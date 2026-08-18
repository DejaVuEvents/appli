"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { rapprochementQonto, importQontoTransactions, ajusterSoldeInitial, type RapportRapprochement } from "./actions";
import { euros, dateFr } from "@/lib/format";

export function QontoRapport() {
  const [pending, startTransition] = useTransition();
  const [rap, setRap] = useState<Extract<RapportRapprochement, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const generer = () => {
    setError(null); setMsg(null);
    startTransition(async () => {
      const r = await rapprochementQonto();
      if (!r.ok) { setError(r.error); setRap(null); return; }
      setRap(r);
    });
  };

  const importerManquantes = () => {
    if (!rap?.manquantes.length) return;
    startTransition(async () => {
      const r = await importQontoTransactions(rap.manquantes);
      if (!r.ok) { setError(r.error); return; }
      setMsg(`${r.count} transaction${r.count > 1 ? "s" : ""} manquante${r.count > 1 ? "s" : ""} importée${r.count > 1 ? "s" : ""}.`);
      generer(); // recalcule le rapport
    });
  };

  const ajusterBaseline = () => {
    if (!rap) return;
    const nouveau = Math.round((rap.soldeInitial + rap.ajustementBaseline) * 100) / 100;
    startTransition(async () => {
      const r = await ajusterSoldeInitial(nouveau);
      if (!r.ok) { setError(r.error ?? "Erreur"); return; }
      setMsg(`Solde initial ajusté à ${euros(nouveau)}.`);
      generer();
    });
  };

  const valide = rap && Math.abs(rap.ecart) < 0.01;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Rapport de rapprochement</h2>
        <button onClick={generer} disabled={pending} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50">
          {pending ? "Analyse…" : rap ? "Rafraîchir" : "Analyser l'écart"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{msg}</div>}

      {rap && (
        <>
          {/* Synthèse de l'écart */}
          <div className={`rounded-xl border p-4 ${valide ? "border-green-300 bg-green-50 dark:border-green-500/40 dark:bg-green-950/20" : "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/20"}`}>
            <div className="grid gap-2 sm:grid-cols-3 sm:max-w-lg">
              <div className="flex justify-between gap-2 text-sm sm:block"><span className="text-muted">Solde Qonto</span><span className="font-bold tabular-nums">{euros(rap.balanceQonto)}</span></div>
              <div className="flex justify-between gap-2 text-sm sm:block"><span className="text-muted">Solde outil</span><span className="font-bold tabular-nums">{euros(rap.soldeOutil)}</span></div>
              <div className="flex justify-between gap-2 text-sm sm:block"><span className="text-muted">Écart</span><span className={`font-bold tabular-nums ${valide ? "text-green-700" : "text-amber-700 dark:text-amber-400"}`}>{rap.ecart > 0 ? "+" : ""}{euros(rap.ecart)}</span></div>
            </div>
          </div>

          {valide ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Tout est aligné, les soldes correspondent.</p>
          ) : (
            <>
              {/* Explication */}
              <div className="rounded-xl border border-border bg-surface p-4 text-sm">
                <div className="mb-2 font-semibold">Décomposition de l&apos;écart de {euros(rap.ecart)}</div>
                <ul className="space-y-1 text-muted">
                  <li>• <strong className="text-foreground">{rap.manquantes.length}</strong> transaction(s) Qonto absente(s) de l&apos;outil → net <strong className="text-foreground">{euros(rap.netManquantes)}</strong></li>
                  <li>• <strong className="text-foreground">{rap.enTrop.length}</strong> écriture(s) de l&apos;outil absente(s) de Qonto → net <strong className="text-foreground">{euros(rap.netEnTrop)}</strong></li>
                  <li>• Reste <strong className="text-foreground">{euros(rap.ajustementBaseline)}</strong> imputable au <strong className="text-foreground">solde initial</strong> ({euros(rap.soldeInitial)}{rap.soldeInitialDate ? ` au ${dateFr(rap.soldeInitialDate)}` : ""})</li>
                </ul>
              </div>

              {/* Correction 1 : importer les manquantes */}
              {rap.manquantes.length > 0 && (
                <div className="rounded-xl border border-border p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{rap.manquantes.length} transaction(s) Qonto à importer</div>
                    <button onClick={importerManquantes} disabled={pending} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                      Importer les {rap.manquantes.length}
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {rap.manquantes.map((m) => (
                      <div key={m.transaction_id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                        <span className="min-w-0"><span className="text-muted">{dateFr(m.date)}</span> · {m.label}</span>
                        <span className={`shrink-0 font-semibold ${m.sens === "entree" ? "text-green-600" : "text-red-600"}`}>{m.sens === "entree" ? "+" : "−"} {euros(m.montant)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correction 2 : écritures en trop */}
              {rap.enTrop.length > 0 && (
                <div className="rounded-xl border border-border p-4">
                  <div className="mb-2 text-sm font-semibold">{rap.enTrop.length} écriture(s) de l&apos;outil absente(s) de Qonto — à vérifier</div>
                  <p className="mb-2 text-xs text-muted">Erreurs de saisie, doublons, ou mouvements hors banque (espèces). Clique pour ouvrir et corriger.</p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {rap.enTrop.map((e) => (
                      <Link key={e.id} href={`/finance/${e.id}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs hover:bg-background">
                        <span className="min-w-0"><span className="text-muted">{dateFr(e.date)}</span> · {e.denomination}</span>
                        <span className={`shrink-0 font-semibold ${e.sens === "entree" ? "text-green-600" : "text-red-600"}`}>{e.sens === "entree" ? "+" : "−"} {euros(e.montant)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Correction 3 : ajuster le solde initial */}
              {Math.abs(rap.ajustementBaseline) >= 0.01 && (
                <div className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <div className="font-semibold">Ajuster le solde initial</div>
                      <div className="text-xs text-muted">Passer de {euros(rap.soldeInitial)} à <strong>{euros(rap.soldeInitial + rap.ajustementBaseline)}</strong> ({rap.ajustementBaseline > 0 ? "+" : ""}{euros(rap.ajustementBaseline)}).</div>
                    </div>
                    <button onClick={ajusterBaseline} disabled={pending} className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50">
                      Appliquer
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted">À ne faire qu&apos;après avoir importé les manquantes et vérifié les « en trop » — sinon vérifie le vrai solde bancaire au {rap.soldeInitialDate ? dateFr(rap.soldeInitialDate) : "1er jour"} sur ton relevé.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
