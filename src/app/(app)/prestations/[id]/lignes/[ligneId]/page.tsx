import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { LigneForm } from "../../../ligne-form";
import { updateLigne } from "../../../actions";
import type { LignePrestation } from "@/lib/types";

export default async function EditLignePage({
  params,
}: {
  params: Promise<{ id: string; ligneId: string }>;
}) {
  const { id, ligneId } = await params;
  const supabase = await createClient();

  const [{ data: ligne }, { data: refs }, { data: cats }] = await Promise.all([
    supabase.from("ligne_prestation").select("*").eq("id", ligneId).single(),
    supabase.from("materiel_reference").select("id, nom, designation, prix_location_jour, cout_location_jour, categorie_id").order("nom"),
    // Toute l'arborescence : la catégorie choisie filtre le catalogue, il lui faut
    // donc les parents comme les enfants.
    supabase.from("categorie").select("id, nom, ordre, parent_id").order("ordre").order("nom"),
  ]);
  if (!ligne) notFound();
  const devisId = (ligne as LignePrestation).devis_id;
  const retour = devisId ? `/prestations/devis/${devisId}?edit=1` : `/prestations/${id}`;

  const categories = (cats ?? []) as { id: string; nom: string; ordre?: number | null; parent_id: string | null }[];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Modifier la ligne" />
      <Card className="p-5">
        <LigneForm
          action={updateLigne.bind(null, id, ligneId)}
          references={refs ?? []}
          categories={categories}
          ligne={ligne as LignePrestation}
          submitLabel="Enregistrer"
          cancelHref={retour}
        />
      </Card>
    </div>
  );
}
