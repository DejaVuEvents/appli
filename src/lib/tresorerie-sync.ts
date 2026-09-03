// Synchronisation trésorerie ← documents. Module partagé (pas "use server") pour être
// appelable depuis plusieurs fichiers d'actions sans exposer de server action publique.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assemblerContenuDocument } from "@/lib/document";
import { chargerNomenclature, categorieManquante, categorieDefaut } from "@/lib/finance";

type LigneCout = {
  quantite: number;
  reference: {
    cout_location_jour: number | null;
    remise_fournisseur_pct: number | null;
    tva_fournisseur_pct: number | null;
    fournisseur: string | null;
  } | null;
};

/**
 * Coût de sous-location d'un devis, VENTILÉ PAR FOURNISSEUR.
 * Le tarif catalogue est HT : on applique d'abord la remise négociée (sur le HT),
 * puis la TVA — d'où coût = HT × (1 − remise%) × (1 + tva%), × quantité.
 *
 * Le coefficient multi-jours du devis n'intervient PAS : c'est un multiplicateur
 * commercial (ce qu'on facture au client). Le loueur applique son propre coefficient
 * sur son devis à lui, déjà compris dans le tarif catalogue.
 */
export async function coutSousLocationParFournisseur(
  supabase: SupabaseClient,
  devisId: string,
): Promise<Map<string, number>> {
  const { data: lignes } = await supabase
    .from("ligne_prestation")
    .select("quantite, reference:materiel_reference(cout_location_jour, remise_fournisseur_pct, tva_fournisseur_pct, fournisseur)")
    .eq("devis_id", devisId);

  const parFournisseur = new Map<string, number>();
  for (const l of ((lignes ?? []) as unknown as LigneCout[])) {
    const r = l.reference;
    if (!r || r.cout_location_jour == null) continue;
    const ht = Number(r.cout_location_jour) * (1 - Number(r.remise_fournisseur_pct ?? 0) / 100);
    const ttc = ht * (1 + Number(r.tva_fournisseur_pct ?? 20) / 100);
    const montant = ttc * Number(l.quantite ?? 0);
    const cle = r.fournisseur?.trim() || "Sous-location";
    parFournisseur.set(cle, Math.round(((parFournisseur.get(cle) ?? 0) + montant) * 100) / 100);
  }
  return parFournisseur;
}

