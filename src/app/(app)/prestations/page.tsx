import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { PrestationForm } from "./prestation-form";
import { createPrestation } from "./actions";
import { DocsSection, type DocRow } from "./docs-section";

type DevisModeleRow = { id: string; nom: string | null; type: string; prestation: { nom: string } | null };

async function chargerModales(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: clientsData }, { data: devisData }] = await Promise.all([
    supabase.from("client").select("id, nom").order("nom"),
    supabase.from("devis").select("id, nom, type, prestation:prestation_id(nom)").order("created_at", { ascending: false }),
  ]);
  const clients = (clientsData ?? []) as { id: string; nom: string }[];
  const modeles = ((devisData ?? []) as unknown as DevisModeleRow[]).map((d) => ({
    id: d.id,
    label: `${d.prestation?.nom ?? "?"} · ${d.nom ?? (d.type === "facture" ? "Facture" : "Devis")}`,
  }));
  const creerDevis = (
    <Modal trigger="+ Créer un devis" title="Créer un devis">
      <p className="mb-4 text-sm text-muted">Nouveau devis dans un nouvel événement — vierge, ou copié d&apos;un devis existant.</p>
      <PrestationForm action={createPrestation} clients={clients} cancelHref="/prestations" inModal type="devis" devisModeles={modeles} />
    </Modal>
  );
  const creerFacture = (
    <Modal trigger="+ Créer une facture" title="Créer une facture">
      <p className="mb-4 text-sm text-muted">Nouvelle facture — vierge, ou à partir d&apos;un devis existant. (Depuis un devis déjà ouvert, tu peux aussi utiliser « Transformer en facture ».)</p>
      <PrestationForm action={createPrestation} clients={clients} cancelHref="/prestations" inModal type="facture" devisModeles={modeles} />
    </Modal>
  );
  return { creerDevis, creerFacture };
}

type DevisDocRow = {
  id: string;
  nom: string | null;
  type: "devis" | "facture";
  statut_signature: string | null;
  created_at: string | null;
  prestation: { id: string; nom: string; lieu: string | null; date_event_debut: string | null; client: { nom: string } | null } | null;
};

export default async function PrestationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp?.tab === "factures" ? "factures" : "devis";

  const supabase = await createClient();

  const { creerDevis, creerFacture } = await chargerModales(supabase);

  // Tous les documents (devis + factures) avec leur événement parent + statut d'émission.
  const [{ data: devisData }, { data: dfData }] = await Promise.all([
    supabase
      .from("devis")
      .select("id, nom, type, statut_signature, created_at, prestation:prestation_id(id, nom, lieu, date_event_debut, client(nom))")
      .order("created_at", { ascending: false }),
    supabase.from("devis_facture").select("devis_id, numero, statut_paiement").eq("type", "facture"),
  ]);

  const allDocs = (devisData ?? []) as unknown as DevisDocRow[];
  const factureInfo = new Map(
    (dfData ?? []).map((d) => [d.devis_id as string, d as { numero: string | null; statut_paiement: string | null }]),
  );

  const toRow = (d: DevisDocRow): DocRow => {
    const df = d.type === "facture" ? factureInfo.get(d.id) : undefined;
    const numero = df?.numero ? ` · n°${df.numero}` : "";
    return {
      id: d.id,
      prestationId: d.prestation?.id ?? "",
      titre: `${d.nom || (d.type === "facture" ? "Facture" : "Devis")}${numero}`,
      client: d.prestation?.client?.nom ?? null,
      lieu: d.prestation?.lieu ?? null,
      date: d.prestation?.date_event_debut ?? (d.created_at ? d.created_at.slice(0, 10) : null),
      type: d.type,
      emis: !!df?.numero,
      statutPaiement: df?.statut_paiement ?? null,
      statutSignature: d.statut_signature ?? null,
    };
  };

  const docs = allDocs
    .filter((d) => d.type === (tab === "factures" ? "facture" : "devis") && d.prestation)
    .map(toRow);

  const action = tab === "factures" ? creerFacture : creerDevis;

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Devis / Factures"
        subtitle={`${docs.length} ${tab === "factures" ? "facture" : "devis"}${docs.length > 1 ? "s" : ""}`}
        action={action}
      />
      <SubTabs tab={tab} />

      {docs.length === 0 ? (
        <EmptyState
          title={tab === "factures" ? "Aucune facture" : "Aucun devis"}
          description={
            tab === "factures"
              ? "Crée une facture (vierge ou à partir d'un devis existant)."
              : "Crée un devis pour construire ton offre (matériel, accessoires, transport, prix)."
          }
          action={action}
        />
      ) : (
        <DocsSection docs={docs} />
      )}
    </div>
  );
}

function SubTabs({ tab }: { tab: string }) {
  const tabCls = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      active ? "bg-background shadow-sm border border-border" : "text-muted hover:bg-background/60"
    }`;

  return (
    <div className="mb-6">
      <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        <Link href="/prestations?tab=devis" className={tabCls(tab === "devis")}>
          Devis
        </Link>
        <Link href="/prestations?tab=factures" className={tabCls(tab === "factures")}>
          Factures
        </Link>
      </div>
    </div>
  );
}

