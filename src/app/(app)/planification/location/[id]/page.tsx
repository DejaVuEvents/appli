import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm-button";
import { LocationTabBar, type LocationTab } from "../../location-tab-bar";
import { LocationForm, type LocationRow } from "../../location-form";
import { updateLocation, deleteLocation, creerDevisLocation } from "../../actions";
import { statutFactureAffichage } from "@/lib/facture-statut";
import { euros, dateFr } from "@/lib/format";
import type { Devis } from "@/lib/types";

const STATUT_CLS: Record<string, string> = {
  prevu: "bg-gray-200 text-gray-700",
  confirme: "bg-blue-100 text-blue-700",
  en_cours: "bg-amber-100 text-amber-800",
  rendu: "bg-green-100 text-green-700",
  annule: "bg-red-100 text-red-700",
};

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tabRaw = (await searchParams)?.tab;
  const tab: LocationTab = tabRaw === "devis" ? "devis" : tabRaw === "preparation" ? "preparation" : "infos";

  const supabase = await createClient();
  const [{ data: locData }, { data: clientsData }] = await Promise.all([
    supabase.from("location").select("*").eq("id", id).maybeSingle(),
    supabase.from("client").select("id, nom").order("nom"),
  ]);
  if (!locData) notFound();
  const loc = locData as LocationRow & { prestation_id: string | null };
  const clients = (clientsData ?? []) as { id: string; nom: string }[];
  const clientNom = loc.client_id ? clients.find((c) => c.id === loc.client_id)?.nom ?? null : null;
  const tiers = loc.sens === "sortie" ? clientNom : loc.tiers;

  // Devis / factures + préparation portés par la prestation support (si créée).
  const { data: devisData } = loc.prestation_id
    ? await supabase.from("devis").select("*").eq("prestation_id", loc.prestation_id).order("created_at")
    : { data: [] };
  const devisList = (devisData ?? []) as Devis[];
  const { data: dfData } = loc.prestation_id
    ? await supabase.from("devis_facture").select("devis_id, numero, statut_paiement").eq("prestation_id", loc.prestation_id).eq("type", "facture")
    : { data: [] };
  const factureMap = new Map((dfData ?? []).map((d) => [d.devis_id as string, d as { numero: string | null; statut_paiement: string | null }]));
  const { count: nbLignes } = loc.prestation_id
    ? await supabase.from("ligne_prestation").select("id", { count: "exact", head: true }).eq("prestation_id", loc.prestation_id)
    : { count: 0 };

  const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90";
  const btnBorder = "inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface";

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={loc.titre}
        subtitle={loc.sens === "sortie" ? "Location — sortie (mon matériel)" : "Location — entrée (sous-location)"}
      />
      <LocationTabBar locationId={id} active={tab} />

      {/* ── INFOS ── */}
      {tab === "infos" && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div><span className="text-muted">{loc.sens === "sortie" ? "Client" : "Fournisseur / loueur"} : </span><span className="font-medium">{tiers ?? "—"}</span></div>
              <div><span className="text-muted">Statut : </span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUT_CLS[loc.statut] ?? "bg-surface text-muted"}`}>{loc.statut.replace(/_/g, " ")}</span></div>
              <div><span className="text-muted">Du : </span>{dateFr(loc.date_debut)}</div>
              <div><span className="text-muted">Au : </span>{loc.date_fin ? dateFr(loc.date_fin) : "—"}</div>
              <div><span className="text-muted">Lieu : </span>{loc.lieu ?? "—"}</div>
              <div><span className="text-muted">Montant : </span>{loc.montant != null ? euros(loc.montant) : "—"}</div>
              {loc.notes && <div className="sm:col-span-2"><span className="text-muted">Notes : </span>{loc.notes}</div>}
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
              <Modal trigger={<>✎ Modifier</>} title="Modifier la location" triggerClassName={btnBorder}>
                <LocationForm action={updateLocation.bind(null, id)} clients={clients} location={loc} />
              </Modal>
            </div>
          </Card>

          <form action={deleteLocation.bind(null, id)}>
            <ConfirmButton confirm="Supprimer définitivement cette location ?" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100">
              Supprimer la location
            </ConfirmButton>
          </form>
        </div>
      )}

      {/* ── DEVIS & FACTURES ── */}
      {tab === "devis" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <form action={creerDevisLocation.bind(null, id, "devis")}><button className={btnPrimary}>+ Créer un devis</button></form>
            <form action={creerDevisLocation.bind(null, id, "facture")}><button className={btnBorder}>+ Créer une facture</button></form>
          </div>

          {devisList.length === 0 ? (
            <Card className="px-4 py-6 text-sm text-muted">Aucun document. Crée un devis ou une facture pour cette location.</Card>
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {devisList.map((d) => {
                const df = d.type === "facture" ? factureMap.get(d.id) : undefined;
                const badge = d.type === "facture" ? statutFactureAffichage(!!df?.numero, df?.statut_paiement) : null;
                return (
                  <Link key={d.id} href={`/prestations/devis/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
                    <span className="flex min-w-0 items-center gap-2">
                      <span>{d.type === "facture" ? "🧾" : "📄"}</span>
                      <span className="truncate">{d.nom || (d.type === "facture" ? "Facture" : "Devis")}{df?.numero ? ` · n°${df.numero}` : ""}</span>
                      {badge && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>}
                    </span>
                  </Link>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* ── PRÉPARATION ── */}
      {tab === "preparation" && (
        <div className="space-y-4">
          {!loc.prestation_id || (nbLignes ?? 0) === 0 ? (
            <Card className="px-4 py-6 text-sm text-muted">
              La check-list de chargement se construit à partir du matériel des devis. Ajoute d&apos;abord un devis avec du matériel dans l&apos;onglet « Devis &amp; Factures ».
            </Card>
          ) : (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="text-sm">
                <div className="font-medium">Check-list de chargement</div>
                <div className="text-muted">{nbLignes} élément{(nbLignes ?? 0) > 1 ? "s" : ""} à préparer · sorties / retours + scan QR</div>
              </div>
              <Link href={`/prestations/${loc.prestation_id}/preparation`} className={btnPrimary}>Ouvrir la check-list →</Link>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
