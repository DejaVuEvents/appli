"use client";

import { useRef, useState } from "react";

/**
 * Champ de date au format français.
 *
 * `<input type="date">` affiche la date dans la locale du NAVIGATEUR : un poste réglé en
 * anglais montre 04/14/2026 malgré le `lang="fr"` du document, et rien en CSS ni en JS ne
 * permet de le forcer. On saisit donc dans un champ texte masqué en jj/mm/aaaa, la valeur
 * ISO partant dans un champ caché — les Server Actions ne changent pas. Le sélecteur natif
 * reste accessible par l'icône calendrier.
 */
const isoVersFr = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

const frVersIso = (fr: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fr);
  if (!m) return "";
  const [, j, mo, a] = m;
  const d = new Date(Number(a), Number(mo) - 1, Number(j));
  // Rejette le 31/02 et consorts : la date reconstruite doit correspondre à la saisie.
  if (d.getFullYear() !== Number(a) || d.getMonth() !== Number(mo) - 1 || d.getDate() !== Number(j)) return "";
  return `${a}-${mo}-${j}`;
};

/** Insère les barres obliques au fil de la frappe. */
const masque = (saisie: string): string => {
  const n = saisie.replace(/\D/g, "").slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
};

export function DateInput({
  id,
  name,
  defaultValue,
  value,
  onChange,
  required = false,
  className = "",
}: {
  id?: string;
  name?: string;
  /** Valeur ISO (AAAA-MM-JJ) — usage non contrôlé. */
  defaultValue?: string | null;
  /** Valeur ISO — usage contrôlé (filtres, formulaires pilotés). */
  value?: string;
  onChange?: (iso: string) => void;
  required?: boolean;
  className?: string;
}) {
  const controle = value !== undefined;
  const [texte, setTexte] = useState(() => isoVersFr(controle ? value : defaultValue));
  // Suit la valeur imposée de l'extérieur (remise à zéro d'un filtre, par exemple) sans
  // passer par un effet : on compare à la dernière valeur reçue pendant le rendu.
  const [vuDehors, setVuDehors] = useState(value);
  if (controle && value !== vuDehors) {
    setVuDehors(value);
    setTexte(isoVersFr(value));
  }
  const natif = useRef<HTMLInputElement>(null);

  const iso = frVersIso(texte);
  const invalide = texte.length === 10 && !iso;

  const majSaisie = (brut: string) => {
    const t = masque(brut);
    setTexte(t);
    onChange?.(frVersIso(t));
  };

  const ouvrirCalendrier = () => {
    const el = natif.current;
    if (!el) return;
    el.value = iso;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={iso} />}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="jj/mm/aaaa"
        value={texte}
        required={required}
        onChange={(e) => majSaisie(e.target.value)}
        aria-invalid={invalide || undefined}
        className={`w-full rounded-lg border bg-background px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          invalide ? "border-red-400" : "border-border"
        }`}
      />
      <button
        type="button"
        onClick={ouvrirCalendrier}
        aria-label="Ouvrir le calendrier"
        title="Ouvrir le calendrier"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </button>
      {/* Sélecteur natif, invisible : il ne sert qu'à ouvrir le calendrier du système. */}
      <input
        ref={natif}
        type="date"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => majSaisie(isoVersFr(e.target.value))}
        className="pointer-events-none absolute right-2 top-1/2 h-0 w-0 -translate-y-1/2 opacity-0"
      />
    </div>
  );
}
