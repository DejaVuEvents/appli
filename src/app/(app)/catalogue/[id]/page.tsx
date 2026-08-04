import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FicheView } from "./fiche-view";
import { FicheEdit } from "./fiche-edit";
import type { KitRow } from "./fiche-types";
import { type MaterielReference, type Unite } from "@/lib/types";

export default async function ReferenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const editMode = (await searchParams)?.edit === "1";
  const supabase = await createClient();

  const [{ data: ref }, { data: cats }, { data: unites }, { data: kits }, { data: autres }] =
    await Promise.all([
      supabase.from("materiel_reference").select("*").eq("id", id).single(),
      supabase.from("categorie").select("id, nom, parent_id").order("nom"),
      supabase.from("unite").select("*").eq("reference_id", id).order("created_at"),
      supabase
        .from("kit_regle")
        .select("id, quantite_par_unite, obligatoire, accessoire:materiel_reference!reference_accessoire_id(nom)")
        .eq("reference_parent_id", id),
      supabase.from("materiel_reference").select("id, nom").neq("id", id).order("nom"),
    ]);

  if (!ref) notFound();
  const reference = ref as MaterielReference;
  const categories = (cats ?? []) as { id: string; nom: string; parent_id: string | null }[];
  const listeUnites = (unites ?? []) as Unite[];
  const listeKits = (kits ?? []) as unknown as KitRow[];
  const accessoiresObligatoires = listeKits.filter((k) => k.obligatoire);
  const accessoiresOptionnels = listeKits.filter((k) => !k.obligatoire);
  const autresRefs = (autres ?? []) as { id: string; nom: string }[];
  const refCat = categories.find((c) => c.id === reference.categorie_id) ?? null;
  const categorieNom = refCat?.nom ?? null;
  // Onglet catalogue à cibler (catégorie racine)
  const rootCatId = refCat?.parent_id ?? refCat?.id ?? null;
  const backHref = rootCatId ? `/catalogue?cat=${rootCatId}` : "/catalogue";

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          ← Catalogue{categorieNom ? ` · ${categorieNom}` : ""}
        </Link>
      </div>
      <PageHeader
        title={reference.designation ?? reference.nom}
        subtitle={reference.designation ? `Réf. interne : ${reference.nom}` : (reference.est_consommable ? "Consommable (non sérialisé)" : "Référence matériel")}
        action={
          editMode ? (
            <Link
              href={`/catalogue/${id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-background"
            >
              ✓ Terminer
            </Link>
          ) : (
            <Link
              href={`/catalogue/${id}?edit=1`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              ✎ Modifier
            </Link>
          )
        }
      />

      {editMode ? (
        <FicheEdit
          id={id}
          reference={reference}
          cats={categories}
          listeUnites={listeUnites}
          accessoiresObligatoires={accessoiresObligatoires}
          accessoiresOptionnels={accessoiresOptionnels}
          autresRefs={autresRefs}
        />
      ) : (
        <FicheView
          reference={reference}
          categorieNom={categorieNom}
          listeUnites={listeUnites}
          accessoiresObligatoires={accessoiresObligatoires}
          accessoiresOptionnels={accessoiresOptionnels}
        />
      )}
    </div>
  );
}
