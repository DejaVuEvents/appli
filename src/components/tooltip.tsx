"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Infobulle au survol. Enveloppe un élément ; au survol, affiche `label` au-dessus.
 * Ex : <Tooltip label="Voir l'aperçu"><button…/></Tooltip>
 *
 * Rendue dans un portail sur <body>, et non à côté du bouton : les lignes de nos
 * listes vivent dans des cartes en `overflow-hidden` (indispensable pour que les
 * séparateurs s'arrêtent aux coins arrondis), qui rognaient l'infobulle — on ne
 * voyait qu'une moitié de pastille blanche débordant de la carte du dessus.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const ancre = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const placer = useCallback(() => {
    const r = ancre.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  }, []);

  useEffect(() => {
    if (!pos) return;
    // La page peut défiler pendant le survol : on suit, sinon l'infobulle reste en l'air.
    const suivre = () => placer();
    window.addEventListener("scroll", suivre, true);
    window.addEventListener("resize", suivre);
    return () => {
      window.removeEventListener("scroll", suivre, true);
      window.removeEventListener("resize", suivre);
    };
  }, [pos, placer]);

  return (
    <span
      ref={ancre}
      className="relative inline-flex"
      onPointerEnter={placer}
      onPointerLeave={() => setPos(null)}
      onFocus={placer}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos !== null &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
            className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
