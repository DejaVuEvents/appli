"use client";

/** Télécharge le PDF puis ouvre le brouillon d'email (le PDF est ainsi prêt à être joint). */
export function EnvoyerClientButton({ mailto, pdfUrl, className }: { mailto: string; pdfUrl: string; className?: string }) {
  function onClick() {
    // 1) Télécharge le PDF (à joindre manuellement — mailto ne permet pas la pièce jointe auto)
    const a = document.createElement("a");
    a.href = pdfUrl;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 2) Ouvre le brouillon d'email pré-rempli
    setTimeout(() => { window.location.href = mailto; }, 400);
  }
  if (className) {
    return (
      <button type="button" onClick={onClick} className={className} title="Télécharge le PDF puis ouvre l'email pré-rempli">
        ✉️ Envoyer
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left text-sm font-medium hover:border-primary/40 hover:shadow-sm"
    >
      <span className="text-lg">✉️</span>
      <span>
        Envoyer au client
        <span className="block text-xs font-normal text-muted">PDF téléchargé + email pré-rempli</span>
      </span>
    </button>
  );
}
