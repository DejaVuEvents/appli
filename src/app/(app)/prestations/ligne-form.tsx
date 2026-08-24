"use client";

import Link from "next/link";
import { useState, useMemo, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { euros } from "@/lib/format";
import type { LignePrestation } from "@/lib/types";

type Ref = {
  id: string;
  nom: string;
  designation?: string | null;
  prix_location_jour: number;
  categorie_id: string | null;
  cout_location_jour?: number | null;
};
type Cat = { id: string; nom: string };

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const noWheel = (e: React.WheelEvent<HTMLInputElement>) => (e.target as HTMLInputElement).blur();

export function LigneForm({
  action,
  references,
  categories,
  ligne,
  submitLabel = "+ Ajouter la ligne",
  cancelHref,
  defaultCategorieId,
}: {
  action: (formData: FormData) => void;
  references: Ref[];
  categories: Cat[];
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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? references
      : references.filter(
          (r) => r.nom.toLowerCase().includes(q) || (r.designation ?? "").toLowerCase().includes(q),
        );
    return base.slice(0, 60);
  }, [references, query]);

  function pick(r: Ref | null) {
    if (!r) {
      setReferenceId("");
      setQuery("");
    } else {
      setReferenceId(r.id);
      setQuery(labelOf(r));
      setDesignation(labelOf(r));
      setPrix(String(r.prix_location_jour ?? 0));
      setCategorieId(r.categorie_id ?? "");
    }
    setOpen(false);
  }

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <span className="mb-1 block text-sm font-medium">Depuis le catalogue</span>
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
                const externe = r.cout_location_jour != null;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pick(r)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface ${
                      r.id === referenceId ? "bg-surface" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {labelOf(r)}
                      {r.designation && <span className="ml-1 text-xs text-muted">· {r.nom}</span>}
                      {externe && (
                        <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          Sous-location
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{euros(r.prix_location_jour)}/j</span>
                  </button>
                );
              })}
              {results.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted">Aucun article. La ligne restera libre.</p>
              )}
            </div>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Catégorie</span>
          <select
            name="categorie_id"
            value={categorieId}
            onChange={(e) => setCategorieId(e.target.value)}
            className={input}
          >
            <option value="">— Aucune —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </label>
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
    </form>
  );
}
