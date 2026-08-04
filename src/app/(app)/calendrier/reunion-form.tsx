"use client";

import { Field, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { createReunion } from "./actions";

type MembreLite = { id: string; prenom: string | null; nom: string | null; email: string | null };

function nom(m: MembreLite) {
  return `${(m.prenom ?? "").trim()} ${(m.nom ?? "").trim()}`.trim() || m.email?.split("@")[0] || "Membre";
}

export function ReunionForm({ membres }: { membres: MembreLite[] }) {
  return (
    <ModalForm action={createReunion} className="space-y-4">
      <Field label="Titre de la réunion" name="titre" required placeholder="Réunion d'avancement" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" name="date" type="date" required />
        <Field label="Heure début" name="heure_debut" placeholder="18:00" />
        <Field label="Heure fin" name="heure_fin" placeholder="19:00" />
      </div>
      <Field label="Lieu (optionnel)" name="lieu" placeholder="Local, visio…" />
      <TextArea label="Description / ordre du jour (optionnel)" name="description" rows={2} />
      <Field label="Lien Google Meet (optionnel)" name="meet_url" placeholder="https://meet.google.com/…" />

      <div>
        <span className="mb-1.5 block text-sm font-medium">Participants à inviter</span>
        {membres.length === 0 ? (
          <p className="text-sm text-muted">Aucun membre.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {membres.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-background has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="checkbox" name="participants" value={m.id} className="h-4 w-4 rounded border-border" />
                {nom(m)}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-xs text-muted">
          Après création, un bouton permet d&apos;ouvrir la réunion dans Google Agenda (avec Meet et invitations e-mail aux participants).
        </p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>Créer la réunion</SubmitButton>
        <ModalCancelButton />
      </div>
    </ModalForm>
  );
}
