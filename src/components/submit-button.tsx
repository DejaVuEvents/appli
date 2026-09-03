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
  disabled = false,
}: {
  children?: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "danger";
  /** Si défini, une confirmation (modale intégrée) est demandée avant l'envoi. */
  confirm?: string;
  className?: string;
  /** Id d'un formulaire à soumettre (bouton placé hors du <form>). */
  form?: string;
  /** Grise le bouton (en plus de l'état « envoi en cours »). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const inactif = pending || disabled;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const styles =
    variant === "danger"
      ? "border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
      : "bg-primary text-primary-foreground hover:opacity-90";
  const cls = `inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`;

  // Sans confirmation : bouton de soumission classique (état "pending").
  if (!confirm) {
    return (
      <button type="submit" form={form} disabled={inactif} className={cls}>
        {pending ? pendingLabel : children}
      </button>
    );
  }

  // Avec confirmation : ouvre la modale, puis soumet le formulaire.
  return (
    <>
      <button ref={ref} type="button" form={form} disabled={inactif} onClick={() => setOpen(true)} className={cls}>
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
