import type { SupabaseClient } from "@supabase/supabase-js";
import { periodeReservation } from "@/lib/devis";

type Supa = SupabaseClient;

export type ResultatAffectation = {
  /** Unités effectivement affectées. */
  affectees: number;
  /** Exemplaires demandés que le parc ne couvre pas (sous-location, ou stock pris). */
  manquants: { reference: string; manque: number; motif: "parc" | "dates" }[];
  /** Raison d'un refus global (dates manquantes, rien à affecter). */
  blocage: string | null;
};

/**
 * Affecte des unités physiques aux entrées de la liste du matériel d'un événement.
 *
 * Trois règles, dans cet ordre :
 *  1. une unité ne peut pas servir avant d'avoir été achetée — les lasers 5 et 6,
 *     arrivés en novembre 2025, n'ont pas pu éclairer une soirée de mars ;
 *  2. une unité déjà réservée sur des dates qui se chevauchent est indisponible
 *     (la contrainte d'exclusion GiST l'interdit de toute façon en base) ;
 *  3. à égalité, on prend la moins utilisée, pour user le parc uniformément.
 *
 * Ce que le parc ne couvre pas n'est pas une erreur : c'est de la sous-location, et
 * on le remonte plutôt que de le taire.
 */
export async function affecterUnites(
  supabase: Supa,
  prestationId: string,
): Promise<ResultatAffectation> {
  const vide: ResultatAffectation = { affectees: 0, manquants: [], blocage: null };

  const { data: p } = await supabase
    .from("prestation")
    .select("date_prepa, date_event_debut, date_event_fin, date_retour")
    .eq("id", prestationId)
    .maybeSingle();
  const periode = p ? periodeReservation(p) : null;
  if (!periode) {
    return { ...vide, blocage: "Dates incomplètes : renseigne au moins le début et la fin de l'événement." };
  }

  // La liste du matériel fait foi : ce qui est décoché « non utilisé » n'a pas à
  // mobiliser d'unité.
  const { data: materiel } = await supabase
    .from("prestation_materiel")
    .select("id, reference_id, quantite, designation")
    .eq("prestation_id", prestationId)
    .eq("utilise", true)
    .not("reference_id", "is", null);
  const entrees = (materiel ?? []) as {
    id: string; reference_id: string; quantite: number; designation: string | null;
  }[];
  if (entrees.length === 0) return { ...vide, blocage: "Aucun matériel de catalogue sur cet événement." };

  const refIds = [...new Set(entrees.map((e) => e.reference_id))];
  const { data: refs } = await supabase
    .from("materiel_reference")
    .select("id, nom, est_consommable, cout_location_jour")
    .in("id", refIds);
  // Une référence consommable ne se suit pas à l'unité ; une référence au coût de
  // sous-location est louée, elle n'est pas dans notre parc.
  const serialisees = new Map(
    ((refs ?? []) as { id: string; nom: string; est_consommable: boolean; cout_location_jour: number | null }[])
      .filter((r) => !r.est_consommable && r.cout_location_jour == null)
      .map((r) => [r.id, r.nom]),
  );

  const aAffecter = entrees.filter((e) => serialisees.has(e.reference_id));
  if (aAffecter.length === 0) {
    return { ...vide, blocage: "Rien à affecter : ce matériel est consommable ou sous-loué." };
  }

  // On repart de zéro pour cet événement, sinon il entre en conflit avec lui-même.
  await supabase.from("reservation_unite").delete().eq("prestation_id", prestationId);

  const { data: unitesData } = await supabase
    .from("unite")
    .select("id, reference_id, date_achat, compteur_sorties, compteur_heures, numero_interne")
    .in("reference_id", [...serialisees.keys()])
    .eq("etat", "ok")
    .order("compteur_sorties", { ascending: true })
    .order("compteur_heures", { ascending: true })
    .order("numero_interne", { ascending: true });
  const unites = (unitesData ?? []) as {
    id: string; reference_id: string; date_achat: string | null;
    compteur_sorties: number; compteur_heures: number; numero_interne: number | null;
  }[];

  const { data: prises } = await supabase
    .from("reservation_unite")
    .select("unite_id")
    .lte("date_debut", periode.fin)
    .gte("date_fin", periode.debut);
  const indisponibles = new Set(((prises ?? []) as { unite_id: string }[]).map((r) => r.unite_id));

  const inserts: {
    unite_id: string; prestation_id: string; prestation_materiel_id: string;
    date_debut: string; date_fin: string;
  }[] = [];
  const manquants: ResultatAffectation["manquants"] = [];

  for (const e of aAffecter) {
    const besoin = Math.max(0, Math.round(e.quantite ?? 0));
    if (besoin === 0) continue;

    const duParc = unites.filter((u) => u.reference_id === e.reference_id);
    // Achetée après le début de l'événement : elle n'existait pas encore.
    const existantes = duParc.filter((u) => !u.date_achat || u.date_achat <= periode.debut);
    const libres = existantes.filter((u) => !indisponibles.has(u.id));

    for (const u of libres.slice(0, besoin)) {
      inserts.push({
        unite_id: u.id,
        prestation_id: prestationId,
        prestation_materiel_id: e.id,
        date_debut: periode.debut,
        date_fin: periode.fin,
      });
      indisponibles.add(u.id);
    }

    const manque = besoin - Math.min(besoin, libres.length);
    if (manque > 0) {
      manquants.push({
        reference: serialisees.get(e.reference_id) ?? e.designation ?? "Matériel",
        manque,
        // Le parc existait mais était pris : ce n'est pas le même problème qu'un
        // parc trop petit, ou que du matériel pas encore acheté.
        motif: existantes.length >= besoin ? "dates" : "parc",
      });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("reservation_unite").insert(inserts);
    if (error) throw new Error(error.message);
  }
  return { affectees: inserts.length, manquants, blocage: null };
}
