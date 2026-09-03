"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui";
import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { LigneForm } from "./ligne-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconInfo, IconHorsCatalogue } from "@/components/icons";
import { SousLocationBadge } from "@/components/sous-location-badge";
import { euros } from "@/lib/format";
import { addLigne, setLigneInline, deleteLigne, reordonnerLignes, ajouterAccessoireOptionnel, lierLigneAuCatalogue } from "./actions";

export type LigneData = {
  id: string; reference_id: string | null; designation: string | null; quantite: number; unite: string | null;
  prix_unitaire: number; prix_total: number | null; remise_type: string; remise_valeur: number;
  est_accessoire_auto: boolean; options: { ruleId: string; nom: string }[];
};
export type BlocData = { catId: string | null; nom: string; lignes: LigneData[] };
export type RefInfo = {
  nom: string; description: string | null;
  puissance_w: number | null; intensite_a: number | null; phase: string | null;
  connecteurs_puissance: string[]; connecteurs_data: string[];
  poids_kg: number | null; dimensions: string | null;
  reserves: { id: string; numero_serie: string | null }[];
  /** Renseigné quand le matériel est loué à un fournisseur (sous-location). */
  sousLoc?: { fournisseur: string | null; coutHt: number; remisePct: number; tvaPct: number } | null;
};
type Ref = { id: string; nom: string; prix_location_jour: number; cout_location_jour: number | null; categorie_id: string | null; est_consommable: boolean };
type Cat = { id: string; nom: string; ordre?: number | null };

// Masque les petites flèches +/− natives des champs numériques (affichage plus léger).
const NO_SPIN = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0";

