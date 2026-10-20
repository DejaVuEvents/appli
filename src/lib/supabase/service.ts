import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase de service, SANS session utilisateur.
 *
 * Réservé à la route MCP : un appel de Claude n'a pas de cookie, donc aucune
 * identité au sens de Supabase, et les règles RLS (qui exigent `authenticated`)
 * rejetteraient tout. La clé de service contourne RLS.
 *
 * La protection ne vient donc plus de la base mais de la route : elle n'expose
 * qu'une poignée d'outils en lecture, jamais de SQL libre, et chacun vérifie le
 * rôle du porteur du jeton. Ne JAMAIS utiliser ce client ailleurs.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
