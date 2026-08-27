"use client";

import { Modal } from "@/components/modal";
import { IconMail, IconDownload, IconSend } from "@/components/icons";

/**
 * Envoi au client en deux gestes explicites.
 * Un `mailto:` ne peut pas porter de pièce jointe (limite des navigateurs), et un
 * téléchargement déclenché par script après un await est bloqué par Safari : on utilise
 * donc deux vrais liens, chacun activé directement par l'utilisateur.
 */
export function EnvoyerClientButton({ mailto, pdfUrl, className }: { mailto: string; pdfUrl: string; className?: string }) {
  const lien = "flex items-center gap-3 rounded-xl border border-border p-3 text-sm font-medium hover:border-primary/40 hover:bg-surface";

  const declencheur = className ? (
    <><IconMail className="h-4 w-4" /> Envoyer</>
  ) : (
    <>
      <IconSend className="h-4 w-4" />
      <span>
        Envoyer au client
        <span className="block text-xs font-normal text-muted">PDF à télécharger + email pré-rempli</span>
      </span>
    </>
  );

  return (
    <Modal
      trigger={declencheur}
      title="Envoyer au client"
      triggerClassName={className ?? "flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left text-sm font-medium hover:border-primary/40 hover:shadow-sm"}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Le PDF ne peut pas être joint automatiquement à l&apos;e-mail : télécharge-le, puis
          glisse-le dans le message qui s&apos;ouvre.
        </p>

        <a href={pdfUrl} download className={lien}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
          <IconDownload className="h-4 w-4 shrink-0" />
          <span>Télécharger le PDF</span>
        </a>

        <a href={mailto} className={lien}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
          <IconMail className="h-4 w-4 shrink-0" />
          <span>
            Ouvrir l&apos;e-mail pré-rempli
            <span className="block text-xs font-normal text-muted">Destinataire, objet, message et signature déjà remplis</span>
          </span>
        </a>
      </div>
    </Modal>
  );
}
