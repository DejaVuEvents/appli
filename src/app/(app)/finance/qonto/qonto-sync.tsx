"use client";

import { useState, useTransition } from "react";
import { previewQonto, importQontoTransactions, recupererJustificatifsQonto, syncGlobal, rapprochementQonto } from "./actions";
import type { QontoPreviewItem, RapportRapprochement } from "./actions";
import { QontoRapport } from "./qonto-rapport";
import { euros, dateFr } from "@/lib/format";
import { NOMENCLATURE } from "@/lib/finance";
import type { SensFinancier } from "@/lib/types";

type Nomenclature = Record<SensFinancier, Record<string, string[]>>;

function SpecSelect({ sens, type, spec, onChange, nomenclature }: {
  sens: "entree" | "sortie";
  type: string;
  spec: string;
  onChange: (type: string, spec: string) => void;
  nomenclature: Nomenclature;
}) {
  const map = nomenclature[sens] ?? {};
  const types = Object.keys(map);
  const specs = map[type] ?? [];

  return (
    <div className="flex gap-1">
      <select
        value={type}
        onChange={(e) => {
          const newType = e.target.value;
          const newSpecs = map[newType] ?? [];
          onChange(newType, newSpecs[0] ?? "");
        }}
        className="rounded border border-border bg-background px-1.5 py-1 text-xs"
      >
        {types.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
      </select>
      <select
        value={spec}
        onChange={(e) => onChange(type, e.target.value)}
        className="rounded border border-border bg-background px-1.5 py-1 text-xs"
      >
        {specs.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

interface Props {
  derniereSync: string | null;
  balanceQonto: number | null;
  soldeOutil?: number;
  nomenclature?: Nomenclature;
}

export function QontoSync({ derniereSync, balanceQonto, soldeOutil, nomenclature = NOMENCLATURE }: Props) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<QontoPreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Map<string, { type: string; specification: string }>>(new Map());
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDoublons, setShowDoublons] = useState(false);
  const [menuSync, setMenuSync] = useState(false);
  // Le rapport de rapprochement est piloté d'ici : son bouton vit dans le même
  // encadré d'actions que la synchronisation.
  const [rap, setRap] = useState<Extract<RapportRapprochement, { ok: true }> | null>(null);
  const [rapPending, setRapPending] = useState(false);

  const analyser = async () => {
    setRapPending(true);
    setError(null);
    const r = await rapprochementQonto();
    setRapPending(false);
    if (!r.ok) { setError(r.error); setRap(null); return; }
    setRap(r);
  };

  const handlePreview = () => {
    setResult(null);
    setError(null);
    startTransition(async () => {
      const r = await previewQonto();
      if (!r.ok) { setError(r.error); return; }
      setItems(r.items);
      // Pré-sélectionner tout SAUF les doublons et les transactions en attente de règlement
      // (montant susceptible de changer — l'utilisateur les coche manuellement s'il le souhaite).
      setSelected(new Set(r.items.filter((i) => !i.doublon && !i.pending).map((i) => i.transaction_id)));
      setEdited(new Map());
    });
  };

  const toggleAll = (checked: boolean) => {
    const pool = (items ?? []).filter((i) => showDoublons || !i.doublon);
    setSelected(checked ? new Set(pool.map((i) => i.transaction_id)) : new Set());
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const editCategorie = (id: string, type: string, specification: string) => {
    setEdited((prev) => new Map(prev).set(id, { type, specification }));
  };

  const handleImport = () => {
    const toImport = (items ?? [])
      .filter((i) => selected.has(i.transaction_id))
      .map((i) => {
        const edit = edited.get(i.transaction_id);
        return edit ? { ...i, ...edit } : i;
      });
    if (!toImport.length) return;

    startTransition(async () => {
      const r = await importQontoTransactions(toImport);
      if (!r.ok) { setError(r.error); return; }
      const attMsg = r.withAttachment > 0 ? ` · ${r.withAttachment} pièce${r.withAttachment > 1 ? "s" : ""} jointe${r.withAttachment > 1 ? "s" : ""} importée${r.withAttachment > 1 ? "s" : ""}.` : "";
      setResult(`${r.count} transaction${r.count > 1 ? "s" : ""} importée${r.count > 1 ? "s" : ""} dans le journal.${attMsg}`);
      setItems(null);
      setSelected(new Set());
    });
  };

  const handleSyncGlobal = () => {
    setResult(null);
    setError(null);
    setItems(null);
    startTransition(async () => {
      const r = await syncGlobal();
      if (!r.ok) { setError(r.error); return; }
      const bits = [
        `${r.importees} transaction${r.importees > 1 ? "s" : ""} importée${r.importees > 1 ? "s" : ""}`,
        `${r.justificatifs} justificatif${r.justificatifs > 1 ? "s" : ""} récupéré${r.justificatifs > 1 ? "s" : ""}`,
      ];
      if (r.ignoresDoublons > 0) bits.push(`${r.ignoresDoublons} doublon${r.ignoresDoublons > 1 ? "s" : ""} ignoré${r.ignoresDoublons > 1 ? "s" : ""}`);
      setResult(`Synchro terminée : ${bits.join(" · ")}.`);
    });
  };

  const handleJustificatifs = () => {
    setResult(null);
    setError(null);
    startTransition(async () => {
      const r = await recupererJustificatifsQonto();
      if (!r.ok) { setError(r.error); return; }
      setResult(
        r.ajoutes === 0 && r.sansPiece === 0
          ? "Toutes les écritures Qonto ont déjà un justificatif."
          : `${r.ajoutes} justificatif${r.ajoutes > 1 ? "s" : ""} récupéré${r.ajoutes > 1 ? "s" : ""} depuis Qonto${r.sansPiece > 0 ? ` · ${r.sansPiece} transaction${r.sansPiece > 1 ? "s" : ""} sans pièce jointe sur Qonto` : ""}.`,
      );
    });
  };

  const selectedCount = selected.size;

  // Doublons déjà enregistrés : masqués par défaut (tout est à jour), affichables via un toggle.
  const nbDoublons = (items ?? []).filter((i) => i.doublon).length;
  const visibles = showDoublons ? (items ?? []) : (items ?? []).filter((i) => !i.doublon);

  // Rapprochement : écart entre le solde bancaire Qonto et le solde réel de l'outil.
  const ecart = balanceQonto !== null && soldeOutil !== undefined ? Math.round((balanceQonto - soldeOutil) * 100) / 100 : null;
  const valide = ecart !== null && Math.abs(ecart) < 0.01;

  return (
    <div className="space-y-4">
      {/* Colonne de gauche : état du compte. Colonne de droite : toutes les actions. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="space-y-4">
        {/* Info compte */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <div>
            <div className="text-sm font-semibold">Compte Qonto connecté</div>
            {derniereSync && (
              <div className="mt-0.5 text-xs text-muted">Dernière sync : {dateFr(derniereSync.slice(0, 10))}</div>
            )}
          </div>
          <div className="text-right">
            {balanceQonto !== null && (
              <div className={`text-lg font-bold ${balanceQonto < 0 ? "text-red-600" : "text-green-700"}`}>
                {euros(balanceQonto)}
              </div>
            )}
            <div className="text-xs text-muted">Solde Qonto actuel</div>
          </div>
        </div>

        {/* Rapprochement Qonto ↔ outil */}
        {ecart !== null && (
          valide ? (
            <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 dark:border-green-500/40 dark:bg-green-950/20 dark:text-green-300">
              ✓ Trésorerie à jour
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold">⚠️ Écart entre Qonto et l&apos;outil</div>
                <div className="text-sm font-bold text-amber-700 dark:text-amber-400">
                  Écart : {ecart > 0 ? "+" : ""}{euros(ecart)}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:max-w-md">
                <div className="flex justify-between gap-2"><span className="text-muted">Solde banque (Qonto)</span><span className="font-semibold tabular-nums">{euros(balanceQonto)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted">Solde outil (réel)</span><span className="font-semibold tabular-nums">{euros(soldeOutil!)}</span></div>
              </div>
              <p className="mt-2 text-xs text-muted">
                Récupère puis importe les transactions manquantes ci-dessous pour aligner l&apos;outil sur la banque.
              </p>
            </div>
          )
        )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 text-sm font-semibold">Actions</div>
          <div className="space-y-2">
          {/* Un seul bouton : l'action courante au clic, les deux variantes dans le menu. */}
          <div className="relative block" onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenuSync(false);
          }}>
            <div className="flex w-full">
              <button
                onClick={handleSyncGlobal}
                disabled={pending}
                className="flex-1 rounded-l-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                title="Importe les nouvelles transactions propres (hors doublons/en attente) + récupère les justificatifs manquants"
              >
                {pending ? "Synchronisation…" : "⟳ Synchroniser"}
              </button>
              <button
                type="button"
                onClick={() => setMenuSync((v) => !v)}
                disabled={pending}
                aria-label="Autres options de synchronisation"
                aria-expanded={menuSync}
                className="rounded-r-lg border-l border-primary-foreground/25 bg-primary px-2.5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                ▾
              </button>
            </div>
            {menuSync && (
              <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                <button
                  type="button"
                  onClick={() => { setMenuSync(false); handlePreview(); }}
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-background"
                >
                  Vérifier / choisir les transactions
                  <span className="block text-xs text-muted">Passer les mouvements en revue avant de les importer.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuSync(false); handleJustificatifs(); }}
                  className="block w-full border-t border-border px-3 py-2.5 text-left text-sm hover:bg-background"
                >
                  Récupérer les justificatifs manquants
                  <span className="block text-xs text-muted">Télécharge depuis Qonto les pièces jointes absentes.</span>
                </button>
              </div>
            )}
          </div>
            <button
              onClick={analyser}
              disabled={pending || rapPending}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-background disabled:opacity-50"
            >
              {rapPending ? "Analyse…" : rap ? "Rafraîchir l'analyse" : "Analyser l'écart"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{result}</div>
      )}

      {rap && (
        <div>
          <h2 className="mb-3 text-base font-semibold">Rapport de rapprochement</h2>
          <QontoRapport rap={rap} onRefresh={analyser} />
        </div>
      )}

      {/* Tableau de prévisualisation */}
      {items !== null && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              {visibles.length === 0
                ? (nbDoublons > 0 ? "Tout est à jour — rien de nouveau à importer." : "Aucune nouvelle transaction à importer.")
                : `${visibles.length} nouvelle${visibles.length > 1 ? "s" : ""} transaction${visibles.length > 1 ? "s" : ""} Qonto`}
            </div>
            {visibles.length > 0 && (
              <div className="flex gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={visibles.length > 0 && selectedCount === visibles.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="rounded"
                  />
                  Tout sélectionner
                </label>
                <button
                  onClick={handleImport}
                  disabled={pending || selectedCount === 0}
                  className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  Importer {selectedCount > 0 ? `(${selectedCount})` : ""}
                </button>
              </div>
            )}
          </div>

          {nbDoublons > 0 && (
            <div className="mb-3 text-xs text-muted">
              {nbDoublons} transaction{nbDoublons > 1 ? "s" : ""} déjà enregistrée{nbDoublons > 1 ? "s" : ""} (doublon{nbDoublons > 1 ? "s" : ""}) masquée{nbDoublons > 1 ? "s" : ""}.{" "}
              <button onClick={() => setShowDoublons((v) => !v)} className="font-medium text-primary hover:underline">
                {showDoublons ? "Masquer" : "Afficher quand même"}
              </button>
            </div>
          )}

          {visibles.length > 0 && (
            <>
              {visibles.some((i) => i.pending) && (
                <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/40 dark:bg-blue-950/20 dark:text-blue-300">
                  ● <strong>{visibles.filter((i) => i.pending).length} transaction{visibles.filter((i) => i.pending).length > 1 ? "s" : ""} en attente de règlement</strong> — ce sont tes opérations les plus récentes, pas encore débitées/créditées par la banque. Pré-décochées (le montant peut encore changer) ; coche-les si tu veux les enregistrer dès maintenant.
                </div>
              )}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Libellé</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                      <th className="px-3 py-2">Catégorie Qonto</th>
                      <th className="px-3 py-2">Notre catégorie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((item) => {
                      const edit = edited.get(item.transaction_id);
                      const type = edit?.type ?? item.type;
                      const spec = edit?.specification ?? item.specification;
                      const isSelected = selected.has(item.transaction_id);

                      return (
                        <tr
                          key={item.transaction_id}
                          className={`border-b border-border/60 ${item.doublon ? "bg-amber-50/40" : ""} ${isSelected ? "" : "opacity-40"}`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(item.transaction_id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{dateFr(item.date)}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.label}</div>
                            {item.reference && <div className="text-muted">{item.reference}</div>}
                            {item.doublon && (
                              <div className="text-amber-600 font-medium">⚠ doublon probable</div>
                            )}
                            {item.pending && (
                              <div className="font-medium text-blue-600">● en attente de règlement</div>
                            )}
                            {item.attachment_ids?.length > 0 && (
                              <div className="text-blue-600 text-xs">{item.attachment_ids.length} pièce{item.attachment_ids.length > 1 ? "s" : ""} jointe{item.attachment_ids.length > 1 ? "s" : ""}</div>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${item.sens === "entree" ? "text-green-600" : "text-red-600"}`}>
                            {item.sens === "entree" ? "+" : "−"} {euros(item.montant)}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {[item.cashflow_cat, item.cashflow_sub].filter(Boolean).join(" / ") || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <SpecSelect
                              sens={item.sens}
                              type={type}
                              spec={spec}
                              onChange={(t, s) => editCategorie(item.transaction_id, t, s)}
                              nomenclature={nomenclature}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
