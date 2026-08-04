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

export function ReinitForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, formAction] = useActionState(definirNouveauMotDePasse, null);

  return (
    <form action={formAction} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-sm">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
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
  );
}
