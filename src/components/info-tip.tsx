"use client";

import { useState } from "react";

/**
 * Petit « i » d'aide : affiche une infobulle (survol + clic) avec la description
 * associée à un titre, pour désencombrer l'interface.
 */
export function InfoTip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label="Plus d'informations"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold leading-none text-muted transition-colors hover:bg-background hover:text-foreground"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-50 w-72 max-w-[80vw] rounded-lg border border-border bg-surface p-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-muted shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
