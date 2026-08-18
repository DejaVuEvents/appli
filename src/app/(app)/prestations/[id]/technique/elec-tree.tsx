"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addNoeud, deleteNoeud, deplacerNoeud, affecterCircuitExemplaire } from "./actions";
import { AssignSelect } from "./assign-select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { niveauAlerte } from "@/lib/technique";
import { PHASE_LABELS, type CircuitElec } from "@/lib/types";

type Exemplaire = {
  key: string;
  ligneId: string;
  rang: number;
  uniteId: string | null;
  designation: string;
  courant: number;
  circuitId: string | null;
};

type Props = {
  prestationId: string;
  circuits: CircuitElec[];
  exemplaires: Exemplaire[];
  noeuds: { id: string; nom: string }[];
};

const ALERTE_CLS = { ok: "text-green-600", warn: "text-amber-500", depasse: "text-red-600" } as const;
const BAR_CLS = { ok: "bg-green-500", warn: "bg-amber-400", depasse: "bg-red-500" } as const;
const amp = (n: number) => `${n.toFixed(1)} A`;

const TYPE_OPTS = [
  { value: "source", label: "Source" },
  { value: "armoire", label: "Armoire" },
  { value: "phase", label: "Phase (16A mono)" },
  { value: "circuit", label: "Circuit" },
  { value: "prise", label: "Prise" },
];
const PHASE_OPTS = [
  { value: "", label: "—" },
  { value: "mono", label: "Mono" },
  { value: "tri", label: "Tri" },
];
const INT_OPTS = ["125", "63", "32", "16"];
const TYPE_DEFAULT_CHILD: Record<string, string> = { source: "phase", armoire: "prise", phase: "prise", circuit: "prise", prise: "prise" };

/** Capacité effective en A mono : une source tri = 3× son calibre (32A tri → 96A mono). */
export function capaciteEffective(intensite_max_a: number | null, phase: string | null): number | null {
  if (intensite_max_a == null) return null;
  return phase === "tri" ? intensite_max_a * 3 : intensite_max_a;
}

