import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { EventTabBar } from "@/components/event-tab-bar";
import { IconDownload } from "@/components/icons";
import { getMembreActuel, nomMembre } from "@/lib/membre";
import { dateFr } from "@/lib/format";
import type { AttestationRow } from "@/lib/attestation-data";
import {
  genererAttestation, modifierAttestation, soumettreAttestation,
  repasserBrouillonAttestation, validerAttestation, refuserAttestation, supprimerAttestation,
} from "./actions";

export const dynamic = "force-dynamic";

const BADGE: Record<AttestationRow["statut"], { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-surface text-muted" },
  soumise: { label: "Attente de signature", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  validee: { label: "Validée", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  refusee: { label: "Refusée", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

export default async function AttestationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const membre = await getMembreActuel(supabase);

  const [{ data: prest }, { data: att }] = await Promise.all([
    supabase.from("prestation").select("id, nom").eq("id", id).maybeSingle(),
    supabase.from("attestation_montage").select("*").eq("prestation_id", id).maybeSingle(),
  ]);
  if (!prest) notFound();
  const a = att as AttestationRow | null;

  const ids = [a?.redacteur_id, a?.valide_par].filter(Boolean) as string[];
  const { data: membres } = ids.length
    ? await supabase.from("membre").select("id, nom, prenom, email").in("id", ids)
    : { data: [] };
  const nomDe = new Map(
    ((membres ?? []) as { id: string; nom: string | null; prenom: string | null; email: string | null }[])
      .map((m) => [m.id, nomMembre(m)]),
  );

  const estRedacteur = !!a && a.redacteur_id === membre?.id;
  const modifiable = !!a && (a.statut === "brouillon" || a.statut === "refusee");
  const peutValider = !!a && a.statut === "soumise" && membre?.role === "co_president" && !estRedacteur;

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Attestation de bon montage"
        subtitle={prest.nom ?? undefined}
        action={
          a?.statut === "validee" ? (
            <a
              href={`/prestations/${id}/attestation/pdf`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <IconDownload className="h-4 w-4" /> Télécharger
            </a>
          ) : null
        }
      />
      <EventTabBar eventId={id} active="infos" />

      {!a ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span className="text-muted">Aucune attestation pour cet événement.</span>
          <form action={genererAttestation.bind(null, id)}>
            <SubmitButton>Générer l&apos;attestation</SubmitButton>
          </form>
        </Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${BADGE[a.statut].cls}`}>
              {BADGE[a.statut].label}
            </span>
            <span className="text-xs text-muted">
              {a.redacteur_signe_le && `Monteur : ${nomDe.get(a.redacteur_id ?? "") ?? "—"} · ${dateFr(a.redacteur_signe_le)}`}
              {a.valide_le && ` · Validée par ${nomDe.get(a.valide_par ?? "") ?? "—"} le ${dateFr(a.valide_le)}`}
            </span>
          </Card>

          {a.statut === "refusee" && a.motif_refus && (
            <Card className="border-red-300 p-4 text-sm text-red-700 dark:text-red-300">
              Refusée : {a.motif_refus}
            </Card>
          )}

          <Card className="p-4">
            <form action={modifierAttestation.bind(null, id)} className="space-y-3">
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
              {modifiable && <SubmitButton>Enregistrer</SubmitButton>}
            </form>
          </Card>

          <Card className="flex flex-wrap items-center gap-3 p-4">
            <a
              href={`/prestations/${id}/attestation/pdf?apercu=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background"
            >
              Aperçu PDF
            </a>

            {modifiable && estRedacteur && (
              <form action={soumettreAttestation.bind(null, id)}>
                <SubmitButton confirm="Signer et envoyer l'attestation aux co-présidents pour validation ?">
                  Signer et envoyer
                </SubmitButton>
              </form>
            )}
            {modifiable && !estRedacteur && (
              <span className="text-xs text-muted">Seul {nomDe.get(a.redacteur_id ?? "") ?? "le rédacteur"} peut la signer.</span>
            )}

            {a.statut === "soumise" && estRedacteur && (
              <form action={repasserBrouillonAttestation.bind(null, id)}>
                <button className="text-sm text-primary underline" type="submit">Repasser en brouillon</button>
              </form>
            )}
            {a.statut === "soumise" && !estRedacteur && !peutValider && (
              <span className="text-xs text-muted">En attente d&apos;un autre co-président.</span>
            )}

            {peutValider && (
              <>
                <form action={validerAttestation.bind(null, id)}>
                  <SubmitButton confirm="Signer cette attestation ? Ta signature enregistrée sera apposée sur le document.">
                    Signer et valider
                  </SubmitButton>
                </form>
                <Modal trigger="Refuser" title="Refuser l'attestation" triggerClassName="rounded-lg border border-border px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                  <ModalForm action={refuserAttestation.bind(null, id)} className="space-y-3">
                    <TextArea label="Ce qui bloque" name="motif_refus" />
                    <div className="flex items-center gap-3">
                      <SubmitButton variant="danger">Refuser</SubmitButton>
                      <ModalCancelButton />
                    </div>
                  </ModalForm>
                </Modal>
              </>
            )}

            <form action={supprimerAttestation.bind(null, id)} className="ml-auto">
              <ConfirmButton
                confirm="Supprimer l'attestation ? Les signatures déjà posées seront perdues."
                className="text-sm text-muted hover:text-red-600"
              >
                Supprimer
              </ConfirmButton>
            </form>
          </Card>
        </>
      )}

      <Link href={`/prestations/${id}`} className="inline-block text-sm text-muted hover:text-foreground">
        ← Événement
      </Link>
    </div>
  );
}
