"use client";

import { useState } from "react";
import Link from "next/link";
import { euros, dateFr } from "@/lib/format";
import { setStatutPaiement, setStatutSignature } from "../../prestations/[id]/document/actions";

export type DocRow = {
  id: string;
  type: "devis" | "facture";
  prestationId: string;
  intitule: string;
  numero: string | null;
  date: string | null;
  montant: number;
  statutLabel: string;
  statutCls: string;
  statutValue: string;
  statutEditable: boolean;
  href: string;
};

// Options du sélecteur de statut, selon le type de document.
const OPTIONS_FACTURE: { value: string; label: string }[] = [
  { value: "en_attente", label: "En attente" },
  { value: "paye", label: "Payée" },
  { value: "retard", label: "En retard" },
  { value: "annule", label: "Annulée" },
];
const OPTIONS_DEVIS: { value: string; label: string }[] = [
  { value: "", label: "Envoyé" },
  { value: "valide", label: "Validé" },
  { value: "signe", label: "Signé" },
  { value: "refuse", label: "Refusé" },
];

function StatutCell({ d }: { d: DocRow }) {
  if (!d.statutEditable) {
    return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.statutCls}`}>{d.statutLabel}</span>;
  }
  const options = d.type === "facture" ? OPTIONS_FACTURE : OPTIONS_DEVIS;
  const field = d.type === "facture" ? "statut_paiement" : "statut_signature";
  const action = d.type === "facture"
    ? setStatutPaiement.bind(null, d.id, d.prestationId)
    : setStatutSignature.bind(null, d.id, d.prestationId);
  return (
    <form action={action} className="inline-flex">
      <select
        name={field}
        defaultValue={d.statutValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary ${d.statutCls}`}
        title="Changer le statut"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-background text-foreground">{o.label}</option>
        ))}
      </select>
    </form>
  );
}

export function ClientDocs({ docs }: { docs: DocRow[] }) {
  const [tab, setTab] = useState<"facture" | "devis">("facture");
  const [q, setQ] = useState("");

  const lignes = docs
    .filter((d) => d.type === tab)
    .filter((d) => `${d.intitule} ${d.numero ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div>
      {/* Barre : recherche + onglets */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Rechercher dans mes ${tab === "facture" ? "factures" : "devis"}…`}
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          <button onClick={() => setTab("facture")} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "facture" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Factures</button>
          <button onClick={() => setTab("devis")} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "devis" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Devis</button>
        </div>
      </div>

      {lignes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Aucun {tab === "facture" ? "facture" : "devis"} pour ce client.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-4 py-2.5 text-left font-medium">N°</th>
                <th className="px-4 py-2.5 text-left font-medium">Intitulé</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                <th className="px-4 py-2.5 text-center font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((d) => (
                <tr key={`${d.type}-${d.id}`} className="hover:bg-background">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{d.date ? dateFr(d.date) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{d.numero ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={d.href} className="font-medium text-primary hover:underline">{d.intitule}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{euros(d.montant)}</td>
                  <td className="px-4 py-3 text-center">
                    <StatutCell d={d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
