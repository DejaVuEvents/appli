import type { ReactNode } from "react";

/**
 * Petit « i » d'aide : au survol, révèle un texte explicatif (multi-lignes).
 * À placer à droite d'un titre de section.
 * Ex : <h2>Titre <InfoHint text="Explication…" /></h2>
 */
export function InfoHint({ text }: { text: ReactNode }) {
  return (
    <span className="group relative ml-1.5 inline-flex align-middle">
      <span
        aria-label="Aide"
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] font-bold text-muted hover:border-primary hover:text-primary"
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-muted shadow-lg group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}
