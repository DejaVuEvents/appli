"use client";

import Link from "next/link";
import { ModalForm } from "@/components/modal";
import { useState, useMemo, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { euros } from "@/lib/format";
import type { LignePrestation } from "@/lib/types";
import { bucketPour, ORDRE_BUCKETS } from "@/lib/devis-buckets";

type Ref = {
  id: string;
  nom: string;
  designation?: string | null;
  prix_location_jour: number;
  categorie_id: string | null;
  cout_location_jour?: number | null;
};
type Cat = { id: string; nom: string; parent_id?: string | null };

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const noWheel = (e: React.WheelEvent<HTMLInputElement>) => (e.target as HTMLInputElement).blur();

export function LigneForm({
  action,
  references,
  categories,
  arbreCategories,
  ligne,
  submitLabel = "+ Ajouter la ligne",
  cancelHref,
  defaultCategorieId,
}: {
  action: (formData: FormData) => void;
  references: Ref[];
  /** Choix proposés : les familles du devis, ou l'arborescence complète. */
  categories: Cat[];
  /** Arborescence complète du catalogue, pour situer chaque article. */
  arbreCategories?: Cat[];
  ligne?: LignePrestation;
  submitLabel?: string;
  cancelHref?: string;
  defaultCategorieId?: string;
}) {
  const [referenceId, setReferenceId] = useState(ligne?.reference_id ?? "");
  const [designation, setDesignation] = useState(ligne?.designation ?? "");
  const [categorieId, setCategorieId] = useState(ligne?.categorie_id ?? defaultCategorieId ?? "");
  const [prix, setPrix] = useState(String(ligne?.prix_unitaire ?? ""));

  const labelOf = (r: Ref) => r.designation ?? r.nom;
  const selected = references.find((r) => r.id === referenceId);
  const [query, setQuery] = useState(selected ? labelOf(selected) : "");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deux listes distinctes : celle qu'on PROPOSE (les familles du devis) et celle
  // qui permet de SITUER un article (l'arborescence complète du catalogue).
  const arbre = useMemo(() => arbreCategories ?? categories, [arbreCategories, categories]);
  const parentDe = useMemo(() => new Map(arbre.map((c) => [c.id, c.parent_id ?? null])), [arbre]);
  const nomArbre = useMemo(() => new Map(arbre.map((c) => [c.id, c.nom])), [arbre]);
  const nomDe = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);

  /** Remonte à la racine de l'arborescence. */
  const racine = (catId: string | null): string | null => {
    let cur = catId;
    for (let i = 0; cur && i < 10; i++) {
      const p = parentDe.get(cur) ?? null;
      if (!p) return cur;
      cur = p;
    }
    return cur;
  };
  const estExterne = (r: Ref) => nomArbre.get(racine(r.categorie_id) ?? "") === "Catalogue Externe";

  /**
   * La catégorie choisie couvre-t-elle cette référence ?
   *
   * Les familles du devis (Lumière, Son, Structure…) ne sont pas des catégories du
   * catalogue : le matériel son se trouve aussi bien sous « Son » que sous
   * « Catalogue Externe › Enceintes & Caissons ». On réutilise donc le classeur qui
   * range déjà les lignes du devis, au lieu de ne regarder que l'arborescence —
   * sinon choisir « Son » ne proposait rien.
   */
  const dansCategorie = (r: Ref, catId: string) => {
    const nomChoisi = nomDe.get(catId) ?? "";
    if ((ORDRE_BUCKETS as readonly string[]).includes(nomChoisi)) {
      return bucketPour(r.designation ?? r.nom, nomArbre.get(r.categorie_id ?? "") ?? null) === nomChoisi;
    }
    let cur = r.categorie_id;
    for (let i = 0; cur && i < 10; i++) {
      if (cur === catId) return true;
      cur = parentDe.get(cur) ?? null;
    }
    return false;
  };

  // Catégories présentées par arborescence : les racines, chacune avec ses enfants.
  const groupesCategories = useMemo(() => {
    const racines = categories.filter((c) => !c.parent_id);
    const groupes = racines.map((r) => ({
      id: r.id,
      nom: r.nom,
      enfants: categories.filter((c) => c.parent_id === r.id),
    }));
    // Catégories dont le parent n'a pas été chargé : à plat, pour ne pas les perdre.
    const vues = new Set(groupes.flatMap((g) => [g.id, ...g.enfants.map((e) => e.id)]));
    for (const c of categories) {
      if (!vues.has(c.id)) groupes.push({ id: c.id, nom: c.nom, enfants: [] });
    }
    return groupes;
  }, [categories]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // La catégorie choisie restreint le catalogue : c'est elle qu'on choisit d'abord.
    const base = references.filter((r) => !categorieId || dansCategorie(r, categorieId));
    const filtres = !q
      ? base
      : base.filter(
          (r) => r.nom.toLowerCase().includes(q) || (r.designation ?? "").toLowerCase().includes(q),
        );
    return filtres.slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [references, query, categorieId, parentDe]);

  function pick(r: Ref | null) {
    if (!r) {
      setReferenceId("");
      setQuery("");
    } else {
      setReferenceId(r.id);
      setQuery(labelOf(r));
      setDesignation(labelOf(r));
      setPrix(String(r.prix_location_jour ?? 0));
      // La catégorie vient en premier : un article choisi ensuite ne la réécrit pas.
      if (!categorieId) setCategorieId(r.categorie_id ?? "");
    }
    setOpen(false);
  }

  return (
    <ModalForm action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* La catégorie se choisit en premier : c'est elle qui restreint le catalogue.
            Sans catégorie proposée (devis de vente), le champ n'offrirait que
            « — Aucune — » : on le masque au lieu d'afficher un choix vide. */}
        {categories.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Catégorie</span>
            <select
              name="categorie_id"
              value={categorieId}
              onChange={(e) => {
                setCategorieId(e.target.value);
                // Un article d'une autre catégorie ne peut pas rester sélectionné.
                if (referenceId) {
                  const r = references.find((x) => x.id === referenceId);
                  if (e.target.value && r && !dansCategorie(r, e.target.value)) {
                    setReferenceId("");
                    setQuery("");
                  }
                }
              }}
              className={input}
            >
              <option value="">— Aucune (tout le catalogue) —</option>
              {groupesCategories.map((g) => (
                g.enfants.length === 0 ? (
                  <option key={g.id} value={g.id}>{g.nom}</option>
                ) : (
                  <optgroup key={g.id} label={g.nom}>
                    <option value={g.id}>{g.nom} — tout</option>
                    {g.enfants.map((c) => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </optgroup>
                )
              ))}
            </select>
          </label>
        )}
        <div className="relative">
          <span className="mb-1 block text-sm font-medium">
            Article{categorieId ? ` — ${nomDe.get(categorieId) ?? ""}` : ""}
          </span>
          <input type="hidden" name="reference_id" value={referenceId} />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (referenceId) setReferenceId(""); // l'utilisateur retape → on délie
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            placeholder="Rechercher un article… (ou laisser vide pour ligne libre)"
            className={input}
            autoComplete="off"
          />
          {open && (
            <div
              className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
              onMouseDown={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
              }}
            >
              <button
                type="button"
                onClick={() => pick(null)}
                className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface"
              >
                — Ligne libre (saisie manuelle) —
              </button>
              {results.map((r) => {
                // Deux informations distinctes : d'où vient l'article (notre
                // catalogue ou un catalogue externe) et s'il nous coûte une
                // sous-location. Elles coïncident souvent, pas toujours.
                const externe = estExterne(r);
                const sousLoc = r.cout_location_jour != null;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pick(r)}
                    className={`flex w-full items-center justify-between gap-2 border-l-2 px-3 py-2 text-left text-sm hover:bg-surface ${
                      externe ? "border-l-amber-400" : "border-l-green-500"
                    } ${r.id === referenceId ? "bg-surface" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {labelOf(r)}
                      {r.designation && <span className="ml-1 text-xs text-muted">· {r.nom}</span>}
                      {/* Un seul badge : les deux informations coïncident presque
                          toujours, et côte à côte elles débordaient de la liste.
                          « Sous-loc. » ne reste visible que sur un article à nous
                          qu'on sous-loue quand même — le cas qui mérite l'attention. */}
                      {externe ? (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          Externe
                        </span>
                      ) : sousLoc ? (
                        <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                          Sous-loc.
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{euros(r.prix_location_jour)}/j</span>
                  </button>
                );
              })}
              {results.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted">
                  {categorieId
                    ? `Aucun article dans « ${nomDe.get(categorieId) ?? "cette catégorie"} ». Choisis « Aucune » pour voir tout le catalogue, ou laisse la ligne libre.`
                    : "Aucun article. La ligne restera libre."}
                </p>
              )}
              <p className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted">
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-0.5 bg-green-500" /> Notre matériel</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-0.5 bg-amber-400" /> Catalogue externe</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Désignation *</span>
        <input
          name="designation"
          required
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="Lyre beam 10R, Tech - Montage…"
          className={input}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Quantité</span>
          <input name="quantite" type="number" min="1" defaultValue={ligne?.quantite ?? 1} onWheel={noWheel} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Unité</span>
          <input name="unite" defaultValue={ligne?.unite ?? ""} placeholder="(ex. mètres)" className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Prix unitaire (€)</span>
          <input
            name="prix_unitaire"
            type="number"
            step="0.01"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            onWheel={noWheel}
            className={input}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Remise</span>
            <input name="remise_valeur" type="number" step="0.01" defaultValue={ligne?.remise_valeur ?? 0} onWheel={noWheel} className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Unité</span>
            <select name="remise_type" defaultValue={ligne?.remise_type ?? "pct"} className={input}>
              <option value="pct">%</option>
              <option value="montant">€</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>{submitLabel}</SubmitButton>
        {cancelHref && <Link href={cancelHref} className="text-sm text-muted hover:underline">Annuler</Link>}
      </div>
    </ModalForm>
  );
}
