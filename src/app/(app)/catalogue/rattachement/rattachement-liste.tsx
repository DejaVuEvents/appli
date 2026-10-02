"use client";

import { useMemo, useState } from "react";
import { Modal, ModalForm, ModalCancelButton, useModalClose } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { normaliser } from "@/lib/rattachement";
import { bucketPour, BUCKETS, type BucketNom } from "@/lib/devis-buckets";
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

export type RefOption = {
  id: string;
  nom: string;
  /** Nom de la catégorie du catalogue, pour le classement en familles. */
  categorieNom: string | null;
  externe: boolean;
  groupe: boolean;
};

const input =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const carte =
  "rounded-xl border border-border px-4 py-3 text-left text-sm font-medium hover:border-primary/50 hover:bg-background";

/** À nous, catalogue externe, ou groupe. */
function Provenance({ r }: { r: RefOption }) {
  const cls = r.groupe
    ? "bg-primary/15 text-primary"
    : r.externe
      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300";
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {r.groupe ? "Groupe" : r.externe ? "Externe" : "À nous"}
    </span>
  );
}

const FAMILLES_MATERIEL: BucketNom[] = [BUCKETS.LUM, BUCKETS.SON, BUCKETS.STR, BUCKETS.ELEC];

/**
 * Choix de la référence, en trois temps : la nature (technique, transport,
 * matériel, groupe), puis la famille si c'est du matériel, puis l'article.
 *
 * Dérouler les 400 références d'un coup ne marchait pas : une ligne « technicien »
 * ne se cherche pas dans les projecteurs.
 */
