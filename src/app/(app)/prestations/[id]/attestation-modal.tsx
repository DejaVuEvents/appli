"use client";

import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { Field, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { dateFr } from "@/lib/format";
import {
  modifierAttestation, signerAttestation, retirerSignatureAttestation, supprimerAttestation,
} from "./attestation/actions";

export type AttestationVue = {
  /** null tant qu'elle n'a jamais été enregistrée : les champs sont pré-remplis. */
  existe: boolean;
  signee: boolean;
  manifestation: string | null;
  lieu_montage: string | null;
  dates_exploitation: string | null;
  organisateur: string | null;
  organisateur_adresse: string | null;
  installateur: string | null;
  responsable_montage: string | null;
  installateur_adresse: string | null;
  documents_plans: string | null;
  fabrique_par: string | null;
  descriptif: string | null;
  soussigne: string | null;
  fait_a: string | null;
  fait_le: string | null;
  redacteurNom: string | null;
  redacteurSigneLe: string | null;
};

const SIGNEE = "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300";

/**
 * Attestation de bon montage, dans une popup : c'est un formulaire à remplir une
 * fois, pas un écran où l'on revient. Le lien du mail de validation l'ouvre
 * directement (`?attestation=1`).
 */
export function AttestationModal({
  prestationId,
  a,
  ouvertParDefaut,
}: {
  prestationId: string;
  a: AttestationVue;
  ouvertParDefaut: boolean;
}) {
  // Un document signé ne se modifie pas sans retirer la signature.
  const modifiable = !a.signee;

  return (
    <Modal
      trigger="Attestation de bon montage"
      title="Attestation de bon montage"
      triggerClassName="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background"
      panelClassName="max-w-3xl"
      ouvertParDefaut={ouvertParDefaut}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${a.signee ? SIGNEE : "bg-surface text-muted"}`}>
            {a.signee ? "Signée" : "Brouillon"}
          </span>
          {a.redacteurSigneLe && (
            <span className="text-muted">{a.redacteurNom ?? "—"} · {dateFr(a.redacteurSigneLe)}</span>
          )}
        </div>

        <ModalForm action={modifierAttestation.bind(null, prestationId)} className="space-y-3">
          <fieldset disabled={!modifiable} className="space-y-3">
            <Field label="Manifestation" name="manifestation" defaultValue={a.manifestation ?? ""} />
            <Field label="Adresse du lieu de montage" name="lieu_montage" defaultValue={a.lieu_montage ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Dates d'exploitation" name="dates_exploitation" defaultValue={a.dates_exploitation ?? ""} />
              <Field label="Organisateur" name="organisateur" defaultValue={a.organisateur ?? ""} />
            </div>
            <Field label="Adresse de l'organisateur" name="organisateur_adresse" defaultValue={a.organisateur_adresse ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Installateur" name="installateur" defaultValue={a.installateur ?? ""} />
              <Field label="Responsable du montage" name="responsable_montage" defaultValue={a.responsable_montage ?? ""} />
            </div>
            <Field label="Adresse de l'installateur" name="installateur_adresse" defaultValue={a.installateur_adresse ?? ""} />
            <Field label="Documents et plans utilisés" name="documents_plans" defaultValue={a.documents_plans ?? ""} placeholder="Plan installation gymnase" />
            <Field label="Fabriqué par (fabricant de la structure)" name="fabrique_par" defaultValue={a.fabrique_par ?? ""} placeholder="ASD, Mobiltruss, SAMIA…" />
            <TextArea label="Description des moyens mis en place" name="descriptif" defaultValue={a.descriptif ?? ""} />
            <Field label="Je soussigné (nom, prénom, fonction)" name="soussigne" defaultValue={a.soussigne ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fait à" name="fait_a" defaultValue={a.fait_a ?? ""} />
              <Field label="Le" name="fait_le" type="date" defaultValue={a.fait_le ?? ""} />
            </div>
          </fieldset>
          {modifiable && (
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>Enregistrer</SubmitButton>
              <SubmitButton
                formAction={signerAttestation.bind(null, prestationId)}
                confirm="Signer l'attestation ? Ta signature enregistrée sera apposée sur le document."
              >
                Signer
              </SubmitButton>
              <ModalCancelButton />
            </div>
          )}
        </ModalForm>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {a.existe && (
            <a
              href={`/prestations/${prestationId}/attestation/pdf?apercu=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background"
            >
              Aperçu PDF
            </a>
          )}
          {a.signee && (
            <a
              href={`/prestations/${prestationId}/attestation/pdf`}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Télécharger
            </a>
          )}
          {a.signee && (
            <form action={retirerSignatureAttestation.bind(null, prestationId)}>
              <button className="text-sm text-primary underline" type="submit">Retirer la signature</button>
            </form>
          )}

          {a.existe && (
            <form action={supprimerAttestation.bind(null, prestationId)} className="ml-auto">
              <ConfirmButton
                confirm="Supprimer l'attestation ? La signature déjà posée sera perdue."
                className="text-sm text-muted hover:text-red-600"
              >
                Supprimer
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
