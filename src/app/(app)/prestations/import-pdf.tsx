"use client";

import { useState } from "react";
import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { Field, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { importerDocumentPdf } from "./actions";

export function ImportPdf({ clients, prestations = [], defaultType }: { clients: { id: string; nom: string }[]; prestations?: { id: string; nom: string }[]; defaultType: "devis" | "facture" }) {
  const [type, setType] = useState<"devis" | "facture">(defaultType);
  const radio = (v: "devis" | "facture", label: string) => (
    <label className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium ${type === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-background"}`}>
      <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} className="sr-only" />
      {label}
    </label>
  );

  return (
    <Modal
      trigger={<>Importer un PDF</>}
      title="Importer un devis / facture (PDF)"
      triggerClassName="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background"
    >
      <ModalForm action={importerDocumentPdf} className="space-y-4">
        <div className="flex gap-2">
          {radio("devis", "Devis")}
          {radio("facture", "Facture")}
        </div>
        <Field label="Intitulé" name="nom" required placeholder="Ex. Prestation Gala 2024" />
        <Select
          label="Client"
          name="client_id"
          options={[{ value: "", label: "— Aucun —" }, ...clients.map((c) => ({ value: c.id, label: c.nom }))]}
        />
        <div>
          <Select
            label="Rattacher à un événement existant"
            name="prestation_id"
            options={[{ value: "", label: "— Créer un nouvel événement —" }, ...prestations.map((p) => ({ value: p.id, label: p.nom }))]}
          />
          <p className="mt-1 text-xs text-muted">
            Un acompte, un devis et sa facture doivent pointer sur le même événement.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date du document" name="date" type="date" />
          <Field label="Montant (€)" name="montant" type="number" step="0.01" />
        </div>
        <Field
          label={type === "facture" ? "N° de facture" : "N° de devis"}
          name="numero"
          placeholder="Ex. 000042 (numéro Tiime, conservé tel quel)"
        />
        <div>
          <label className="mb-1 block text-sm font-medium">Fichier PDF *</label>
          <input
            type="file" name="pdf" accept="application/pdf,image/*" required
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
          />
          <p className="mt-1 text-xs text-muted">Le PDF d&apos;origine sera conservé et affiché tel quel (comme les anciens documents Tiime).</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <SubmitButton pendingLabel="Import…">Importer</SubmitButton>
          <ModalCancelButton />
        </div>
      </ModalForm>
    </Modal>
  );
}
