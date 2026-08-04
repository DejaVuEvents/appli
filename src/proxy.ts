import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 : « Proxy » remplace l'ancien « Middleware » (même rôle).
// S'exécute avant chaque requête : rafraîchit la session Supabase et
// protège les routes (redirection vers /login si non connecté).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     * - _next/static, _next/image (assets Next)
     * - favicon, manifest, icônes, fichiers images
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
