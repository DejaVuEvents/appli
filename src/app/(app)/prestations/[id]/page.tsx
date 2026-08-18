import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembreActuel } from "@/lib/membre";
import { PageHeader, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { StatutSelect } from "./statut-select";
import { AjouterDocPopup } from "../ajouter-doc-popup";
import { EventTabBar } from "@/components/event-tab-bar";
import {
  updateStatut,
  deletePrestation,
  attacherMembre,
  detacherMembre,
  setRoleMembre,
  associerDevisExistant,
} from "../actions";
import { ROLES_MEMBRE } from "@/lib/roles";
import { euros, dateFr } from "@/lib/format";
import { IconReceipt, IconFile } from "@/components/icons";
import { calculerTotaux } from "@/lib/devis";
import { statutFactureAffichage } from "@/lib/facture-statut";
import type { LignePrestation, Prestation, PrestationStatut, Devis } from "@/lib/types";

type TransportRow = { id: string; devis_id: string | null; cout_calcule: number | null };

export default async function PrestationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  const showDevis = tab === "devis";

  // RBAC : seuls les co-présidents accèdent aux devis/factures (même par URL directe).
  const moi = await getMembreActuel(supabase);
  if (showDevis && moi?.role !== "co_president") redirect(`/prestations/${id}`);

  const [{ data: prest }, { data: devisData }, { data: lignesData }, { data: transportsData }] =
    await Promise.all([
      supabase.from("prestation").select("*, client(nom, tarif_preferentiel_pct)").eq("id", id).single(),
      supabase.from("devis").select("*").eq("prestation_id", id).order("created_at"),
      supabase.from("ligne_prestation").select("id, devis_id, reference_id, prix_unitaire, quantite, prix_total").eq("prestation_id", id),
      supabase.from("transport").select("id, devis_id, cout_calcule").eq("prestation_id", id),
    ]);

  if (!prest) notFound();
  const prestation = prest as unknown as Prestation & {
    client: { nom: string; tarif_preferentiel_pct: number } | null;
    created_by: string | null;
  };

  const devisList = (devisData ?? []) as Devis[];
  const { data: dfData } = await supabase
    .from("devis_facture")
    .select("devis_id, numero, statut_paiement")
    .eq("prestation_id", id)
    .eq("type", "facture");
  const factureMap = new Map((dfData ?? []).map((d) => [d.devis_id as string, d as { numero: string | null; statut_paiement: string | null }]));
  const allLignes = (lignesData ?? []) as Pick<LignePrestation, "id" | "devis_id" | "reference_id" | "prix_unitaire" | "quantite" | "prix_total">[];
  const allTransports = (transportsData ?? []) as unknown as TransportRow[];

  // Gain net estimé de l'événement = total des devis − coût de sous-location (matériel externe).
  const refIds = [...new Set(allLignes.map((l) => l.reference_id).filter(Boolean) as string[])];
  const { data: refCoutData } = refIds.length
    ? await supabase.from("materiel_reference").select("id, cout_location_jour").in("id", refIds)
    : { data: [] };
  const refCout = new Map((refCoutData ?? []).map((r) => [r.id as string, Number(r.cout_location_jour ?? 0)]));
  const coutSousLoc = allLignes.reduce((s, l) => s + (l.reference_id ? (refCout.get(l.reference_id) ?? 0) * Number(l.quantite ?? 0) : 0), 0);

  // Total d'un devis
  const totalDevis = (d: Devis): number => {
    const ls = allLignes.filter((l) => l.devis_id === d.id);
    const tr = allTransports.filter((t) => t.devis_id === d.id).reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
    return calculerTotaux({ lignes: ls, transportTotal: tr, remiseGlobaleType: d.remise_globale_type, remiseGlobaleValeur: Number(d.remise_globale_valeur ?? 0) }).totalHT;
  };
  const totalTousDevis = devisList.reduce((s, d) => s + totalDevis(d), 0);
  const gainNetEvenement = totalTousDevis - coutSousLoc;

  // Tous les documents existants (pour la popup d'ajout) — chargé seulement en vue liste.
  const { data: tousDevisData } = showDevis
    ? await supabase.from("devis").select("id, nom, type, prestation:prestation_id(nom)").order("created_at", { ascending: false })
    : { data: [] };
  const tousDocs = ((tousDevisData ?? []) as unknown as { id: string; nom: string | null; type: string; prestation: { nom: string } | null }[])
    .map((d) => ({ id: d.id, type: d.type, label: `${d.prestation?.nom ?? "?"} · ${d.nom ?? (d.type === "facture" ? "Facture" : "Devis")}` }));

  // Créateur de l'événement + personnes attachées (onglet Infos)
  const [{ data: attachesData }, { data: tousMembresData }] = showDevis
    ? [{ data: [] }, { data: [] }]
    : await Promise.all([
        supabase.from("prestation_membre").select("role, membre:membre_id(id, prenom, nom, email, competences)").eq("prestation_id", id),
        supabase.from("membre").select("id, prenom, nom, email, competences").eq("actif", true).order("prenom"),
      ]);
  const { data: creeParData } = prestation.created_by
    ? await supabase.from("membre").select("prenom, nom, email").eq("id", prestation.created_by).maybeSingle()
    : { data: null };
  const creePar = creeParData
    ? (creeParData.prenom ?? "").trim() || (creeParData.nom ?? "").trim() || creeParData.email?.split("@")[0] || null
    : null;

  type MembreLite = { id: string; prenom: string | null; nom: string | null; email: string | null; competences: string[] | null };
  type Attache = { role: string[] | null; membre: MembreLite };
  const nomMembre = (m: MembreLite) => (m.prenom ?? "").trim() || (m.nom ?? "").trim() || m.email?.split("@")[0] || "Membre";
  const attaches = ((attachesData ?? []) as unknown as { role: string[] | null; membre: MembreLite | null }[])
    .filter((r) => r.membre).map((r) => ({ role: r.role, membre: r.membre! })) as Attache[];
  const attachesIds = new Set(attaches.map((a) => a.membre.id));
  const membresDispo = ((tousMembresData ?? []) as MembreLite[]).filter((m) => !attachesIds.has(m.id));

  const clientPct = Number(prestation.client?.tarif_preferentiel_pct ?? 0);
  const activeTab = showDevis ? "devis" : "infos";

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title={prestation.nom}
        subtitle={prestation.client?.nom ?? "Sans client"}
        action={<StatutSelect action={updateStatut.bind(null, id)} statut={prestation.statut as PrestationStatut} />}
      />

      <EventTabBar eventId={id} active={activeTab} />

      {/* ── Onglet INFOS ── */}
      {!showDevis && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div><span className="text-muted">Client : </span><span className="font-medium">{prestation.client?.nom ?? "—"}</span></div>
              <div><span className="text-muted">Lieu : </span>{prestation.lieu ?? "—"}</div>
              <div><span className="text-muted">Préparation : </span>{dateFr(prestation.date_prepa)}</div>
              <div><span className="text-muted">Retour : </span>{dateFr(prestation.date_retour)}</div>
              <div className="sm:col-span-2">
                <span className="text-muted">Événement : </span>
                {dateFr(prestation.date_event_debut)} → {dateFr(prestation.date_event_fin)}
              </div>
              {clientPct > 0 && (
                <div className="sm:col-span-2 text-muted text-xs">Tarif préférentiel client : −{clientPct}% (à appliquer en remise ligne)</div>
              )}
              {creePar && <div className="sm:col-span-2 text-muted text-xs">Créé par {creePar}</div>}
              <div className="sm:col-span-2 mt-1 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-2">
                <span><span className="text-muted">Total devis : </span><span className="font-semibold">{euros(totalTousDevis)}</span></span>
                <span><span className="text-muted">Gain net estimé : </span><span className={`font-semibold ${gainNetEvenement >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{euros(gainNetEvenement)}</span>{coutSousLoc > 0 && <span className="ml-1 text-xs text-muted">(− {euros(coutSousLoc)} sous-loc.)</span>}</span>
              </div>
            </div>

            {/* Personnes attachées + rôles + compétences */}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Équipe sur l&apos;événement</p>
              <div className="space-y-2">
                {attaches.length === 0 && <span className="text-sm text-muted">Personne pour l&apos;instant.</span>}
                {attaches.map((a) => (
                  <div key={a.membre.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="text-sm font-medium">{nomMembre(a.membre)}</span>
                    <form action={setRoleMembre.bind(null, id, a.membre.id)} className="inline-flex flex-wrap items-center gap-1">
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
                    <form action={detacherMembre.bind(null, id, a.membre.id)} className="ml-auto inline">
                      <button className="text-muted hover:text-red-600" title="Retirer">✕</button>
                    </form>
                  </div>
                ))}
                {membresDispo.length > 0 && (
                  <form action={attacherMembre.bind(null, id)} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
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
              <Link
                href={`/prestations/${id}/modifier`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background"
                title="Modifier l'événement"
              >
                Modifier
              </Link>
            </div>
          </Card>

          {/* Suppression */}
          <form action={deletePrestation.bind(null, id, "/planification")}>
            <SubmitButton variant="danger" pendingLabel="Suppression…" confirm="Supprimer définitivement cet événement (tous ses devis, lignes, transport, réservations) ?">
              Supprimer l&apos;événement
            </SubmitButton>
          </form>
        </div>
      )}

      {/* ── Onglet DEVIS & FACTURES — LISTE uniquement (l'édition se fait dans l'outil Devis & Factures) ── */}
      {showDevis && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Documents de l&apos;événement</h2>
            <AjouterDocPopup
              docs={tousDocs}
              associerAction={associerDevisExistant.bind(null, id)}
              creer={
                <Link href="/prestations" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90" title="Créer un nouveau document">+ Créer</Link>
              }
            />
          </div>

          {devisList.length === 0 ? (
            <Card className="px-4 py-6 text-sm text-muted">Aucun document associé. Clique « + Ajouter un document ».</Card>
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {devisList.map((d) => {
                const df = d.type === "facture" ? factureMap.get(d.id) : undefined;
                const badge = d.type === "facture" ? statutFactureAffichage(!!df?.numero, df?.statut_paiement) : null;
                return (
                  <Link key={d.id} href={`/prestations/devis/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
                    <span className="flex min-w-0 items-center gap-2">
                      {d.type === "facture" ? <IconReceipt className="h-4 w-4 shrink-0 text-muted" /> : <IconFile className="h-4 w-4 shrink-0 text-muted" />}
                      <span className="truncate">{d.nom || (d.type === "facture" ? "Facture" : "Devis")}{df?.numero ? ` · n°${df.numero}` : ""}</span>
                      {badge && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>}
                    </span>
                    <span className="shrink-0 font-medium">{euros(totalDevis(d))}</span>
                  </Link>
                );
              })}
              {devisList.length > 1 && (
                <div className="flex items-center justify-between bg-background px-4 py-2.5 text-sm font-bold"><span>Total HT</span><span>{euros(totalTousDevis)}</span></div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
