"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, EmptyState } from "@/components/ui";

export type Entree = { cle: string; node: ReactNode };

/**
 * Listes « À venir » / « Passées » avec recherche.
 *
 * Les passées sont repliées par défaut : l'historique compte des dizaines de lignes et
 * noyait les prestations à venir. Une recherche déplie automatiquement, sinon on ne
 * trouverait rien dans la partie fermée.
 */
export function ListePlanification({
  aVenir,
  passees,
  motVide,
  descriptionVide,
}: {
  aVenir: Entree[];
  passees: Entree[];
  motVide: string;
  descriptionVide: string;
}) {
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);

  const recherche = q.trim().toLowerCase();
  const futures = useMemo(
    () => (recherche ? aVenir.filter((e) => e.cle.includes(recherche)) : aVenir),
    [aVenir, recherche],
  );
  const anciennes = useMemo(
    () => (recherche ? passees.filter((e) => e.cle.includes(recherche)) : passees),
    [passees, recherche],
  );
  const passeesVisibles = ouvert || recherche.length > 0;

  return (
    <div>
      <div className="relative mb-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Rechercher une ${motVide}… (nom, client, lieu, date)`}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Effacer"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          À venir {futures.length > 0 && <span className="font-normal">({futures.length})</span>}
        </h2>
        {futures.length === 0 ? (
          <Card className="px-4 py-3 text-sm text-muted">
            {recherche ? "Aucun résultat." : `Aucune ${motVide} à venir.`}
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">{futures.map((e) => e.node)}</Card>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="mb-2 flex w-full items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted hover:text-foreground"
          aria-expanded={passeesVisibles}
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${passeesVisibles ? "rotate-90" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Passées <span className="font-normal normal-case">({anciennes.length})</span>
        </button>

        {passeesVisibles &&
          (anciennes.length === 0 ? (
            recherche ? (
              <Card className="px-4 py-3 text-sm text-muted">Aucun résultat.</Card>
            ) : (
              <EmptyState title={`Aucune ${motVide} passée`} description={descriptionVide} />
            )
          ) : (
            <Card className="divide-y divide-border overflow-hidden">{anciennes.map((e) => e.node)}</Card>
          ))}
      </section>
    </div>
  );
}
