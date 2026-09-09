import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FinanceTabs } from "../finance-tabs";
import { InfoHint } from "@/components/info-hint";
import { chargerNomenclature } from "@/lib/finance";
import { PrevisionnelView, type PrevRow, type Recurrent } from "./previsionnel-view";

export default async function PrevisionnelPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();

  const [{ data: recData }, { data: prevData }, { data: entData }, { data: toutesEcritures }, { data: ndfData }, nomenclature, { data: suggData }, { data: docData }] = await Promise.all([
    supabase.from("depense_recurrente").select("*").order("actif", { ascending: false }).order("nom"),
    supabase
      .from("ecriture_financiere")
      .select("*, prestation:prestation_id(id, nom, client(nom))")
      .eq("statut", "previsionnel")
      .is("depense_recurrente_id", null)
      .order("date"),
    supabase.from("parametres_entreprise").select("solde_initial, solde_initial_date, seuil_alerte").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("date, montant_ttc, sens, statut, depense_recurrente_id, note_frais_id, devis_id"),
    // Notes de frais validées dont le remboursement n'est pas encore décaissé.
    supabase
      .from("note_frais")
      .select("id, numero, titre, date, ecriture_id, lignes:ligne_note_frais(montant_ttc)")
      .in("statut", ["soumise", "validee"])
      .order("date", { ascending: false }),
    chargerNomenclature(supabase),
    supabase.rpc("suggestions_rapprochement_ndf"),
    // Devis signés / factures émises, pour les proposer comme source d'une prévision.
    supabase
      .from("devis_facture")
      .select("numero, montant_ttc, date_emission, statut_paiement, devis_id, devis:devis_id(nom, prestation:prestation_id(nom))")
      .not("devis_id", "is", null)
      // Une facture payée ou annulée n'a plus rien à prévoir : seuls les documents
      // dont l'argent reste à encaisser sont proposés.
      .or("statut_paiement.is.null,statut_paiement.eq.en_attente")
      .order("date_emission", { ascending: false }),
  ]);

  // Point de départ du solde projeté : le réel encaissé à ce jour.
  const ent = entData as { solde_initial: number | null; solde_initial_date: string | null; seuil_alerte: number | null } | null;
  const lignes = (toutesEcritures ?? []) as { date: string; montant_ttc: number; sens: string; statut: string; depense_recurrente_id: string | null }[];
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const depuis = ent?.solde_initial_date ?? null;
  const soldeReel = lignes
    .filter((e) => e.statut === "reel" && e.date <= aujourdhui && (!depuis || e.date >= depuis))
    .reduce((s2, e) => s2 + (e.sens === "entree" ? Number(e.montant_ttc) : -Number(e.montant_ttc)), Number(ent?.solde_initial ?? 0));

  // Net mensuel des prévisions RÉCURRENTES : absentes de la liste affichée, mais elles
  // pèsent sur le solde — les ignorer donnerait une projection fausse.
  // Une note déjà liée à une prévision ou à un décaissement réel ne doit plus être proposée.
  const dejaLiees = new Set(
    ((toutesEcritures ?? []) as { note_frais_id?: string | null }[]).map((e) => e.note_frais_id).filter(Boolean) as string[],
  );
  const ndfAPrevoir = ((ndfData ?? []) as unknown as {
    id: string; numero: string | null; titre: string | null; date: string | null;
    ecriture_id: string | null; lignes: { montant_ttc: number }[];
  }[])
    .filter((n) => !n.ecriture_id && !dejaLiees.has(n.id))
    .map((n) => ({
      id: n.id,
      libelle: `${n.numero ?? "NDF"} — ${n.titre ?? "Note de frais"}`,
      montant: Math.round((n.lignes ?? []).reduce((s2, l) => s2 + Number(l.montant_ttc ?? 0), 0) * 100) / 100,
      date: n.date,
    }))
    .filter((n) => n.montant > 0)
    .map((n) => ({ ...n, kind: "ndf" as const }));

  // Un devis/facture déjà porté par une écriture ne doit plus être proposé.
  const devisLies = new Set(
    ((toutesEcritures ?? []) as { devis_id?: string | null }[]).map((e) => e.devis_id).filter(Boolean) as string[],
  );
  const devisAPrevoir = ((docData ?? []) as unknown as {
    numero: string | null; montant_ttc: number | null; date_emission: string | null;
    devis_id: string; devis: { nom: string | null; prestation: { nom: string } | null } | null;
  }[])
    .filter((d) => !devisLies.has(d.devis_id) && Number(d.montant_ttc ?? 0) > 0)
    .map((d) => ({
      id: d.devis_id,
      kind: "devis" as const,
      libelle: `${d.numero ?? "Document"} — ${d.devis?.prestation?.nom ?? d.devis?.nom ?? "Devis"}`,
      montant: Number(d.montant_ttc),
      date: d.date_emission,
    }));

  const docsAPrevoir = [...ndfAPrevoir, ...devisAPrevoir];

  // Décaissements réels qui pourraient solder une prévision de note de frais.
  const suggestions = ((suggData ?? []) as {
    prevision_id: string; note_numero: string | null; note_titre: string | null;
    ecriture_id: string; ecriture_date: string; ecriture_libelle: string | null;
  }[]).map((x) => ({
    previsionId: x.prevision_id,
    ecritureId: x.ecriture_id,
    libelle: x.ecriture_libelle ?? "Décaissement",
    date: x.ecriture_date,
  }));

  const recurrentesParMois: Record<string, number> = {};
  for (const e of lignes) {
    if (e.statut !== "previsionnel" || !e.depense_recurrente_id) continue;
    const cle = e.date.slice(0, 7);
    recurrentesParMois[cle] = (recurrentesParMois[cle] ?? 0) + (e.sens === "entree" ? Number(e.montant_ttc) : -Number(e.montant_ttc));
  }

  const recurrents = (recData ?? []) as Recurrent[];
  const ponctuelles = ((prevData ?? []) as unknown as (PrevRow & {
    prestation: { nom: string; client: { nom: string } | null } | null;
  })[]).map((r) => ({
    ...r,
    prestationNom: r.prestation
      ? `${r.prestation.nom}${r.prestation.client?.nom ? ` · ${r.prestation.client.nom}` : ""}`
      : null,
  })) as PrevRow[];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Comptabilité" />
      <FinanceTabs annee={annee} />
      <h2 className="mb-4 text-base font-semibold">
        Prévisionnel
        <InfoHint text="Dépenses et recettes à venir : récurrentes (abonnements, assurance, frais bancaires…) et prévisions ponctuelles (devis signés, factures non payées, échéances fournisseurs, saisies manuelles)." />
      </h2>
      <PrevisionnelView
        ponctuelles={ponctuelles}
        recurrents={recurrents}
        nomenclature={nomenclature}
        soldeReel={soldeReel}
        seuil={Number(ent?.seuil_alerte ?? 0)}
        recurrentesParMois={recurrentesParMois}
        docsAPrevoir={docsAPrevoir}
        suggestions={suggestions}
      />
    </div>
  );
}
