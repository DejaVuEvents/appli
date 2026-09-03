"use client";

import { useMemo, useRef, useState } from "react";

export type OptionPrestation = { id: string; nom: string; date?: string | null };

/**
 * Choix d'un événement, avec recherche.
 *
 * La base compte des dizaines d'événements passés : les afficher tous rendait le menu
 * déroulant inutilisable. Seuls les événements à venir sont proposés d'emblée ; les
 * passés restent atteignables dès qu'on tape quelque chose.
 */
export function SelecteurPrestation({
  name,
  options,
  defaultValue = "",
  placeholder = "Aucun événement",
}: {
  name: string;
  options: OptionPrestation[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [choisi, setChoisi] = useState<string>(defaultValue);
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const estPasse = (o: OptionPrestation) => !!o.date && o.date < aujourdhui;

  const recherche = q.trim().toLowerCase();
  const { liste, nbPasses } = useMemo(() => {
    const passe = (o: OptionPrestation) => !!o.date && o.date < aujourdhui;
    if (recherche) {
      return { liste: options.filter((o) => o.nom.toLowerCase().includes(recherche)), nbPasses: 0 };
    }
    const futurs = options.filter((o) => !passe(o));
    // L'événement déjà rattaché reste proposé même s'il est passé.
    const actuel = options.find((o) => o.id === choisi && passe(o));
    return {
      liste: actuel ? [actuel, ...futurs] : futurs,
      nbPasses: options.length - futurs.length - (actuel ? 1 : 0),
    };
  }, [options, recherche, choisi, aujourdhui]);

  const nomChoisi = options.find((o) => o.id === choisi)?.nom ?? "";

  return (
    <div ref={conteneur} className="relative" onBlur={(e) => {
      if (!conteneur.current?.contains(e.relatedTarget as Node)) setOuvert(false);
    }}>
      <input type="hidden" name={name} value={choisi} />
      <input
        value={ouvert ? q : nomChoisi}
        onChange={(e) => { setQ(e.target.value); setOuvert(true); }}
        onFocus={() => { setQ(""); setOuvert(true); }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {choisi && !ouvert && (
        <button
          type="button"
          onClick={() => setChoisi("")}
          aria-label="Retirer l'événement"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
        >
          ✕
        </button>
      )}

      {ouvert && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setChoisi(""); setOuvert(false); }}
            className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-background"
          >
            — Aucun —
          </button>
          {liste.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setChoisi(o.id); setOuvert(false); }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-background ${o.id === choisi ? "font-semibold text-primary" : ""}`}
            >
              {o.nom}
              {estPasse(o) && <span className="ml-1.5 text-xs text-muted">(passé)</span>}
            </button>
          ))}
          {liste.length === 0 && <p className="px-3 py-3 text-sm text-muted">Aucun résultat.</p>}
          {nbPasses > 0 && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted">
              {nbPasses} événement{nbPasses > 1 ? "s" : ""} passé{nbPasses > 1 ? "s" : ""} — tape pour les chercher.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
