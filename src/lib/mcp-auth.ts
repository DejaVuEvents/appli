import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleMembre } from "@/lib/membre";

export type AppelantMcp = {
  id: string;
  nom: string;
  role: RoleMembre;
};

/**
 * Identifie l'appelant d'après son jeton MCP.
 *
 * Chaque membre a le sien : l'outil sait donc QUI parle et peut appliquer les
 * mêmes règles de rôle que l'application. Un jeton partagé donnerait à tout le
 * monde les droits du plus permissif.
 */
export async function membreDuJeton(
  supabase: SupabaseClient,
  jeton: string | undefined,
): Promise<AppelantMcp | null> {
  if (!jeton || jeton.length < 20) return null;
  const { data } = await supabase
    .from("membre")
    .select("id, nom, prenom, email, role, actif")
    .eq("mcp_token", jeton)
    .maybeSingle();
  const m = data as {
    id: string; nom: string | null; prenom: string | null;
    email: string | null; role: string; actif: boolean;
  } | null;
  if (!m || !m.actif) return null;
  return {
    id: m.id,
    nom: [m.prenom?.trim(), m.nom?.trim()].filter(Boolean).join(" ") || m.email?.split("@")[0] || "—",
    role: m.role as RoleMembre,
  };
}

/** La finance et les devis restent réservés aux co-présidents, comme dans l'app. */
export function peutVoirFinance(appelant: AppelantMcp): boolean {
  return appelant.role === "co_president";
}

/** Le matériel et les événements sont ouverts au rôle technique. */
export function peutVoirMateriel(appelant: AppelantMcp): boolean {
  return appelant.role === "co_president" || appelant.role === "technique";
}

/**
 * Écrire par Claude (notes de frais, justificatifs) : réservé aux membres listés
 * dans MCP_ECRITURE_MEMBRES (ids séparés par des virgules), en plus du rôle
 * co-président. Générer un jeton dans Paramètres ne suffit donc pas. Variable
 * absente ou vide : personne n'écrit.
 */
export function peutEcrire(appelant: AppelantMcp): boolean {
  const autorises = (process.env.MCP_ECRITURE_MEMBRES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return appelant.role === "co_president" && autorises.includes(appelant.id);
}
