import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * Gère la session via les cookies Next.js.
 */
export async function createClient() {
  const cookieStore = await cookies();

  // Valeurs de repli tant que Supabase n'est pas configuré : évitent une
  // exception à la construction. Les requêtes échouent alors proprement
  // (data = null) et les pages affichent un état vide / l'écran de configuration.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key-placeholder",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : ignoré.
            // Le middleware se charge de rafraîchir la session.
          }
        },
      },
    },
  );
}
