import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FinanceTabs } from "../finance-tabs";
import { InfoHint } from "@/components/info-hint";
import { chargerNomenclature } from "@/lib/finance";
import { PrevisionnelView, type PrevRow, type Recurrent } from "./previsionnel-view";

export default async function PrevisionnelPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();

  const [{ data: recData }, { data: prevData }, { data: entData }, { data: toutesEcritures }, nomenclature] = await Promise.all([
    supabase.from("depense_recurrente").select("*").order("actif", { ascending: false }).order("nom"),
    supabase
      .from("ecriture_financiere")
      .select("id, date, denomination, montant_ttc, sens, type, specification, prestation_id, prestation:prestation_id(nom, client(nom))")
      .eq("statut", "previsionnel")
      .is("depense_recurrente_id", null)
      .order("date"),
    supabase.from("parametres_entreprise").select("solde_initial, solde_initial_date, seuil_alerte").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("date, montant_ttc, sens, statut, depense_recurrente_id"),
    chargerNomenclature(supabase),
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
        nomenclature={nomenclature as Record<string, Record<string, string[]>>}
        soldeReel={soldeReel}
        seuil={Number(ent?.seuil_alerte ?? 0)}
        recurrentesParMois={recurrentesParMois}
      />
    </div>
  );
}
