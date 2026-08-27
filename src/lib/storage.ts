// Stockage : bucket privé pour les documents sensibles (justificatifs, factures reçues,
// photos de retour). Les fichiers y sont servis via des URLs signées temporaires.
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_PRIVE = "docs-prives";

/**
 * Renvoie une URL affichable pour une valeur stockée :
 * - si c'est déjà une URL http(s) (asset public / legacy) → renvoyée telle quelle ;
 * - sinon c'est un chemin dans le bucket privé → URL signée temporaire (1 h par défaut).
 */
export async function urlDocument(
  supabase: SupabaseClient,
  stored: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  const { data } = await supabase.storage.from(BUCKET_PRIVE).createSignedUrl(stored, expiresIn);
  return data?.signedUrl ?? null;
}

/**
 * En-tête Content-Disposition robuste : nom ASCII pour les anciens clients + `filename*`
 * en UTF-8 (RFC 5987). Sans ça, un nom accentué rend l'en-tête invalide et certains
 * navigateurs l'ignorent — le fichier s'ouvre au lieu d'être téléchargé.
 */
export function dispositionFichier(nom: string, mode: "attachment" | "inline" = "attachment"): string {
  const ascii = nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // retire les accents
    .replace(/[^\x20-\x7E]/g, "_")      // tout caractère non ASCII imprimable
    .replace(/["\\]/g, "_");
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
}
