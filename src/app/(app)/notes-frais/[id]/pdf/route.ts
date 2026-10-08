import { type NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { genererNoteFraisPdf } from "@/lib/pdf/note-frais";
import { assemblerNdfPdfArgs } from "@/lib/note-frais-data";
import { nomFichierSafe } from "@/lib/drive";
import { urlDocument, dispositionFichier } from "@/lib/storage";
import { relevePourLigne } from "@/lib/releve-trajet";

export const runtime = "nodejs";

const A4 = { w: 595.28, h: 841.89 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?apercu=1 → affichage dans l'iframe de la lightbox ; sans lui, téléchargement.
  const apercu = request.nextUrl.searchParams.get("apercu") === "1";
  const supabase = await createClient();
  const args = await assemblerNdfPdfArgs(supabase, id);
  if (!args) return new Response("Introuvable", { status: 404 });

  // 1) La note de frais elle-même (template @react-pdf)
  const ndfPdf = await genererNoteFraisPdf(args);
  const merged = await PDFDocument.load(ndfPdf);

  // 2) Fusionner tous les justificatifs associés (PDF ajoutés page à page, images en pleine page)
  const { data: lignes } = await supabase
    .from("ligne_note_frais")
    .select("id, libelle, justificatif_url, depart, arrivee")
    .eq("note_frais_id", id)
    .order("date");

  for (const l of (lignes ?? []) as {
    id: string; libelle: string | null; justificatif_url: string | null;
    depart: string | null; arrivee: string | null;
  }[]) {
    try {
      // Un déplacement calculé ici porte sa propre pièce : le relevé se
      // reconstruit à partir de la ligne, sans dépendre d'un fichier déposé.
      if (!l.justificatif_url && l.depart && l.arrivee) {
        const releve = await relevePourLigne(supabase, l.id);
        if (releve) {
          const src = await PDFDocument.load(new Uint8Array(releve));
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
        }
        continue;
      }
      if (!l.justificatif_url) continue;

      const url = await urlDocument(supabase, l.justificatif_url);
      if (!url) continue;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      const path = (l.justificatif_url || "").toLowerCase();
      const isPdf = ct.includes("pdf") || path.endsWith(".pdf");

      if (isPdf) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      } else {
        // Image : essaie JPG/PNG selon le type ; les autres formats (HEIC…) sont ignorés proprement
        let img;
        try {
          img = ct.includes("png") || path.endsWith(".png") ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
        } catch {
          try { img = await merged.embedPng(bytes); } catch { continue; }
        }
        const page = merged.addPage([A4.w, A4.h]);
        page.drawText(`Justificatif : ${l.libelle ?? ""}`.slice(0, 90), { x: 24, y: A4.h - 30, size: 10 });
        const scale = Math.min((A4.w - 48) / img.width, (A4.h - 90) / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - h) / 2 - 15, width: w, height: h });
      }
    } catch {
      // un justificatif illisible ne doit pas casser tout le PDF
      continue;
    }
  }

  const out = await merged.save();
  const nom = nomFichierSafe(`NDF ${args.titre ?? id}`) + ".pdf";
  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispositionFichier(nom, apercu ? "inline" : "attachment"),
      "Cache-Control": "no-store",
    },
  });
}
