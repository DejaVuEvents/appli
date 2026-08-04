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
