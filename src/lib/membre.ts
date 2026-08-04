// Identité de l'utilisateur connecté (multi-utilisateur).
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RoleMembre = "co_president" | "technique" | "membre";

export const ROLE_LABELS: Record<RoleMembre, string> = {
  co_president: "Co-président",
  technique: "Technique",
  membre: "Membre",
};
export type Membre = {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  adresse: string | null;
  telephone: string | null;
  iban: string | null;
  fonction: string | null;
  photo_url: string | null;
  signature_url: string | null;
  role: RoleMembre;
  actif: boolean;
  competences: string[] | null;
};

/** Compétences prédéfinies (cases à cocher) pour organiser les installations. */
export const COMPETENCES = [
  "Installation Laser",
  "Opération Laser",
  "Installation Son",
  "Opération Son",
  "Installation Lumière",
  "Opération Lumière",
  "Assemblage Structure",
  "Levage / Accroche",
  "Électricité / Distribution",
  "Vidéo / Mapping",
  "Régie / Conduite",
  "Chauffeur",
] as const;

/** Membre correspondant à l'utilisateur connecté (ou null si non connecté). */
export async function getMembreActuel(supabase?: SupabaseClient): Promise<Membre | null> {
  const sb = supabase ?? (await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("membre").select("*").eq("id", user.id).maybeSingle();
  if (data) return data as Membre;
  // Repli si le profil n'existe pas encore (avant trigger/backfill)
  return {
    id: user.id,
    nom: user.email?.split("@")[0] ?? null,
    prenom: null,
    email: user.email ?? null,
    adresse: null,
    telephone: null,
    iban: null,
    fonction: null,
    photo_url: null,
    signature_url: null,
    role: "membre",
    actif: true,
    competences: null,
  };
}

/** Nom affichable d'un membre. */
export function nomMembre(m: { nom: string | null; email: string | null } | null): string {
  return m?.nom?.trim() || m?.email?.split("@")[0] || "—";
}
