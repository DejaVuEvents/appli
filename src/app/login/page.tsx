"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(signIn, null);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Déjà Vu" className="mx-auto h-12 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanc.png" alt="Déjà Vu" className="mx-auto hidden h-12 w-auto dark:block" />
          <p className="text-sm text-muted mt-3">Gestion intégrée de l&apos;association</p>
        </div>
        <form action={formAction} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="email" name="email" type="email" required autoComplete="email"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">Mot de passe</label>
            <input
              id="password" name="password" type="password" required autoComplete="current-password"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <SubmitButton />
        </form>
      </div>
    </main>
  );
}
