import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { relevePourLigne } from "@/lib/releve-trajet";
import { dispositionFichier } from "@/lib/storage";

export const runtime = "nodejs";

/** Relevé d'itinéraire d'une ligne, reconstruit à la demande. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ligneId: string }> },
) {
  const { ligneId } = await params;
  const apercu = request.nextUrl.searchParams.get("apercu") === "1";
  const supabase = await createClient();

  const pdf = await relevePourLigne(supabase, ligneId);
  if (!pdf) return new Response("Relevé indisponible", { status: 404 });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispositionFichier("Releve itineraire.pdf", apercu ? "inline" : "attachment"),
    },
  });
}
