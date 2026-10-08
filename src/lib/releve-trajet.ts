import type { SupabaseClient } from "@supabase/supabase-js";
import { geocode, itineraire } from "@/lib/routage";
import { genererTrajetPdf } from "@/lib/pdf/trajet";
import type { ParametresEntreprise } from "@/lib/types";
import type { ModeTrajet } from "@/lib/trajet";

type Supa = SupabaseClient;

const LIGNE_SELECT =
  "depart, arrivee, date, distance_km, aller_retour, conso_l_100km, prix_carburant, peages, tarif_km, vehicule_id";

/**
 * Relevé d'itinéraire d'une ligne de déplacement, reconstruit à la demande.
 *
 * C'est une donnée DÉRIVÉE : la ligne porte déjà le trajet, la distance et le
 * calcul. Le relevé se recompose donc à partir d'elle, au lieu de dépendre d'un
 * fichier déposé — une note reprise avant que l'outil ne sache le produire reste
 * ainsi justifiée, et le document ne peut pas diverger de la ligne.
 *
 * Renvoie null si la ligne n'est pas un déplacement ou si l'itinéraire est
 * injoignable : le PDF de la note se passe alors de cette pièce.
 */
export async function relevePourLigne(supabase: Supa, ligneId: string): Promise<Buffer | null> {
  const { data } = await supabase.from("ligne_note_frais").select(LIGNE_SELECT).eq("id", ligneId).maybeSingle();
  const l = data as {
    depart: string | null; arrivee: string | null; date: string | null;
    distance_km: number | null; aller_retour: boolean | null;
    conso_l_100km: number | null; prix_carburant: number | null;
    peages: number | null; tarif_km: number | null; vehicule_id: string | null;
  } | null;
  if (!l?.depart || !l?.arrivee) return null;

  try {
    const [{ data: veh }, { data: ent }] = await Promise.all([
      l.vehicule_id
        ? supabase.from("vehicule").select("nom").eq("id", l.vehicule_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    ]);

    // Le tracé se recalcule : il n'est pas stocké, et c'est lui qui fait la carte.
    let trace: [number, number][] = [];
    let dureeMin: number | null = null;
    let peage: boolean | undefined;
    try {
      const [a, b] = await Promise.all([geocode(l.depart), geocode(l.arrivee)]);
      const r = await itineraire([a.coord, b.coord]);
      trace = r.trace;
      dureeMin = r.dureeMin * (l.aller_retour ? 2 : 1);
      peage = r.peage;
    } catch {
      // Itinéraire injoignable : le relevé sort sans carte, les chiffres font foi.
    }

    const mode: ModeTrajet = l.tarif_km != null ? "bareme" : "reel";
    const km = Number(l.distance_km ?? 0);
    const conso = Number(l.conso_l_100km ?? 0);
    const prix = Number(l.prix_carburant ?? 0);
    const peages = Number(l.peages ?? 0);
    const carburant = Math.round(((km * conso * prix) / 100) * 100) / 100;
    const total = mode === "bareme"
      ? Math.round(km * Number(l.tarif_km ?? 0) * 100) / 100
      : Math.round((carburant + peages) * 100) / 100;

    return await genererTrajetPdf({
      ent: (ent ?? null) as ParametresEntreprise | null,
      depart: l.depart,
      arrivee: l.arrivee,
      date: l.date,
      allerRetour: l.aller_retour === true,
      eviterPeages: false,
      km,
      dureeMin,
      peage,
      vehicule: (veh as { nom: string } | null)?.nom ?? null,
      mode,
      conso: mode === "reel" ? conso : null,
      prixCarburant: mode === "reel" ? prix : null,
      peages,
      tarifKm: mode === "bareme" ? Number(l.tarif_km ?? 0) : null,
      carburant,
      total,
      trace,
    });
  } catch (e) {
    console.error("[ndf] relevé d'itinéraire :", e instanceof Error ? e.message : e);
    return null;
  }
}
