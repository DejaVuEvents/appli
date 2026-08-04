import { type NextRequest } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

/**
 * Renvoie le QR code (PNG) d'une unité, en téléchargement.
 * Le QR encode l'URL de la fiche unité : .../u/{code}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: unite } = await supabase
    .from("unite")
    .select("id, qr_code, numero_serie")
    .eq("id", id)
    .single();

  if (!unite) {
    return new Response("Unité introuvable", { status: 404 });
  }

  const code = unite.qr_code ?? unite.id;
  const origin = _request.nextUrl.origin;
  const url = `${origin}/u/${code}`;

  const png = await QRCode.toBuffer(url, {
    width: 600,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const filename = `qr-${unite.numero_serie || code}.png`;

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
