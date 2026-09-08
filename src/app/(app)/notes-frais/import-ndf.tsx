"use client";

import { useState } from "react";
import { Field, Select } from "@/components/form";
import { FileDropzone } from "@/components/file-dropzone";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm } from "@/components/modal";
import { importerNoteFrais } from "./actions";

/**
 * Reprise d'une note établie hors de l'outil, dans la fenêtre de création.
 *
 * Le dépôt du document est la première action : les champs à renseigner n'apparaissent
 * qu'une fois le fichier choisi. Sans lui, la zone reste une simple invite — inutile de
 * montrer un formulaire complet à qui vient seulement créer une note vierge.
 */
export function ImportNdf({ membres }: { membres: { id: string; nom: string }[] }) {
  const [fichier, setFichier] = useState<File | null>(null);

  return (
    <div className="mt-5 border-t border-border pt-4">
      <ModalForm action={importerNoteFrais} className="space-y-3">
        <span className="mb-1 block text-sm font-medium">Importer une NDF</span>
        <FileDropzone
          name="justificatif"
          accept="image/*,application/pdf"
          libelle="Glisser une note de frais ici, ou cliquer pour choisir (photo / PDF)"
          onFile={setFichier}
        />

        {fichier && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              La note sera enregistrée comme validée et signée. Aucune écriture n&apos;est créée : si un
              décaissement du même montant existe déjà au journal, elle s&apos;y rattache et apparaît
              « Remboursée ».
            </p>
            <Field label="Intitulé" name="titre" required defaultValue={fichier.name.replace(/\.[^.]+$/, "")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" name="date" type="date" />
              <Field label="Montant TTC (€)" name="montant_ttc" type="number" step="0.01" required />
            </div>
            <Select
              label="Demandeur"
              name="demandeur_id"
              options={[{ value: "", label: "— Moi —" }, ...membres.map((m) => ({ value: m.id, label: m.nom }))]}
            />
            <SubmitButton>Importer la note</SubmitButton>
          </div>
        )}
      </ModalForm>
    </div>
  );
}
