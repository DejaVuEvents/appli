"use client";

import { useFormStatus } from "react-dom";

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
  /** Si défini, une confirmation est demandée avant l'envoi du formulaire. */
  confirm?: string;
  className?: string;
  /** Id d'un formulaire à soumettre (bouton placé hors du <form>). */
  form?: string;
}) {
  const { pending } = useFormStatus();
  const styles =
    variant === "danger"
      ? "border border-red-300 text-red-600 hover:bg-red-50"
      : "bg-primary text-primary-foreground hover:opacity-90";
  return (
    <button
      type="submit"
      form={form}
      disabled={pending}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${styles} ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
