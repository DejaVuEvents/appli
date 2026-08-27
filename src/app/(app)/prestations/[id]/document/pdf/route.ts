import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assemblerContenuDocument } from "@/lib/document";
import { genererDevisFacturePdf } from "@/lib/pdf/devis-facture";
import { nomFichierSafe } from "@/lib/drive";
import { urlDocument, dispositionFichier } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") === "facture" ? "facture" : "devis";
  const supabase = await createClient();

  // Devis ciblé : ?devis, sinon premier devis de l'événement.
  let devisId = request.nextUrl.searchParams.get("devis");
  if (!devisId) {
    const { data: first } = await supabase.from("devis").select("id").eq("prestation_id", id).order("created_at").limit(1).maybeSingle();
    devisId = first?.id ?? null;
  }
  if (!devisId) return new Response("Introuvable", { status: 404 });

  // Document importé de Tiime : renvoie l'ancien PDF d'origine.
  const { data: dv } = await supabase.from("devis").select("pdf_import").eq("id", devisId).maybeSingle();
  if (dv?.pdf_import) {
    const url = await urlDocument(supabase, dv.pdf_import);
    if (url) return NextResponse.redirect(url);
  }

  const contenu = await assemblerContenuDocument(supabase, devisId);
  if (!contenu) return new Response("Introuvable", { status: 404 });

  const { data: doc } = await supabase
    .from("devis_facture")
    .select("numero, date_emission, date_echeance")
    .eq("devis_id", devisId)
    .eq("type", type)
    .maybeSingle();

  const pdf = await genererDevisFacturePdf({
    ...contenu,
    type,
    numero: doc?.numero ?? null,
    dateEmission: doc?.date_emission ?? null,
    dateEcheance: doc?.date_echeance ?? null,
  });

  const nom = nomFichierSafe(`${type === "devis" ? "Devis" : "Facture"} ${doc?.numero ?? contenu.prestationNom}`) + ".pdf";
  // ?inline=1 → affichage dans un iframe/aperçu ; sinon téléchargement.
  const disposition = request.nextUrl.searchParams.get("inline") ? "inline" : "attachment";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispositionFichier(nom, disposition as "attachment" | "inline"),
      "Cache-Control": "no-store",
    },
  });
}
