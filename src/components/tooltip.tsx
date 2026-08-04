import type { ReactNode } from "react";

/**
 * Infobulle au survol (CSS pur). Enveloppe un élément ; au survol, affiche `label` au-dessus.
 * Ex : <Tooltip label="Voir l'aperçu"><button…/></Tooltip>
 * (À ne pas imbriquer dans un autre élément `group`.)
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md group-hover:block"
      >
        {label}
      </span>
    </span>
  );
}
