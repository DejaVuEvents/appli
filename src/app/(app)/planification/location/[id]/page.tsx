import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { LocationTabBar, type LocationTab } from "../../location-tab-bar";
import { LocationForm, type LocationRow } from "../../location-form";
import { LocationStatutSelect } from "../location-statut-select";
import { updateLocation, deleteLocation, creerDevisLocation, associerDevisLocation, attacherMembreLocation, updateLocationStatut } from "../../actions";
import { setRoleMembre, detacherMembre } from "../../../prestations/actions";
import { AjouterDocPopup } from "../../../prestations/ajouter-doc-popup";
import { statutFactureAffichage } from "@/lib/facture-statut";
import { ROLES_MEMBRE } from "@/lib/roles";
import { euros, dateFr } from "@/lib/format";
import type { Devis } from "@/lib/types";

type MembreLite = { id: string; prenom: string | null; nom: string | null; email: string | null; competences: string[] | null };
const nomMembre = (m: MembreLite) => (m.prenom ?? "").trim() || (m.nom ?? "").trim() || m.email?.split("@")[0] || "Membre";

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
  const [{ data: locData }, { data: clientsData }, { data: membresData }] = await Promise.all([
    supabase.from("location").select("*").eq("id", id).maybeSingle(),
    supabase.from("client").select("id, nom").order("nom"),
    supabase.from("membre").select("id, prenom, nom, email, competences").eq("actif", true).order("prenom"),
  ]);
  if (!locData) notFound();
  const loc = locData as LocationRow & { prestation_id: string | null; created_by: string | null };
  const clients = (clientsData ?? []) as { id: string; nom: string }[];
  const tousMembres = (membresData ?? []) as MembreLite[];
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

  // Équipe attachée (via la prestation support) + créateur.
  const { data: attachesData } = loc.prestation_id
    ? await supabase.from("prestation_membre").select("role, membre:membre_id(id, prenom, nom, email, competences)").eq("prestation_id", loc.prestation_id)
    : { data: [] };
  type Attache = { role: string[] | null; membre: MembreLite };
  const attaches = ((attachesData ?? []) as unknown as { role: string[] | null; membre: MembreLite | null }[])
    .filter((r) => r.membre).map((r) => ({ role: r.role, membre: r.membre! })) as Attache[];
  const attachesIds = new Set(attaches.map((a) => a.membre.id));
  const membresDispo = tousMembres.filter((m) => !attachesIds.has(m.id));
  const creePar = loc.created_by ? tousMembres.find((m) => m.id === loc.created_by) : null;

  // Documents existants (pour la popup « associer un document existant »), chargés en vue Devis.
  const { data: tousDevisData } = tab === "devis"
    ? await supabase.from("devis").select("id, nom, type, prestation:prestation_id(nom)").order("created_at", { ascending: false })
    : { data: [] };
  const tousDocs = ((tousDevisData ?? []) as unknown as { id: string; nom: string | null; type: string; prestation: { nom: string } | null }[])
    .map((d) => ({ id: d.id, type: d.type, label: `${d.prestation?.nom ?? "?"} · ${d.nom ?? (d.type === "facture" ? "Facture" : "Devis")}` }));

  const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90";
  const btnBorder = "inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface";

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title={loc.titre}
        subtitle={loc.sens === "sortie" ? "Location — sortie (mon matériel)" : "Location — entrée (sous-location)"}
        action={<LocationStatutSelect action={updateLocationStatut.bind(null, id)} statut={loc.statut} />}
      />
      <LocationTabBar locationId={id} active={tab} />

      {/* ── INFOS ── */}
      {tab === "infos" && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div><span className="text-muted">{loc.sens === "sortie" ? "Client" : "Fournisseur / loueur"} : </span><span className="font-medium">{tiers ?? "—"}</span></div>
              <div><span className="text-muted">Lieu : </span>{loc.lieu ?? "—"}</div>
              <div><span className="text-muted">Du : </span>{dateFr(loc.date_debut)}</div>
              <div><span className="text-muted">Au : </span>{loc.date_fin ? dateFr(loc.date_fin) : "—"}</div>
              <div><span className="text-muted">Montant : </span>{loc.montant != null ? euros(loc.montant) : "—"}</div>
              {loc.notes && <div className="sm:col-span-2"><span className="text-muted">Notes : </span>{loc.notes}</div>}
              {creePar && <div className="sm:col-span-2 text-muted text-xs">Créé par {nomMembre(creePar)}</div>}
            </div>

            {/* Personnes attachées + rôles + compétences */}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Équipe sur la location</p>
              <div className="space-y-2">
                {attaches.length === 0 && <span className="text-sm text-muted">Personne pour l&apos;instant.</span>}
                {attaches.map((a) => (
                  <div key={a.membre.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="text-sm font-medium">{nomMembre(a.membre)}</span>
                    <form action={setRoleMembre.bind(null, loc.prestation_id!, a.membre.id)} className="inline-flex flex-wrap items-center gap-1">
                      {ROLES_MEMBRE.map((r) => {
                        const on = (a.role ?? []).includes(r);
                        return (
                          <label key={r} className="cursor-pointer">
                            <input type="checkbox" name="role" value={r} defaultChecked={on} className="peer sr-only" />
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-medium peer-checked:text-primary">{r}</span>
                          </label>
                        );
                      })}
                      <button className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-background" title="Enregistrer les rôles">OK</button>
                    </form>
                    {(a.membre.competences ?? []).length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {(a.membre.competences ?? []).map((c) => (
                          <span key={c} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{c}</span>
                        ))}
                      </span>
                    )}
                    <form action={detacherMembre.bind(null, loc.prestation_id!, a.membre.id)} className="ml-auto inline">
                      <button className="text-muted hover:text-red-600" title="Retirer">✕</button>
                    </form>
                  </div>
                ))}
                {membresDispo.length > 0 && (
                  <form action={attacherMembreLocation.bind(null, id)} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                    <select name="membre_id" required defaultValue="" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm">
                      <option value="" disabled>+ Ajouter une personne…</option>
                      {membresDispo.map((m) => (
                        <option key={m.id} value={m.id}>{nomMembre(m)}</option>
                      ))}
                    </select>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {ROLES_MEMBRE.map((r) => (
                        <label key={r} className="cursor-pointer">
                          <input type="checkbox" name="role" value={r} className="peer sr-only" />
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-medium peer-checked:text-primary">{r}</span>
                        </label>
                      ))}
                    </span>
                    <button className="shrink-0 rounded-lg border border-border px-2 py-1 text-sm hover:bg-background">OK</button>
                  </form>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              <Modal trigger={<>✎ Modifier</>} title="Modifier la location" triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">
                <LocationForm action={updateLocation.bind(null, id)} clients={clients} location={loc} />
              </Modal>
            </div>
          </Card>

          {/* Suppression */}
          <form action={deleteLocation.bind(null, id)}>
            <SubmitButton variant="danger" pendingLabel="Suppression…" confirm="Supprimer définitivement cette location ?">
              Supprimer la location
            </SubmitButton>
          </form>
        </div>
      )}

      {/* ── DEVIS & FACTURES ── */}
      {tab === "devis" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <form action={creerDevisLocation.bind(null, id, "devis")}><button className={btnPrimary}>+ Créer un devis</button></form>
            <form action={creerDevisLocation.bind(null, id, "facture")}><button className={btnBorder}>+ Créer une facture</button></form>
            <AjouterDocPopup docs={tousDocs} associerAction={associerDevisLocation.bind(null, id)} />
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
