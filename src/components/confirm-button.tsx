"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";

/** Bouton (dans un <form action=…>) qui demande confirmation via une modale intégrée
 *  au design du site (au lieu de la popup native du navigateur) avant de soumettre. */
export function ConfirmButton({
  confirm,
  className,
  title,
  children,
  confirmLabel = "Supprimer",
}: {
  confirm: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={ref} type="button" title={title} className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        message={confirm}
        confirmLabel={confirmLabel}
        danger
        onCancel={() => setOpen(false)}
        onConfirm={() => { setOpen(false); ref.current?.form?.requestSubmit(); }}
      />
    </>
  );
}
