"use client";

import { useState } from "react";
import { Modal, ModalForm } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";

type Doc = { id: string; type: string; label: string };

/**
 * Popup unifiée « Ajouter un document » : recherche + association d'un devis/facture
 * existant (copie dans la cible), avec un bouton de création fourni par l'appelant
 * (différent selon la cible : événement → lien /prestations, location → server action).
 */
export function AjouterDocPopup({
  docs,
  associerAction,
  creer,
}: {
  docs: Doc[];
  /** Server action déjà liée à la cible : (formData) => associe le devis choisi. */
  associerAction: (formData: FormData) => void | Promise<void>;
  /** Contrôle(s) de création rendu(s) en haut à droite (lien ou formulaires). */
  creer?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"devis" | "facture">("devis");
  const [q, setQ] = useState("");

  const filtres = docs.filter((d) => d.type === tab && d.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Modal trigger={<>+ Ajouter un document</>} title="Ajouter un devis / une facture" panelClassName="max-w-xl">
      {/* Recherche + créer */}
      <div className="mb-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un document existant…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        {creer && <span className="flex shrink-0 items-center gap-2">{creer}</span>}
      </div>

      {/* Onglets Devis / Factures */}
      <div className="mb-3 flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        <button onClick={() => setTab("devis")} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "devis" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Devis</button>
        <button onClick={() => setTab("facture")} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === "facture" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Factures</button>
      </div>

      {/* Liste (association = copie dans la cible) */}
      {filtres.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          Aucun {tab === "facture" ? "facture" : "devis"} existant{q ? " pour cette recherche" : ""}.
        </p>
      ) : (
        <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {filtres.map((d) => (
            <ModalForm key={d.id} action={associerAction} className="flex items-center justify-between gap-3 px-3 py-2">
              <input type="hidden" name="source_devis_id" value={d.id} />
              <span className="min-w-0 flex-1 truncate text-sm">{d.type === "facture" ? "🧾" : "📄"} {d.label}</span>
              <SubmitButton>Associer</SubmitButton>
            </ModalForm>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">« Associer » copie le document choisi dans cette fiche. Pour partir de zéro, utilise « Créer ».</p>
    </Modal>
  );
}
