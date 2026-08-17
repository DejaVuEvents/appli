/** Utilitaires véhicules : coût kilométrique dérivé de la consommation et du prix du carburant. */

export type CarburantPrix = { essence: number; diesel: number };

/**
 * Coût du carburant par km d'un véhicule = (conso L/100km ÷ 100) × prix du litre
 * (essence ou diesel selon le véhicule). Repli sur l'ancien champ `cout_km` si la
 * consommation n'est pas renseignée.
 */
export function coutKmVehicule(
  v: { conso_l_100km?: number | null; type_carburant?: string | null; cout_km?: number | null },
  prix: CarburantPrix,
): number {
  const conso = Number(v.conso_l_100km ?? 0);
  if (conso > 0) {
    const pu = v.type_carburant === "diesel" ? prix.diesel : prix.essence;
    return Math.round((conso / 100) * Number(pu ?? 0) * 1000) / 1000;
  }
  return Number(v.cout_km ?? 0);
}

export const CARBURANTS: { value: string; label: string }[] = [
  { value: "essence", label: "Essence" },
  { value: "diesel", label: "Diesel" },
];
