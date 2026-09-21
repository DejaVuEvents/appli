"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Petit calendrier français, affiché sous un champ date.
 *
 * Remplace le sélecteur natif ouvert par `showPicker()` : celui-ci est rendu par le
 * navigateur, donc dans SA langue (« Sep 2026 », « Mo Tu We »), et il ne se referme pas
 * toujours au clic à côté selon la façon dont il a été ouvert. Ici tout est à nous :
 * libellés français, fermeture au clic extérieur et à Échap.
 */
const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function CalendrierPopup({
  valeur,
  onChoisir,
  onFermer,
}: {
  /** Date sélectionnée au format ISO, si valide. */
  valeur: string;
  onChoisir: (iso: string) => void;
  onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const initiale = valeur ? new Date(`${valeur}T12:00:00`) : new Date();
  const [curseur, setCurseur] = useState(
    new Date(initiale.getFullYear(), initiale.getMonth(), 1),
  );

  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) onFermer();
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    // `capture` : on veut fermer même si le clic vise un élément qui arrête la propagation.
    document.addEventListener("pointerdown", dehors, true);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors, true);
      document.removeEventListener("keydown", echap);
    };
  }, [onFermer]);

  const annee = curseur.getFullYear();
  const mois = curseur.getMonth();
  const premier = new Date(annee, mois, 1);
  // getDay() place dimanche en 0 ; la semaine française commence lundi.
  const decalage = (premier.getDay() + 6) % 7;
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  const aujourdhui = ymd(new Date());

  const cases: (number | null)[] = [
    ...Array(decalage).fill(null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];

  const deplacer = (delta: number) => setCurseur(new Date(annee, mois + delta, 1));

  return (
    <div
      ref={boite}
      className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => deplacer(-1)} aria-label="Mois précédent"
          className="rounded p-1 text-muted hover:bg-background hover:text-foreground">‹</button>
        <span className="text-sm font-semibold capitalize">{MOIS[mois]} {annee}</span>
        <button type="button" onClick={() => deplacer(1)} aria-label="Mois suivant"
          className="rounded p-1 text-muted hover:bg-background hover:text-foreground">›</button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted">
        {JOURS.map((j, i) => <span key={i}>{j}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cases.map((jour, i) => {
          if (jour === null) return <span key={`v${i}`} />;
          const iso = ymd(new Date(annee, mois, jour));
          const choisi = iso === valeur;
          const cejour = iso === aujourdhui;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => { onChoisir(iso); onFermer(); }}
              className={`rounded-md py-1 text-sm transition-colors ${
                choisi
                  ? "bg-primary font-semibold text-primary-foreground"
                  : cejour
                    ? "font-semibold text-primary hover:bg-background"
                    : "hover:bg-background"
              }`}
            >
              {jour}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => { onChoisir(aujourdhui); onFermer(); }}
        className="mt-2 w-full rounded-lg border border-border py-1 text-xs text-muted hover:bg-background"
      >
        Aujourd&apos;hui
      </button>
    </div>
  );
}
