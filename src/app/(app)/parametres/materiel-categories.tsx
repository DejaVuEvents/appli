import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { updateCategoriesOrdre, createCategorie, deleteCategorie } from "../catalogue/actions";

export type MaterielCat = { id: string; nom: string; ordre: number | null; parent_id: string | null };

const FORM_ID = "form-categories-ordre";
const ordreInp = "w-14 shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm";
const nomInp = "min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm";
const delBtn = "shrink-0 rounded-lg border border-border px-2 py-2 text-xs text-red-600 hover:bg-background";
const addInp = "min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";
const addBtn = "shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-background";

/** Ligne éditable (ordre + nom + suppression) pour une catégorie ou sous-catégorie. */
function Ligne({ c, sous }: { c: MaterielCat; sous?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <input
        form={FORM_ID}
        name={`ordre_${c.id}`}
        type="number"
        defaultValue={c.ordre ?? 0}
        className={ordreInp}
        title="Ordre d'affichage"
      />
      <input
        form={FORM_ID}
        name={`nom_${c.id}`}
        defaultValue={c.nom}
        className={`${nomInp} ${sous ? "" : "font-medium"}`}
      />
      <form action={deleteCategorie.bind(null, c.id)} className="shrink-0">
        <ConfirmButton
          confirm={`Supprimer la catégorie « ${c.nom} » ? (Impossible si du matériel ou des sous-catégories y sont rattachés.)`}
          className={delBtn}
          title="Supprimer la catégorie"
        >
          ✕
        </ConfirmButton>
      </form>
    </div>
  );
}

export function MaterielCategories({ cats }: { cats: MaterielCat[] }) {
  // Arborescence : racines (sans parent) + enfants.
  const enfantsPar = new Map<string, MaterielCat[]>();
  for (const c of cats) {
    if (c.parent_id) {
      if (!enfantsPar.has(c.parent_id)) enfantsPar.set(c.parent_id, []);
      enfantsPar.get(c.parent_id)!.push(c);
    }
  }
  const racines = cats.filter((c) => !c.parent_id);

  if (cats.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface px-4 py-4 text-sm text-muted">
        Aucune catégorie. Elles se créent en ajoutant du matériel au catalogue, ou ci-dessous.
      </p>
    );
  }

  return (
    <>
      {/* Formulaire d'ordre/renommage : les inputs des lignes y sont rattachés via l'attribut form. */}
      <form id={FORM_ID} action={updateCategoriesOrdre} />

      <div className="grid gap-3 md:grid-cols-2">
        {racines.map((c) => {
          const enfants = enfantsPar.get(c.id) ?? [];
          return (
            <div key={c.id} className="rounded-xl border border-border bg-surface p-3">
              <Ligne c={c} />

              {/* Sous-catégories */}
              <div className="mt-2 ml-4 space-y-1.5 border-l-2 border-primary/50 pl-3">
                {enfants.map((e) => (
                  <Ligne key={e.id} c={e} sous />
                ))}
                <form action={createCategorie.bind(null, c.id)} className="flex items-center gap-2 pt-0.5">
                  <input name="nom" placeholder="+ Sous-catégorie" className={addInp} />
                  <button className={addBtn}>Ajouter</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton form={FORM_ID}>Enregistrer l&apos;ordre et les noms</SubmitButton>
        <form action={createCategorie.bind(null, null)} className="flex items-center gap-2">
          <input name="nom" placeholder="+ Nouvelle catégorie principale" className={`${addInp} w-56`} />
          <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Ajouter
          </button>
        </form>
      </div>
    </>
  );
}
