"use client";

import { useState, useTransition } from "react";
import { ETAT_LABELS, type EtatUnite } from "@/lib/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  const [confirmVal, setConfirmVal] = useState<string | null>(null);

  const appliquer = (v: string) => {
    setVal(v);
    const fd = new FormData();
    fd.set("etat_constate", v);
    start(() => {
      action(fd);
    });
  };

  return (
    <>
      <select
        value={val}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if ((ETATS_SENSIBLES as string[]).includes(v)) {
            setConfirmVal(v); // confirmation via modale intégrée
            return;
          }
          appliquer(v);
        }}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
      >
        {ETATS.map((e) => (
          <option key={e} value={e}>
            {ETAT_LABELS[e]}
          </option>
        ))}
      </select>
      <ConfirmDialog
        open={confirmVal !== null}
        message={confirmVal ? `Marquer cette unité « ${ETAT_LABELS[confirmVal as EtatUnite]} » ? Elle ne sera plus proposée pour les prestations.` : ""}
        confirmLabel="Confirmer"
        danger
        onCancel={() => setConfirmVal(null)}
        onConfirm={() => { const v = confirmVal; setConfirmVal(null); if (v) appliquer(v); }}
      />
    </>
  );
}
