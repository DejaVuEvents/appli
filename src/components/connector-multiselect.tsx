"use client";

import { useState } from "react";

/**
 * Sélection de plusieurs connecteurs sous forme de "chips".
 * Chaque valeur sélectionnée produit un <input hidden name={name}> :
 * côté serveur, on lit la liste avec formData.getAll(name).
 */
export function ConnectorMultiSelect({
  name,
  label,
  options,
  defaultValues = [],
}: {
  name: string;
  label: string;
  options: string[];
  defaultValues?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValues);
  const available = options.filter((o) => !selected.includes(o));

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        {selected.length === 0 && (
          <span className="text-sm text-muted">Aucun</span>
        )}
        {selected.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            {v}
            <button
              type="button"
              onClick={() => setSelected((s) => s.filter((x) => x !== v))}
              className="text-primary/70 hover:text-primary"
              aria-label={`Retirer ${v}`}
            >
              ✕
            </button>
            <input type="hidden" name={name} value={v} />
          </span>
        ))}
      </div>

      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) setSelected((s) => [...s, v]);
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">+ Ajouter un connecteur…</option>
          {available.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
