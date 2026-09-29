/**
 * Frais de déplacement : le même calcul que le « coût du trajet » de Mappy.
 *
 * Deux façons de chiffrer un déplacement, et elles ne se mélangent pas :
 *   • COÛT RÉEL   — ce que le trajet a réellement coûté : carburant (distance ×
 *     consommation × prix du litre) + péages. C'est le calcul de Mappy, celui que
 *     l'équipe faisait jusqu'ici à l'extérieur de l'outil.
 *   • BARÈME      — un tarif forfaitaire au kilomètre (barème kilométrique), sans
 *     justificatif de carburant.
 */
export type ModeTrajet = "reel" | "bareme";

export type EntreeTrajet = {
  mode: ModeTrajet;
  /** Distance d'un aller simple, en km. */
  km: number;
  allerRetour: boolean;
  /** Coût réel : consommation en L/100 km et prix du litre. */
  conso?: number;
  prixCarburant?: number;
  /** Péages d'un aller simple, en euros. */
  peages?: number;
  /** Barème : tarif au kilomètre. */
  tarifKm?: number;
};

export type DetailTrajet = {
  /** Distance effectivement parcourue (doublée si aller-retour). */
  km: number;
  carburant: number;
  peages: number;
  total: number;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function coutTrajet(e: EntreeTrajet): DetailTrajet {
  // L'aller-retour double la distance ET les péages : on repasse par la même barrière.
  const facteur = e.allerRetour ? 2 : 1;
  const km = Math.round(Math.max(0, e.km) * facteur * 10) / 10;

  if (e.mode === "bareme") {
    const total = arrondi(km * Math.max(0, e.tarifKm ?? 0));
    return { km, carburant: 0, peages: 0, total };
  }

  const carburant = arrondi((km * Math.max(0, e.conso ?? 0) * Math.max(0, e.prixCarburant ?? 0)) / 100);
  const peages = arrondi(Math.max(0, e.peages ?? 0) * facteur);
  return { km, carburant, peages, total: arrondi(carburant + peages) };
}

/** Libellé de la ligne : le calcul doit se relire sans ouvrir la fiche. */
export function libelleTrajet(
  e: EntreeTrajet,
  d: DetailTrajet,
  depart: string,
  arrivee: string,
  vehicule?: string | null,
): string {
  const trajet = `${depart} → ${arrivee}${e.allerRetour ? " (aller-retour)" : ""}`;
  const detail =
    e.mode === "bareme"
      ? `${d.km} km × ${(e.tarifKm ?? 0).toFixed(2)} €/km`
      : `${d.km} km · ${(e.conso ?? 0).toFixed(1)} L/100 km × ${(e.prixCarburant ?? 0).toFixed(3)} €/L`
        + (d.peages > 0 ? ` + ${d.peages.toFixed(2)} € de péages` : "");
  return `Déplacement${vehicule ? ` (${vehicule})` : ""} : ${trajet} — ${detail}`;
}
