import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Modal } from "@/components/modal";
import { FinanceTabs } from "../finance-tabs";
import { EcritureForm } from "../ecriture-form";
import { createEcriture } from "../actions";
import { JournalTabs } from "./journal-tabs";
import { ExportModal } from "../export-modal";
import { urlDocument } from "@/lib/storage";
import { chargerNomenclature } from "@/lib/finance";
import type { EcritureFinanciere } from "@/lib/types";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const sp = await searchParams;
  const annee = Number(sp?.annee) || new Date().getFullYear();

  const supabase = await createClient();
  const [{ data }, { data: prestData }, { data: justifData }] = await Promise.all([
    supabase.from("ecriture_financiere").select("*").order("date", { ascending: false }),
    supabase.from("prestation").select("id, nom, est_evenement, client(nom)").order("date_event_debut", { ascending: false }),
    supabase.from("justificatif").select("ecriture_id").not("ecriture_id", "is", null),
  ]);

  const ecrituresBrutes = ((data ?? []) as EcritureFinanciere[]).filter(
    (e) => new Date(e.date).getFullYear() === annee,
  );
  // Résout le champ `facture` : fichier privé → URL signée ; référence texte → conservée telle quelle.
  const ecritures = await Promise.all(
    ecrituresBrutes.map(async (e) => ({ ...e, facture: (await urlDocument(supabase, e.facture)) ?? e.facture })),
  );
  const prestations = (prestData ?? []) as unknown as { id: string; nom: string; client: { nom: string } | null }[];
  const avecJustif = new Set((justifData ?? []).map((j) => j.ecriture_id as string));

  // Factures liées à chaque entrée (via ecriture_facture) : lien "Voir facture" + aperçu (PDF signé si importé)
  const ecrIds = ecritures.map((e) => e.id);
  const { data: liensData } = ecrIds.length
    ? await supabase
        .from("ecriture_facture")
        .select("ecriture_id, devis_facture:devis_facture_id(devis_id, numero, type, prestation_id, devis:devis_id(pdf_import))")
        .in("ecriture_id", ecrIds)
    : { data: [] };
  const facturesLiees: Record<string, { numero: string | null; type: string; prestationId: string | null; devisId: string | null; previewUrl: string | null; voirUrl: string | null }[]> = {};
  for (const l of (liensData ?? []) as unknown as { ecriture_id: string; devis_facture: { devis_id: string | null; numero: string | null; type: string; prestation_id: string | null; devis: { pdf_import: string | null } | null } | null }[]) {
    const df = l.devis_facture;
    if (!df) continue;
    const previewUrl = df.devis?.pdf_import ? await urlDocument(supabase, df.devis.pdf_import) : null;
    const voirUrl = df.prestation_id ? `/prestations/${df.prestation_id}/document?devis=${df.devis_id ?? ""}&type=${df.type}` : null;
    (facturesLiees[l.ecriture_id] ??= []).push({ numero: df.numero, type: df.type, prestationId: df.prestation_id, devisId: df.devis_id, previewUrl, voirUrl });
  }

  const nomenclature = await chargerNomenclature(supabase);

  // Actions (barre d'outils) : nouvelle écriture (modale) + export (modale)
  const sidebar = (
    <div key="journal-actions" className="flex items-center gap-2">
      <Modal
        key="nouvelle-ecriture"
        trigger={<>+ Nouvelle écriture</>}
        title="Nouvelle écriture"
        triggerClassName="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <EcritureForm action={createEcriture} prestations={prestations} inModal nomenclature={nomenclature} />
      </Modal>
      <ExportModal key="export" annee={annee} />
    </div>
  );

  return (
    <div className="max-w-7xl">
      <PageHeader title="Comptabilité" />
      <FinanceTabs annee={annee} />
      <JournalTabs all={ecritures} prestations={prestations} sidebar={sidebar} avecJustif={[...avecJustif]} facturesLiees={facturesLiees} nomenclature={nomenclature} />
    </div>
  );
}
