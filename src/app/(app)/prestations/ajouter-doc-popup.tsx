"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal, ModalForm } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { associerDevisExistant } from "./actions";

type Doc = { id: string; type: string; label: string };

export function AjouterDocPopup({ prestationId, docs }: { prestationId: string; docs: Doc[] }) {
  const [tab, setTab] = useState<"devis" | "facture">("devis");
  const [q, setQ] = useState("");

  const filtres = docs.filter((d) => d.type === tab && d.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Modal trigger={<>+ Ajouter un document</>} title="Ajouter un devis / une facture" panelClassName="max-w-xl">
      {/* Recherche + créer (lieu unique de création) */}
      <div className="mb-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un document existant…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <Link
          href="/prestations"
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          title="Créer un nouveau document (lieu unique de création)"
        >
          + Créer
        </Link>
      </div>

      {/* Onglets Devis / Factures */}
      <div className="mb-3 flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        <button onClick={() => setTab("devis")} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "devis" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Devis</button>
        <button onClick={() => setTab("facture")} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "facture" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Factures</button>
      </div>

      {/* Liste (association = copie dans cet événement) */}
      {filtres.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          Aucun {tab === "facture" ? "facture" : "devis"} existant{q ? " pour cette recherche" : ""}. Clique « + Créer » pour en faire un nouveau.
        </p>
      ) : (
        <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {filtres.map((d) => (
            <ModalForm key={d.id} action={associerDevisExistant.bind(null, prestationId)} className="flex items-center justify-between gap-3 px-3 py-2">
              <input type="hidden" name="source_devis_id" value={d.id} />
              <span className="min-w-0 flex-1 truncate text-sm">{d.type === "facture" ? "🧾" : "📄"} {d.label}</span>
              <SubmitButton>Associer</SubmitButton>
            </ModalForm>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">« Associer » copie le document choisi dans cet événement. Pour partir de zéro, utilise « + Créer ».</p>
    </Modal>
  );
}
