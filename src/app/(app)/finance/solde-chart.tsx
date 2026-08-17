"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { euros } from "@/lib/format";

export type PointSolde = { key: string; label: string; value: number };

/**
 * Graphe du solde projeté cumulé, fenêtre glissante de 12 mois.
 * Flèches ◀ ▶ pour se déplacer d'un mois en arrière / en avant dans la série multi-années.
 */
export function SoldeProjeteChart({
  points,
  defautStart,
  seuil,
}: {
  points: PointSolde[];
  defautStart: number;
  seuil: number;
}) {
  const WIN = 12;
  const H = 56;
  const maxStart = Math.max(0, points.length - WIN);
  const [start, setStart] = useState(Math.min(Math.max(0, defautStart), maxStart));
  const fenetre = points.slice(start, start + WIN);
  const maxAbs = Math.max(1, ...fenetre.map((p) => Math.abs(p.value)));

  return (
    <Card className="max-w-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Solde projeté cumulé</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStart((s) => Math.max(0, s - 1))}
            disabled={start <= 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:bg-background disabled:opacity-30"
            aria-label="Mois précédent"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            type="button"
            onClick={() => setStart((s) => Math.min(maxStart, s + 1))}
            disabled={start >= maxStart}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted hover:bg-background disabled:opacity-30"
            aria-label="Mois suivant"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
      <div className="flex items-stretch gap-1.5">
        {fenetre.map((p) => {
          const v = p.value;
          const h = Math.round((Math.abs(v) / maxAbs) * H);
          const color = v < 0 ? "bg-red-500" : v < seuil ? "bg-amber-500" : "bg-green-500";
          return (
            <div key={p.key} className="flex-1" title={`${p.label} : ${euros(v)}`}>
              <div className="flex items-end justify-center" style={{ height: H }}>
                {v >= 0 && <div className={`w-3.5 rounded-t ${color}`} style={{ height: `${h}px` }} />}
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-start justify-center" style={{ height: H }}>
                {v < 0 && <div className={`w-3.5 rounded-b ${color}`} style={{ height: `${h}px` }} />}
              </div>
              <div className="mt-1 text-center text-[10px] text-muted">{p.label}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
