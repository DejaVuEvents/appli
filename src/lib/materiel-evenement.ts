import type { SupabaseClient } from "@supabase/supabase-js";
import { lignesRetenues, type DocumentAvecLignes } from "@/lib/documents-evenement";

type Supa = SupabaseClient;

/**
 * Synchronise la liste du matériel d'un événement avec ses documents.
 *
 * Idempotent et non destructif : une entrée déjà présente garde sa coche
 * « utilisé » et sa note, les ajouts faits sur le terrain ne sont jamais touchés, et
 * seules les entrées dont la ligne de devis a disparu (ou dont le document n'est
 * plus retenu) sont retirées.
 */
export async function synchroniserMaterielEvenement(supabase: Supa, prestationId: string) {
  const [{ data: devisData }, { data: lignesData }] = await Promise.all([
    supabase.from("devis").select("id, type").eq("prestation_id", prestationId),
    supabase
      .from("ligne_prestation")
      .select("id, devis_id, reference_id, designation, quantite, prix_total, prix_unitaire")
      .eq("prestation_id", prestationId),
  ]);

  const lignes = (lignesData ?? []) as {
    id: string; devis_id: string | null; reference_id: string | null;
    designation: string | null; quantite: number;
    prix_total: number | null; prix_unitaire: number | null;
  }[];
  const montant = (l: (typeof lignes)[number]) =>
    Number(l.prix_total ?? (l.prix_unitaire ?? 0) * (l.quantite ?? 0));

  // Seules les lignes de catalogue entrent dans la liste : la main d'œuvre, le
  // transport et le câblage au mètre ne sortent aucune unité du local.
  const docs: DocumentAvecLignes[] = ((devisData ?? []) as { id: string; type: string | null }[]).map((d) => ({
    id: d.id,
    type: d.type,
    lignes: lignes
      .filter((l) => l.devis_id === d.id && l.reference_id)
      .map((l) => ({ id: l.id, reference_id: l.reference_id as string, montant: montant(l) })),
  }));
  const retenues = lignesRetenues(docs);
  const attendues = lignes.filter((l) => retenues.has(l.id));

  const { data: existantes } = await supabase
    .from("prestation_materiel")
    .select("id, ligne_prestation_id, origine")
    .eq("prestation_id", prestationId);
  const parLigne = new Map(
    ((existantes ?? []) as { id: string; ligne_prestation_id: string | null; origine: string }[])
      .filter((e) => e.ligne_prestation_id)
      .map((e) => [e.ligne_prestation_id as string, e]),
  );

  const aCreer = attendues
    .filter((l) => !parLigne.has(l.id))
    .map((l) => ({
      prestation_id: prestationId,
      reference_id: l.reference_id,
      designation: l.designation,
      quantite: l.quantite ?? 1,
      montant: Math.round(montant(l) * 100) / 100,
      origine: "devis",
      ligne_prestation_id: l.id,
      devis_id: l.devis_id,
    }));
  if (aCreer.length > 0) await supabase.from("prestation_materiel").insert(aCreer);

  // Mise à jour des entrées existantes (quantité, montant) sans toucher à `utilise`.
  for (const l of attendues) {
    const e = parLigne.get(l.id);
    if (!e) continue;
    await supabase
      .from("prestation_materiel")
      .update({
        reference_id: l.reference_id,
        designation: l.designation,
        quantite: l.quantite ?? 1,
        montant: Math.round(montant(l) * 100) / 100,
        devis_id: l.devis_id,
      })
      .eq("id", e.id);
  }

  await developperGroupes(supabase, prestationId);

  // Entrées orphelines : la ligne a été supprimée, ou son document n'est plus retenu.
  const gardees = new Set(attendues.map((l) => l.id));
  const aSupprimer = [...parLigne.entries()]
    .filter(([ligneId, e]) => e.origine === "devis" && !gardees.has(ligneId))
    .map(([, e]) => e.id);
  if (aSupprimer.length > 0) {
    await supabase.from("prestation_materiel").delete().in("id", aSupprimer);
  }
}


/**
 * Déplie les groupes : « Régie Lumière grandMA2 » part avec ses deux wings et son
 * flightcase, et ces trois-là doivent compter comme utilisés — compteurs d'unité,
 * historique de leur fiche, ROI.
 *
 * Les composants ne portent aucun montant : le chiffre d'affaires reste sur le
 * groupe, qui est ce qui a été vendu. Les compter deux fois gonflerait le ROI.
 */
async function developperGroupes(supabase: Supa, prestationId: string) {
  const { data: entreesData } = await supabase
    .from("prestation_materiel")
    .select("id, reference_id, quantite, utilise, origine")
    .eq("prestation_id", prestationId)
    .neq("origine", "groupe");
  const entrees = (entreesData ?? []) as {
    id: string; reference_id: string | null; quantite: number; utilise: boolean; origine: string;
  }[];
  const refIds = [...new Set(entrees.map((e) => e.reference_id).filter(Boolean) as string[])];
  if (refIds.length === 0) return;

  const { data: groupesData } = await supabase
    .from("materiel_reference")
    .select("id")
    .in("id", refIds)
    .eq("est_groupe", true);
  const groupes = new Set(((groupesData ?? []) as { id: string }[]).map((g) => g.id));

  const { data: existantsData } = await supabase
    .from("prestation_materiel")
    .select("id, parent_materiel_id, reference_id")
    .eq("prestation_id", prestationId)
    .eq("origine", "groupe");
  const existants = (existantsData ?? []) as {
    id: string; parent_materiel_id: string | null; reference_id: string | null;
  }[];

  const attendus = new Set<string>();

  for (const e of entrees) {
    if (!e.reference_id || !groupes.has(e.reference_id)) continue;
    const { data: reglesData } = await supabase
      .from("kit_regle")
      .select("reference_accessoire_id, quantite_par_unite, accessoire:materiel_reference!kit_regle_reference_accessoire_id_fkey(nom)")
      .eq("reference_parent_id", e.reference_id)
      .eq("obligatoire", true);
    const regles = (reglesData ?? []) as unknown as {
      reference_accessoire_id: string; quantite_par_unite: number; accessoire: { nom: string } | null;
    }[];

    for (const r of regles) {
      const cle = `${e.id}:${r.reference_accessoire_id}`;
      attendus.add(cle);
      const quantite = Math.max(1, Math.round(Number(e.quantite ?? 1) * Number(r.quantite_par_unite ?? 1)));
      const deja = existants.find(
        (x) => x.parent_materiel_id === e.id && x.reference_id === r.reference_accessoire_id,
      );
      if (deja) {
        // Le composant suit son groupe : décocher le groupe décoche ce qu'il contient.
        await supabase
          .from("prestation_materiel")
          .update({ quantite, utilise: e.utilise })
          .eq("id", deja.id);
      } else {
        await supabase.from("prestation_materiel").insert({
          prestation_id: prestationId,
          reference_id: r.reference_accessoire_id,
          designation: r.accessoire?.nom ?? null,
          quantite,
          montant: 0,
          origine: "groupe",
          parent_materiel_id: e.id,
          utilise: e.utilise,
        });
      }
    }
  }

  // Composants dont le groupe a disparu de l'événement.
  const aSupprimer = existants
    .filter((x) => !attendus.has(`${x.parent_materiel_id}:${x.reference_id}`))
    .map((x) => x.id);
  if (aSupprimer.length > 0) {
    await supabase.from("prestation_materiel").delete().in("id", aSupprimer);
  }
}
