import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererAttestationPdf } from "@/lib/pdf/attestation-montage";
import { assemblerAttestation } from "@/lib/attestation-data";
import { nomFichierSafe } from "@/lib/drive";
import { dispositionFichier } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const apercu = request.nextUrl.searchParams.get("apercu") === "1";
  const supabase = await createClient();

  const args = await assemblerAttestation(supabase, id);
  if (!args) return new Response("Introuvable", { status: 404 });

  const pdf = await genererAttestationPdf(args);
  const nom = nomFichierSafe(`Attestation de bon montage ${args.manifestation ?? ""}`.trim()) + ".pdf";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispositionFichier(nom, apercu ? "inline" : "attachment"),
    },
  });
}