export function LignesEditor({ prestationId, devisId, blocs, references, categories, infosRef }: {
  prestationId: string; devisId: string; blocs: BlocData[]; references: Ref[]; categories: Cat[]; infosRef: Record<string, RefInfo>;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragCat, setDragCat] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; cat: string } | null>(null);
  const overRef = useRef<string | null>(null); // dernière ligne survolée (id) pendant le drag
  const overCatRef = useRef<string | null>(null); // catégorie survolée (déplacement entre catégories)
  const posRef = useRef<{ x: number; y: number } | null>(null); // dernière position pointeur (auto-scroll)
  const rafRef = useRef<number | null>(null);
  const [remiseOpen, setRemiseOpen] = useState<Set<string>>(new Set());
  const [delId, setDelId] = useState<string | null>(null);

  // Auto-scroll de la fenêtre quand on glisse une ligne près du haut/bas de l'écran.
  const autoScrollTick = () => {
    const pos = posRef.current;
    if (!dragRef.current || !pos) { rafRef.current = null; return; }
    const EDGE = 90, MAX = 20;
    const h = window.innerHeight;
    let dy = 0;
    if (pos.y < EDGE) dy = -Math.ceil(((EDGE - pos.y) / EDGE) * MAX);
    else if (pos.y > h - EDGE) dy = Math.ceil(((pos.y - (h - EDGE)) / EDGE) * MAX);
    if (dy !== 0) {
      window.scrollBy(0, dy);
      const el = document.elementFromPoint(pos.x, pos.y)?.closest("[data-ligne]") as HTMLElement | null;
      const o = el?.getAttribute("data-ligne") ?? null;
      const c = el?.getAttribute("data-cat") ?? overCatRef.current;
      overRef.current = o; overCatRef.current = c;
      setOverId(o); setOverCat(c);
    }
    rafRef.current = requestAnimationFrame(autoScrollTick);
  };
  const stopAutoScroll = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null; posRef.current = null;
  };

  const inline = (ligneId: string, champ: string, valeur: string | number) => {
    const fd = new FormData(); fd.set("champ", champ); fd.set("valeur", String(valeur));
    start(async () => { await setLigneInline(prestationId, ligneId, fd); router.refresh(); });
  };

  const catKey = (b: BlocData) => b.catId ?? "__divers";

  // Drag & drop : réordonnancement DANS une catégorie et déplacement ENTRE catégories.
  // Détection par rectangles (fiable, sans scintillement) via listeners globaux.
  const onDown = (e: React.PointerEvent, id: string, cat: string) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id, cat }; overRef.current = id; overCatRef.current = cat;
    setDragId(id); setDragCat(cat); setOverCat(cat);
    posRef.current = { x: e.clientX, y: e.clientY };

    // Cible : la ligne sous le pointeur (toutes catégories), sinon la catégorie survolée
    // (permet de déposer dans une catégorie vide ou sous sa dernière ligne).
    const cibleSousPointeur = (x: number, y: number): { ligne: string | null; cat: string | null } => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-ligne]"));
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
          return { ligne: row.getAttribute("data-ligne"), cat: row.getAttribute("data-cat") };
        }
      }
      const blocsEl = Array.from(document.querySelectorAll<HTMLElement>("[data-bloc]"));
      for (const b of blocsEl) {
        const r = b.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
          return { ligne: null, cat: b.getAttribute("data-bloc") };
        }
      }
      return { ligne: null, cat: null };
    };

    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      posRef.current = { x: ev.clientX, y: ev.clientY };
      const c = cibleSousPointeur(ev.clientX, ev.clientY);
      overRef.current = c.ligne;
      overCatRef.current = c.cat;
      setOverId(c.ligne);
      setOverCat(c.cat);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      stopAutoScroll();
      const d = dragRef.current;
      const over = overRef.current;
      const overCatFinal = overCatRef.current;
      dragRef.current = null; overRef.current = null; overCatRef.current = null;
      setDragId(null); setDragCat(null); setOverId(null); setOverCat(null);
      if (!d || !overCatFinal) return;
      if (over === d.id) return; // déposé sur lui-même

      const blocCible = blocs.find((b) => catKey(b) === overCatFinal);
      if (!blocCible) return;
      const changeCategorie = overCatFinal !== d.cat;

      // Ordre cible : on retire la ligne de sa catégorie et on l'insère dans la cible.
      const idsCible = blocCible.lignes.map((l) => l.id).filter((x) => x !== d.id);
      const pos = over ? idsCible.indexOf(over) : -1;
      if (pos >= 0) idsCible.splice(pos, 0, d.id); else idsCible.push(d.id);

      // Renumérotation GLOBALE (toutes catégories) → pas de collision d'ordre.
      const ordreGlobal = blocs.flatMap((b) => {
        const k = catKey(b);
        if (k === overCatFinal) return idsCible;
        return b.lignes.map((l) => l.id).filter((x) => x !== d.id);
      });

      start(async () => {
        await reordonnerLignes(
          prestationId,
          ordreGlobal,
          changeCategorie ? (blocCible.catId ?? null) : undefined,
          changeCategorie ? d.id : undefined,
        );
        router.refresh();
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(autoScrollTick);
  };

  const InlineNum = ({ l, champ, val, w, step = "0.01", suffix }: { l: LigneData; champ: string; val: number; w: string; step?: string; suffix?: string }) => (
    <span className="inline-flex items-center gap-0.5">
      <input
        key={`${l.id}-${champ}-${val}`}
        type="number" step={step} min="0" inputMode="decimal" defaultValue={val}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (v !== val) inline(l.id, champ, v); }}
        className={`${w} ${NO_SPIN} rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm hover:border-border focus:border-primary focus:bg-background focus:outline-none`}
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );

  return (
    <>
      <ConfirmDialog open={delId !== null} message="Supprimer cette ligne ?" confirmLabel="Supprimer" danger
        onCancel={() => setDelId(null)}
        onConfirm={() => { const x = delId; setDelId(null); if (x) start(async () => { await deleteLigne(prestationId, x); router.refresh(); }); }} />

      <section className="space-y-4">
        {blocs.map((b) => {
          const total = b.lignes.reduce((s, l) => s + Number(l.prix_total ?? 0), 0);
          return (
            <div
              key={catKey(b)}
              data-bloc={catKey(b)}
              className={`rounded-xl transition-colors ${dragId && overCat === catKey(b) && overCat !== dragCat ? "bg-primary/5 ring-1 ring-dashed ring-primary/40" : ""}`}
            >
              <h3 className="mb-1 text-sm font-semibold">{b.nom}{b.lignes.length > 0 && <span className="text-muted"> · {euros(total)}</span>}</h3>
              {b.lignes.length > 0 && (
                <Card className="mb-2 divide-y divide-border overflow-hidden">
                  {/* En-têtes de colonnes */}
                  <div className="flex items-center gap-2 bg-surface/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    <span className="w-4 shrink-0" />
                    <span className="min-w-0 flex-1">Désignation</span>
                    <span className="w-16 shrink-0 text-right">Qté</span>
                    <span className="w-24 shrink-0 text-right">P.U. HT</span>
                    <span className="w-24 shrink-0 text-right">Total</span>
                    <span className="w-16 shrink-0" />
                  </div>
                  {b.lignes.map((l) => {
                    const remiseVisible = remiseOpen.has(l.id) || l.remise_valeur > 0;
                    return (
                      <div key={l.id} data-ligne={l.id} data-cat={catKey(b)}
                        className={`${dragId === l.id ? "opacity-40" : ""} ${overId === l.id && dragId && dragId !== l.id ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}>
                        <div className="group flex items-center gap-2 px-2 py-1.5">
                          {/* Poignée (visible au survol ; toujours visible sur tactile) */}
                          <button type="button" onPointerDown={(e) => onDown(e, l.id, catKey(b))}
                            className="w-4 shrink-0 cursor-grab touch-none text-center text-muted opacity-0 transition-opacity hover:text-foreground active:cursor-grabbing group-hover:opacity-100 [@media(hover:none)]:opacity-100" title="Déplacer" aria-label="Déplacer">⠿</button>
                          {/* Désignation — cliquable pour la fiche produit si liée au catalogue */}
                          {l.reference_id && infosRef[l.reference_id] ? (
                            <span className="flex min-w-0 flex-1 items-center gap-1 text-sm">
                              <Modal
                                trigger={<span className="inline-flex min-w-0 items-center gap-1"><span className="truncate">{l.designation}</span><IconInfo className="h-3.5 w-3.5 shrink-0 opacity-50" /></span>}
                                title={infosRef[l.reference_id].nom}
                                triggerClassName="min-w-0 max-w-full text-left hover:text-primary"
                              >
                                <FicheProduit info={infosRef[l.reference_id]} unitePrefix={`/u/`} />
                              </Modal>
                              {l.est_accessoire_auto && <span className="ml-0.5 shrink-0 text-xs text-muted">(accessoire)</span>}
                              {infosRef[l.reference_id].sousLoc && <SousLocationBadge sl={infosRef[l.reference_id].sousLoc!} quantite={l.quantite} />}
                            </span>
                          ) : (
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                              <span className="truncate">{l.designation}</span>
                              {l.est_accessoire_auto && <span className="shrink-0 text-xs text-muted">(accessoire)</span>}
                              {!l.reference_id && (
                                <LierAuCatalogue prestationId={prestationId} ligne={l} references={references} />
                              )}
                            </span>
                          )}
                          {/* Qté (pas de 1) */}
                          <span className="flex w-16 shrink-0 justify-end"><InlineNum l={l} champ="quantite" val={l.quantite} w="w-12" step="1" /></span>
                          {/* P.U. HT */}
                          <span className="flex w-24 shrink-0 items-center justify-end"><InlineNum l={l} champ="prix_unitaire" val={l.prix_unitaire} w="w-16" suffix="€" /></span>
                          {/* Total */}
                          <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">{euros(l.prix_total)}</span>
                          {/* Actions : remise / suppression */}
                          <span className="flex w-16 shrink-0 items-center justify-end gap-1.5">
                            <button type="button" title="Remise" onClick={() => setRemiseOpen((p) => { const n = new Set(p); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}
                              className={`rounded px-1 text-xs ${remiseVisible ? "text-primary" : "text-muted hover:text-foreground"}`}>%</button>
                            <button type="button" onClick={() => setDelId(l.id)} className="text-muted opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 [@media(hover:none)]:opacity-100" title="Supprimer">✕</button>
                          </span>
                        </div>
                        {/* Remise — ligne dédiée en dessous, indentée */}
                        {remiseVisible && (
                          <div className="flex items-center gap-1.5 pb-1.5 pl-9 text-xs text-muted">
                            <span>Remise</span>
                            <input key={`${l.id}-rem-${l.remise_valeur}`} type="number" step="0.01" min="0" inputMode="decimal" defaultValue={l.remise_valeur}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (v !== l.remise_valeur) inline(l.id, "remise_valeur", v); }}
                              className={`w-16 ${NO_SPIN} rounded-md border border-border bg-background px-1.5 py-0.5 text-right text-xs focus:border-primary focus:outline-none`} />
                            <select defaultValue={l.remise_type} onChange={(e) => inline(l.id, "remise_type", e.target.value)}
                              className="rounded-md border border-border bg-background px-1 py-0.5 text-xs">
                              <option value="pct">%</option>
                              <option value="montant">€</option>
                            </select>
                            <button type="button" title="Supprimer la remise"
                              onClick={() => { if (l.remise_valeur !== 0) inline(l.id, "remise_valeur", 0); setRemiseOpen((p) => { const n = new Set(p); n.delete(l.id); return n; }); }}
                              className="text-muted hover:text-red-600">✕</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
              )}
              {/* Accessoires optionnels des lignes */}
              {b.lignes.some((l) => l.options.length > 0) && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {b.lignes.flatMap((l) => l.options.map((o) => (
                    <form key={`${l.id}-${o.ruleId}`} action={ajouterAccessoireOptionnel.bind(null, prestationId, devisId, l.id, o.ruleId)}>
                      <button className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-background">+ {o.nom}</button>
                    </form>
                  )))}
                </div>
              )}
              <Modal trigger={<>+ Ajouter un élément</>} title={`Ajouter — ${b.nom}`}
                triggerClassName="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted hover:border-primary hover:text-primary">
                <LigneForm action={addLigne.bind(null, prestationId, devisId)} references={references} categories={categories} defaultCategorieId={b.catId ?? undefined} />
                <p className="mt-2 text-xs text-muted">Choisis une référence du catalogue (prix + accessoires auto) ou laisse vide pour une ligne libre.</p>
              </Modal>
            </div>
          );
        })}
      </section>
    </>
  );
}

/** Fiche produit affichée au clic sur une ligne : specs techniques + unités réservées pour l'événement. */
function FicheProduit({ info, unitePrefix }: { info: RefInfo; unitePrefix: string }) {
  const specs: { label: string; valeur: string }[] = [];
  if (info.puissance_w != null) specs.push({ label: "Consommation", valeur: `${info.puissance_w} W` });
  if (info.intensite_a != null) specs.push({ label: "Intensité", valeur: `${info.intensite_a} A${info.phase ? ` (${info.phase})` : ""}` });
  else if (info.phase) specs.push({ label: "Phase", valeur: info.phase });
  if (info.poids_kg != null) specs.push({ label: "Poids", valeur: `${info.poids_kg} kg` });
  if (info.dimensions) specs.push({ label: "Dimensions", valeur: info.dimensions });
  if (info.connecteurs_puissance.length) specs.push({ label: "Connecteurs puissance", valeur: info.connecteurs_puissance.join(", ") });
  if (info.connecteurs_data.length) specs.push({ label: "Connecteurs data", valeur: info.connecteurs_data.join(", ") });

  return (
    <div className="space-y-4 text-sm">
      {info.description && <p className="text-muted">{info.description}</p>}

      {specs.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {specs.map((s) => (
            <div key={s.label} className="contents">
              <dt className="text-muted">{s.label}</dt>
              <dd className="font-medium">{s.valeur}</dd>
            </div>
          ))}
        </dl>
      ) : (
        !info.description && <p className="text-muted">Aucune caractéristique technique renseignée.</p>
      )}

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Unités réservées pour cet événement</div>
        {info.reserves.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {info.reserves.map((u) => (
              <Link key={u.id} href={`${unitePrefix}${u.id}`} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:underline">
                {u.numero_serie || "unité"}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Aucune unité encore réservée (vérifie la disponibilité / les dates de l&apos;événement).</p>
        )}
      </div>
    </div>
  );
}

/**
 * Pastille « ? » cliquable : ouvre le choix d'une référence du catalogue pour une ligne
 * saisie librement. Tant qu'elle n'est reliée à rien, la ligne est ignorée par le plan de
 * levage, le plan électrique et la réservation d'unités.
 */
function LierAuCatalogue({
  prestationId,
  ligne,
  references,
}: {
  prestationId: string;
  ligne: LigneData;
  references: Ref[];
}) {
  const [q, setQ] = useState("");
  const recherche = q.trim().toLowerCase();
  // Sans recherche, on propose les références dont le nom ressemble à la désignation.
  const mots = (ligne.designation ?? "").toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((m) => m.length > 3);
  const liste = recherche
    ? references.filter((r) => r.nom.toLowerCase().includes(recherche)).slice(0, 60)
    : references.filter((r) => mots.some((m) => r.nom.toLowerCase().includes(m))).slice(0, 20);

  return (
    <Modal
      trigger={<IconHorsCatalogue className="h-3.5 w-3.5 text-amber-600" />}
      triggerTitle="Hors catalogue — cliquer pour relier à une référence"
      triggerClassName="shrink-0 rounded p-0.5 hover:bg-background"
      title="Relier au catalogue"
      panelClassName="max-w-lg"
    >
      <p className="mb-3 text-sm text-muted">
        <strong className="text-foreground">{ligne.designation}</strong> est saisie librement : elle
        n&apos;apparaît ni dans le plan de levage, ni dans le plan électrique, et ne réserve aucune unité.
        Choisis la référence correspondante — la désignation et le prix de la ligne ne changent pas.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher dans le catalogue…"
        autoFocus
        className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <ModalForm action={lierLigneAuCatalogue.bind(null, prestationId, ligne.id)}>
        <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {liste.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted">
              {recherche ? "Aucune référence trouvée." : "Aucune correspondance évidente — tape pour chercher."}
            </p>
          )}
          {liste.map((r) => (
            <button
              key={r.id}
              type="submit"
              name="reference_id"
              value={r.id}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-background"
            >
              <span className="min-w-0 truncate">{r.nom}</span>
              <span className="shrink-0 text-xs text-muted">{euros(r.prix_location_jour)}/j</span>
            </button>
          ))}
        </div>
        <div className="mt-3"><ModalCancelButton /></div>
      </ModalForm>
    </Modal>
  );
}
