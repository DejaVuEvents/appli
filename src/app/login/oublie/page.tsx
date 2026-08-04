"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { envoyerReinitialisation } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? "Envoi…" : "Envoyer le lien"}
    </button>
  );
}

export default function OubliePage() {
  const [state, formAction] = useActionState(envoyerReinitialisation, null);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Déjà Vu" className="mx-auto h-12 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanc.png" alt="Déjà Vu" className="mx-auto hidden h-12 w-auto dark:block" />
          <p className="text-sm text-muted mt-3">Mot de passe oublié</p>
        </div>

        {state?.sent ? (
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-sm text-sm">
            <p>
              Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation vient d&apos;être envoyé.
              Pense à vérifier tes spams.
            </p>
            <Link href="/login" className="block text-center text-primary hover:underline">← Retour à la connexion</Link>
          </div>
        ) : (
          <form action={formAction} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-sm">
            <p className="text-sm text-muted">Saisis ton adresse e-mail : tu recevras un lien pour définir un nouveau mot de passe.</p>
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
              <input
                id="email" name="email" type="email" required autoComplete="email"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            <SubmitButton />
            <Link href="/login" className="block text-center text-sm text-muted hover:underline">← Retour à la connexion</Link>
          </form>
        )}
      </div>
    </main>
  );
}
