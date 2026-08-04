import Link from "next/link";
import { Field } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import type { Vehicule } from "@/lib/types";

function Fields({ vehicule }: { vehicule?: Vehicule }) {
  return (
    <div className="space-y-4">
      <Field label="Nom" name="nom" required defaultValue={vehicule?.nom} placeholder="Fourgon 20 m³" />
      <Field label="Type" name="type" defaultValue={vehicule?.type} placeholder="Utilitaire, PL…" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Coût location / jour (€)" name="cout_location_jour" type="number" step="0.01" defaultValue={vehicule?.cout_location_jour} placeholder="0" />
        <Field label="Coût / km (€)" name="cout_km" type="number" step="0.001" defaultValue={vehicule?.cout_km} placeholder="0" />
      </div>
      <Field label="Capacité (m³)" name="capacite_m3" type="number" step="0.01" defaultValue={vehicule?.capacite_m3} />
    </div>
  );
}

export function VehiculeForm({
  action,
  vehicule,
  inModal = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  vehicule?: Vehicule;
  inModal?: boolean;
}) {
  if (inModal) {
    return (
      <ModalForm action={action}>
        <Fields vehicule={vehicule} />
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
        <Fields vehicule={vehicule} />
        <div className="flex items-center gap-3 pt-2">
          <SubmitButton />
          <Link href="/vehicules" className="text-sm text-muted hover:underline">
            Annuler
          </Link>
        </div>
      </Card>
    </form>
  );
}
