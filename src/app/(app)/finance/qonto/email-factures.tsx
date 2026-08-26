"use client";

import { useState, useTransition } from "react";
import { previewFacturesEmail, attacherFacturesEmail, type FactureEmailCandidat } from "./email-actions";
import { euros, dateFr } from "@/lib/format";

export function EmailFactures() {
  const [pending, startTransition] = useTransition();
  const [candidats, setCandidats] = useState<FactureEmailCandidat[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = () => {
    setError(null); setInfo(null);
    startTransition(async () => {
      const r = await previewFacturesEmail();
      if (!r.ok) { setError(r.error); return; }
      setCandidats(r.candidats);
      setSel(new Set(r.candidats.map((c) => c.ecritureId)));
      setInfo(`${r.candidats.length} facture${r.candidats.length > 1 ? "s" : ""} trouvée${r.candidats.length > 1 ? "s" : ""} sur ${r.scannees} dépense${r.scannees > 1 ? "s" : ""} sans justificatif · ${r.sansMatch} sans correspondance.`);
    });
  };

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const attacher = () => {
    const choisis = (candidats ?? []).filter((c) => sel.has(c.ecritureId))
      .map((c) => ({ ecritureId: c.ecritureId, messageId: c.messageId, attachmentId: c.attachmentId, filename: c.filename }));
    if (!choisis.length) return;
    startTransition(async () => {
      const r = await attacherFacturesEmail(choisis);
      if (!r.ok) { setError(r.error); return; }
      setInfo(`${r.rattachees} facture${r.rattachees > 1 ? "s" : ""} rattachée${r.rattachees > 1 ? "s" : ""} (à valider dans le journal).`);
      setCandidats(null); setSel(new Set());
    });
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Factures reçues (emails)</div>
          <div className="text-xs text-muted">Recherche les PDF de factures dans Gmail et les propose pour les dépenses sans justificatif.</div>
        </div>
        <button onClick={scan} disabled={pending} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-50">
          {pending ? "Recherche…" : "Rechercher dans les mails"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-500/40 dark:bg-blue-950/20 dark:text-blue-300">{info}</div>}

      {candidats !== null && candidats.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 flex justify-end">
            <button onClick={attacher} disabled={pending || sel.size === 0} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              Rattacher {sel.size > 0 ? `(${sel.size})` : ""}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2">Dépense (outil)</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2">Facture trouvée (email)</th>
                </tr>
              </thead>
              <tbody>
                {candidats.map((c) => (
                  <tr key={c.ecritureId} className={`border-b border-border/60 ${sel.has(c.ecritureId) ? "" : "opacity-40"}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={sel.has(c.ecritureId)} onChange={() => toggle(c.ecritureId)} className="rounded" /></td>
                    <td className="px-3 py-2"><div className="font-medium">{c.denomination}</div><div className="text-muted">{dateFr(c.dateEcriture)}</div></td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-600">− {euros(c.montant)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.emailSubject}</div>
                      <div className="text-muted">{c.emailFrom} · {c.emailDate ? dateFr(c.emailDate) : ""} · 📎 {c.filename}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Vérifie chaque correspondance avant de rattacher — décoche celles qui ne correspondent pas. Un justificatif déjà présent n&apos;est jamais écrasé.</p>
        </div>
      )}
      {candidats !== null && candidats.length === 0 && !error && (
        <div className="mt-3 text-sm text-muted">Aucune facture correspondante trouvée dans les mails.</div>
      )}
    </div>
  );
}
