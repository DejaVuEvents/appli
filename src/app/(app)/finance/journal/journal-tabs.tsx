"use client";

import { useState, useMemo, useEffect } from "react";
import { IconPaperclip, IconAlert } from "@/components/icons";
import { createPortal } from "react-dom";
import Link from "next/link";
import { deleteEcriture, setValideEcriture, ajouterJustificatifs } from "../actions";
import { JustificatifPreview } from "@/components/justificatif-preview";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { typeLabel, categorieManquante, NOMENCLATURE, type Nomenclature } from "@/lib/finance";
import { CategorieIcon } from "@/components/categorie-icon";
import { euros, dateFr } from "@/lib/format";
import type { EcritureFinanciere } from "@/lib/types";

type Tab = "entrees" | "sorties" | "previsionnel";

type Prestation = { id: string; nom: string; client: { nom: string } | null };

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
}

function groupByMonth(list: EcritureFinanciere[]): [string, EcritureFinanciere[]][] {
  const map = new Map<string, EcritureFinanciere[]>();
  for (const e of list) {
    const key = e.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return [...map.entries()];
}

type FactureLiee = { numero: string | null; type: string; prestationId: string | null; devisId: string | null; previewUrl: string | null; voirUrl: string | null };

export function JournalTabs({ all, prestations = [], sidebar, avecJustif = [], facturesLiees = {}, nomenclature = NOMENCLATURE }: { all: EcritureFinanciere[]; prestations?: Prestation[]; sidebar?: React.ReactNode; avecJustif?: string[]; facturesLiees?: Record<string, FactureLiee[]>; nomenclature?: Nomenclature }) {
  const justifSet = useMemo(() => new Set(avecJustif), [avecJustif]);
  const [tab, setTab] = useState<Tab>("entrees");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [filtreOuvert, setFiltreOuvert] = useState(false);
  const [aValiderOnly, setAValiderOnly] = useState(false);
  const [catManquanteOnly, setCatManquanteOnly] = useState(false);
  const [selected, setSelected] = useState<EcritureFinanciere | null>(null);

  const catFlag = useMemo(
    () => (e: EcritureFinanciere) => categorieManquante(nomenclature, e.sens, e.type),
    [nomenclature],
  );

  const filtered = useMemo(() => {
    let list = all;
    if (q.trim()) {
      const lq = q.toLowerCase();
      list = list.filter((e) =>
        `${e.denomination ?? ""} ${e.type ?? ""} ${e.specification ?? ""} ${e.effectue_par ?? ""}`.toLowerCase().includes(lq),
      );
    }
    if (aValiderOnly) list = list.filter((e) => !e.valide);
    if (catManquanteOnly) list = list.filter(catFlag);
    if (tab === "entrees") return list.filter((e) => e.statut === "reel" && e.sens === "entree").sort((a, b) => b.date.localeCompare(a.date));
    if (tab === "sorties") return list.filter((e) => e.statut === "reel" && e.sens === "sortie").sort((a, b) => b.date.localeCompare(a.date));
    return list.filter((e) => e.statut === "previsionnel").sort((a, b) => a.date.localeCompare(b.date));
  }, [all, tab, q, aValiderOnly, catManquanteOnly, catFlag]);

  const nbAValider = useMemo(() => all.filter((e) => !e.valide).length, [all]);
  const nbCatManquante = useMemo(() => all.filter(catFlag).length, [all, catFlag]);

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const switchTab = (t: Tab) => {
    setTab(t);
    setCollapsed(new Set());
  };

  const collapseAll = () => setCollapsed(new Set(groups.map(([k]) => k)));
  const expandAll = () => setCollapsed(new Set());

  const tabDefs: { key: Tab; label: string }[] = [
    { key: "entrees", label: "Entrées" },
    { key: "sorties", label: "Sorties" },
  ];

  const prestMap = new Map(prestations.map((p) => [p.id, p]));

  const activeCount = (q.trim() ? 1 : 0) + (aValiderOnly ? 1 : 0) + (catManquanteOnly ? 1 : 0);

  return (
    <div>
      {/* Barre d'outils à droite : Filtrer (déroulant inline) + Nouvelle écriture + Exporter */}
      <div className="mb-4 flex items-center">
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setFiltreOuvert((o) => !o)}
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-background"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
            </svg>
            Filtrer
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{activeCount}</span>
            )}
            <svg className={`h-3.5 w-3.5 transition-transform ${filtreOuvert ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {sidebar}
        </div>
      </div>

      {/* Panneau de filtres — déroulé juste en dessous (pas de popup) */}
      {filtreOuvert && (
        <div className="mb-4 flex">
          <div className="ml-auto w-full max-w-sm space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Recherche</span>
              <div className="relative">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Dénomination, catégorie, personne…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-8 text-sm"
                  autoFocus
                />
                {q && (
                  <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Effacer">✕</button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">S&apos;applique à l&apos;onglet affiché (entrées / sorties / prévisionnel).</p>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={aValiderOnly} onChange={(e) => setAValiderOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
              À valider uniquement {nbAValider > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{nbAValider}</span>}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={catManquanteOnly} onChange={(e) => setCatManquanteOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Catégorie à corriger {nbCatManquante > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">{nbCatManquante}</span>}
            </label>
            <div className="flex gap-2">
              <button onClick={expandAll} className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-background">Tout déplier</button>
              <button onClick={collapseAll} className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-background">Tout replier</button>
            </div>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {tabDefs.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-background shadow-sm border border-border"
                : "hover:bg-background/60 text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Groupes par mois */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Aucune écriture pour cette période.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(([monthKey, entries]) => {
            const isOpen = !collapsed.has(monthKey);
            const entTotal = entries.filter((e) => e.sens === "entree").reduce((s, e) => s + Number(e.montant_ttc), 0);
            const depTotal = entries.filter((e) => e.sens === "sortie").reduce((s, e) => s + Number(e.montant_ttc), 0);
            const net = entTotal - depTotal;

            return (
              <div key={monthKey}>
                <button
                  onClick={() => toggle(monthKey)}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm transition-colors hover:bg-background"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-3.5 w-3.5 text-muted"
                      style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.22s ease" }}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    >
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-semibold">{monthLabel(monthKey)}</span>
                    <span className="rounded-full bg-border/60 px-2 py-0.5 text-xs">
                      {entries.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right text-xs">
                    {tab === "entrees" && (
                      <span className="font-semibold text-green-600">+ {euros(entTotal)}</span>
                    )}
                    {tab === "sorties" && (
                      <span className="font-semibold text-red-600">− {euros(depTotal)}</span>
                    )}
                    {tab === "previsionnel" && (
                      <>
                        {entTotal > 0 && <span className="text-green-600">+ {euros(entTotal)}</span>}
                        {depTotal > 0 && <span className="text-red-600">− {euros(depTotal)}</span>}
                        <span className={`font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>
                          = {net >= 0 ? "+" : ""}{euros(net)}
                        </span>
                      </>
                    )}
                  </div>
                </button>

                <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
                  <div style={{ overflow: "hidden" }}>
                  <div className="mt-1 divide-y divide-border rounded-xl border border-border bg-background">
                    {entries.map((e) => {
                      const factureUrl = e.facture?.startsWith("https://") ? e.facture : null;
                      const hasDoc = !!e.facture || !!e.devis_facture_id || (facturesLiees[e.id]?.length ?? 0) > 0 || justifSet.has(e.id);
                      const missingDoc = e.statut === "reel" && !hasDoc;
                      return (
                        <div
                          key={e.id}
                          className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface/50"
                          onClick={() => setSelected(e)}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <CategorieIcon type={e.type} specification={e.specification} className="h-4 w-4 shrink-0 text-muted" />
                            <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate font-medium">
                              {e.denomination ?? "(sans libellé)"}
                              {missingDoc && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" title="Aucun justificatif — cliquer pour en associer un">
                                  <IconAlert className="h-3 w-3" /> justif. manquant
                                </span>
                              )}
                              {hasDoc && (
                                <IconPaperclip className="h-3 w-3 shrink-0 text-muted" aria-label="Justificatif présent" />
                              )}
                              {!e.valide && (
                                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" title="Écriture à valider">
                                  à valider
                                </span>
                              )}
                              {catFlag(e) && (
                                <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300" title={e.type ? `Catégorie inconnue : « ${typeLabel(e.type)} »` : "Aucune catégorie"}>
                                  ⚠ catégorie
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted">
                              {dateFr(e.date)} · {typeLabel(e.type)}{e.specification ? ` / ${e.specification}` : ""}
                              {e.effectue_par ? ` · ${e.effectue_par}` : ""}
                            </div>
                            {e.notes && e.notes !== "Import BP 2026" && e.notes !== "Import historique" && (
                              <div className="text-[11px] italic text-muted">{e.notes}</div>
                            )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            {factureUrl && (
                              <button
                                type="button"
                                className="text-muted hover:text-primary"
                                title="Aperçu du document joint"
                                onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}
                              >
                                <IconPaperclip className="h-4 w-4" />
                              </button>
                            )}
                            <span className={e.sens === "entree" ? "font-medium text-green-600" : "font-medium text-red-600"}>
                              {e.sens === "entree" ? "+" : "−"} {euros(e.montant_ttc)}
                            </span>
                            <button
                              className="text-muted hover:text-foreground"
                              title="Voir le détail"
                              onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}
                            >
                              ⓘ
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel de détail */}
      {selected && (
        <EcriturePanel
          ecriture={selected}
          prestation={selected.prestation_id ? prestMap.get(selected.prestation_id) ?? null : null}
          factures={facturesLiees[selected.id] ?? []}
          catManquante={catFlag(selected)}
          hasJustif={justifSet.has(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function EcriturePanel({
  ecriture: e,
  prestation,
  factures = [],
  catManquante = false,
  hasJustif = false,
  onClose,
}: {
  ecriture: EcritureFinanciere;
  prestation: Prestation | null;
  factures?: FactureLiee[];
  catManquante?: boolean;
  hasJustif?: boolean;
  onClose: () => void;
}) {
  const [delOpen, setDelOpen] = useState(false);
  const factureUrl = e.facture?.startsWith("https://") ? e.facture : null;
  const factureRef = !factureUrl && e.facture ? e.facture : null;
  const missingDoc = !e.facture && !e.devis_facture_id && factures.length === 0 && !hasJustif;
  const apercu = factures.find((f) => f.previewUrl)?.previewUrl ?? null;

  // Verrouille le scroll de la page d'arrière-plan tant que le panneau est ouvert.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleDelete = () => setDelOpen(true);
  const confirmDelete = async () => {
    setDelOpen(false);
    onClose();
    await deleteEcriture(e.id);
  };

  const panel = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <ConfirmDialog open={delOpen} message="Supprimer cette écriture ?" confirmLabel="Supprimer" danger onCancel={() => setDelOpen(false)} onConfirm={confirmDelete} />
      <div className={`relative flex w-full ${apercu ? "max-w-4xl" : "max-w-md"} overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:max-h-[90vh] sm:rounded-2xl`}>
        {/* Colonne gauche : détails */}
        <div className="w-full shrink-0 overflow-y-auto sm:max-h-[90vh] sm:w-[26rem]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{e.denomination ?? "(sans libellé)"}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {e.statut === "reel" ? "Réel" : "Prévisionnel"} · {dateFr(e.date)}
            </p>
          </div>
          <button onClick={onClose} className="mt-0.5 shrink-0 text-xl text-muted hover:text-foreground">✕</button>
        </div>

        {/* Montant */}
        <div className={`px-5 py-4 text-3xl font-bold ${e.sens === "entree" ? "text-green-600" : "text-red-600"}`}>
          {e.sens === "entree" ? "+" : "−"} {euros(e.montant_ttc)}
        </div>

        {/* Détails */}
        <div className="space-y-2.5 px-5 pb-6">
          <Row label="Date" value={dateFr(e.date)} />
          <Row label="Catégorie" value={[typeLabel(e.type), e.specification].filter(Boolean).join(" / ") || "—"} />
          {catManquante && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <span>⚠</span>
              <span>
                {e.type ? <>Catégorie inconnue (« {typeLabel(e.type)} » n&apos;existe plus).</> : "Aucune catégorie associée."}{" "}
                <Link href={`/finance/${e.id}`} className="font-medium underline">Corriger</Link> avant de valider.
              </span>
            </div>
          )}
          {e.effectue_par && <Row label="Effectué par" value={e.effectue_par} />}
          {e.notes && e.notes !== "Import BP 2026" && e.notes !== "Import historique" && (
            <Row label="Notes" value={e.notes} />
          )}

          {/* Facture / document */}
          {missingDoc && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300">
              <div className="mb-2 flex items-center gap-2"><span>⚠</span><span>Aucun document joint à cette écriture.</span></div>
              <form action={ajouterJustificatifs.bind(null, e.id)} className="space-y-2">
                <input
                  type="file" name="justificatifs" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="block w-full text-xs text-orange-900/80 file:mr-2 file:rounded-lg file:border-0 file:bg-orange-600 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white dark:text-orange-200"
                />
                <SubmitButton pendingLabel="Ajout…" className="!py-1.5 !text-xs">Associer un document</SubmitButton>
              </form>
            </div>
          )}
          {factureUrl && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-muted">Document joint</span>
              <div className="flex shrink-0 items-center gap-2">
                {/* Aperçu en popup centrée */}
                <JustificatifPreview url={factureUrl} libelle={e.denomination ?? "Document"} />
                {/* Voir dans l'éditeur (outil facture si lié à un événement, sinon l'écriture) */}
                <Link
                  href={prestation ? `/prestations/${prestation.id}` : `/finance/${e.id}`}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface"
                >
                  Voir dans l&apos;éditeur →
                </Link>
              </div>
            </div>
          )}
          {factureRef && <Row label="Réf. facture" value={factureRef} />}

          {/* Prestation */}
          {prestation && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Prestation liée</p>
              <p className="font-medium">{prestation.nom}</p>
              {prestation.client?.nom && (
                <p className="text-xs text-muted">{prestation.client.nom}</p>
              )}
              <div className="mt-2 flex gap-3">
                <Link href={`/prestations/${prestation.id}`} className="text-xs text-primary hover:underline">
                  Prestation
                </Link>
              </div>
            </div>
          )}

          {/* Factures réglées par cette entrée */}
          {factures.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Facture{factures.length > 1 ? "s" : ""} réglée{factures.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-1.5">
                {factures.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span>Facture n° {f.numero ?? "—"}</span>
                    {f.voirUrl && (
                      <Link href={f.voirUrl} className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90">
                        Voir la facture →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation */}
          <button
            type="button"
            onClick={async () => { onClose(); await setValideEcriture(e.id, !e.valide); }}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
              e.valide
                ? "border-border text-muted hover:bg-surface"
                : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30"
            }`}
          >
            {e.valide ? "↩ Dévalider" : "✓ Valider l'écriture"}
          </button>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Link
              href={`/finance/${e.id}`}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground"
            >
              Modifier
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Supprimer
            </button>
          </div>
        </div>
        </div>{/* fin colonne gauche */}

        {/* Colonne droite : aperçu de la facture liée */}
        {apercu && (
          <div className="hidden min-w-0 flex-1 flex-col border-l border-border bg-surface sm:flex">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted">
              <span>Aperçu de la facture</span>
              <a href={apercu} target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2 py-0.5 hover:bg-background">Ouvrir ↗</a>
            </div>
            <iframe src={apercu} title="Aperçu facture" className="min-h-0 flex-1 bg-white" />
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
