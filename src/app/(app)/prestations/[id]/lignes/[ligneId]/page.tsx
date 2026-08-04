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

  const DEVIS_CATS = ["Lumière & Effets", "Son", "Structure & Scène", "Transport", "Technique"];
  const [{ data: ligne }, { data: refs }, { data: cats }] = await Promise.all([
    supabase.from("ligne_prestation").select("*").eq("id", ligneId).single(),
    supabase.from("materiel_reference").select("id, nom, designation, prix_location_jour, cout_location_jour, categorie_id").order("nom"),
    supabase.from("categorie").select("id, nom, ordre").in("nom", DEVIS_CATS).order("ordre"),
  ]);
  if (!ligne) notFound();
  const devisId = (ligne as LignePrestation).devis_id;
  const retour = devisId ? `/prestations/devis/${devisId}?edit=1` : `/prestations/${id}`;

  // Garder la catégorie actuelle de la ligne si elle n'est pas dans les 5 (pour ne pas la perdre).
  let categories = (cats ?? []) as { id: string; nom: string; ordre?: number | null }[];
  const curCatId = (ligne as LignePrestation).categorie_id;
  if (curCatId && !categories.some((c) => c.id === curCatId)) {
    const { data: cur } = await supabase.from("categorie").select("id, nom").eq("id", curCatId).maybeSingle();
    if (cur) categories = [...categories, cur];
  }

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
