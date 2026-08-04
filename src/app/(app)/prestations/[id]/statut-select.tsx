"use client";

import { useState, useTransition } from "react";
import { PRESTATION_STATUT_LABELS, type PrestationStatut } from "@/lib/types";

const STATUTS = Object.keys(PRESTATION_STATUT_LABELS) as PrestationStatut[];

export function StatutSelect({
  action,
  statut,
}: {
  action: (formData: FormData) => void | Promise<void>;
  statut: PrestationStatut;
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
      {STATUTS.map((s) => (
        <option key={s} value={s}>
          {PRESTATION_STATUT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
