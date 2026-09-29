"use client";

import { useEffect, useRef, useState } from "react";
import { chercherAdresses, type Adresse } from "@/lib/adresse";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

/**
 * Champ d'adresse avec suggestions pendant la frappe (Base Adresse Nationale).
 *
 * Tant qu'aucune suggestion n'est retenue, on n'a qu'un texte libre : c'est le choix
 * dans la liste qui donne les coordonnées, donc la carte et le calcul d'itinéraire.
 */
export function AdresseAutocomplete({
  label,
  name,
  placeholder,
  valeur,
  onChoisir,
}: {
  label: string;
  name: string;
  placeholder?: string;
  valeur: string;
  onChoisir: (a: Adresse | null, texte: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Adresse[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  // Une frappe rapide lance plusieurs requêtes : on annule les précédentes, sinon
  // une réponse en retard réaffiche d'anciennes suggestions.
  const enCours = useRef<AbortController | null>(null);

  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("pointerdown", dehors, true);
    return () => document.removeEventListener("pointerdown", dehors, true);
  }, []);

  const saisir = (texte: string) => {
    onChoisir(null, texte);
    enCours.current?.abort();
    if (texte.trim().length < 3) {
      setSuggestions([]);
      setOuvert(false);
      return;
    }
    const ctrl = new AbortController();
    enCours.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const r = await chercherAdresses(texte, ctrl.signal);
        setSuggestions(r);
        setOuvert(r.length > 0);
      } catch {
        /* requête annulée : rien à faire */
      }
    }, 250);
    ctrl.signal.addEventListener("abort", () => clearTimeout(t));
  };

  return (
    <div ref={boite} className="relative">
      <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={name}
        name={name}
        className={input}
        value={valeur}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => saisir(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOuvert(true)}
      />
      {ouvert && (
        <ul className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
          {suggestions.map((a) => (
            <li key={`${a.label}-${a.coord.join()}`}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-background"
                onClick={() => {
                  onChoisir(a, a.label);
                  setOuvert(false);
                }}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
