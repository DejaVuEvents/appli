"use client";

import { useState, useMemo } from "react";

type LiteEcriture = { date: string; sens: string; montant_ttc: number };

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

function short(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${Math.round(v / 1000)}k`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

interface Props {
  ecritures: LiteEcriture[];
  soldeDebutHistoire: number;
  seuil: number;
}

export function Calendrier({ ecritures, soldeDebutHistoire, seuil }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { balances, maxPos } = useMemo(() => {
    // Solde cumulé jusqu'au début du mois affiché
    let soldeBase = soldeDebutHistoire;
    for (const e of ecritures) {
      const d = new Date(e.date + "T12:00:00");
      if (
        d.getFullYear() < year ||
        (d.getFullYear() === year && d.getMonth() < month)
      ) {
        soldeBase += e.sens === "entree" ? Number(e.montant_ttc) : -Number(e.montant_ttc);
      }
    }

    // Somme nette par jour du mois
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dailyNet = Array<number>(daysInMonth).fill(0);
    for (const e of ecritures) {
      const d = new Date(e.date + "T12:00:00");
      if (d.getFullYear() === year && d.getMonth() === month) {
        dailyNet[d.getDate() - 1] += e.sens === "entree" ? Number(e.montant_ttc) : -Number(e.montant_ttc);
      }
    }

    // Soldes cumulés
    let running = soldeBase;
    const balances = dailyNet.map((delta) => {
      running = Math.round((running + delta) * 100) / 100;
      return running;
    });

    const maxPos = Math.max(seuil * 2 || 1, ...balances.filter((b) => b > 0));
    return { balances, maxPos };
  }, [ecritures, soldeDebutHistoire, seuil, year, month]);

  const daysInMonth = balances.length;
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0=lun
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const prev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  // Cellules du calendrier (null = case vide)
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Navigation mois */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={prev} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background">‹</button>
        <span className="font-semibold text-sm">{MOIS[month]} {year}</span>
        <button onClick={next} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background">›</button>
      </div>

      {/* Grille */}
      <div className="grid grid-cols-7 gap-1">
        {/* En-têtes jours */}
        {JOURS.map((j, i) => (
          <div key={i} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">{j}</div>
        ))}

        {/* Cases */}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} />;
          }
          const solde = balances[day - 1];
          const statut = solde < 0 ? "decouvert" : seuil > 0 && solde < seuil ? "faible" : "ok";
          const barW = solde <= 0 ? 0 : Math.min(100, Math.round((solde / maxPos) * 100));
          const isToday = `${year}-${month}-${day}` === todayKey;

          const textCls =
            statut === "decouvert" ? "text-red-600" :
            statut === "faible" ? "text-amber-600" :
            "text-green-700";
          const barCls =
            statut === "decouvert" ? "bg-red-400" :
            statut === "faible" ? "bg-amber-400" :
            "bg-green-500";

          return (
            <div
              key={i}
              className={`flex flex-col gap-0.5 rounded-md border p-1 ${
                isToday ? "border-primary bg-primary/5" : "border-border/50 bg-surface"
              }`}
            >
              {/* Numéro du jour */}
              <div className={`text-right text-[10px] font-medium ${isToday ? "text-primary" : "text-muted"}`}>
                {day}
              </div>
              {/* Solde cumulé */}
              <div className={`text-center text-[9px] font-semibold leading-tight ${textCls}`}>
                {short(solde)}
              </div>
              {/* Barre couleur */}
              <div className="h-[3px] overflow-hidden rounded-full bg-border/30">
                {statut === "decouvert" ? (
                  <div className={`h-full w-full ${barCls}`} />
                ) : (
                  <div className={`h-full ${barCls}`} style={{ width: `${barW}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Légende */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />OK (≥ seuil)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />Faible (0 → seuil)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" />Découvert</span>
        <span className="text-muted/70">Solde projeté (réel + prévisionnel). Seuil : {seuil.toLocaleString("fr-FR")} €.</span>
      </div>
    </div>
  );
}
