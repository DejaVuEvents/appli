"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "./confirm-dialog";

export function SubmitButton({
  children = "Enregistrer",
  pendingLabel = "Enregistrement…",
  variant = "primary",
  confirm,
  className = "",
  form,
}: {
  children?: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "danger";
  /** Si défini, une confirmation (modale intégrée) est demandée avant l'envoi. */
  confirm?: string;
  className?: string;
  /** Id d'un formulaire à soumettre (bouton placé hors du <form>). */
  form?: string;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const styles =
    variant === "danger"
      ? "border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
      : "bg-primary text-primary-foreground hover:opacity-90";
  const cls = `inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${styles} ${className}`;

  // Sans confirmation : bouton de soumission classique (état "pending").
  if (!confirm) {
    return (
      <button type="submit" form={form} disabled={pending} className={cls}>
        {pending ? pendingLabel : children}
      </button>
    );
  }

  // Avec confirmation : ouvre la modale, puis soumet le formulaire.
  return (
    <>
      <button ref={ref} type="button" form={form} disabled={pending} onClick={() => setOpen(true)} className={cls}>
        {pending ? pendingLabel : children}
      </button>
      <ConfirmDialog
        open={open}
        message={confirm}
        confirmLabel={variant === "danger" ? "Supprimer" : "Confirmer"}
        danger={variant === "danger"}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          const b = ref.current;
          if (form) (document.getElementById(form) as HTMLFormElement | null)?.requestSubmit();
          else b?.form?.requestSubmit();
        }}
      />
    </>
  );
}
