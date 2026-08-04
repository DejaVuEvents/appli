// Logique partagée d'enregistrement des mouvements (sortie / retour) d'une unité.
// Incrémente les compteurs d'usage de façon ATOMIQUE (RPC Postgres) pour éviter les
// pertes/doublons d'incréments quand plusieurs utilisateurs (ou un double-tap mobile)
// agissent en même temps. Utilisé par la page Préparation et la fiche unité.

import type { SupabaseClient } from "@supabase/supabase-js";

type Supa = SupabaseClient;

/** Type du dernier mouvement d'une unité pour une prestation donnée (null si aucun). */
async function dernierMouvement(
  supabase: Supa,
  uniteId: string,
  prestationId: string | null,
): Promise<string | null> {
  let q = supabase
    .from("mouvement")
    .select("type")
    .eq("unite_id", uniteId)
    .order("date", { ascending: false })
    .limit(1);
  q = prestationId ? q.eq("prestation_id", prestationId) : q.is("prestation_id", null);
  const { data } = await q;
  return data?.[0]?.type ?? null;
}

/** Sortie : enregistre le mouvement et incrémente le compteur de sorties (atomique).
 *  No-op si l'unité est déjà sortie pour cette prestation (anti double-incrément). */
export async function appliquerSortie(
  supabase: Supa,
  uniteId: string,
  prestationId: string | null,
  userId: string | null,
) {
  if ((await dernierMouvement(supabase, uniteId, prestationId)) === "sortie") return;
  await supabase.from("mouvement").insert({
    unite_id: uniteId,
    prestation_id: prestationId,
    type: "sortie",
    utilisateur_id: userId,
  });
  await supabase.rpc("increment_compteur_sorties", { p_unite_id: uniteId });
}

/** Retour : enregistre le mouvement et ajoute les heures d'usage (atomique).
 *  No-op si l'unité n'est pas actuellement sortie pour cette prestation. */
export async function appliquerRetour(
  supabase: Supa,
  uniteId: string,
  prestationId: string | null,
  userId: string | null,
  heures: number,
) {
  if ((await dernierMouvement(supabase, uniteId, prestationId)) !== "sortie") return;
  await supabase.from("mouvement").insert({
    unite_id: uniteId,
    prestation_id: prestationId,
    type: "retour",
    heures_ajoutees: heures,
    utilisateur_id: userId,
  });
  if (heures > 0) {
    await supabase.rpc("ajouter_compteur_heures", { p_unite_id: uniteId, p_heures: heures });
  }
}

/** Annule la dernière sortie d'une unité pour une prestation (décrémente le compteur). */
export async function annulerDerniereSortie(supabase: Supa, uniteId: string, prestationId: string) {
  const { data: m } = await supabase
    .from("mouvement")
    .select("id")
    .eq("unite_id", uniteId)
    .eq("prestation_id", prestationId)
    .eq("type", "sortie")
    .order("date", { ascending: false })
    .limit(1);
  if (m && m[0]) {
    await supabase.from("mouvement").delete().eq("id", m[0].id);
    await supabase.rpc("decrementer_compteur_sorties", { p_unite_id: uniteId });
  }
}

/**
 * Prestation pertinente pour une unité scannée (fiche QR), de façon tolérante :
 *  1. réservation qui couvre aujourd'hui ;
 *  2. sinon la prochaine réservation pas encore terminée (en cours ou à venir) ;
 *  3. sinon la réservation passée la plus récente.
 * Évite d'enregistrer une sortie « sans prestation » quand on charge la veille de la
 * fenêtre (sinon la check-list de préparation ne la verrait pas → risque de double sortie).
 */
export async function resoudrePrestationUnite(supabase: Supa, uniteId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const couvre = await supabase
    .from("reservation_unite")
    .select("prestation_id")
    .eq("unite_id", uniteId)
    .lte("date_debut", today)
    .gte("date_fin", today)
    .limit(1);
  if (couvre.data?.[0]) return couvre.data[0].prestation_id;

  const aVenir = await supabase
    .from("reservation_unite")
    .select("prestation_id")
    .eq("unite_id", uniteId)
    .gte("date_fin", today)
    .order("date_debut", { ascending: true })
    .limit(1);
  if (aVenir.data?.[0]) return aVenir.data[0].prestation_id;

  const passee = await supabase
    .from("reservation_unite")
    .select("prestation_id")
    .eq("unite_id", uniteId)
    .order("date_fin", { ascending: false })
    .limit(1);
  return passee.data?.[0]?.prestation_id ?? null;
}

/** État d'une unité pour une prestation, calculé depuis ses mouvements. */
export type EtatPrepa = "a_charger" | "sorti" | "rentre";

export function etatDepuisMouvements(mouvements: { type: string }[]): EtatPrepa {
  const sorties = mouvements.filter((m) => m.type === "sortie").length;
  const retours = mouvements.filter((m) => m.type === "retour").length;
  if (sorties === 0) return "a_charger";
  return retours >= sorties ? "rentre" : "sorti";
}
