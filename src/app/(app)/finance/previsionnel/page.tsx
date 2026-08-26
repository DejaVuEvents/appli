import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FinanceTabs } from "../finance-tabs";
import { chargerNomenclature } from "@/lib/finance";
import { PrevisionnelView, type PrevRow, type Recurrent } from "./previsionnel-view";

export default async function PrevisionnelPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();

  const [{ data: recData }, { data: prevData }, nomenclature] = await Promise.all([
    supabase.from("depense_recurrente").select("*").order("actif", { ascending: false }).order("nom"),
    supabase
      .from("ecriture_financiere")
      .select("id, date, denomination, montant_ttc, sens, type, specification")
      .eq("statut", "previsionnel")
      .is("depense_recurrente_id", null)
      .order("date"),
    chargerNomenclature(supabase),
  ]);

  const recurrents = (recData ?? []) as Recurrent[];
  const ponctuelles = (prevData ?? []) as PrevRow[];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Comptabilité" />
      <FinanceTabs annee={annee} />
      <h2 className="mb-1 text-base font-semibold">Prévisionnel</h2>
      <p className="mb-5 text-sm text-muted">Dépenses/recettes à venir : récurrentes (abonnements, assurance, frais bancaires…) et prévisions ponctuelles (devis signés, factures non payées, échéances).</p>
      <PrevisionnelView ponctuelles={ponctuelles} recurrents={recurrents} nomenclature={nomenclature as Record<string, Record<string, string[]>>} />
    </div>
  );
}
