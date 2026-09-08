"use client";

import { useState } from "react";
import { ModalForm } from "@/components/modal";
import { Field, Select } from "@/components/form";
import { FileDropzone } from "@/components/file-dropzone";
import { SubmitButton } from "@/components/submit-button";
import { importerDocumentPdf } from "./actions";

/**
 * Volet « importer » de la fenêtre de création. Il n'ouvre plus sa propre modale : tout
 * ce qui crée un document part du même endroit, création comme reprise d'un PDF existant.
 */
export function ImportPdf({ clients, prestations = [], defaultType }: { clients: { id: string; nom: string }[]; prestations?: { id: string; nom: string }[]; defaultType: "devis" | "facture" }) {
  const [type, setType] = useState<"devis" | "facture">(defaultType);
  // Les champs n'apparaissent qu'une fois le document déposé : le dépôt est l'action
  // d'entrée, le reste ne sert à rien tant qu'il n'y a pas de fichier.
  const [fichier, setFichier] = useState<File | null>(null);
  const radio = (v: "devis" | "facture", label: string) => (
    <label className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium ${type === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-background"}`}>
      <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} className="sr-only" />
      {label}
    </label>
  );

  return (
    <div className="mt-5 border-t border-border pt-4">
      <ModalForm action={importerDocumentPdf} className="space-y-4">
        <span className="block text-sm font-medium">
          {defaultType === "facture" ? "Importer une facture déjà établie" : "Importer un devis déjà établi"}
        </span>
        <FileDropzone
          name="pdf"
          accept="application/pdf,image/*"
          libelle="Glisser le document ici, ou cliquer pour choisir (PDF / photo)"
          onFile={setFichier}
        />

        {fichier && (
          <div className="space-y-4">
        <p className="text-xs text-muted">Le document d&apos;origine sera conservé et affiché tel quel (comme les anciens documents Tiime).</p>
        <div className="flex gap-2">
          {radio("devis", "Devis")}
          {radio("facture", "Facture")}
        </div>
        <Field label="Intitulé" name="nom" required defaultValue={fichier ? fichier.name.replace(/\.[^.]+$/, "") : ""} placeholder="Ex. Prestation Gala 2024" />
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
        <SubmitButton pendingLabel="Import…">Importer</SubmitButton>
          </div>
        )}
      </ModalForm>
    </div>
  );
}
