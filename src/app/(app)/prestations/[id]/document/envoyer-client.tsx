"use client";

import { useState } from "react";
import { IconMail, IconSend } from "@/components/icons";

/**
 * Télécharge le PDF PUIS ouvre le brouillon d'email (le PDF est ainsi prêt à être joint).
 * Le PDF est d'abord récupéré en mémoire (blob) : sans ça, l'ouverture du client mail
 * juste après annulait le téléchargement en cours.
 */
export function EnvoyerClientButton({ mailto, pdfUrl, className }: { mailto: string; pdfUrl: string; className?: string }) {
  const [enCours, setEnCours] = useState(false);

  async function onClick() {
    if (enCours) return;
    setEnCours(true);
    try {
      const res = await fetch(pdfUrl);
      if (res.ok) {
        const blob = await res.blob();
        // Nom du fichier : celui renvoyé par le serveur si présent.
        const dispo = res.headers.get("content-disposition") ?? "";
        const m = /filename="?([^"]+)"?/i.exec(dispo);
        const nom = m?.[1] ?? "document.pdf";

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nom;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
    } catch {
      // Repli : lien direct (le navigateur gère le téléchargement lui-même)
      window.open(pdfUrl, "_blank");
    } finally {
      setEnCours(false);
      // Une fois le fichier récupéré, on ouvre le brouillon d'email.
      setTimeout(() => { window.location.href = mailto; }, 250);
    }
  }

  const titre = "Télécharge le PDF puis ouvre l'email pré-rempli (glisse le fichier dans le message)";

  if (className) {
    return (
      <button type="button" onClick={onClick} disabled={enCours} className={className} title={titre}>
        <IconMail className="h-4 w-4" /> {enCours ? "Préparation…" : "Envoyer"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={enCours}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left text-sm font-medium hover:border-primary/40 hover:shadow-sm disabled:opacity-60"
      title={titre}
    >
      <IconSend className="h-4 w-4" />
      <span>
        {enCours ? "Préparation du PDF…" : "Envoyer au client"}
        <span className="block text-xs font-normal text-muted">PDF téléchargé + email pré-rempli</span>
      </span>
    </button>
  );
}
