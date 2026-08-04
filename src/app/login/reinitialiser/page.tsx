"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { definirNouveauMotDePasse } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? "Enregistrement…" : "Définir le mot de passe"}
    </button>
  );
}

export default function ReinitialiserPage() {
  const [state, formAction] = useActionState(definirNouveauMotDePasse, null);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Déjà Vu" className="mx-auto h-12 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanc.png" alt="Déjà Vu" className="mx-auto hidden h-12 w-auto dark:block" />
          <p className="text-sm text-muted mt-3">Nouveau mot de passe</p>
        </div>

        <form action={formAction} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
            <input
              id="password" name="password" type="password" required autoComplete="new-password" minLength={8}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium mb-1">Confirmer</label>
            <input
              id="confirm" name="confirm" type="password" required autoComplete="new-password" minLength={8}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <SubmitButton />
        </form>
      </div>
    </main>
  );
}
