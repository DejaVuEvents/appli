// Synchronisation trésorerie ← documents. Module partagé (pas "use server") pour être
// appelable depuis plusieurs fichiers d'actions sans exposer de server action publique.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assemblerContenuDocument } from "@/lib/document";
import { chargerNomenclature, categorieManquante, categorieDefaut } from "@/lib/finance";

/**
 * Coût de sous-location d'un devis : matériel du catalogue ayant un coût fournisseur
 * (`cout_location_jour`), × quantité × coefficient multi-jours.
 */
export async function coutSousLocationDevis(supabase: SupabaseClient, devisId: string): Promise<number> {
  const { data: d } = await supabase.from("devis").select("coefficient_duree").eq("id", devisId).maybeSingle();
  const coeff = Number(d?.coefficient_duree ?? 0) > 0 ? Number(d!.coefficient_duree) : 1;
  const { data: lignes } = await supabase
    .from("ligne_prestation")
    .select("quantite, reference:materiel_reference(cout_location_jour)")
    .eq("devis_id", devisId);
  const total = ((lignes ?? []) as unknown as { quantite: number; reference: { cout_location_jour: number | null } | null }[])
    .reduce((s2, l) => s2 + (l.reference?.cout_location_jour != null ? Number(l.reference.cout_location_jour) * Number(l.quantite ?? 0) : 0), 0);
  return Math.round(total * coeff * 100) / 100;
}

/**
 * Auto-alimentation de la trésorerie depuis un DEVIS SIGNÉ : crée/maj une entrée
 * PRÉVISIONNELLE liée (`devis_id`). Retirée dès qu'une facture est émise pour ce devis,
 * qu'il est découpé en acompte/solde (les filles portent la recette), ou qu'il n'est plus signé.
 */
export async function synchroniserEcritureDevisSigne(supabase: SupabaseClient, devisId: string) {
  const { data: dv } = await supabase
    .from("devis")
    .select("id, nom, prestation_id, statut_signature")
    .eq("id", devisId)
    .maybeSingle();
  if (!dv) return;

  const { data: fac } = await supabase
    .from("devis_facture")
    .select("numero")
    .eq("devis_id", devisId)
    .eq("type", "facture")
    .maybeSingle();
  // Découpage acompte/solde : seules les factures filles ÉMISES portent la recette.
  // Tant qu'une tranche n'est pas émise, elle reste couverte par la prévision du devis
  // (sinon la recette attendue disparaîtrait du prévisionnel entre le découpage et l'émission).
  const { data: filles } = await supabase
    .from("devis")
    .select("id")
    .eq("source_devis_id", devisId)
    .eq("type", "facture");
  let dejaFacture = 0;
  for (const f of filles ?? []) {
    const { data: df } = await supabase
      .from("devis_facture")
      .select("numero, montant_ttc")
      .eq("devis_id", f.id)
      .eq("type", "facture")
      .maybeSingle();
    if (df?.numero) dejaFacture += Number(df.montant_ttc ?? 0);
  }
  const couvertParFacture = !!fac?.numero;

  const { data: existante } = await supabase
    .from("ecriture_financiere")
    .select("id, type, specification")
    .eq("devis_id", devisId)
    .eq("sens", "entree")
    .maybeSingle();
  // Sortie prévisionnelle jumelle : le coût de sous-location de ce devis.
  const { data: existanteCout } = await supabase
    .from("ecriture_financiere")
    .select("id, type, specification")
    .eq("devis_id", devisId)
    .eq("sens", "sortie")
    .maybeSingle();
  const supprimerCout = async () => {
    if (existanteCout) await supabase.from("ecriture_financiere").delete().eq("id", existanteCout.id);
  };

  if (dv.statut_signature !== "signe" || couvertParFacture) {
    if (existante) await supabase.from("ecriture_financiere").delete().eq("id", existante.id);
    await supprimerCout();
    return;
  }

  // Montant = total TTC restant à facturer (total − tranches déjà émises).
  const contenu = await assemblerContenuDocument(supabase, devisId);
  const total = contenu?.tva.totalTtc ?? contenu?.totaux.totalHT ?? 0;
  const montant = Math.round((total - dejaFacture) * 100) / 100;
  if (montant <= 0) {
    if (existante) await supabase.from("ecriture_financiere").delete().eq("id", existante.id);
    await supprimerCout();
    return;
  }

  const nomenclature = await chargerNomenclature(supabase);
  let type = existante?.type ?? null;
  let specification = existante?.specification ?? null;
  if (categorieManquante(nomenclature, "entree", type)) {
    const defo = categorieDefaut(nomenclature, "entree", "Prestation_Tech", "Location de matériel");
    type = defo.type;
    specification = defo.specification;
  }

  let datePrev = new Date().toISOString().slice(0, 10);
  let clientNom = "";
  if (dv.prestation_id) {
    const { data: p } = await supabase.from("prestation").select("date_event_debut, client(nom)").eq("id", dv.prestation_id).maybeSingle();
    const pp = p as unknown as { date_event_debut: string | null; client: { nom: string } | null } | null;
    if (pp?.date_event_debut) datePrev = pp.date_event_debut;
    clientNom = pp?.client?.nom ?? "";
  }

  const payload = {
    date: datePrev,
    denomination: `${dejaFacture > 0 ? "Reste à facturer" : "Devis signé"} — ${dv.nom ?? "Devis"}${clientNom ? ` (${clientNom})` : ""}`,
    type, specification,
    sens: "entree",
    statut: "previsionnel",
    montant_ttc: montant,
    prestation_id: dv.prestation_id,
    devis_id: devisId,
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (existante) {
    await supabase.from("ecriture_financiere").update(payload).eq("id", existante.id);
  } else {
    await supabase.from("ecriture_financiere").insert({ ...payload, created_by: user?.id ?? null });
  }

  // Sortie prévisionnelle jumelle : le matériel sous-loué pour cette prestation
  // (Audiotec, camion…). Sans elle, le prévisionnel n'affiche que le chiffre d'affaires
  // et non le bénéfice réel de l'événement.
  const cout = await coutSousLocationDevis(supabase, devisId);
  if (cout <= 0) {
    await supprimerCout();
    return;
  }
  const nomencCout = await chargerNomenclature(supabase);
  let typeCout = existanteCout?.type ?? null;
  let specCout = existanteCout?.specification ?? null;
  if (categorieManquante(nomencCout, "sortie", typeCout)) {
    const defo = categorieDefaut(nomencCout, "sortie", "Matériel", "Location de matériel");
    typeCout = defo.type;
    specCout = defo.specification;
  }
  const payloadCout = {
    date: datePrev,
    denomination: `Sous-location — ${dv.nom ?? "Devis"}${clientNom ? ` (${clientNom})` : ""}`,
    type: typeCout, specification: specCout,
    sens: "sortie",
    statut: "previsionnel",
    montant_ttc: cout,
    prestation_id: dv.prestation_id,
    devis_id: devisId,
  };
  if (existanteCout) {
    await supabase.from("ecriture_financiere").update(payloadCout).eq("id", existanteCout.id);
  } else {
    await supabase.from("ecriture_financiere").insert({ ...payloadCout, created_by: user?.id ?? null });
  }
}
