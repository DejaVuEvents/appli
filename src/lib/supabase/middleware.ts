import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "./config";
import { peutAcceder } from "@/lib/roles";
import type { RoleMembre } from "@/lib/membre";

/**
 * Rafraîchit la session Supabase à chaque requête et protège les routes :
 * un utilisateur non connecté est redirigé vers /login.
 */
export async function updateSession(request: NextRequest) {
  // Tant que Supabase n'est pas configuré, on laisse tout passer
  // (la page d'accueil affiche les instructions de configuration).
  if (!supabaseConfigured) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT : ne rien exécuter entre createServerClient et getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");

  // Non connecté + page protégée -> redirection login
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Déjà connecté + page login -> redirection accueil
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Contrôle d'accès par rôle (sécurité serveur, non contournable côté client).
  if (user && !isAuthRoute) {
    const { data: membre } = await supabase.from("membre").select("role").eq("id", user.id).maybeSingle();
    const role = (membre?.role ?? "membre") as RoleMembre;
    if (!peutAcceder(role, request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
