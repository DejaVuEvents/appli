import Link from "next/link";
import { Field, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import type { Client } from "@/lib/types";

function Fields({ client }: { client?: Client }) {
  return (
    <div className="space-y-4">
      <Field label="Nom" name="nom" required defaultValue={client?.nom} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" defaultValue={client?.email} />
        <Field label="Téléphone" name="telephone" defaultValue={client?.telephone} />
      </div>
      <Field label="Adresse" name="adresse" defaultValue={client?.adresse} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SIRET / SIREN" name="siret" placeholder="123 456 789 00012" defaultValue={client?.siret} />
        <Field label="N° TVA intracom." name="tva_intra" placeholder="FR..." defaultValue={client?.tva_intra} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="IBAN" name="iban" defaultValue={client?.iban} />
        <Field label="BIC" name="bic" defaultValue={client?.bic} />
      </div>
      <Field
        label="Tarif préférentiel (%)"
        name="tarif_preferentiel_pct"
        type="number"
        step="0.01"
        placeholder="0"
        defaultValue={client?.tarif_preferentiel_pct}
      />
      <TextArea label="Notes" name="notes" defaultValue={client?.notes} />
    </div>
  );
}

export function ClientForm({
  action,
  client,
  inModal = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  client?: Client;
  inModal?: boolean;
}) {
  if (inModal) {
    return (
      <ModalForm action={action}>
        <Fields client={client} />
        <div className="flex items-center gap-3 pt-4">
          <SubmitButton />
          <ModalCancelButton />
        </div>
      </ModalForm>
    );
  }

  return (
    <form action={action}>
      <Card className="p-5 space-y-4 max-w-2xl">
        <Fields client={client} />
        <div className="flex items-center gap-3 pt-2">
          <SubmitButton />
          <Link href="/clients" className="text-sm text-muted hover:underline">
            Annuler
          </Link>
        </div>
      </Card>
    </form>
  );
}
