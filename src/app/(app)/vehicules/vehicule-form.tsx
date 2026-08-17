import Link from "next/link";
import { Field, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { CARBURANTS } from "@/lib/vehicule";
import type { Vehicule } from "@/lib/types";

function Fields({ vehicule }: { vehicule?: Vehicule }) {
  return (
    <div className="space-y-4">
      <Field label="Nom" name="nom" required defaultValue={vehicule?.nom} placeholder="Fourgon 20 m³" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" name="type" defaultValue={vehicule?.type} placeholder="Utilitaire, PL…" />
        <Select label="Carburant" name="type_carburant" defaultValue={vehicule?.type_carburant} options={[{ value: "", label: "—" }, ...CARBURANTS]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Coût location / jour (€)" name="cout_location_jour" type="number" step="0.01" defaultValue={vehicule?.cout_location_jour} placeholder="0" />
        <Field label="Consommation (L/100 km)" name="conso_l_100km" type="number" step="0.1" defaultValue={vehicule?.conso_l_100km} placeholder="ex. 9.5" />
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
