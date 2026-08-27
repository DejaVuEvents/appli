"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { euros } from "@/lib/format";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Découpage acompte + solde : saisie en % ou en €, avec aperçu en direct
 * des deux montants avant de créer les factures.
 */
export function AcompteForm({
  action,
  total,
}: {
  action: (formData: FormData) => void;
  total: number;
}) {
  const [mode, setMode] = useState<"pct" | "montant">("pct");
  const [valeur, setValeur] = useState<string>("30");

  const v = Number(String(valeur).replace(",", ".")) || 0;
  const acompte = mode === "pct" ? r2((total * Math.min(Math.max(v, 0), 100)) / 100) : r2(Math.min(Math.max(v, 0), total));
  const solde = r2(total - acompte);
  const pctEffectif = total > 0 ? Math.round((acompte / total) * 100) : 0;
  const invalide = acompte <= 0 || acompte >= total;

  return (
    <form action={action} className="rounded-xl border border-border p-4">
      <div className="text-sm font-semibold">Acompte + solde</div>
      <p className="mb-3 mt-1 text-sm text-muted">
        Crée <span className="font-medium text-foreground">deux factures</span> : un acompte à régler avant la
        prestation (pour bloquer le matériel), puis le solde.
      </p>

      <input type="hidden" name="acompte_mode" value={mode} />
      <input type="hidden" name="acompte_valeur" value={valeur} />

      {/* Saisie : montant + unité (% ou €) */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Acompte</span>
          <input
            type="number"
            step={mode === "pct" ? "1" : "0.01"}
            min="0"
            max={mode === "pct" ? 100 : total}
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="mb-0.5 flex overflow-hidden rounded-lg border border-border">
          {(["pct", "montant"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setValeur(m === "pct" ? "30" : String(r2(total * 0.3))); }}
              className={`px-3 py-2 text-sm font-medium ${mode === m ? "bg-primary text-primary-foreground" : "text-muted hover:bg-background"}`}
            >
              {m === "pct" ? "%" : "€"}
            </button>
          ))}
        </div>
      </div>

      {/* Aperçu en direct */}
      <div className="mt-3 space-y-1 rounded-lg border border-border bg-surface p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Total du devis</span>
          <span className="font-medium tabular-nums">{euros(total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Facture d&apos;acompte{total > 0 ? ` (${pctEffectif} %)` : ""}</span>
          <span className="font-semibold tabular-nums text-primary">{euros(acompte)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1">
          <span className="text-muted">Facture de solde</span>
          <span className="font-semibold tabular-nums">{euros(solde)}</span>
        </div>
      </div>

      {invalide && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
          L&apos;acompte doit être supérieur à 0 et inférieur au total du devis.
        </p>
      )}

      <div className="mt-3">
        <SubmitButton>Créer les 2 factures</SubmitButton>
      </div>
    </form>
  );
}
