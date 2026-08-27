"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { dateFr, euros } from "@/lib/format";
import { JustificatifPreview } from "@/components/justificatif-preview";
import { ConfirmButton } from "@/components/confirm-button";
import { setStatutPaiement, setStatutSignature, supprimerFacture } from "./[id]/document/actions";
import { deleteDevis } from "./actions";

export type DocRow = {
  id: string;              // id du devis (document)
  prestationId: string;    // événement parent
  titre: string;           // nom du document (+ n° éventuel)
  client: string | null;
  lieu: string | null;
  date: string | null;     // date de l'événement (regroupement + affichage)
  type: "devis" | "facture";
  montant: number;                   // total HT
  emis: boolean;                     // facture émise (a un n°)
  statutPaiement: string | null;     // facture
  statutSignature: string | null;    // devis
  factureSurDevis: boolean;          // facture = émission sur un devis (supprimer ≠ supprimer le devis)
};

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
function monthLabel(key: string): string {
  if (key === "0000-00") return "Sans date";
  const [y, m] = key.split("-");
  return `${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
}

const selBase = "rounded-lg border px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40";

// Couleur du menu selon le statut courant.
const COULEUR: Record<string, string> = {
  "": "border-border bg-surface text-muted",
  en_attente: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  signe: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  paye: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
  refuse: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  retard: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  annule: "border-border bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

/** Menu déroulant de statut coloré (signature pour un devis, paiement pour une facture émise). */
function StatutSelect({ d }: { d: DocRow }) {
  const [val, setVal] = useState(d.type === "devis" ? (d.statutSignature ?? "") : (d.statutPaiement ?? "en_attente"));
  const couleur = COULEUR[val] ?? COULEUR[""];

  if (d.type === "devis") {
    return (
      <form action={setStatutSignature.bind(null, d.id, d.prestationId)}>
        <select
          name="statut_signature"
          value={val}
          onChange={(e) => { setVal(e.target.value); e.currentTarget.form?.requestSubmit(); }}
          className={`${selBase} ${couleur}`}
          title="Statut du devis"
        >
          <option value="">En attente</option>
          <option value="signe">Signé</option>
          <option value="refuse">Refusé</option>
        </select>
      </form>
    );
  }
  // Facture : le statut de paiement n'existe qu'une fois la facture émise (n°).
  if (!d.emis) {
    return <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">Brouillon</span>;
  }
  return (
    <form action={setStatutPaiement.bind(null, d.id, d.prestationId)}>
      <select
        name="statut_paiement"
        value={val}
        onChange={(e) => { setVal(e.target.value); e.currentTarget.form?.requestSubmit(); }}
        className={`${selBase} ${couleur}`}
        title="Statut de paiement"
      >
        <option value="en_attente">En attente</option>
        <option value="paye">Payée</option>
        <option value="retard">En retard</option>
        <option value="annule">Annulée</option>
      </select>
    </form>
  );
}

export function DocsSection({ docs }: { docs: DocRow[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, DocRow[]>();
    for (const d of docs) {
      const key = d.date ? d.date.slice(0, 7) : "0000-00";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [docs]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="space-y-2">
      {groups.map(([monthKey, items]) => {
        const isOpen = !collapsed.has(monthKey);
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
                <span className="rounded-full bg-border/60 px-2 py-0.5 text-xs">{items.length}</span>
              </div>
            </button>

            <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
              <div style={{ overflow: "hidden" }}>
              <div className="mt-1 divide-y divide-border rounded-xl border border-border bg-background">
                {items.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/50">
                    <div className="w-16 shrink-0 text-xs font-medium tabular-nums text-muted sm:w-20">
                      {d.date ? dateFr(d.date) : "—"}
                    </div>
                    <Link href={`/prestations/devis/${d.id}?retour=liste`} className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.titre}</div>
                      <div className="truncate text-sm text-muted">
                        {d.client ?? "Sans client"}
                        {d.lieu ? ` · ${d.lieu}` : ""}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden whitespace-nowrap text-sm font-semibold tabular-nums sm:inline">{euros(d.montant)}</span>
                      <StatutSelect d={d} />
                      <JustificatifPreview
                        url={`/apercu/${d.id}?type=${d.type}`}
                        libelle={d.titre}
                      />
                      <form
                        action={
                          d.type === "facture" && d.factureSurDevis
                            ? supprimerFacture.bind(null, d.id, d.prestationId, "/prestations?tab=factures")
                            : deleteDevis.bind(null, d.id, `/prestations?tab=${d.type === "facture" ? "factures" : "devis"}`)
                        }
                      >
                        <ConfirmButton
                          confirm={
                            d.type === "facture" && d.factureSurDevis
                              ? `Supprimer définitivement la facture « ${d.titre} » ? Le devis associé est conservé.`
                              : `Supprimer définitivement « ${d.titre} » ?`
                          }
                          className="rounded-lg border border-border px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Supprimer"
                        >
                          ✕
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
