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

  const pathname = request.nextUrl.pathname;
  // Pages publiques (connexion + réinitialisation de mot de passe) : tout /login/*.
  const isPublic = pathname.startsWith("/login");
  // Seule la page de connexion « racine » renvoie un utilisateur déjà connecté vers l'accueil
  // (les pages de réinitialisation doivent rester accessibles même avec une session de récupération).
  const isLoginRacine = pathname === "/login";

  // Non connecté + page protégée -> redirection login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Déjà connecté + page de connexion racine -> redirection accueil
  if (user && isLoginRacine) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Contrôle d'accès par rôle (sécurité serveur, non contournable côté client).
  // Optimisation perf : `peutAcceder` est une fonction pure (sans réseau). On ne fait
  // la requête DB du rôle QUE si le chemin est réellement restreint (c.-à-d. si un
  // « membre » ou un « technique » pourrait être bloqué). Sur les pages ouvertes à tous
  // (accueil, calendrier, équipe, NDF, paramètres…), on économise un aller-retour Supabase.
  if (user && !isPublic) {
    const cheminRestreint = !peutAcceder("membre", pathname) || !peutAcceder("technique", pathname);
    if (cheminRestreint) {
      const { data: membre } = await supabase.from("membre").select("role").eq("id", user.id).maybeSingle();
      const role = (membre?.role ?? "membre") as RoleMembre;
      if (!peutAcceder(role, pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
