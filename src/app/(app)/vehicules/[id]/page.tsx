import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { VehiculeForm } from "../vehicule-form";
import { updateVehicule, deleteVehicule } from "../actions";
import type { Vehicule } from "@/lib/types";

export default async function EditVehiculePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("vehicule").select("*").eq("id", id).single();
  if (!data) notFound();
  const vehicule = data as Vehicule;

  return (
    <div>
      <PageHeader title={vehicule.nom} subtitle="Modifier le véhicule" />
      <VehiculeForm action={updateVehicule.bind(null, id)} vehicule={vehicule} />

      <form action={deleteVehicule.bind(null, id)} className="mt-6">
        <SubmitButton variant="danger" pendingLabel="Suppression…" confirm="Supprimer définitivement ce véhicule ?">
          Supprimer ce véhicule
        </SubmitButton>
      </form>
    </div>
  );
}
