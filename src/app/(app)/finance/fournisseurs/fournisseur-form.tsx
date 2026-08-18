"use client";

import { Field, Select, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { STATUT_FOURNISSEUR_LABELS, type StatutFournisseur, type FactureFournisseur } from "@/lib/types";

const statutOptions = (Object.keys(STATUT_FOURNISSEUR_LABELS) as StatutFournisseur[]).map((s) => ({
  value: s,
  label: STATUT_FOURNISSEUR_LABELS[s],
}));

export function FournisseurForm({
  action,
  facture,
  prestations,
}: {
  action: (formData: FormData) => void | Promise<void>;
  facture?: FactureFournisseur;
  prestations: { id: string; nom: string }[];
}) {
  return (
    <ModalForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fournisseur" name="fournisseur" required defaultValue={facture?.fournisseur} placeholder="Audiotec…" />
        <Field label="N° de facture" name="numero" defaultValue={facture?.numero ?? ""} placeholder="F-2026-018" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Montant TTC (€)" name="montant_ttc" type="number" step="0.01" defaultValue={facture?.montant_ttc} />
        <Field label="Date facture" name="date_facture" type="date" defaultValue={facture?.date_facture ?? ""} />
        <Field label="Échéance" name="date_echeance" type="date" defaultValue={facture?.date_echeance ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Statut" name="statut_paiement" defaultValue={facture?.statut_paiement ?? "a_payer"} options={statutOptions} />
        {prestations.length > 0 && (
          <Select
            label="Événement lié (optionnel)"
            name="prestation_id"
            defaultValue={facture?.prestation_id ?? ""}
            options={[{ value: "", label: "— Aucun —" }, ...prestations.map((p) => ({ value: p.id, label: p.nom }))]}
          />
        )}
      </div>
      <TextArea label="Notes (optionnel)" name="notes" defaultValue={facture?.notes ?? ""} rows={2} />
      <div>
        <span className="mb-1 block text-sm font-medium">Justificatif (PDF / image)</span>
        <input
          name="fichier"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-background"
        />
        {facture?.fichier_url && (
          <a href={facture.fichier_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">Justificatif actuel</a>
        )}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>{facture ? "Enregistrer" : "Ajouter la facture"}</SubmitButton>
        <ModalCancelButton />
      </div>
    </ModalForm>
  );
}
