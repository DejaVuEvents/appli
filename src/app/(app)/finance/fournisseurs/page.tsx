import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm-button";
import { AutoSelect } from "@/components/auto-select";
import { FinanceTabs } from "../finance-tabs";
import { FournisseurForm } from "./fournisseur-form";
import { createFactureFournisseur, setStatutFournisseur, deleteFactureFournisseur } from "./actions";
import { euros, dateFr } from "@/lib/format";
import { urlDocument } from "@/lib/storage";
import { STATUT_FOURNISSEUR_LABELS, type FactureFournisseur, type StatutFournisseur } from "@/lib/types";

const STATUT_CLS: Record<StatutFournisseur, string> = {
  a_payer: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  planifie: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  paye: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  retard: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};
const statutOptions = (Object.keys(STATUT_FOURNISSEUR_LABELS) as StatutFournisseur[]).map((s) => ({ value: s, label: STATUT_FOURNISSEUR_LABELS[s] }));

export default async function FournisseursPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();

  const [{ data: ffData }, { data: prestData }] = await Promise.all([
    supabase.from("facture_fournisseur").select("*").order("date_echeance", { ascending: true, nullsFirst: false }),
    supabase.from("prestation").select("id, nom").order("date_event_debut", { ascending: false }),
  ]);
  const factures = (ffData ?? []) as FactureFournisseur[];
  const prestations = (prestData ?? []) as { id: string; nom: string }[];

  // Justificatifs fournisseurs : URL signée (bucket privé) ou publique (legacy).
  const fichierUrl = new Map<string, string | null>();
  await Promise.all(
    factures.filter((f) => f.fichier_url).map(async (f) => fichierUrl.set(f.id, await urlDocument(supabase, f.fichier_url))),
  );

  const today = new Date().toISOString().slice(0, 10);
  const nonPayees = factures.filter((f) => f.statut_paiement !== "paye");
  const enRetard = nonPayees.filter((f) => f.date_echeance && f.date_echeance < today);
  const aVenir = nonPayees.filter((f) => !f.date_echeance || f.date_echeance >= today);
  const totalDu = nonPayees.reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0);
  const totalRetard = enRetard.reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0);

  const ajouter = (
    <Modal trigger={<>+ Facture fournisseur</>} title="Nouvelle facture fournisseur" panelClassName="max-w-xl">
      <FournisseurForm action={createFactureFournisseur} prestations={prestations} />
    </Modal>
  );

  const Ligne = ({ f }: { f: FactureFournisseur }) => {
    const retard = f.statut_paiement !== "paye" && f.date_echeance && f.date_echeance < today;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{f.fournisseur}</span>
            {f.numero && <span className="text-xs text-muted">N° {f.numero}</span>}
            {retard && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">En retard</span>}
          </div>
          <div className="text-xs text-muted">
            Échéance : {dateFr(f.date_echeance)}
            {f.date_facture ? ` · facturé le ${dateFr(f.date_facture)}` : ""}
            {fichierUrl.get(f.id) ? <> · <a href={fichierUrl.get(f.id)!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">justificatif</a></> : ""}
          </div>
          {f.notes && <div className="text-[11px] italic text-muted">{f.notes}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-semibold tabular-nums text-red-600">− {euros(f.montant_ttc)}</span>
          <AutoSelect
            action={setStatutFournisseur.bind(null, f.id)}
            name="statut_paiement"
            value={f.statut_paiement}
            options={statutOptions}
            className={`rounded-lg border border-border px-2 py-1 text-xs font-medium ${STATUT_CLS[f.statut_paiement] ?? ""}`}
          />
          <form action={deleteFactureFournisseur.bind(null, f.id)}>
            <ConfirmButton confirm={`Supprimer la facture ${f.fournisseur} ? (l'écriture de trésorerie liée sera retirée)`} className="text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl">
      <PageHeader title="Finance / Trésorerie" action={ajouter} />
      <FinanceTabs annee={annee} />

      {/* Résumé échéancier */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xl font-bold text-red-600 tabular-nums">{euros(totalDu)}</div><div className="mt-0.5 text-xs text-muted">Total à payer</div></Card>
        <Card className="p-4"><div className={`text-xl font-bold tabular-nums ${totalRetard > 0 ? "text-red-600" : ""}`}>{euros(totalRetard)}</div><div className="mt-0.5 text-xs text-muted">Dont en retard ({enRetard.length})</div></Card>
        <Card className="p-4"><div className="text-xl font-bold tabular-nums">{nonPayees.length}</div><div className="mt-0.5 text-xs text-muted">Factures ouvertes</div></Card>
      </div>

      <p className="mb-4 text-xs text-muted">
        Chaque facture crée automatiquement une <strong>sortie prévisionnelle</strong>{" "}dans le journal (réelle une fois « Payé »),
        visible dans la trésorerie et le calendrier. L&apos;écriture auto reste <strong>à valider</strong> dans le journal.
      </p>

      {/* En retard */}
      {enRetard.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-600">⚠ En retard</h2>
          <Card className="divide-y divide-border overflow-hidden ring-1 ring-red-200 dark:ring-red-500/20">{enRetard.map((f) => <Ligne key={f.id} f={f} />)}</Card>
        </section>
      )}

      {/* À venir */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">À payer (échéancier)</h2>
        {aVenir.length === 0 ? (
          <Card className="px-4 py-6 text-sm text-muted">Aucune facture fournisseur en attente. Clique « + Facture fournisseur » pour en ajouter une.</Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">{aVenir.map((f) => <Ligne key={f.id} f={f} />)}</Card>
        )}
      </section>

      {/* Payées */}
      {factures.some((f) => f.statut_paiement === "paye") && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Payées</h2>
          <Card className="divide-y divide-border overflow-hidden opacity-80">{factures.filter((f) => f.statut_paiement === "paye").map((f) => <Ligne key={f.id} f={f} />)}</Card>
        </section>
      )}
    </div>
  );
}