function InlineForm({ prestationId, parentId, defaultType, onDone }: { prestationId: string; parentId: string | null; defaultType: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(defaultType);
  const [phase, setPhase] = useState(defaultType === "phase" ? "mono" : "");
  const [intChoice, setIntChoice] = useState(defaultType === "phase" ? "16" : "32");
  const [intAutre, setIntAutre] = useState("");
  const mono = phase === "mono" || type === "phase";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    fd.set("phase", type === "phase" ? "mono" : phase);
    fd.set("intensite_max_a", mono ? "16" : (intChoice === "autre" ? intAutre : intChoice));
    if (parentId) fd.set("parent_id", parentId); else fd.delete("parent_id");
    startTransition(async () => { await addNoeud(prestationId, fd); router.refresh(); onDone(); });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
      <select
        value={type}
        onChange={(e) => { const t = e.target.value; setType(t); if (t === "phase") { setPhase("mono"); setIntChoice("16"); } }}
        className="rounded border border-border bg-background px-2 py-1 text-xs"
      >
        {TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input name="nom" required placeholder="Nom…" autoFocus className="w-28 rounded border border-border bg-background px-2 py-1 text-xs" />
      {/* Phase (sauf type « phase » qui est forcément mono 16A) */}
      {type !== "phase" && (
        <select value={phase} onChange={(e) => setPhase(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs">
          {PHASE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {/* Intensité : mono → 16A figé ; sinon menu 125/63/32/16 + Autre */}
      {mono ? (
        <span className="rounded border border-border bg-background px-2 py-1 text-xs text-muted">16 A (mono)</span>
      ) : (
        <>
          <select value={intChoice} onChange={(e) => setIntChoice(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs" title="Calibre par phase">
            {INT_OPTS.map((v) => <option key={v} value={v}>{v} A</option>)}
            <option value="autre">Autre…</option>
          </select>
          {intChoice === "autre" && (
            <input value={intAutre} onChange={(e) => setIntAutre(e.target.value)} type="number" step="0.1" min="0" inputMode="decimal" placeholder="A" className="w-16 rounded border border-border bg-background px-2 py-1 text-xs" />
          )}
        </>
      )}
      <button type="submit" disabled={isPending} className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60">{isPending ? "…" : "Ajouter"}</button>
      <button type="button" onClick={onDone} className="px-1 text-xs text-muted hover:text-foreground">Annuler</button>
    </form>
  );
}

type Drag =
  | { kind: "node"; id: string }
  | { kind: "exemplaire"; key: string; ligneId: string; rang: number; uniteId: string | null };

export function ElecTree({ prestationId, circuits, exemplaires, noeuds }: Props) {
  const router = useRouter();
  const [addAt, setAddAt] = useState<string | "root" | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (nodeId: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return next;
  });
  const [, startDel] = useTransition();
  const [, startMove] = useTransition();
  const [delId, setDelId] = useState<string | null>(null);

  // Drag & drop (souris + tactile via Pointer Events)
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const onDown = (e: React.PointerEvent, d: Drag) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = d; setDrag(d);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const drop = el?.closest("[data-drop]") as HTMLElement | null;
    setOverId(drop?.getAttribute("data-drop") ?? null);
  };
  const onUp = () => {
    const d = dragRef.current; const over = overId;
    dragRef.current = null; setDrag(null); setOverId(null);
    if (!d || !over) return;
    if (d.kind === "node") {
      if (over === d.id) return;
      const target = over === "root" ? null : over;
      startMove(async () => { await deplacerNoeud(prestationId, d.id, target); router.refresh(); });
    } else {
      // exemplaire → circuit (ou détacher si zone racine)
      const circuitId = over === "root" ? "" : over;
      const fd = new FormData(); fd.set("circuit_id", circuitId); if (d.uniteId) fd.set("unite_id", d.uniteId);
      startMove(async () => { await affecterCircuitExemplaire(prestationId, d.ligneId, d.rang, fd); router.refresh(); });
    }
  };

  const enfantsDe = new Map<string | null, CircuitElec[]>();
  for (const c of circuits) {
    const key = c.parent_id ?? null;
    if (!enfantsDe.has(key)) enfantsDe.set(key, []);
    enfantsDe.get(key)!.push(c);
  }
  const cacheTotal = new Map<string, number>();
  const totalNoeud = (nodeId: string): number => {
    if (cacheTotal.has(nodeId)) return cacheTotal.get(nodeId)!;
    const direct = exemplaires.filter((e) => e.circuitId === nodeId).reduce((s, e) => s + e.courant, 0);
    const t = direct + (enfantsDe.get(nodeId) ?? []).reduce((s, e) => s + totalNoeud(e.id), 0);
    const r = Math.round(t * 100) / 100;
    cacheTotal.set(nodeId, r);
    return r;
  };

  const handleDelete = (nodeId: string) => setDelId(nodeId);
  const confirmDelete = () => {
    const nodeId = delId;
    setDelId(null);
    if (nodeId) startDel(async () => { await deleteNoeud(prestationId, nodeId); router.refresh(); });
  };
  const detach = (e: Exemplaire) => {
    const fd = new FormData(); fd.set("circuit_id", "");
    startMove(async () => { await affecterCircuitExemplaire(prestationId, e.ligneId, e.rang, fd); router.refresh(); });
  };

  const renderNode = (node: CircuitElec, depth: number): React.ReactNode => {
    const total = totalNoeud(node.id);
    const capEff = capaciteEffective(node.intensite_max_a, node.phase);
    const al = niveauAlerte(total, capEff, 0.9);
    const pct = capEff ? Math.min(100, (total / capEff) * 100) : 0;
    const children = enfantsDe.get(node.id) ?? [];
    const devices = exemplaires.filter((e) => e.circuitId === node.id);
    const isAddingHere = addAt === node.id;
    const childType = TYPE_DEFAULT_CHILD[node.type ?? "prise"] ?? "prise";
    const estCible = overId === node.id && !(drag?.kind === "node" && drag.id === node.id);
    const estTraine = drag?.kind === "node" && drag.id === node.id;
    const hasContent = children.length + devices.length > 0;
    const isCollapsed = collapsed.has(node.id);

    return (
      <div key={node.id}>
        <div
          data-drop={node.id}
          className={`group flex items-center gap-2 border-b border-border py-2 pr-3 hover:bg-surface/50 ${estCible ? "bg-primary/15 ring-2 ring-inset ring-primary" : ""} ${estTraine ? "opacity-40" : ""}`}
          style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}
        >
          <button
            onPointerDown={(e) => onDown(e, { kind: "node", id: node.id })}
            onPointerMove={onMove}
            onPointerUp={onUp}
            title="Glisser pour déplacer ce nœud"
            aria-label="Déplacer"
            className="shrink-0 cursor-grab touch-none px-0.5 text-muted hover:text-foreground active:cursor-grabbing"
          >
            ⠿
          </button>
          {depth > 0 && <span className="shrink-0 text-xs text-border select-none">└</span>}
          {/* Chevron replier/déplier */}
          {hasContent ? (
            <button onClick={() => toggleCollapse(node.id)} title={isCollapsed ? "Déplier" : "Replier"} className="shrink-0 w-4 text-xs text-muted hover:text-foreground">
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="shrink-0 w-4" />
          )}
          {node.type && <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{node.type}</span>}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {node.nom}
            {node.phase && <span className="ml-1.5 text-xs font-normal text-muted">{PHASE_LABELS[node.phase]}</span>}
          </span>
          {node.intensite_max_a ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                <div className={`h-full rounded-full transition-all ${BAR_CLS[al]}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-right text-xs font-medium tabular-nums ${ALERTE_CLS[al]}`}>
                {amp(total)} / {amp(capEff ?? 0)}
                {node.phase === "tri" && <span className="ml-1 font-normal text-muted">(3×{node.intensite_max_a} A)</span>}
                {al === "depasse" ? " ⚠" : ""}
              </span>
            </div>
          ) : (
            <span className="shrink-0 text-xs text-muted tabular-nums">{amp(total)}</span>
          )}
          <button onClick={() => setAddAt(isAddingHere ? null : node.id)} title="Ajouter un sous-circuit ici" className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold transition-colors hover:bg-primary/10 hover:text-primary ${isAddingHere ? "text-primary" : "text-muted opacity-0 group-hover:opacity-100"}`}>+</button>
          <button onClick={() => handleDelete(node.id)} title="Supprimer ce nœud (et ses enfants)" className="shrink-0 text-sm text-muted opacity-0 hover:text-red-600 group-hover:opacity-100">✕</button>
        </div>
        {/* Appareils branchés sur ce nœud */}
        {!isCollapsed && devices.map((d) => {
          const traine = drag?.kind === "exemplaire" && drag.key === d.key;
          return (
            <div
              key={d.key}
              className={`flex items-center gap-2 border-b border-border/60 py-1.5 pr-3 text-sm ${traine ? "opacity-40" : ""}`}
              style={{ paddingLeft: `${0.75 + (depth + 1) * 1.5}rem` }}
            >
              <button
                onPointerDown={(e) => onDown(e, { kind: "exemplaire", key: d.key, ligneId: d.ligneId, rang: d.rang, uniteId: d.uniteId })}
                onPointerMove={onMove}
                onPointerUp={onUp}
                title="Glisser vers un autre circuit"
                className="shrink-0 cursor-grab touch-none px-0.5 text-muted hover:text-foreground active:cursor-grabbing"
              >
                ⠿
              </button>

              <span className="min-w-0 flex-1 truncate text-muted">{d.designation}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">{amp(d.courant)}</span>
              <button onClick={() => detach(d)} title="Détacher" className="shrink-0 text-xs text-muted hover:text-red-600">✕</button>
            </div>
          );
        })}
        {!isCollapsed && children.map((c) => renderNode(c, depth + 1))}
        {isAddingHere && (
          <div className="border-b border-border py-2 pr-3" style={{ paddingLeft: `${0.75 + (depth + 1) * 1.5}rem` }}>
            <InlineForm prestationId={prestationId} parentId={node.id} defaultType={childType} onDone={() => setAddAt(null)} />
          </div>
        )}
      </div>
    );
  };

  const roots = enfantsDe.get(null) ?? [];
  const isAddingRoot = addAt === "root";
  const nonBranches = exemplaires.filter((e) => !e.circuitId);

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      <ConfirmDialog
        open={delId !== null}
        message="Supprimer ce nœud et tous ses sous-circuits ?"
        confirmLabel="Supprimer"
        danger
        onCancel={() => setDelId(null)}
        onConfirm={confirmDelete}
      />
      {/* Colonne gauche : arborescence */}
      <div className="min-w-0 flex-1">
        {/* Zone racine / détacher (visible pendant un glissement) */}
        {drag && (
          <div
            data-drop="root"
            className={`mb-2 rounded-xl border-2 border-dashed py-2.5 text-center text-xs ${overId === "root" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}
          >
            {drag.kind === "node" ? "Déposer ici → source racine" : "Déposer ici → détacher (non branché)"}
          </div>
        )}

        {roots.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            {roots.map((r) => renderNode(r, 0))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            Aucune source — cliquez sur « + Ajouter une source » ci-dessous.
          </div>
        )}

        {isAddingRoot ? (
          <div className="mt-2 rounded-xl border border-border bg-background px-3 py-3">
            <InlineForm prestationId={prestationId} parentId={null} defaultType="source" onDone={() => setAddAt(null)} />
          </div>
        ) : (
          <button onClick={() => setAddAt("root")} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm text-muted transition-colors hover:border-primary hover:text-primary">
            <span className="text-lg font-medium leading-none">+</span> Ajouter une source
          </button>
        )}
      </div>

      {/* Colonne droite (étroite) : matériel NON branché à glisser + légende */}
      <aside className="mt-4 space-y-3 lg:mt-0 lg:w-72 lg:shrink-0">
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">À brancher{nonBranches.length > 0 && <span className="ml-1 font-normal normal-case">({nonBranches.length})</span>}</div>
          {nonBranches.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">{exemplaires.length === 0 ? "Aucun matériel élec." : "Tout est branché ✓"}</p>
          ) : (
            <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {nonBranches.map((l) => {
                const estTraine = drag?.kind === "exemplaire" && drag.key === l.key;
                return (
                  <div key={l.key} className={`flex items-center gap-1.5 bg-orange-50/60 px-2 py-2 text-sm dark:bg-orange-950/20 ${estTraine ? "opacity-40" : ""}`}>
                    <button
                      onPointerDown={(e) => onDown(e, { kind: "exemplaire", key: l.key, ligneId: l.ligneId, rang: l.rang, uniteId: l.uniteId })}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      title="Glisser vers un circuit de l'arbre"
                      aria-label="Glisser vers l'arbre"
                      className="shrink-0 cursor-grab touch-none px-0.5 text-muted hover:text-foreground active:cursor-grabbing"
                    >
                      ⠿
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words leading-tight">{l.designation}</span>
                      <span className="text-xs text-muted">{amp(l.courant)}</span>
                    </span>
                    <AssignSelect action={affecterCircuitExemplaire.bind(null, prestationId, l.ligneId, l.rang)} fieldName="circuit_id" value={l.circuitId} options={noeuds} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
          <p className="mb-1 font-semibold uppercase tracking-wide">Légende</p>
          <p><span className="text-green-600">●</span> marge OK · <span className="text-amber-500">●</span> &lt; 10 % · <span className="text-red-600">●</span> dépassé</p>
          <p className="mt-1">Glisse la poignée <strong>⠿</strong> sur un circuit pour brancher.</p>
        </div>
      </aside>
    </div>
  );
}
