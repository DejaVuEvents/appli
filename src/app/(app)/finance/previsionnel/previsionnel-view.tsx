"use client";

import { useState } from "react";
import { creerRecurrent, supprimerRecurrent, toggleRecurrent, regenererRecurrents } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { euros, dateFr } from "@/lib/format";
import { typeLabel } from "@/lib/finance";

export type PrevRow = { id: string; date: string; denomination: string | null; montant_ttc: number; sens: string; type: string | null; specification: string | null };
export type Recurrent = { id: string; nom: string; sens: string; montant_ttc: number; frequence: string; jour: number; mois: number | null; type: string | null; specification: string | null; actif: boolean };
type Nomenclature = Record<string, Record<string, string[]>>;

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function PrevisionnelView({ ponctuelles, recurrents, nomenclature }: { ponctuelles: PrevRow[]; recurrents: Recurrent[]; nomenclature: Nomenclature }) {
  const [vue, setVue] = useState<"ponctuelles" | "recurrents">("recurrents");

  // Total mensuel équivalent des récurrents actifs (annuel /12).
  const mensuelEquivalent = recurrents.filter((r) => r.actif).reduce((s, r) => {
    const m = r.frequence === "annuel" ? r.montant_ttc / 12 : r.montant_ttc;
    return s + (r.sens === "entree" ? m : -m);
  }, 0);

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
        <button onClick={() => setVue("recurrents")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${vue === "recurrents" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Dépenses récurrentes</button>
        <button onClick={() => setVue("ponctuelles")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${vue === "ponctuelles" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Prévisions ponctuelles</button>
      </div>

      {vue === "recurrents" ? (
        <RecurrentsView recurrents={recurrents} nomenclature={nomenclature} mensuelEquivalent={mensuelEquivalent} />
      ) : (
        <PonctuellesView rows={ponctuelles} />
      )}
    </div>
  );
}

function RecurrentsView({ recurrents, nomenclature, mensuelEquivalent }: { recurrents: Recurrent[]; nomenclature: Nomenclature; mensuelEquivalent: number }) {
  const [sens, setSens] = useState<"sortie" | "entree">("sortie");
  const [freq, setFreq] = useState<"mensuel" | "annuel">("mensuel");
  const [type, setType] = useState("");
  const map = nomenclature[sens] ?? {};
  const types = Object.keys(map);
  const specs = map[type] ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        Charge récurrente mensuelle estimée : <strong className={mensuelEquivalent < 0 ? "text-red-600" : "text-green-700"}>{mensuelEquivalent >= 0 ? "+" : ""}{euros(mensuelEquivalent)}</strong> / mois (annuel réparti /12).
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Libellé</th>
              <th className="px-3 py-2 text-left font-medium">Catégorie</th>
              <th className="px-3 py-2 text-left font-medium">Fréquence</th>
              <th className="px-3 py-2 text-right font-medium">Montant</th>
              <th className="px-3 py-2 text-center font-medium">Actif</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recurrents.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted">Aucune dépense récurrente. Ajoute-en une ci-dessous.</td></tr>}
            {recurrents.map((r) => (
              <tr key={r.id} className={r.actif ? "" : "opacity-50"}>
                <td className="px-3 py-2 font-medium">{r.nom}</td>
                <td className="px-3 py-2 text-muted">{[typeLabel(r.type), r.specification].filter(Boolean).join(" / ") || "—"}</td>
                <td className="px-3 py-2 text-muted">{r.frequence === "annuel" ? `Annuel (${MOIS[(r.mois ?? 1) - 1]}, le ${r.jour})` : `Mensuel (le ${r.jour})`}</td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.sens === "entree" ? "text-green-600" : "text-red-600"}`}>{r.sens === "entree" ? "+" : "−"} {euros(r.montant_ttc)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.actif ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}>{r.actif ? "Actif" : "En pause"}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-2">
                    <form action={toggleRecurrent.bind(null, r.id, !r.actif)} className="inline">
                      <button
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${r.actif ? "border-border text-muted hover:bg-background hover:text-foreground" : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"}`}
                        title={r.actif ? "Suspendre : retire ses prévisions futures (reprise possible à tout moment)" : "Reprendre : regénère ses prévisions futures"}
                      >
                        {r.actif ? "⏸ Mettre en pause" : "▶ Reprendre"}
                      </button>
                    </form>
                    <form action={supprimerRecurrent.bind(null, r.id)} className="inline">
                      <ConfirmButton confirm="Supprimer cette dépense récurrente ? (retire ses prévisions futures)" className="text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
                    </form>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ajout */}
      <form action={creerRecurrent} className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 text-sm font-semibold">Ajouter une dépense récurrente</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="mb-1 block text-xs font-medium">Libellé</span>
            <input name="nom" required placeholder="Assurance MAIF, Google One…" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium">Sens</span>
            <select name="sens" value={sens} onChange={(e) => { setSens(e.target.value as "sortie" | "entree"); setType(""); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="sortie">Dépense</option><option value="entree">Recette</option>
            </select></label>
          <label className="block"><span className="mb-1 block text-xs font-medium">Montant (€)</span>
            <input name="montant_ttc" type="number" step="0.01" min="0" required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium">Fréquence</span>
            <select name="frequence" value={freq} onChange={(e) => setFreq(e.target.value as "mensuel" | "annuel")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="mensuel">Mensuel</option><option value="annuel">Annuel</option>
            </select></label>
          <label className="block"><span className="mb-1 block text-xs font-medium">Jour du mois</span>
            <input name="jour" type="number" min="1" max="28" defaultValue={1} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          {freq === "annuel" && (
            <label className="block"><span className="mb-1 block text-xs font-medium">Mois</span>
              <select name="mois" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select></label>
          )}
          <label className="block"><span className="mb-1 block text-xs font-medium">Catégorie</span>
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">—</option>
              {types.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-xs font-medium">Spécification</span>
            <select name="specification" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="">—</option>
              {specs.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
        </div>
        <div className="mt-3"><SubmitButton>+ Ajouter</SubmitButton></div>
      </form>

      <form action={regenererRecurrents}>
        <button className="text-xs text-muted hover:text-foreground underline">Régénérer les prévisions récurrentes</button>
      </form>
    </div>
  );
}

function PonctuellesView({ rows }: { rows: PrevRow[] }) {
  const groups = new Map<string, PrevRow[]>();
  for (const r of rows) { const k = r.date.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (rows.length === 0) return <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">Aucune prévision ponctuelle (devis signés non facturés, factures émises non payées, échéances fournisseurs, saisies manuelles).</div>;

  return (
    <div className="space-y-3">
      {entries.map(([mk, list]) => {
        const [y, m] = mk.split("-");
        const net = list.reduce((s, r) => s + (r.sens === "entree" ? r.montant_ttc : -r.montant_ttc), 0);
        return (
          <div key={mk} className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-sm font-semibold">
              <span>{MOIS[parseInt(m, 10) - 1]} {y}</span>
              <span className={net >= 0 ? "text-green-700" : "text-red-600"}>{net >= 0 ? "+" : ""}{euros(net)}</span>
            </div>
            <div className="divide-y divide-border">
              {list.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.denomination ?? "—"}</div>
                    <div className="text-xs text-muted">{dateFr(r.date)}{r.type ? ` · ${typeLabel(r.type)}` : ""}{r.specification ? ` / ${r.specification}` : ""}</div>
                  </div>
                  <span className={`shrink-0 font-medium ${r.sens === "entree" ? "text-green-600" : "text-red-600"}`}>{r.sens === "entree" ? "+" : "−"} {euros(r.montant_ttc)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
