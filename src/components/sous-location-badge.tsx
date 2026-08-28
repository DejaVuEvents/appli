"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconSousLocation } from "@/components/icons";
import { euros } from "@/lib/format";

import type { SousLocInfo } from "@/lib/sous-location";
export type { SousLocInfo };

/**
 * Pastille « sous-location » : signale une ligne dont le matériel est loué à un
 * fournisseur. Visible DANS L'OUTIL UNIQUEMENT — masquée à l'impression (`print:hidden`)
 * et absente du PDF, qui est généré séparément.
 *
 * L'infobulle est rendue dans un portail : les lignes de devis vivent dans des
 * conteneurs qui rognent (`overflow-hidden` du bloc, `overflow-x-auto` du tableau).
 */
export function SousLocationBadge({
  sl,
  quantite,
  coeff = 1,
  className = "h-3.5 w-3.5",
}: {
  sl: SousLocInfo;
  quantite: number;
  coeff?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const remise = sl.coutHt * (1 - sl.remisePct / 100);
  const ttc = remise * (1 + sl.tvaPct / 100);
  const c = coeff > 0 ? coeff : 1;
  const total = ttc * (Number(quantite) || 0) * c;

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
      <IconSousLocation className={`${className} cursor-help text-muted`} aria-label="Sous-location" />
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
            className="pointer-events-none fixed z-[100] w-60 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-normal leading-relaxed text-muted shadow-lg"
          >
            <span className="block font-semibold text-foreground">
              Sous-location{sl.fournisseur ? ` — ${sl.fournisseur}` : ""}
            </span>
            <span className="mt-1 block">Tarif public : {euros(sl.coutHt)} HT / jour</span>
            {sl.remisePct > 0 && (
              <span className="block">Remise {sl.remisePct} % → {euros(remise)} HT</span>
            )}
            <span className="block">TVA {sl.tvaPct} % → {euros(ttc)} TTC / unité</span>
            <span className="mt-1 block border-t border-border pt-1 font-medium text-foreground">
              Coût de la ligne : {euros(total)} TTC{c !== 1 ? ` (× ${quantite} × coef ${c})` : ` (× ${quantite})`}
            </span>
          </span>,
          document.body,
        )}
    </span>
  );
}
