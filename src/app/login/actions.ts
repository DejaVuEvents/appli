"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Identifiants incorrects." };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Envoie l'e-mail de réinitialisation du mot de passe.
 *  Le lien de l'e-mail (modèle Supabase) pointe vers /login/reinitialiser avec un token_hash ;
 *  le jeton n'est vérifié qu'au moment où l'utilisateur soumet son nouveau mot de passe
 *  (POST) → immunisé contre le pré-chargement des liens par les messageries (Gmail). */
export async function envoyerReinitialisation(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email requis." };

  const supabase = await createClient();
  const h = await headers();
  const host = h.get("host");
  const origin = h.get("origin") ?? (host ? `https://${host}` : "");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/login/reinitialiser`,
  });
  // On répond toujours « envoyé » (sans révéler si le compte existe).
  if (error) return { error: "Impossible d'envoyer l'e-mail. Réessaie dans un instant." };
  return { sent: true };
}

/** Définit un nouveau mot de passe. Vérifie le token_hash (reçu par e-mail) puis met à jour. */
export async function definirNouveauMotDePasse(_prev: unknown, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const tokenHash = String(formData.get("token_hash") ?? "").trim();
  const type = String(formData.get("type") ?? "recovery").trim();
  if (password.length < 8) return { error: "Le mot de passe doit faire au moins 8 caractères." };
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };

  const supabase = await createClient();

  // Vérifie le jeton reçu par e-mail (établit la session de récupération) — sauf si l'utilisateur
  // a déjà une session (ancien flux). Fait au POST → non consommé par les scanners d'e-mail.
  if (tokenHash) {
    const { error: e1 } = await supabase.auth.verifyOtp({
      type: type === "recovery" ? "recovery" : "email",
      token_hash: tokenHash,
    });
    if (e1) return { error: "Lien invalide ou expiré. Recommence la procédure « mot de passe oublié »." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Impossible d'enregistrer. Le lien a peut-être expiré — recommence la procédure." };

  redirect("/");
}
