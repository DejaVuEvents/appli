import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Écritures ouvertes à Claude (MCP + route /api/mcp/upload) : notes de frais en
 * brouillon et justificatifs. Réservées aux co-présidents.
 *
 * Ces routes utilisent la clé de service, qui contourne RLS : chaque garde-fou de
 * l'application doit donc être rejoué ici, à l'identique. Rien pour signer,
 * soumettre ou valider — ces gestes restent dans l'application.
 */

/** Taille maximale d'un justificatif. Vercel refuse de toute façon tout corps > 4,5 Mo. */
export const LIMITE_JUSTIFICATIF = 4 * 1024 * 1024;

/** Même règle que `assertModifiable` (notes-frais/actions.ts) : brouillon ET demandeur. */
export async function refusModificationNote(
  supabase: SupabaseClient,
  noteId: string,
  membreId: string,
): Promise<string | null> {
  const { data: n } = await supabase
    .from("note_frais")
    .select("statut, demandeur_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!n) return "Note de frais introuvable.";
  if (n.demandeur_id !== membreId) return "Seul le demandeur peut modifier sa note de frais.";
  if (n.statut !== "brouillon") {
    return "Cette note n'est plus modifiable : elle a été soumise. Repasse-la en brouillon dans l'application pour la corriger.";
  }
  return null;
}

export type TypeJustificatif = { ext: "pdf" | "jpg" | "png" | "heic"; contentType: string };

/**
 * Type réel du fichier, lu dans ses premiers octets — pas dans son nom ni dans le
 * Content-Type envoyé : curl annonce « application/octet-stream » pour un .heic.
 */
export function typeJustificatif(octets: Uint8Array): TypeJustificatif | null {
  const debut = (...b: number[]) => b.every((v, i) => octets[i] === v);
  if (debut(0x25, 0x50, 0x44, 0x46)) return { ext: "pdf", contentType: "application/pdf" }; // %PDF
  if (debut(0xff, 0xd8, 0xff)) return { ext: "jpg", contentType: "image/jpeg" };
  if (debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", contentType: "image/png" };
  // HEIC/HEIF (photos iPhone) : boîte « ftyp » à l'octet 4, puis la marque.
  const ascii = (a: number, b: number) => String.fromCharCode(...octets.slice(a, b));
  if (octets.length >= 12 && ascii(4, 8) === "ftyp") {
    const marque = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(marque)) {
      return { ext: "heic", contentType: "image/heic" };
    }
  }
  return null;
}

/** Nom d'origine, sans chemin ni caractères de contrôle ; repli sur un nom générique. */
export function nomJustificatif(nom: string | null | undefined, ext: string): string {
  const propre = String(nom ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
  return propre || `justificatif.${ext}`;
}

export type DepenseSansJustificatif = {
  id: string;
  date: string;
  denomination: string | null;
  montant_ttc: number;
  qonto: boolean;
};

/**
 * Dépenses réelles sans pièce, selon la règle du journal (journal-tabs.tsx) : ni
 * `facture`, ni facture émise liée, ni note de frais, ni ligne `ecriture_facture`,
 * ni ligne `justificatif`.
 */
export async function depensesSansJustificatif(
  supabase: SupabaseClient,
  limite: number,
): Promise<DepenseSansJustificatif[]> {
  const { data } = await supabase
    .from("ecriture_financiere")
    .select("id, date, denomination, montant_ttc, qonto_transaction_id")
    .eq("sens", "sortie")
    .eq("statut", "reel")
    .is("facture", null)
    .is("devis_facture_id", null)
    .is("note_frais_id", null)
    .order("date", { ascending: false })
    .limit(500);
  const sorties = (data ?? []) as {
    id: string; date: string; denomination: string | null; montant_ttc: number; qonto_transaction_id: string | null;
  }[];
  if (sorties.length === 0) return [];

  const ids = sorties.map((s) => s.id);
  const [{ data: justifs }, { data: liees }] = await Promise.all([
    supabase.from("justificatif").select("ecriture_id").in("ecriture_id", ids),
    supabase.from("ecriture_facture").select("ecriture_id").in("ecriture_id", ids),
  ]);
  const avecPiece = new Set(
    [...(justifs ?? []), ...(liees ?? [])].map((r) => (r as { ecriture_id: string }).ecriture_id),
  );

  return sorties
    .filter((s) => !avecPiece.has(s.id))
    .slice(0, limite)
    .map((s) => ({
      id: s.id,
      date: s.date,
      denomination: s.denomination,
      montant_ttc: Number(s.montant_ttc),
      qonto: !!s.qonto_transaction_id,
    }));
}