function Choix({ l, references }: { l: LibelleLibre; references: RefOption[] }) {
  const [etape, setEtape] = useState<"racine" | "materiel" | "items">("racine");
  const [famille, setFamille] = useState<BucketNom | "groupes" | null>(null);
  const [recherche, setRecherche] = useState("");
  const [choix, setChoix] = useState(l.suggestions[0]?.id ?? "");
  const fermer = useModalClose();

  const parId = useMemo(() => new Map(references.map((r) => [r.id, r])), [references]);
  const bucketDe = useMemo(() => {
    const m = new Map<string, BucketNom>();
    for (const r of references) m.set(r.id, bucketPour(r.nom, r.categorieNom));
    return m;
  }, [references]);

  const compte = (f: BucketNom | "groupes") =>
    references.filter((r) => (f === "groupes" ? r.groupe : !r.groupe && bucketDe.get(r.id) === f)).length;

  const items = useMemo(() => {
    if (!famille) return [];
    const n = normaliser(recherche);
    return references
      .filter((r) => (famille === "groupes" ? r.groupe : !r.groupe && bucketDe.get(r.id) === famille))
      .filter((r) => !n || normaliser(r.nom).includes(n))
      .slice(0, 300);
  }, [famille, recherche, references, bucketDe]);

  const ouvrir = (f: BucketNom | "groupes") => {
    setFamille(f);
    setRecherche("");
    setEtape("items");
  };

  const choisi = choix ? parId.get(choix) : null;

  const bouton = (f: BucketNom | "groupes", libelle: string) => (
    <button key={libelle} type="button" className={carte} onClick={() => ouvrir(f)}>
      <span className="block">{libelle}</span>
      <span className="block text-xs font-normal text-muted">{compte(f)} référence{compte(f) > 1 ? "s" : ""}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="font-medium">{l.designation}</div>
        <div className="text-xs text-muted">
          {l.lignes} ligne{l.lignes > 1 ? "s" : ""} · {l.quantite} unité{l.quantite > 1 ? "s" : ""}
        </div>
      </div>

      {/* Suggestions : le raccourci, avant toute navigation. */}
      {etape === "racine" && l.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {l.suggestions.map((sg) => {
            const r = parId.get(sg.id);
            return (
              <button
                key={sg.id}
                type="button"
                onClick={() => setChoix(sg.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs hover:bg-background ${
                  choix === sg.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <span className="truncate">{sg.nom}</span>
                {r && <Provenance r={r} />}
                <span className="text-muted">{Math.round(sg.score * 100)} %</span>
              </button>
            );
          })}
        </div>
      )}

      {etape === "racine" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {bouton(BUCKETS.TECH, "Technique")}
          {bouton(BUCKETS.TRANSPORT, "Transport")}
          <button type="button" className={carte} onClick={() => setEtape("materiel")}>
            <span className="block">Matériel</span>
            <span className="block text-xs font-normal text-muted">Lumière, son, structure, élec</span>
          </button>
          {bouton("groupes", "Groupes")}
        </div>
      )}

      {etape === "materiel" && (
        <div className="space-y-2">
          <button type="button" onClick={() => setEtape("racine")} className="text-xs text-muted hover:text-foreground">
            ← Retour
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            {FAMILLES_MATERIEL.map((f) => bouton(f, f))}
          </div>
        </div>
      )}

      {etape === "items" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setEtape(famille && FAMILLES_MATERIEL.includes(famille as BucketNom) ? "materiel" : "racine")}
            className="text-xs text-muted hover:text-foreground"
          >
            ← {famille === "groupes" ? "Groupes" : famille}
          </button>
          <input className={input} placeholder="Filtrer…" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus />
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {items.length === 0 && <p className="px-3 py-2 text-sm text-muted">Aucune référence.</p>}
            {items.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setChoix(r.id); setEtape("racine"); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-background ${
                  r.id === choix ? "bg-primary/5" : ""
                }`}
              >
                <span className="min-w-0 truncate">{r.nom}</span>
                <Provenance r={r} />
              </button>
            ))}
          </div>
        </div>
      )}

      <ModalForm action={rattacherLibelle} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <input type="hidden" name="designation" value={l.designation} />
        <input type="hidden" name="reference_id" value={choix} />
        <SubmitButton disabled={!choix} pendingLabel="Rattachement…">
          Rattacher {l.lignes} ligne{l.lignes > 1 ? "s" : ""}
        </SubmitButton>
        {choisi ? (
          <span className="flex items-center gap-1.5 text-sm">
            <span className="truncate">{choisi.nom}</span>
            <Provenance r={choisi} />
          </span>
        ) : (
          <span className="text-xs text-muted">Choisis une référence.</span>
        )}
        <ModalCancelButton />
      </ModalForm>

      <form action={ignorerLibelle} onSubmit={() => fermer()}>
        <input type="hidden" name="designation" value={l.designation} />
        <button type="submit" className="text-xs text-muted underline hover:text-foreground">
          Pas du matériel
        </button>
      </form>
    </div>
  );
}

function Ligne({ l, references }: { l: LibelleLibre; references: RefOption[] }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-medium">{l.designation}</div>
        <div className="text-xs text-muted">
          {l.lignes} ligne{l.lignes > 1 ? "s" : ""} · {l.quantite} unité{l.quantite > 1 ? "s" : ""}
          {l.evenements.length > 0 && ` · ${l.evenements[0]}`}
          {l.evenements.length > 1 && ` +${l.evenements.length - 1}`}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {l.suggestions.length > 0 && (
          <span className="hidden max-w-48 truncate text-xs text-muted sm:inline">{l.suggestions[0].nom}</span>
        )}
        <Modal
          trigger="Rattacher"
          title="Rattacher au catalogue"
          triggerClassName="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-background"
          panelClassName="max-w-2xl"
        >
          <Choix l={l} references={references} />
        </Modal>
      </div>
    </div>
  );
}

/** File de rattachement : un libellé par ligne, toutes ses lignes traitées d'un geste. */
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
          Avec suggestion
        </label>
        <span className="text-sm text-muted">{visibles.length}</span>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">Rien à rattacher.</div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visibles.map((l) => (
            <Ligne key={l.designation} l={l} references={references} />
          ))}
        </div>
      )}

      {ignores.length > 0 && (
        <details className="rounded-xl border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Écartés ({ignores.length})</summary>
          <div className="mt-2 divide-y divide-border">
            {ignores.map((i) => (
              <div key={i.designation} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {i.designation}
                  <span className="ml-2 text-xs text-muted">{i.lignes}</span>
                </span>
                <form action={reprendreLibelle}>
                  <input type="hidden" name="designation" value={i.designation} />
                  <button type="submit" className="shrink-0 text-xs text-primary underline">Remettre</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
