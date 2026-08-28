import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FinanceTabs } from "../finance-tabs";
import { InfoHint } from "@/components/info-hint";
import { chargerNomenclature } from "@/lib/finance";
import { PrevisionnelView, type PrevRow, type Recurrent } from "./previsionnel-view";

export default async function PrevisionnelPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();

  const [{ data: recData }, { data: prevData }, nomenclature] = await Promise.all([
    supabase.from("depense_recurrente").select("*").order("actif", { ascending: false }).order("nom"),
    supabase
      .from("ecriture_financiere")
      .select("id, date, denomination, montant_ttc, sens, type, specification, prestation_id, prestation:prestation_id(nom, client(nom))")
      .eq("statut", "previsionnel")
      .is("depense_recurrente_id", null)
      .order("date"),
    chargerNomenclature(supabase),
  ]);

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
      <PrevisionnelView ponctuelles={ponctuelles} recurrents={recurrents} nomenclature={nomenclature as Record<string, Record<string, string[]>>} />
    </div>
  );
}
