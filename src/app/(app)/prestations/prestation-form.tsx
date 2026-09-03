import Link from "next/link";
import { Field, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import {
  PRESTATION_STATUT_LABELS,
  type Prestation,
  type PrestationStatut,
} from "@/lib/types";

const statutOptions = (Object.keys(PRESTATION_STATUT_LABELS) as PrestationStatut[]).map((s) => ({
  value: s,
  label: PRESTATION_STATUT_LABELS[s],
}));

type DevisModele = { id: string; label: string };

function Fields({
  prestation,
  clients,
  devisModeles,
  type,
}: {
  prestation?: Prestation;
  clients: { id: string; nom: string }[];
  devisModeles?: DevisModele[];
  type?: "devis" | "facture";
}) {
  return (
    <div className="space-y-4">
      {type && <input type="hidden" name="devis_type" value={type} />}
      <Field label="Nom de l'événement" name="nom" required defaultValue={prestation?.nom} placeholder="Festival X — scène principale" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Client"
          name="client_id"
          defaultValue={prestation?.client_id ?? ""}
          options={[{ value: "", label: "— Aucun —" }, ...clients.map((c) => ({ value: c.id, label: c.nom }))]}
        />
        <Field label="Lieu" name="lieu" defaultValue={prestation?.lieu} placeholder="Ville / salle" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date préparation" name="date_prepa" type="date" defaultValue={prestation?.date_prepa} />
        <Field label="Date retour" name="date_retour" type="date" defaultValue={prestation?.date_retour} />
        <Field label="Événement — début" name="date_event_debut" type="date" defaultValue={prestation?.date_event_debut} />
        <Field label="Événement — fin" name="date_event_fin" type="date" defaultValue={prestation?.date_event_fin} />
      </div>
      {type === "facture" && devisModeles && devisModeles.length > 0 && (
        <Select
          label="Facture de départ"
          name="source_devis_id"
          defaultValue=""
          options={[{ value: "", label: "— Facture vierge —" }, ...devisModeles.map((d) => ({ value: d.id, label: `Copier : ${d.label}` }))]}
        />
      )}
      {!prestation && <input type="hidden" name="statut" value="brouillon" />}
      {prestation && <Select label="Statut" name="statut" defaultValue={prestation.statut ?? "brouillon"} options={statutOptions} />}
    </div>
  );
}

export function PrestationForm({
  action,
  prestation,
  clients,
  cancelHref,
  inModal = false,
  devisModeles,
  type,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  prestation?: Prestation;
  clients: { id: string; nom: string }[];
  cancelHref: string;
  inModal?: boolean;
  devisModeles?: DevisModele[];
  type?: "devis" | "facture";
  submitLabel?: string;
}) {
  if (inModal) {
    return (
      <ModalForm action={action}>
        <Fields prestation={prestation} clients={clients} devisModeles={devisModeles} type={type} />
        <div className="flex items-center gap-3 pt-4">
          <SubmitButton>{submitLabel ?? (type === "facture" ? "Créer la facture" : "Créer le devis")}</SubmitButton>
          <ModalCancelButton />
        </div>
      </ModalForm>
    );
  }

  return (
    <form action={action}>
      <Card className="p-5 space-y-4 max-w-2xl">
        <Fields prestation={prestation} clients={clients} devisModeles={devisModeles} type={type} />
        <div className="flex items-center gap-3 pt-2">
          <SubmitButton />
          <Link href={cancelHref} className="text-sm text-muted hover:underline">Annuler</Link>
        </div>
      </Card>
    </form>
  );
}
