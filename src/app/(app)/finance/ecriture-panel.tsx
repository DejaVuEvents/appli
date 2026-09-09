"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { deleteEcriture, setValideEcriture, ajouterJustificatifs } from "./actions";
import { JustificatifPreview } from "@/components/justificatif-preview";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { typeLabel } from "@/lib/finance";
import { euros, dateFr } from "@/lib/format";
import { IconPaperclip } from "@/components/icons";
import type { EcritureFinanciere } from "@/lib/types";

/** Prestation réduite à ce que le panneau affiche. */
export type PrestationLiee = { id: string; nom: string; client: { nom: string } | null };
/** Document (devis/facture) rattaché à une écriture. */
export type FactureLiee = {
  numero: string | null; type: string; prestationId: string | null;
  devisId: string | null; previewUrl: string | null; voirUrl: string | null;
};

export function EcriturePanel({
  ecriture: e,
  prestation,
  factures = [],
  catManquante = false,
  hasJustif = false,
  onClose,
}: {
  ecriture: EcritureFinanciere;
  prestation: PrestationLiee | null;
  factures?: FactureLiee[];
  catManquante?: boolean;
  hasJustif?: boolean;
  onClose: () => void;
}) {
  const [delOpen, setDelOpen] = useState(false);
  const factureUrl = e.facture?.startsWith("https://") ? e.facture : null;
  const factureRef = !factureUrl && e.facture ? e.facture : null;
  // Les justificatifs d'une écriture issue d'une NOTE DE FRAIS vivent sur la note,
  // pas sur l'écriture : sans ce cas, l'outil réclamait un document déjà fourni.
  const viaNoteFrais = !!e.note_frais_id;
  const missingDoc = !e.facture && !e.devis_facture_id && factures.length === 0 && !hasJustif && !viaNoteFrais;
  const apercu = factures.find((f) => f.previewUrl)?.previewUrl ?? null;

  // Verrouille le scroll de la page d'arrière-plan tant que le panneau est ouvert.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleDelete = () => setDelOpen(true);
  const confirmDelete = async () => {
    setDelOpen(false);
    onClose();
    await deleteEcriture(e.id);
  };

  const panel = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <ConfirmDialog open={delOpen} message="Supprimer cette écriture ?" confirmLabel="Supprimer" danger onCancel={() => setDelOpen(false)} onConfirm={confirmDelete} />
      <div className={`relative flex w-full ${apercu ? "max-w-4xl" : "max-w-md"} overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:max-h-[90vh] sm:rounded-2xl`}>
        {/* Colonne gauche : détails */}
        <div className="w-full shrink-0 overflow-y-auto sm:max-h-[90vh] sm:w-[26rem]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{e.denomination ?? "(sans libellé)"}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {e.statut === "reel" ? "Réel" : "Prévisionnel"} · {dateFr(e.date)}
            </p>
          </div>
          <button onClick={onClose} className="mt-0.5 shrink-0 text-xl text-muted hover:text-foreground">✕</button>
        </div>

        {/* Montant */}
        <div className={`px-5 py-4 text-3xl font-bold ${e.sens === "entree" ? "text-green-600" : "text-red-600"}`}>
          {e.sens === "entree" ? "+" : "−"} {euros(e.montant_ttc)}
        </div>

        {/* Détails */}
        <div className="space-y-2.5 px-5 pb-6">
          <Row label="Date" value={dateFr(e.date)} />
          <Row label="Catégorie" value={[typeLabel(e.type), e.specification].filter(Boolean).join(" / ") || "—"} />
          {catManquante && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <span>⚠</span>
              <span>
                {e.type ? <>Catégorie inconnue (« {typeLabel(e.type)} » n&apos;existe plus).</> : "Aucune catégorie associée."}{" "}
                <Link href={`/finance/${e.id}`} className="font-medium underline">Corriger</Link> avant de valider.
              </span>
            </div>
          )}
          {e.effectue_par && <Row label="Effectué par" value={e.effectue_par} />}
          {e.notes && e.notes !== "Import BP 2026" && e.notes !== "Import historique" && (
            <Row label="Notes" value={e.notes} />
          )}

          {/* Facture / document */}
          {viaNoteFrais && !e.facture && (
            <Link
              href={`/notes-frais/${e.note_frais_id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-background"
            >
              <span className="flex min-w-0 items-center gap-2 text-muted">
                <IconPaperclip className="h-4 w-4 shrink-0" />
                Justificatifs portés par la note de frais
              </span>
              <span className="shrink-0 text-primary">Ouvrir la note →</span>
            </Link>
          )}
          {missingDoc && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300">
              <div className="mb-2 flex items-center gap-2"><span>⚠</span><span>Aucun document joint à cette écriture.</span></div>
              <form action={ajouterJustificatifs.bind(null, e.id)} className="space-y-2">
                <input
                  type="file" name="justificatifs" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="block w-full text-xs text-orange-900/80 file:mr-2 file:rounded-lg file:border-0 file:bg-orange-600 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white dark:text-orange-200"
                />
                <SubmitButton pendingLabel="Ajout…" className="!py-1.5 !text-xs">Associer un document</SubmitButton>
              </form>
            </div>
          )}
          {factureUrl && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-muted">Document joint</span>
              <div className="flex shrink-0 items-center gap-2">
                {/* Aperçu en popup centrée */}
                <JustificatifPreview url={factureUrl} libelle={e.denomination ?? "Document"} />
                {/* Voir dans l'éditeur (outil facture si lié à un événement, sinon l'écriture) */}
                <Link
                  href={prestation ? `/prestations/${prestation.id}` : `/finance/${e.id}`}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface"
                >
                  Voir dans l&apos;éditeur →
                </Link>
              </div>
            </div>
          )}
          {factureRef && <Row label="Réf. facture" value={factureRef} />}

          {/* Prestation */}
          {prestation && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Prestation liée</p>
              <p className="font-medium">{prestation.nom}</p>
              {prestation.client?.nom && (
                <p className="text-xs text-muted">{prestation.client.nom}</p>
              )}
              <div className="mt-2 flex gap-3">
                <Link href={`/prestations/${prestation.id}`} className="text-xs text-primary hover:underline">
                  Prestation
                </Link>
              </div>
            </div>
          )}

          {/* Factures réglées par cette entrée */}
          {factures.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Facture{factures.length > 1 ? "s" : ""} réglée{factures.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-1.5">
                {factures.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span>Facture n° {f.numero ?? "—"}</span>
                    {f.voirUrl && (
                      <Link href={f.voirUrl} className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90">
                        Voir la facture →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation */}
          <button
            type="button"
            onClick={async () => { onClose(); await setValideEcriture(e.id, !e.valide); }}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
              e.valide
                ? "border-border text-muted hover:bg-surface"
                : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30"
            }`}
          >
            {e.valide ? "↩ Dévalider" : "✓ Valider l'écriture"}
          </button>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Link
              href={`/finance/${e.id}`}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground"
            >
              Modifier
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Supprimer
            </button>
          </div>
        </div>
        </div>{/* fin colonne gauche */}

        {/* Colonne droite : aperçu de la facture liée */}
        {apercu && (
          <div className="hidden min-w-0 flex-1 flex-col border-l border-border bg-surface sm:flex">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted">
              <span>Aperçu de la facture</span>
              <a href={apercu} target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2 py-0.5 hover:bg-background">Ouvrir ↗</a>
            </div>
            <iframe src={apercu} title="Aperçu facture" className="min-h-0 flex-1 bg-white" />
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
