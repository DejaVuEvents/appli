"use client";

import { IconMail, IconSend } from "@/components/icons";

/**
 * Ouvre le brouillon d'e-mail pré-rempli (destinataire, objet, message, signature).
 * Le PDF se télécharge séparément via le bouton « PDF » : un lien `mailto:` ne peut pas
 * porter de pièce jointe (limite des navigateurs), elle se glisse à la main.
 */
export function EnvoyerClientButton({ mailto, className }: { mailto: string; pdfUrl?: string; className?: string }) {
  const titre = "Ouvre l'e-mail pré-rempli (joins le PDF téléchargé au message)";

  if (className) {
    return (
      <a href={mailto} className={className} title={titre}>
        <IconMail className="h-4 w-4" /> Envoyer
      </a>
    );
  }
  return (
    <a
      href={mailto}
      title={titre}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left text-sm font-medium hover:border-primary/40 hover:shadow-sm"
    >
      <IconSend className="h-4 w-4" />
      <span>
        Envoyer au client
        <span className="block text-xs font-normal text-muted">E-mail pré-rempli · joins le PDF</span>
      </span>
    </a>
  );
}
