"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconHorsCatalogue } from "@/components/icons";

/**
 * Pastille « hors catalogue » : signale une ligne saisie librement, sans référence
 * catalogue derrière. Ces lignes échappent à tout ce qui est calculé à partir du
 * matériel — poids sur les ponts, consommation électrique, disponibilité des unités.
 *
 * Visible dans l'outil seulement (`print:hidden`, absente du PDF). Infobulle en portail,
 * les lignes vivant dans des conteneurs qui rognent.
 */
export function HorsCatalogueBadge({ className = "h-3.5 w-3.5" }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const ouvrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 6 });
  };

  return (
    <span
      ref={ref}
      className="relative inline-flex shrink-0 align-middle print:hidden"
      onMouseEnter={ouvrir}
      onMouseLeave={() => setPos(null)}
      onFocus={ouvrir}
      onBlur={() => setPos(null)}
      tabIndex={0}
    >
      <IconHorsCatalogue className={`${className} cursor-help text-amber-600`} aria-label="Hors catalogue" />
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
            className="pointer-events-none fixed z-[100] w-60 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-normal leading-relaxed text-muted shadow-lg"
          >
            <span className="block font-semibold text-foreground">Ligne hors catalogue</span>
            <span className="mt-1 block">
              Saisie libre, sans référence derrière : elle est absente du plan de levage et du plan
              électrique, et ne réserve aucune unité.
            </span>
            <span className="mt-1 block">Relie-la au catalogue pour qu&apos;elle soit prise en compte.</span>
          </span>,
          document.body,
        )}
    </span>
  );
}
