"use client";

import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { Field, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { dateFr } from "@/lib/format";
import {
  modifierAttestation, soumettreAttestation, repasserBrouillonAttestation,
  validerAttestation, refuserAttestation, supprimerAttestation,
} from "./attestation/actions";

export type AttestationVue = {
  /** null tant qu'elle n'a jamais été enregistrée : les champs sont pré-remplis. */
  existe: boolean;
  statut: "brouillon" | "soumise" | "validee" | "refusee";
  manifestation: string | null;
  lieu_montage: string | null;
  dates_exploitation: string | null;
  organisateur: string | null;
  organisateur_adresse: string | null;
  installateur: string | null;
  responsable_montage: string | null;
  installateur_adresse: string | null;
  documents_plans: string | null;
  moyens_par: string | null;
  descriptif: string | null;
  soussigne: string | null;
  fait_a: string | null;
  fait_le: string | null;
  motif_refus: string | null;
  redacteurNom: string | null;
  redacteurSigneLe: string | null;
  validateurNom: string | null;
  valideLe: string | null;
  estRedacteur: boolean;
  peutValider: boolean;
};

const BADGE: Record<AttestationVue["statut"], { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-surface text-muted" },
  soumise: { label: "Attente de signature", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  validee: { label: "Validée", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  refusee: { label: "Refusée", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

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
  const modifiable = a.statut === "brouillon" || a.statut === "refusee";

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
          <span className={`rounded-full px-2.5 py-1 font-semibold ${BADGE[a.statut].cls}`}>{BADGE[a.statut].label}</span>
          {a.redacteurSigneLe && (
            <span className="text-muted">Monteur : {a.redacteurNom ?? "—"} · {dateFr(a.redacteurSigneLe)}</span>
          )}
          {a.valideLe && (
            <span className="text-muted">Validée par {a.validateurNom ?? "—"} le {dateFr(a.valideLe)}</span>
          )}
        </div>

        {a.statut === "refusee" && a.motif_refus && (
          <p className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            Refusée : {a.motif_refus}
          </p>
        )}

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
            <Field label="Moyens mis en place par" name="moyens_par" defaultValue={a.moyens_par ?? ""} />
            <TextArea label="Descriptif sommaire" name="descriptif" defaultValue={a.descriptif ?? ""} />
            <Field label="Je soussigné (nom, prénom, fonction)" name="soussigne" defaultValue={a.soussigne ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fait à" name="fait_a" defaultValue={a.fait_a ?? ""} />
              <Field label="Le" name="fait_le" type="date" defaultValue={a.fait_le ?? ""} />
            </div>
          </fieldset>
          {modifiable && (
            <div className="flex items-center gap-3">
              <SubmitButton>Enregistrer</SubmitButton>
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
          {a.statut === "validee" && (
            <a
              href={`/prestations/${prestationId}/attestation/pdf`}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Télécharger
            </a>
          )}

          {a.existe && modifiable && a.estRedacteur && (
            <form action={soumettreAttestation.bind(null, prestationId)}>
              <SubmitButton confirm="Signer et envoyer l'attestation aux co-présidents pour validation ?">
                Signer et envoyer
              </SubmitButton>
            </form>
          )}
          {a.existe && modifiable && !a.estRedacteur && (
            <span className="text-xs text-muted">Seul {a.redacteurNom ?? "le rédacteur"} peut la signer.</span>
          )}
          {!a.existe && <span className="text-xs text-muted">Enregistre d&apos;abord pour pouvoir signer.</span>}

          {a.statut === "soumise" && a.estRedacteur && (
            <form action={repasserBrouillonAttestation.bind(null, prestationId)}>
              <button className="text-sm text-primary underline" type="submit">Repasser en brouillon</button>
            </form>
          )}
          {a.statut === "soumise" && !a.estRedacteur && !a.peutValider && (
            <span className="text-xs text-muted">En attente d&apos;un autre co-président.</span>
          )}

          {a.peutValider && (
            <>
              <form action={validerAttestation.bind(null, prestationId)}>
                <SubmitButton confirm="Signer cette attestation ? Ta signature enregistrée sera apposée sur le document.">
                  Signer et valider
                </SubmitButton>
              </form>
              <ModalForm action={refuserAttestation.bind(null, prestationId)} className="flex items-end gap-2">
                <Field label="Motif de refus" name="motif_refus" className="flex-1" />
                <SubmitButton variant="danger">Refuser</SubmitButton>
              </ModalForm>
            </>
          )}

          {a.existe && (
            <form action={supprimerAttestation.bind(null, prestationId)} className="ml-auto">
              <ConfirmButton
                confirm="Supprimer l'attestation ? Les signatures déjà posées seront perdues."
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
