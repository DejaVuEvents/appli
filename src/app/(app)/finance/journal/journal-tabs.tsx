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
import { EcriturePanel, type FactureLiee, type PrestationLiee } from "../ecriture-panel";
import { Modal } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { euros, dateFr } from "@/lib/format";
import type { EcritureFinanciere } from "@/lib/types";

type Tab = "entrees" | "sorties" | "previsionnel";

type Prestation = PrestationLiee;

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



export function JournalTabs({ all, prestations = [], sidebar, avecJustif = [], facturesLiees = {}, nomenclature = NOMENCLATURE }: { all: EcritureFinanciere[]; prestations?: Prestation[]; sidebar?: React.ReactNode; avecJustif?: string[]; facturesLiees?: Record<string, FactureLiee[]>; nomenclature?: Nomenclature }) {
  const justifSet = useMemo(() => new Set(avecJustif), [avecJustif]);
  const [tab, setTab] = useState<Tab>("entrees");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [aValiderOnly, setAValiderOnly] = useState(false);
  const [catManquanteOnly, setCatManquanteOnly] = useState(false);
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [prixMin, setPrixMin] = useState("");
  const [prixMax, setPrixMax] = useState("");
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
    if (dateMin) list = list.filter((e) => e.date >= dateMin);
    if (dateMax) list = list.filter((e) => e.date <= dateMax);
    // Les bornes portent sur le montant absolu : l'utilisateur raisonne en euros,
    // pas en signe (le sens est déjà donné par l'onglet).
    if (prixMin) list = list.filter((e) => Number(e.montant_ttc) >= parseFloat(prixMin));
    if (prixMax) list = list.filter((e) => Number(e.montant_ttc) <= parseFloat(prixMax));
    if (tab === "entrees") return list.filter((e) => e.statut === "reel" && e.sens === "entree").sort((a, b) => b.date.localeCompare(a.date));
    if (tab === "sorties") return list.filter((e) => e.statut === "reel" && e.sens === "sortie").sort((a, b) => b.date.localeCompare(a.date));
    return list.filter((e) => e.statut === "previsionnel").sort((a, b) => a.date.localeCompare(b.date));
  }, [all, tab, q, aValiderOnly, catManquanteOnly, catFlag, dateMin, dateMax, prixMin, prixMax]);

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

  // La recherche a sa propre barre : elle ne compte plus dans le badge « Filtrer ».
  const activeCount = [aValiderOnly, catManquanteOnly, dateMin, dateMax, prixMin, prixMax].filter(Boolean).length;
  const resetFiltres = () => {
    setAValiderOnly(false); setCatManquanteOnly(false);
    setDateMin(""); setDateMax(""); setPrixMin(""); setPrixMax("");
  };

  return (
    <div>
      {/* Barre d'outils : recherche à gauche, Filtrer + actions à droite. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une dénomination, une catégorie, une personne…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm pr-8"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Effacer la recherche">✕</button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Modal
            title="Filtrer le journal"
            panelClassName="max-w-md"
            triggerClassName="relative inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-background"
            trigger={
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
                </svg>
                Filtrer
                {activeCount > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{activeCount}</span>
                )}
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium">Montant (€)</span>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" step="0.01" min="0" value={prixMin} onChange={(e) => setPrixMin(e.target.value)} placeholder="Minimum" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input type="number" step="0.01" min="0" value={prixMax} onChange={(e) => setPrixMax(e.target.value)} placeholder="Maximum" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium">Date</span>
                <div className="grid grid-cols-2 gap-3">
                  <DateInput value={dateMin} onChange={setDateMin} />
                  <DateInput value={dateMax} onChange={setDateMax} />
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={aValiderOnly} onChange={(e) => setAValiderOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
                  À valider uniquement {nbAValider > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{nbAValider}</span>}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={catManquanteOnly} onChange={(e) => setCatManquanteOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
                  Catégorie à corriger {nbCatManquante > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">{nbCatManquante}</span>}
                </label>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <button onClick={resetFiltres} className="text-sm text-muted hover:underline" disabled={activeCount === 0}>
                  Tout effacer
                </button>
                <div className="flex gap-2">
                  <button onClick={expandAll} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-background">Tout déplier</button>
                  <button onClick={collapseAll} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-background">Tout replier</button>
                </div>
              </div>
            </div>
          </Modal>
          {sidebar}
        </div>
      </div>

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
                      const hasDoc = !!e.facture || !!e.devis_facture_id || !!e.note_frais_id || (facturesLiees[e.id]?.length ?? 0) > 0 || justifSet.has(e.id);
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
