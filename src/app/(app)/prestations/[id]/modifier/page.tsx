import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { PrestationForm } from "../../prestation-form";
import { updatePrestation } from "../../actions";
import type { Prestation } from "@/lib/types";

export default async function ModifierPrestationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: prest }, { data: clients }] = await Promise.all([
    supabase.from("prestation").select("*").eq("id", id).single(),
    supabase.from("client").select("id, nom").order("nom"),
  ]);
  if (!prest) notFound();

  return (
    <div>
      <PageHeader title="Modifier la prestation" />
      <PrestationForm
        action={updatePrestation.bind(null, id)}
        prestation={prest as Prestation}
        clients={clients ?? []}
        cancelHref={`/prestations/${id}`}
      />
    </div>
  );
}
