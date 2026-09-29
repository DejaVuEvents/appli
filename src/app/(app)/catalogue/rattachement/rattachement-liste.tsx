"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { normaliser } from "@/lib/rattachement";
import { rattacherLibelle, ignorerLibelle, reprendreLibelle } from "./actions";

export type LibelleLibre = {
  designation: string;
  lignes: number;
  quantite: number;
  /** Sert au tri côté serveur ; pas affiché — le rôle technique n'a pas accès aux devis. */
  montant: number;
  evenements: string[];
  suggestions: { id: string; nom: string; score: number }[];
};

export type RefOption = { id: string; nom: string };

const input =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function Ligne({
  l,
  references,
}: {
  l: LibelleLibre;
  references: RefOption[];
}) {
  const [choix, setChoix] = useState(l.suggestions[0]?.id ?? "");
  const [recherche, setRecherche] = useState("");

  // Le catalogue fait plusieurs centaines d'entrées : sans filtre, la liste
  // déroulante est inutilisable. Les suggestions restent toujours en tête.
  const liste = useMemo(() => {
    const n = normaliser(recherche);
    const base = n
      ? references.filter((r) => normaliser(r.nom).includes(n))
      : references;
    return base.slice(0, 200);
  }, [recherche, references]);

  const suggIds = new Set(l.suggestions.map((s) => s.id));

  return (
    <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <div className="min-w-0">
        <div className="font-medium">{l.designation}</div>
        <div className="mt-0.5 text-xs text-muted">
          {l.lignes} ligne{l.lignes > 1 ? "s" : ""} · {l.quantite} unité{l.quantite > 1 ? "s" : ""}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted" title={l.evenements.join(", ")}>
          {l.evenements.slice(0, 3).join(" · ")}
          {l.evenements.length > 3 && ` · +${l.evenements.length - 3}`}
        </div>
      </div>

      <div className="space-y-2">
        <input
          className={input}
          placeholder="Filtrer le catalogue…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <select className={input} value={choix} onChange={(e) => setChoix(e.target.value)}>
          <option value="">— Choisir une référence —</option>
          {l.suggestions.length > 0 && (
            <optgroup label="Suggestions">
              {l.suggestions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom} ({Math.round(s.score * 100)} %)
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Tout le catalogue">
            {liste.filter((r) => !suggIds.has(r.id)).map((r) => (
              <option key={r.id} value={r.id}>{r.nom}</option>
            ))}
          </optgroup>
        </select>

        <div className="flex flex-wrap items-center gap-2">
          <form action={rattacherLibelle}>
            <input type="hidden" name="designation" value={l.designation} />
            <input type="hidden" name="reference_id" value={choix} />
            <SubmitButton
              className="!px-2.5 !py-1.5 !text-xs"
              disabled={!choix}
              pendingLabel="Rattachement…"
              confirm={`Rattacher les ${l.lignes} ligne${l.lignes > 1 ? "s" : ""} « ${l.designation} » à cette référence ?`}
            >
              Rattacher {l.lignes} ligne{l.lignes > 1 ? "s" : ""}
            </SubmitButton>
          </form>
          <form action={ignorerLibelle}>
            <input type="hidden" name="designation" value={l.designation} />
            <button type="submit" className="text-xs text-muted underline hover:text-foreground">
              Ce n&apos;est pas du matériel
            </button>
          </form>
          {!choix && (
            <span className="text-xs text-muted">Choisis une référence pour activer le bouton.</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * File de rattachement : un libellé par ligne, toutes les lignes de devis qui le
 * portent traitées d'un seul geste. Trié par nombre de lignes : on commence par ce
 * qui pèse le plus.
 */
export function RattachementListe({
  libelles,
  references,
  ignores,
}: {
  libelles: LibelleLibre[];
  references: RefOption[];
  ignores: { designation: string; lignes: number }[];
}) {
  const [recherche, setRecherche] = useState("");
  const [avecSuggestion, setAvecSuggestion] = useState(false);

  const visibles = useMemo(() => {
    const n = normaliser(recherche);
    return libelles.filter(
      (l) =>
        (!n || normaliser(l.designation).includes(n)) &&
        (!avecSuggestion || l.suggestions.length > 0),
    );
  }, [libelles, recherche, avecSuggestion]);

  const totalLignes = visibles.reduce((s, l) => s + l.lignes, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${input} sm:max-w-xs`}
          placeholder="Chercher un libellé…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={avecSuggestion}
            onChange={(e) => setAvecSuggestion(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Seulement ceux qui ont une suggestion
        </label>
        <span className="text-sm text-muted">
          {visibles.length} libellé{visibles.length > 1 ? "s" : ""} · {totalLignes} ligne{totalLignes > 1 ? "s" : ""}
        </span>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">
          Rien à rattacher ici.
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visibles.map((l) => (
            <Ligne key={l.designation} l={l} references={references} />
          ))}
        </div>
      )}

      {ignores.length > 0 && (
        <details className="rounded-xl border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Libellés écartés ({ignores.length})
          </summary>
          <div className="mt-2 divide-y divide-border">
            {ignores.map((i) => (
              <div key={i.designation} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {i.designation}
                  <span className="ml-2 text-xs text-muted">{i.lignes} ligne{i.lignes > 1 ? "s" : ""}</span>
                </span>
                <form action={reprendreLibelle}>
                  <input type="hidden" name="designation" value={i.designation} />
                  <button type="submit" className="shrink-0 text-xs text-primary underline">Remettre dans la file</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
