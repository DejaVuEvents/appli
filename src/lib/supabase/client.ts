import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase côté navigateur (composants "use client").
 * Utilise la clé publique anon — sûre à exposer.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key-placeholder",
  );
}
