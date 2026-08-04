"use client";

import { useState } from "react";
import { Tooltip } from "@/components/tooltip";

/** Aperçu in-app d'un justificatif (image ou PDF) en lightbox, sans téléchargement.
 *  Si `label` est fourni, le déclencheur est un bouton texte ; sinon une icône œil. */
export function JustificatifPreview({ url, libelle, label, className }: { url: string; libelle?: string | null; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const isPdf = /\.pdf(\?|$)/i.test(url);
  const isImg = /\.(png|jpe?g|webp|gif|heic|avif)(\?|$)/i.test(url);

  return (
    <>
      {label ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={className ?? "inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"}
        >
          {/* œil */}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {label}
        </button>
      ) : (
        <Tooltip label={`Voir l'aperçu${isPdf ? " (PDF)" : ""}`}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Voir l'aperçu"
            className="rounded-lg border border-border p-1.5 text-muted hover:bg-background hover:text-foreground"
          >
            {/* œil */}
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </Tooltip>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }} onClick={() => setOpen(false)}>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 text-white">
              <span className="truncate text-sm">{libelle ?? "Justificatif"}</span>
              <div className="flex shrink-0 gap-2">
                <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/10 px-3 py-1 text-sm">Ouvrir</a>
                <button onClick={() => setOpen(false)} className="rounded-lg bg-white/10 px-3 py-1 text-sm">Fermer ✕</button>
              </div>
            </div>
            <div className="my-3 flex-1 overflow-auto rounded-lg bg-white">
              {isImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={libelle ?? "Justificatif"} className="mx-auto max-h-full object-contain" />
              ) : (
                <iframe src={url} className="h-full w-full" title="Justificatif" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
