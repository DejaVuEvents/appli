"use client";

import { useState, useTransition } from "react";
import { ETAT_LABELS, type EtatUnite } from "@/lib/types";

const ETATS = Object.keys(ETAT_LABELS) as EtatUnite[];
// États « destructifs » : sortent l'unité du parc exploitable → confirmation requise.
const ETATS_SENSIBLES: EtatUnite[] = ["hs", "reforme"];

export function EtatConstateSelect({
  action,
  etat,
}: {
  action: (formData: FormData) => void | Promise<void>;
  etat: string | null;
}) {
  const [val, setVal] = useState(etat ?? "ok");
  const [pending, start] = useTransition();

  return (
    <select
      value={val}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        if (
          (ETATS_SENSIBLES as string[]).includes(v) &&
          !window.confirm(
            `Marquer cette unité « ${ETAT_LABELS[v as EtatUnite]} » ? Elle ne sera plus proposée pour les prestations.`,
          )
        ) {
          e.target.value = val; // annulation → on remet l'ancien état
          return;
        }
        setVal(v);
        const fd = new FormData();
        fd.set("etat_constate", v);
        start(() => {
          action(fd);
        });
      }}
      className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
    >
      {ETATS.map((e) => (
        <option key={e} value={e}>
          {ETAT_LABELS[e]}
        </option>
      ))}
    </select>
  );
}
