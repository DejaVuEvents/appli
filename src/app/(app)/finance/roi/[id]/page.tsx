import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { FinanceTabs } from "../../finance-tabs";
import { updateRoiItem } from "../actions";
import { RoiForm } from "../roi-form";
import type { RoiMateriel, MaterielReference } from "@/lib/types";

export default async function EditRoiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ annee?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const annee = Number(sp.annee) || new Date().getFullYear();

  const supabase = await createClient();
  const [{ data: item }, { data: refs }] = await Promise.all([
    supabase.from("roi_materiel").select("*").eq("id", id).single(),
    supabase.from("materiel_reference").select("id, nom").order("nom"),
  ]);

  if (!item) notFound();

  const action = updateRoiItem.bind(null, id);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Finance / Trésorerie" />
      <FinanceTabs annee={annee} />

      <h2 className="mb-4 font-semibold">Modifier — {(item as RoiMateriel).nom}</h2>

      <Card className="p-4">
        <RoiForm
          action={action}
          item={item as RoiMateriel}
          references={(refs ?? []) as MaterielReference[]}
        />
      </Card>
    </div>
  );
}
