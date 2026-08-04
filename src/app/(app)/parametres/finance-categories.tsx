import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import {
  updateFinanceNoms,
  createFinanceCategorie, deleteFinanceCategorie,
  createFinanceSousCategorie, deleteFinanceSousCategorie,
} from "../finance/actions";

export type FinanceCat = { id: string; sens: string; nom: string; sous: { id: string; nom: string }[] };

const FORM_ID = "form-finance-noms";
const catInp = "min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium";
const subInp = "min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";
const delBtn = "shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs text-red-600 hover:bg-background";
const addBtn = "shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-background";

function Panneau({ sens, titre, accent, cats }: {
  sens: "entree" | "sortie";
  titre: string;
  accent: string;
  cats: FinanceCat[];
}) {
  const liste = cats.filter((c) => c.sens === sens);
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className={`border-b border-border px-4 py-2.5 text-sm font-semibold ${accent}`}>{titre}</div>
      <div className="space-y-2.5 bg-surface/40 p-3">
        {liste.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-surface p-2.5">
            {/* Catégorie */}
            <div className="flex items-center gap-2">
              <input form={FORM_ID} name={`catnom_${c.id}`} defaultValue={c.nom.replace(/_/g, " ")} className={catInp} />
              <form action={deleteFinanceCategorie.bind(null, c.id)} className="shrink-0">
                <ConfirmButton
                  confirm={`Supprimer la catégorie « ${c.nom.replace(/_/g, " ")} » et ses sous-catégories ? (Les écritures existantes gardent leur libellé.)`}
                  className={delBtn}
                  title="Supprimer la catégorie"
                >
                  ✕
                </ConfirmButton>
              </form>
            </div>
            {/* Sous-catégories */}
            <div className="mt-1.5 ml-4 space-y-1.5 border-l-2 border-primary/50 pl-3">
              {c.sous.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <input form={FORM_ID} name={`subnom_${s.id}`} defaultValue={s.nom} className={subInp} />
                  <form action={deleteFinanceSousCategorie.bind(null, s.id)} className="shrink-0">
                    <ConfirmButton confirm="Supprimer cette sous-catégorie ?" className={delBtn} title="Supprimer">✕</ConfirmButton>
                  </form>
                </div>
              ))}
              <form action={createFinanceSousCategorie.bind(null, c.id)} className="flex items-center gap-2 pt-0.5">
                <input name="nom" placeholder="+ Sous-catégorie" className={subInp} />
                <button className={addBtn}>Ajouter</button>
              </form>
            </div>
          </div>
        ))}

        {/* Nouvelle catégorie */}
        <form action={createFinanceCategorie.bind(null, sens)} className="flex items-center gap-2 pt-1">
          <input name="nom" placeholder="+ Nouvelle catégorie" className={`${catInp} font-normal`} />
          <button className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Ajouter</button>
        </form>
      </div>
    </div>
  );
}

export function FinanceCategories({ cats }: { cats: FinanceCat[] }) {
  return (
    <div className="space-y-4">
      {/* Formulaire de renommage groupé : les champs sont rattachés via l'attribut form. */}
      <form id={FORM_ID} action={updateFinanceNoms} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panneau sens="sortie" titre="Sorties (dépenses)" accent="bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300" cats={cats} />
        <Panneau sens="entree" titre="Entrées (recettes)" accent="bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" cats={cats} />
      </div>

      <SubmitButton form={FORM_ID}>Enregistrer les noms</SubmitButton>
    </div>
  );
}
