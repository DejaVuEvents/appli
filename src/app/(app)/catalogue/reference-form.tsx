import Link from "next/link";
import { Field, TextArea, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConnectorMultiSelect } from "@/components/connector-multiselect";
import { Card } from "@/components/ui";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { PhotoField } from "./photo-field";
import {
  type MaterielReference,
  CONNECTEURS_PUISSANCE,
  CONNECTEURS_DATA,
} from "@/lib/types";

type CatRow = { id: string; nom: string; parent_id?: string | null };

export function ReferenceForm({
  action,
  reference,
  categories,
  defaultCatId,
  inModal = false,
}: {
  action: (formData: FormData) => void;
  reference?: MaterielReference;
  categories: CatRow[];
  defaultCatId?: string;
  inModal?: boolean;
}) {
  const activeCatId = reference?.categorie_id ?? defaultCatId ?? null;
  const currentCat = categories.find((c) => c.id === activeCatId)?.nom;

  const fields = (
    <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Désignation (apparaît sur les devis)" name="designation" defaultValue={reference?.designation ?? ""} placeholder="Tête mobile Spot 300W" />
          <Field label="Nom interne" name="nom" required defaultValue={reference?.nom} placeholder="Shehed 10R" />
        </div>

        <PhotoField photoUrl={reference?.photo_url} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="categorie_nom" className="block text-sm font-medium mb-1">
              Catégorie
            </label>
            <input
              id="categorie_nom"
              name="categorie_nom"
              list="categories-list"
              defaultValue={currentCat}
              placeholder="Lumière, Son, Structure…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="categories-list">
              {categories
                .filter((c) => !c.parent_id)
                .map((root) => (
                  <option key={root.id} value={root.nom} />
                ))}
              {categories
                .filter((c) => c.parent_id)
                .map((child) => {
                  const parent = categories.find((c) => c.id === child.parent_id);
                  return (
                    <option key={child.id} value={`${parent?.nom ?? ""} → ${child.nom}`} />
                  );
                })}
            </datalist>
          </div>
          <Field
            label="Prix de location / jour (€)"
            name="prix_location_jour"
            type="number"
            step="0.01"
            defaultValue={reference?.prix_location_jour}
            placeholder="0"
          />
          <Field
            label="Coût fournisseur / jour (€ HT)"
            name="cout_location_jour"
            type="number"
            step="0.01"
            defaultValue={reference?.cout_location_jour ?? undefined}
            placeholder="Tarif HT du loueur — vide si matériel Déjà Vu"
          />
          <Field
            label="Fournisseur"
            name="fournisseur"
            defaultValue={reference?.fournisseur ?? ""}
            placeholder="Audiotec, loueur camion…"
          />
          <Field
            label="Remise fournisseur (%)"
            name="remise_fournisseur_pct"
            type="number"
            step="0.01"
            defaultValue={reference?.remise_fournisseur_pct ?? 0}
            placeholder="Appliquée sur le HT (ex. 30)"
          />
          <Field
            label="TVA fournisseur (%)"
            name="tva_fournisseur_pct"
            type="number"
            step="0.01"
            defaultValue={reference?.tva_fournisseur_pct ?? 20}
            placeholder="Ajoutée après la remise"
          />
          <Field
            label="Zone de stockage"
            name="lieu_stockage"
            defaultValue={reference?.lieu_stockage ?? ""}
            placeholder="Local 1, Local 2, Entreprise de location…"
          />
        </div>

        <TextArea label="Description" name="description" defaultValue={reference?.description} />

        <fieldset className="border-t border-border pt-4">
          <legend className="text-sm font-semibold text-muted mb-3">
            Caractéristiques techniques
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Consommation électrique (W)" name="puissance_w" type="number" step="0.01" defaultValue={reference?.puissance_w} />
            <Field label="Intensité (A)" name="intensite_a" type="number" step="0.01" defaultValue={reference?.intensite_a} />
            <Select
              label="Phase"
              name="phase"
              defaultValue={reference?.phase ?? ""}
              options={[
                { value: "", label: "—" },
                { value: "mono", label: "Monophasé" },
                { value: "tri", label: "Triphasé" },
              ]}
            />
            <Field label="Poids (kg)" name="poids_kg" type="number" step="0.01" defaultValue={reference?.poids_kg} />
            <Field label="Charge admissible (kg)" name="charge_max_kg" type="number" step="1" defaultValue={reference?.charge_max_kg} placeholder="CMU — matériel de levage" />
            <Field label="Dimensions" name="dimensions" defaultValue={reference?.dimensions} placeholder="L×l×h" />
            <ConnectorMultiSelect
              name="connecteurs_puissance"
              label="Connecteurs (alimentation)"
              options={CONNECTEURS_PUISSANCE}
              defaultValues={reference?.connecteurs_puissance ?? []}
            />
            <ConnectorMultiSelect
              name="connecteurs_data"
              label="Connecteurs (données / contrôle)"
              options={CONNECTEURS_DATA}
              defaultValues={reference?.connecteurs_data ?? []}
            />
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="est_consommable"
            defaultChecked={reference?.est_consommable}
            className="h-4 w-4 rounded border-border"
          />
          Consommable (non sérialisé — ex. câbles, suivi en quantité)
        </label>
    </div>
  );

  if (inModal) {
    return (
      <ModalForm action={action}>
        {fields}
        <div className="flex items-center gap-3 pt-4">
          <SubmitButton />
          <ModalCancelButton />
        </div>
      </ModalForm>
    );
  }

  return (
    <form action={action}>
      <Card className="p-5 space-y-5 max-w-3xl">
        {fields}
        <div className="flex items-center gap-3 pt-2">
          <SubmitButton />
          <Link
            href={activeCatId ? `/catalogue?cat=${activeCatId}` : "/catalogue"}
            className="text-sm text-muted hover:underline"
          >
            Annuler
          </Link>
        </div>
      </Card>
    </form>
  );
}
