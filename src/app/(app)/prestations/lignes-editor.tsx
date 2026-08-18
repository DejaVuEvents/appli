"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { LigneForm } from "./ligne-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconEdit } from "@/components/icons";
import { euros } from "@/lib/format";
import { addLigne, setLigneInline, deleteLigne, reordonnerLignes, ajouterAccessoireOptionnel } from "./actions";

export type LigneData = {
  id: string; designation: string | null; quantite: number; unite: string | null;
  prix_unitaire: number; prix_total: number | null; remise_type: string; remise_valeur: number;
  est_accessoire_auto: boolean; options: { ruleId: string; nom: string }[];
};
export type BlocData = { catId: string | null; nom: string; lignes: LigneData[] };
type Ref = { id: string; nom: string; prix_location_jour: number; cout_location_jour: number | null; categorie_id: string | null; est_consommable: boolean };
type Cat = { id: string; nom: string; ordre?: number | null };

export function LignesEditor({ prestationId, devisId, blocs, references, categories }: {
  prestationId: string; devisId: string; blocs: BlocData[]; references: Ref[]; categories: Cat[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; cat: string } | null>(null);
  const [remiseOpen, setRemiseOpen] = useState<Set<string>>(new Set());
  const [delId, setDelId] = useState<string | null>(null);

  const inline = (ligneId: string, champ: string, valeur: string | number) => {
    const fd = new FormData(); fd.set("champ", champ); fd.set("valeur", String(valeur));
    start(async () => { await setLigneInline(prestationId, ligneId, fd); router.refresh(); });
  };

  const catKey = (b: BlocData) => b.catId ?? "__divers";

  // Drag & drop (réordonnancement dans une même catégorie).
  const onDown = (e: React.PointerEvent, id: string, cat: string) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id, cat }; setDragId(id);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-ligne]") as HTMLElement | null;
    setOverId(el?.getAttribute("data-ligne") ?? null);
  };
  const onUp = () => {
    const d = dragRef.current; const over = overId;
    dragRef.current = null; setDragId(null); setOverId(null);
    if (!d || !over || over === d.id) return;
    const bloc = blocs.find((b) => catKey(b) === d.cat);
    if (!bloc) return;
    const ids = bloc.lignes.map((l) => l.id);
    const from = ids.indexOf(d.id); const to = ids.indexOf(over);
    if (from < 0 || to < 0) return; // cible dans une autre catégorie → ignoré
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    start(async () => { await reordonnerLignes(prestationId, ids); router.refresh(); });
  };

  const InlineNum = ({ l, champ, val, w, suffix }: { l: LigneData; champ: string; val: number; w: string; suffix?: string }) => (
    <span className="inline-flex items-center">
      <input
        key={`${l.id}-${champ}-${val}`}
        type="number" step="0.01" inputMode="decimal" defaultValue={val}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (v !== val) inline(l.id, champ, v); }}
        className={`${w} rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right text-sm hover:border-border focus:border-primary focus:bg-background focus:outline-none`}
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
            <div key={catKey(b)}>
              <h3 className="mb-1 text-sm font-semibold">{b.nom}{b.lignes.length > 0 && <span className="text-muted"> · {euros(total)}</span>}</h3>
              {b.lignes.length > 0 && (
                <Card className="mb-2 divide-y divide-border overflow-hidden">
                  {b.lignes.map((l) => {
                    const remiseVisible = remiseOpen.has(l.id) || l.remise_valeur > 0;
                    return (
                      <div key={l.id} data-ligne={l.id}
                        className={`flex items-center gap-2 px-2 py-1.5 ${dragId === l.id ? "opacity-40" : ""} ${overId === l.id && dragId ? "border-t-2 border-primary" : ""}`}>
                        {/* Poignée */}
                        <button type="button" onPointerDown={(e) => onDown(e, l.id, catKey(b))} onPointerMove={onMove} onPointerUp={onUp}
                          className="shrink-0 cursor-grab touch-none px-0.5 text-muted hover:text-foreground active:cursor-grabbing" title="Déplacer" aria-label="Déplacer">⠿</button>
                        {/* Désignation */}
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {l.designation}
                          {l.est_accessoire_auto && <span className="ml-1.5 text-xs text-muted">(accessoire)</span>}
                        </span>
                        {/* Qté × prix */}
                        <InlineNum l={l} champ="quantite" val={l.quantite} w="w-12" />
                        <span className="text-xs text-muted">×</span>
                        <InlineNum l={l} champ="prix_unitaire" val={l.prix_unitaire} w="w-20" suffix="€" />
                        {/* Remise */}
                        <button type="button" title="Remise" onClick={() => setRemiseOpen((p) => { const n = new Set(p); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}
                          className={`shrink-0 rounded px-1 text-xs ${remiseVisible ? "text-primary" : "text-muted hover:text-foreground"}`}>%</button>
                        {remiseVisible && (
                          <span className="inline-flex items-center gap-0.5">
                            <input key={`${l.id}-rem-${l.remise_valeur}`} type="number" step="0.01" inputMode="decimal" defaultValue={l.remise_valeur}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (v !== l.remise_valeur) inline(l.id, "remise_valeur", v); }}
                              className="w-12 rounded-md border border-border bg-background px-1 py-0.5 text-right text-xs focus:border-primary focus:outline-none" />
                            <select defaultValue={l.remise_type} onChange={(e) => inline(l.id, "remise_type", e.target.value)}
                              className="rounded-md border border-border bg-background px-0.5 py-0.5 text-xs">
                              <option value="pct">%</option>
                              <option value="montant">€</option>
                            </select>
                          </span>
                        )}
                        {/* Total */}
                        <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">{euros(l.prix_total)}</span>
                        {/* Édition avancée + suppression */}
                        <Link href={`/prestations/${prestationId}/lignes/${l.id}?devis=${devisId}`} className="shrink-0 text-muted hover:text-primary" title="Éditer"><IconEdit className="h-4 w-4" /></Link>
                        <button type="button" onClick={() => setDelId(l.id)} className="shrink-0 text-muted hover:text-red-600" title="Supprimer">✕</button>
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
