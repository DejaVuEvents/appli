import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm-button";
import { PrestationForm } from "../prestations/prestation-form";
import { createEvenement, deletePrestation } from "../prestations/actions";
import { LocationForm, type LocationRow } from "./location-form";
import { createLocation, deleteLocation } from "./actions";
import { dateFr, euros } from "@/lib/format";

type PrestaRow = {
  id: string;
  nom: string;
  statut: string | null;
  date_prepa: string | null;
  date_event_debut: string | null;
  date_event_fin: string | null;
  date_retour: string | null;
  client: { nom: string } | null;
};

const STATUT_CLS: Record<string, string> = {
  devis: "bg-surface text-muted",
  confirme: "bg-blue-100 text-blue-700",
  en_cours: "bg-amber-100 text-amber-800",
  termine: "bg-green-100 text-green-700",
  rendu: "bg-green-100 text-green-700",
  prevu: "bg-surface text-muted",
  annule: "bg-red-100 text-red-700",
};

function refDate(p: PrestaRow): string {
  return p.date_event_debut ?? p.date_prepa ?? p.date_retour ?? "";
}

export default async function PlanificationPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { vue } = await searchParams;
  const onglet = vue === "location" ? "location" : "evenements";
  const supabase = await createClient();
  const [{ data }, { data: clientsData }, { data: locData }] = await Promise.all([
    supabase
      .from("prestation")
      .select("id, nom, statut, date_prepa, date_event_debut, date_event_fin, date_retour, client(nom)")
      .eq("est_evenement", true)
      .order("date_event_debut", { ascending: false }),
    supabase.from("client").select("id, nom").order("nom"),
    supabase.from("location").select("*").order("date_debut", { ascending: false }),
  ]);
  const prestations = (data ?? []) as unknown as PrestaRow[];
  const clients = (clientsData ?? []) as { id: string; nom: string }[];
  const clientNom = new Map(clients.map((c) => [c.id, c.nom]));
  const locations = (locData ?? []) as LocationRow[];

  const ajouterEvenement = (
    <Modal trigger="+ Ajouter un événement" title="Nouvel événement">
      <p className="mb-4 text-sm text-muted">Crée l&apos;événement (dates, lieu, client). Tu pourras ensuite y ajouter un ou plusieurs devis.</p>
      <PrestationForm action={createEvenement} clients={clients} cancelHref="/planification" inModal submitLabel="Créer l'événement" />
    </Modal>
  );

  const ajouterLocation = (
    <Modal trigger="+ Ajouter une location" title="Nouvelle location">
      <LocationForm action={createLocation} clients={clients} />
    </Modal>
  );

  const today = new Date().toISOString().slice(0, 10);

  // Badge de statut + bouton supprimer, communs aux 2 listes.
  const Badge = ({ statut }: { statut: string | null }) => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUT_CLS[statut ?? ""] ?? "bg-surface text-muted"}`}>
      {(statut ?? "—").replace(/_/g, " ")}
    </span>
  );
  const btnSupprimer = "rounded-lg border border-border px-2 py-1 text-xs text-red-600 hover:bg-surface";

  // ── Événements ──
  const aVenir = prestations
    .filter((p) => (p.date_event_fin ?? p.date_retour ?? refDate(p) ?? "") >= today)
    .sort((a, b) => refDate(a).localeCompare(refDate(b)));
  const passees = prestations
    .filter((p) => !aVenir.includes(p))
    .sort((a, b) => refDate(b).localeCompare(refDate(a)));

  const Row = ({ p }: { p: PrestaRow }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
      <Link href={`/prestations/${p.id}`} className="min-w-0 flex-1">
        <div className="font-medium truncate">{p.nom}</div>
        <div className="text-xs text-muted">{p.client?.nom ?? "Sans client"}{refDate(p) ? ` · ${dateFr(refDate(p))}` : ""}</div>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <Badge statut={p.statut} />
        <form action={deletePrestation.bind(null, p.id, "/planification")}>
          <ConfirmButton confirm={`Supprimer l'événement « ${p.nom} » et tous ses devis ?`} className={btnSupprimer}>✕</ConfirmButton>
        </form>
      </div>
    </div>
  );

  // ── Locations ──
  const refDateLoc = (l: LocationRow) => l.date_fin ?? l.date_debut ?? "";
  const locAVenir = locations
    .filter((l) => refDateLoc(l) >= today)
    .sort((a, b) => refDateLoc(a).localeCompare(refDateLoc(b)));
  const locPassees = locations
    .filter((l) => !locAVenir.includes(l))
    .sort((a, b) => refDateLoc(b).localeCompare(refDateLoc(a)));

  const LocRow = ({ l }: { l: LocationRow }) => {
    const tiers = l.sens === "sortie" ? (l.client_id ? clientNom.get(l.client_id) : l.tiers) : l.tiers;
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
        <Link href={`/planification/location/${l.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${l.sens === "sortie" ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>
              {l.sens === "sortie" ? "↗ Sortie" : "↘ Entrée"}
            </span>
            <span className="truncate font-medium">{l.titre}</span>
          </div>
          <div className="text-xs text-muted">
            {tiers ? `${tiers} · ` : ""}{dateFr(l.date_debut)}{l.date_fin && l.date_fin !== l.date_debut ? ` → ${dateFr(l.date_fin)}` : ""}
            {l.montant != null ? ` · ${euros(l.montant)}` : ""}{l.lieu ? ` · ${l.lieu}` : ""}
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Badge statut={l.statut} />
          <form action={deleteLocation.bind(null, l.id)}>
            <ConfirmButton confirm="Supprimer cette location ?" className={btnSupprimer}>✕</ConfirmButton>
          </form>
        </div>
      </div>
    );
  };

  // Rendu commun : 2 sections À venir / Passées.
  const estLoc = onglet === "location";
  const rowsAVenir = estLoc ? locAVenir.map((l) => <LocRow key={l.id} l={l} />) : aVenir.map((p) => <Row key={p.id} p={p} />);
  const rowsPassees = estLoc ? locPassees.map((l) => <LocRow key={l.id} l={l} />) : passees.map((p) => <Row key={p.id} p={p} />);
  const motVide = estLoc ? "location" : "prestation";

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={estLoc ? "Location" : "Événements"}
        action={estLoc ? ajouterLocation : ajouterEvenement}
      />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">À venir</h2>
        {rowsAVenir.length === 0 ? (
          <Card className="px-4 py-3 text-sm text-muted">Aucune {motVide} à venir.</Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">{rowsAVenir}</Card>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Passées</h2>
        {rowsPassees.length === 0 ? (
          <EmptyState title={`Aucune ${motVide} passée`} description={estLoc ? "Les locations terminées apparaîtront ici." : "Les prestations terminées apparaîtront ici."} />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">{rowsPassees}</Card>
        )}
      </section>
    </div>
  );
}
