"use client";

import { useEffect, useState } from "react";

/**
 * Bouton « Filtrer » (aligné à droite) ouvrant un volet latéral droit
 * contenant les contrôles de recherche / filtres. Allège la zone centrale.
 * Les contrôles (children) sont fournis par la page et pilotent son propre état.
 */
export function FilterDrawer({
  children,
  activeCount = 0,
  title = "Filtres",
  label = "Filtrer",
  onReset,
}: {
  children: React.ReactNode;
  activeCount?: number;
  title?: string;
  label?: string;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-background"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
        </svg>
        {label}
        {activeCount > 0 && (
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[90] flex justify-end print:hidden"
          style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold">{title}</h2>
              <div className="flex items-center gap-2">
                {onReset && activeCount > 0 && (
                  <button type="button" onClick={onReset} className="text-xs text-muted hover:text-foreground">Réinitialiser</button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                  className="rounded-lg p-1.5 text-muted hover:bg-background"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
            <div className="border-t border-border p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Voir les résultats
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
