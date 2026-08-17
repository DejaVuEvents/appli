"use client";

import { useState, useTransition } from "react";

const LOCATION_STATUT_LABELS: Record<string, string> = {
  prevu: "Prévu",
  confirme: "Confirmé",
  en_cours: "En cours",
  rendu: "Rendu",
  annule: "Annulé",
};

export function LocationStatutSelect({
  action,
  statut,
}: {
  action: (formData: FormData) => void | Promise<void>;
  statut: string;
}) {
  const [val, setVal] = useState<string>(statut);
  const [pending, start] = useTransition();

  return (
    <select
      value={val}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        setVal(v);
        const fd = new FormData();
        fd.set("statut", v);
        start(() => {
          action(fd);
        });
      }}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium disabled:opacity-50"
    >
      {Object.keys(LOCATION_STATUT_LABELS).map((s) => (
        <option key={s} value={s}>
          {LOCATION_STATUT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
