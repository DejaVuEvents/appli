"use client";

import { useState, useTransition } from "react";
import { previewQonto, importQontoTransactions } from "./actions";
import type { QontoPreviewItem } from "./actions";
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
  compteNom: string;
  balanceQonto: number | null;
  soldeOutil?: number;
  nomenclature?: Nomenclature;
}

export function QontoSync({ derniereSync, compteNom, balanceQonto, soldeOutil, nomenclature = NOMENCLATURE }: Props) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<QontoPreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Map<string, { type: string; specification: string }>>(new Map());
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setSelected(checked ? new Set(items!.map((i) => i.transaction_id)) : new Set());
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

  const selectedCount = selected.size;

  // Rapprochement : écart entre le solde bancaire Qonto et le solde réel de l'outil.
  const ecart = balanceQonto !== null && soldeOutil !== undefined ? Math.round((balanceQonto - soldeOutil) * 100) / 100 : null;
  const valide = ecart !== null && Math.abs(ecart) < 0.01;

  return (
    <div className="space-y-4">
      {/* Info compte */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <div className="text-sm font-semibold">Compte Qonto connecté</div>
          <div className="text-xs text-muted">{compteNom}</div>
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
        <div className={`rounded-xl border p-4 ${valide ? "border-green-300 bg-green-50 dark:border-green-500/40 dark:bg-green-950/20" : "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/20"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              {valide ? "Trésorerie validée — les soldes correspondent" : "⚠️ Écart entre Qonto et l'outil"}
            </div>
            {!valide && (
              <div className="text-sm font-bold text-amber-700 dark:text-amber-400">
                Écart : {ecart > 0 ? "+" : ""}{euros(ecart)}
              </div>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:max-w-md">
            <div className="flex justify-between gap-2"><span className="text-muted">Solde banque (Qonto)</span><span className="font-semibold tabular-nums">{euros(balanceQonto)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">Solde outil (réel)</span><span className="font-semibold tabular-nums">{euros(soldeOutil!)}</span></div>
          </div>
          {!valide && (
            <p className="mt-2 text-xs text-muted">
              Récupère puis importe les transactions manquantes ci-dessous pour aligner l&apos;outil sur la banque.
            </p>
          )}
        </div>
      )}

      {/* Bouton sync */}
      <button
        onClick={handlePreview}
        disabled={pending}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Chargement…" : "Récupérer les nouvelles transactions"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{result}</div>
      )}

      {/* Tableau de prévisualisation */}
      {items !== null && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              {items.length === 0
                ? "Aucune nouvelle transaction à importer."
                : `${items.length} nouvelle${items.length > 1 ? "s" : ""} transaction${items.length > 1 ? "s" : ""} Qonto`}
            </div>
            {items.length > 0 && (
              <div className="flex gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCount === items.length}
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

          {items.length > 0 && (
            <>
              {items.some((i) => i.doublon) && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠️ <strong>{items.filter((i) => i.doublon).length} doublon{items.filter((i) => i.doublon).length > 1 ? "s" : ""} probable{items.filter((i) => i.doublon).length > 1 ? "s" : ""}</strong> détecté{items.filter((i) => i.doublon).length > 1 ? "s" : ""} — même date, montant et sens qu'une écriture existante. Pré-décochés pour éviter les doublons. Vérifiez avant de cocher.
                </div>
              )}
              {items.some((i) => i.pending) && (
                <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/40 dark:bg-blue-950/20 dark:text-blue-300">
                  ● <strong>{items.filter((i) => i.pending).length} transaction{items.filter((i) => i.pending).length > 1 ? "s" : ""} en attente de règlement</strong> — ce sont tes opérations les plus récentes, pas encore débitées/créditées par la banque. Pré-décochées (le montant peut encore changer) ; coche-les si tu veux les enregistrer dès maintenant.
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
                    {items.map((item) => {
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