/** Coût total de sous-location d'un devis (toutes lignes, tous fournisseurs). */
export async function coutSousLocationDevis(supabase: SupabaseClient, devisId: string): Promise<number> {
  const m = await coutSousLocationParFournisseur(supabase, devisId);
  return Math.round([...m.values()].reduce((s2, v) => s2 + v, 0) * 100) / 100;
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
  // Sorties prévisionnelles jumelles (une par fournisseur) : retirées avec l'entrée.
  const supprimerCout = async () => {
    await supabase.from("ecriture_financiere").delete().eq("devis_id", devisId).eq("sens", "sortie");
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

  // Sorties prévisionnelles jumelles : le matériel sous-loué pour cette prestation,
  // UNE LIGNE PAR FOURNISSEUR (Audiotec, loueur de camion…). Sans elles, le prévisionnel
  // n'affiche que le chiffre d'affaires et non le bénéfice réel de l'événement.
  const parFournisseur = await coutSousLocationParFournisseur(supabase, devisId);
  const { data: sortiesExistantes } = await supabase
    .from("ecriture_financiere")
    .select("id, type, specification, effectue_par")
    .eq("devis_id", devisId)
    .eq("sens", "sortie");
  const dejaLa = (sortiesExistantes ?? []) as { id: string; type: string | null; specification: string | null; effectue_par: string | null }[];

  const nomencCout = await chargerNomenclature(supabase);
  const defoCout = categorieDefaut(nomencCout, "sortie", "Matériel", "Location de matériel");
  const gardes = new Set<string>();

  for (const [fournisseur, montantCout] of parFournisseur) {
    if (montantCout <= 0) continue;
    const ex = dejaLa.find((x) => (x.effectue_par ?? "") === fournisseur);
    if (ex) gardes.add(ex.id);
    const typeC = ex && !categorieManquante(nomencCout, "sortie", ex.type) ? ex.type : defoCout.type;
    const specC = ex && !categorieManquante(nomencCout, "sortie", ex.type) ? ex.specification : defoCout.specification;
    const payloadCout = {
      date: datePrev,
      denomination: `Sous-location ${fournisseur} — ${dv.nom ?? "Devis"}${clientNom ? ` (${clientNom})` : ""}`,
      type: typeC, specification: specC,
      sens: "sortie",
      statut: "previsionnel",
      montant_ttc: montantCout,
      effectue_par: fournisseur,
      prestation_id: dv.prestation_id,
      devis_id: devisId,
    };
    if (ex) await supabase.from("ecriture_financiere").update(payloadCout).eq("id", ex.id);
    else await supabase.from("ecriture_financiere").insert({ ...payloadCout, created_by: user?.id ?? null });
  }

  // Fournisseurs disparus du devis → on retire leurs prévisions.
  const obsoletes = dejaLa.filter((x) => !gardes.has(x.id)).map((x) => x.id);
  if (obsoletes.length) await supabase.from("ecriture_financiere").delete().in("id", obsoletes);
}

/**
 * Alimente la trésorerie depuis une facture IMPORTÉE, sans jamais créer de doublon.
 *
 * Une facture déjà réglée a normalement son encaissement dans le journal (sync Qonto).
 * Créer en plus une écriture prévisionnelle gonflerait le prévisionnel d'un montant
 * fantôme — c'est ce qui se passait jusqu'ici. On cherche donc d'abord un mouvement
 * RÉEL du même montant, non encore rattaché à un document, dans une fenêtre autour de
 * la date de facture ; on s'y rattache s'il existe, sinon on crée la prévision.
 *
 * Renvoie ce qui a été fait, pour pouvoir l'annoncer à l'utilisateur.
 */
export async function rattacherOuCreerEcritureFacture(
  supabase: SupabaseClient,
  args: {
    factureId: string;
    prestationId: string;
    numero: string;
    montant: number;
    date: string | null;
    createdBy: string | null;
  },
): Promise<"rattachee" | "creee" | "ignoree"> {
  const { factureId, prestationId, numero, montant, date, createdBy } = args;
  if (!montant) return "ignoree"; // facture annulée / à 0 € : rien à comptabiliser

  const ref = date ?? new Date().toISOString().slice(0, 10);
  const jour = 86400000;
  // Un règlement arrive après la facture, mais un acompte peut la précéder.
  const debut = new Date(new Date(ref).getTime() - 15 * jour).toISOString().slice(0, 10);
  const fin = new Date(new Date(ref).getTime() + 150 * jour).toISOString().slice(0, 10);

  const { data: candidates } = await supabase
    .from("ecriture_financiere")
    .select("id, date")
    .eq("statut", "reel")
    .eq("sens", montant < 0 ? "sortie" : "entree")
    .eq("montant_ttc", montant < 0 ? -montant : montant)
    .is("devis_facture_id", null)
    .gte("date", debut)
    .lte("date", fin);

  const liste = (candidates ?? []) as { id: string; date: string }[];
  if (liste.length > 0) {
    // La plus proche de la date de facture.
    const ecart = (d: string) => Math.abs(new Date(d).getTime() - new Date(ref).getTime());
    const meilleure = liste.reduce((a, b) => (ecart(b.date) < ecart(a.date) ? b : a));
    await supabase
      .from("ecriture_financiere")
      .update({ devis_facture_id: factureId, prestation_id: prestationId })
      .eq("id", meilleure.id);
    // Le mouvement est réel : la facture est donc encaissée.
    await supabase.from("devis_facture").update({ statut_paiement: "paye" }).eq("id", factureId);
    return "rattachee";
  }

  await supabase.from("ecriture_financiere").insert({
    date: ref,
    denomination: `Facture N° ${numero}`,
    type: "Prestation_Tech",
    specification: "Location de matériel",
    sens: montant < 0 ? "sortie" : "entree",
    statut: "previsionnel",
    montant_ttc: montant < 0 ? -montant : montant,
    prestation_id: prestationId,
    devis_facture_id: factureId,
    valide: false,
    created_by: createdBy,
  });
  return "creee";
}
