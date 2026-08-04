import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { PrestationForm } from "../prestation-form";
import { createPrestation } from "../actions";

export default async function NouvellePrestationPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("client").select("id, nom").order("nom");

  return (
    <div>
      <PageHeader title="Nouvelle prestation" />
      <PrestationForm action={createPrestation} clients={data ?? []} cancelHref="/prestations" />
    </div>
  );
}
