// Synchronisation trésorerie ← documents. Module partagé (pas "use server") pour être
// appelable depuis plusieurs fichiers d'actions sans exposer de server action publique.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assemblerContenuDocument } from "@/lib/document";
import { chargerNomenclature, categorieManquante, categorieDefaut } from "@/lib/finance";

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
  // Découpage acompte/solde : les factures filles portent la recette → pas de double.
  const { data: filles } = await supabase
    .from("devis")
    .select("id")
    .eq("source_devis_id", devisId)
    .eq("type", "facture");
  const couvertParFacture = !!fac?.numero || (filles ?? []).length > 0;

  const { data: existante } = await supabase
    .from("ecriture_financiere")
    .select("id, type, specification")
    .eq("devis_id", devisId)
    .maybeSingle();

  if (dv.statut_signature !== "signe" || couvertParFacture) {
    if (existante) await supabase.from("ecriture_financiere").delete().eq("id", existante.id);
    return;
  }

  // Montant = total TTC (même base que la facture → pas de saut à l'émission).
  const contenu = await assemblerContenuDocument(supabase, devisId);
  const montant = contenu?.tva.totalTtc ?? contenu?.totaux.totalHT ?? 0;
  if (!montant) {
    if (existante) await supabase.from("ecriture_financiere").delete().eq("id", existante.id);
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
    denomination: `Devis signé — ${dv.nom ?? "Devis"}${clientNom ? ` (${clientNom})` : ""}`,
    type, specification,
    sens: "entree",
    statut: "previsionnel",
    montant_ttc: montant,
    prestation_id: dv.prestation_id,
    devis_id: devisId,
  };

  if (existante) {
    await supabase.from("ecriture_financiere").update(payload).eq("id", existante.id);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("ecriture_financiere").insert({ ...payload, created_by: user?.id ?? null });
  }
}
