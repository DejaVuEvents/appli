"use client";

import { useState } from "react";
import { Field, Select, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";

export type LocationRow = {
  id: string;
  titre: string;
  sens: string;
  client_id: string | null;
  tiers: string | null;
  lieu: string | null;
  date_debut: string;
  date_fin: string;
  montant: number | null;
  statut: string;
  notes: string | null;
};

export function LocationForm({
  action,
  clients,
  location,
}: {
  action: (formData: FormData) => void | Promise<void>;
  clients: { id: string; nom: string }[];
  location?: LocationRow;
}) {
  const [sens, setSens] = useState(location?.sens ?? "sortie");
  return (
    <ModalForm action={action} className="space-y-4">
      <Field label="Intitulé" name="titre" required defaultValue={location?.titre} placeholder="Ex. Location 4 lyres — Festival X" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sens" className="mb-1 block text-sm font-medium">Sens</label>
          <select
            id="sens" name="sens" value={sens}
            onChange={(e) => setSens(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="sortie">Sortie — je loue mon matériel</option>
            <option value="entree">Entrée — je sous-loue du matériel</option>
          </select>
        </div>
        <Select label="Statut" name="statut" defaultValue={location?.statut ?? "prevu"} options={[
          { value: "prevu", label: "Prévu" },
          { value: "confirme", label: "Confirmé" },
          { value: "en_cours", label: "En cours" },
          { value: "rendu", label: "Rendu / terminé" },
          { value: "annule", label: "Annulé" },
        ]} />
      </div>
      {sens === "sortie" ? (
        <Select label="Client" name="client_id" defaultValue={location?.client_id ?? ""} options={[
          { value: "", label: "— Aucun / hors base —" },
          ...clients.map((c) => ({ value: c.id, label: c.nom })),
        ]} />
      ) : (
        <Field label="Fournisseur / loueur" name="tiers" defaultValue={location?.tiers ?? ""} placeholder="Nom du loueur" />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Du" name="date_debut" type="date" required defaultValue={location?.date_debut} />
        <Field label="Au" name="date_fin" type="date" defaultValue={location?.date_fin} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lieu" name="lieu" defaultValue={location?.lieu ?? ""} />
        <Field label="Montant (€)" name="montant" type="number" step="0.01" defaultValue={location?.montant ?? undefined} />
      </div>
      <TextArea label="Notes" name="notes" rows={3} defaultValue={location?.notes ?? ""} />
      <div className="flex items-center gap-3 pt-2">
        <SubmitButton>{location ? "Enregistrer" : "Créer la location"}</SubmitButton>
        <ModalCancelButton />
      </div>
    </ModalForm>
  );
}
