// Sous-location : matériel loué à un fournisseur (coût renseigné au catalogue).
// Sert à repérer ces lignes DANS L'OUTIL uniquement — jamais sur le document client.
import type { SupabaseClient } from "@supabase/supabase-js";

export type SousLocInfo = {
  fournisseur: string | null;
  /** Tarif catalogue du loueur, HT, par jour. */
  coutHt: number;
  /** Remise négociée, appliquée sur le HT. */
  remisePct: number;
  tvaPct: number;
};

/** Coût fournisseur des références passées, indexé par id. Les références possédées
 *  par Déjà Vu (pas de `cout_location_jour`) sont absentes de la map. */
export async function chargerSousLocation(
  supabase: SupabaseClient,
  referenceIds: (string | null)[],
): Promise<Map<string, SousLocInfo>> {
  const ids = [...new Set(referenceIds.filter(Boolean) as string[])];
  const map = new Map<string, SousLocInfo>();
  if (!ids.length) return map;

  const { data } = await supabase
    .from("materiel_reference")
    .select("id, fournisseur, cout_location_jour, remise_fournisseur_pct, tva_fournisseur_pct")
    .in("id", ids);

  for (const r of (data ?? []) as {
    id: string;
    fournisseur: string | null;
    cout_location_jour: number | null;
    remise_fournisseur_pct: number | null;
    tva_fournisseur_pct: number | null;
  }[]) {
    if (r.cout_location_jour == null) continue;
    map.set(r.id, {
      fournisseur: r.fournisseur,
      coutHt: Number(r.cout_location_jour),
      remisePct: Number(r.remise_fournisseur_pct ?? 0),
      tvaPct: Number(r.tva_fournisseur_pct ?? 20),
    });
  }
  return map;
}
