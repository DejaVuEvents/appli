import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Prépare l'insertion d'une copie de ligne de prestation (vers un autre devis). */
export function copieLigne(
  l: Record<string, unknown>,
  prestationId: string,
  devisId: string,
  parentId: string | null,
) {
  return {
    prestation_id: prestationId,
    devis_id: devisId,
    reference_id: l.reference_id,
    designation: l.designation,
    unite: l.unite,
    categorie_id: l.categorie_id,
    quantite: l.quantite,
    prix_unitaire: l.prix_unitaire,
    remise_type: l.remise_type,
    remise_valeur: l.remise_valeur,
    prix_total: l.prix_total,
    est_accessoire_auto: l.est_accessoire_auto,
    ligne_parent_id: parentId,
  };
}

/**
 * Copie un devis (lignes + sous-lignes + transport) dans une prestation cible.
 * Renvoie l'id du nouveau devis, ou null si la source est introuvable.
 */
export async function copierDevisDans(
  supabase: Supa,
  sourceDevisId: string,
  prestationId: string,
  userId: string | null,
  forcedType?: "devis" | "facture",
): Promise<string | null> {
  const { data: src } = await supabase.from("devis").select("*").eq("id", sourceDevisId).single();
  if (!src) return null;

  const { data: nouveau } = await supabase
    .from("devis")
    .insert({
      prestation_id: prestationId,
      nom: forcedType === "facture" ? "Facture" : (src.nom ?? "Devis"),
      type: forcedType ?? src.type,
      remise_globale_type: src.remise_globale_type,
      remise_globale_valeur: src.remise_globale_valeur,
      remise_globale_libelle: src.remise_globale_libelle,
      source_devis_id: src.id,
      created_by: userId,
    })
    .select("id")
    .single();
  if (!nouveau) return null;

  const { data: lignes } = await supabase.from("ligne_prestation").select("*").eq("devis_id", sourceDevisId).order("created_at");
  const idMap = new Map<string, string>();
  for (const l of (lignes ?? []).filter((x) => !x.ligne_parent_id)) {
    const { data: ins } = await supabase.from("ligne_prestation").insert(copieLigne(l, prestationId, nouveau.id, null)).select("id").single();
    if (ins) idMap.set(l.id, ins.id);
  }
  for (const l of (lignes ?? []).filter((x) => x.ligne_parent_id)) {
    await supabase.from("ligne_prestation").insert(copieLigne(l, prestationId, nouveau.id, idMap.get(l.ligne_parent_id as string) ?? null));
  }
  const { data: transports } = await supabase.from("transport").select("*").eq("devis_id", sourceDevisId);
  for (const t of transports ?? []) {
    await supabase.from("transport").insert({
      prestation_id: prestationId, devis_id: nouveau.id, vehicule_id: t.vehicule_id,
      nb_vehicules: t.nb_vehicules, km: t.km, cout_calcule: t.cout_calcule,
    });
  }
  return nouveau.id;
}
