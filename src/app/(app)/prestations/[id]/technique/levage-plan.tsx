"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPont, deletePont, affecterPont } from "./actions";
import { AssignSelect } from "./assign-select";
import { niveauAlerte } from "@/lib/technique";

const ALERTE_CLS = { ok: "text-green-600", warn: "text-amber-600", depasse: "text-red-600" } as const;
const BAR_CLS = { ok: "bg-green-500", warn: "bg-amber-500", depasse: "bg-red-500" } as const;
const kg = (n: number) => `${n.toFixed(1)} kg`;

type Pont = { id: string; nom: string; capacite_kg: number | null; total: number };
type LigneP = { id: string; designation: string | null; poids: number; pontId: string | null };
type LigneLevage = { designation: string; chargeUnitaire: number; quantite: number };

export function LevagePlan({ prestationId, ponts, lignes, lignesLevage = [] }: { prestationId: string; ponts: Pont[]; lignes: LigneP[]; lignesLevage?: LigneLevage[] }) {
  const router = useRouter();
  const [, startT] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  // Formulaire d'ajout de pont : soit un pied de levage du devis (charge auto), soit « autre matériel » (saisie manuelle).
  const aDesPieds = lignesLevage.length > 0;
  const [source, setSource] = useState<"devis" | "autre">(aDesPieds ? "devis" : "autre");
  const [nom, setNom] = useState("");
  const [capacite, setCapacite] = useState("");
  // La charge admissible s'additionne : quantité de pieds × charge admissible unitaire.
  const choisirPied = (idx: number) => {
    const l = lignesLevage[idx];
    if (!l) { setNom(""); setCapacite(""); return; }
    const total = l.chargeUnitaire * (l.quantite || 1);
    setNom(l.quantite > 1 ? `${l.designation} (×${l.quantite})` : l.designation);
    setCapacite(String(total));
  };

  const onDown = (e: React.PointerEvent, ligneId: string) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = ligneId; setDragId(ligneId);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const drop = el?.closest("[data-drop]") as HTMLElement | null;
    setOverId(drop?.getAttribute("data-drop") ?? null);
  };
  const onUp = () => {
    const ligneId = dragRef.current; const over = overId;
    dragRef.current = null; setDragId(null); setOverId(null);
    if (!ligneId || !over) return;
    const pontId = over === "root" ? "" : over;
    const fd = new FormData(); fd.set("pont_id", pontId);
    startT(async () => { await affecterPont(prestationId, ligneId, fd); router.refresh(); });
  };

  const pontOptions = ponts.map((p) => ({ id: p.id, nom: p.nom }));
  const nonAffectees = lignes.filter((l) => !l.pontId);

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      {/* Colonne gauche : ponts (cibles de dépôt) */}
      <div className="min-w-0 flex-1 space-y-3">
        {dragId && (
          <div data-drop="root" className={`rounded-xl border-2 border-dashed py-2.5 text-center text-xs ${overId === "root" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>
            Déposer ici → détacher (non affecté)
          </div>
        )}
        {ponts.map((p) => {
          const al = niveauAlerte(p.total, p.capacite_kg);
          const pct = p.capacite_kg ? Math.min(100, Math.round((p.total / p.capacite_kg) * 100)) : 0;
          const estCible = overId === p.id;
          return (
            <div key={p.id} data-drop={p.id} className={`rounded-xl border border-border bg-surface p-4 ${estCible ? "ring-2 ring-inset ring-primary bg-primary/10" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.nom}</span>
                <span className="flex items-center gap-3 text-sm">
                  <span className={ALERTE_CLS[al]}>{kg(p.total)} / {p.capacite_kg ? kg(p.capacite_kg) : "—"}{al === "depasse" && " ⚠ dépassé"}</span>
                  <form action={deletePont.bind(null, prestationId, p.id)}>
                    <button className="text-muted hover:text-red-600" title="Supprimer" onClick={(e) => { if (!confirm(`Supprimer le pont « ${p.nom} » ?`)) e.preventDefault(); }}>✕</button>
                  </form>
                </span>
              </div>
              {p.capacite_kg ? (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
                  <div className={`h-full rounded-full ${BAR_CLS[al]}`} style={{ width: `${pct}%` }} />
                </div>
              ) : null}
              {/* Charges affectées à ce pont */}
              <div className="mt-2 flex flex-wrap gap-1">
                {lignes.filter((l) => l.pontId === p.id).map((l) => (
                  <span key={l.id} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted">{l.designation} · {kg(l.poids)}</span>
                ))}
              </div>
            </div>
          );
        })}
        <form action={addPont.bind(null, prestationId)} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          {aDesPieds && (
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1 text-sm">
              <button type="button" onClick={() => { setSource("devis"); }} className={`rounded-md px-3 py-1 font-medium ${source === "devis" ? "bg-surface shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Pied de levage (devis)</button>
              <button type="button" onClick={() => { setSource("autre"); setNom(""); setCapacite(""); }} className={`rounded-md px-3 py-1 font-medium ${source === "autre" ? "bg-surface shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>Autre matériel</button>
            </div>
          )}
          {source === "devis" && aDesPieds && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Pied de levage du devis</span>
              <select
                defaultValue=""
                onChange={(e) => choisirPied(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>Choisir un pied…</option>
                {lignesLevage.map((l, i) => (
                  <option key={i} value={i}>
                    {l.designation}{l.quantite > 1 ? ` ×${l.quantite}` : ""} — {(l.chargeUnitaire * (l.quantite || 1)).toLocaleString("fr-FR")} kg admissibles
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">La charge admissible s&apos;additionne selon la quantité de pieds.</span>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <label className="block text-sm"><span className="mb-1 block font-medium">Nom du pont</span><input name="nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Pont 1" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Charge admissible (kg)</span><input name="capacite_kg" value={capacite} onChange={(e) => setCapacite(e.target.value)} type="number" step="0.1" inputMode="decimal" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">+ Ajouter un pont</button>
          </div>
        </form>
      </div>

      {/* Colonne droite (étroite) : charges NON affectées à glisser */}
      <aside className="mt-4 space-y-3 lg:mt-0 lg:w-56 lg:shrink-0">
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">À affecter</div>
          {nonAffectees.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">{lignes.length === 0 ? "Aucun matériel avec poids." : "Tout est affecté ✓"}</p>
          ) : (
            <div className="divide-y divide-border">
              {nonAffectees.map((l) => {
                const estTraine = dragId === l.id;
                return (
                  <div key={l.id} className={`flex items-center gap-1.5 bg-orange-50/60 px-2 py-2 text-sm dark:bg-orange-950/20 ${estTraine ? "opacity-40" : ""}`}>
                    <button
                      onPointerDown={(e) => onDown(e, l.id)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      title="Glisser vers un pont"
                      aria-label="Glisser vers un pont"
                      className="shrink-0 cursor-grab touch-none px-0.5 text-muted hover:text-foreground active:cursor-grabbing"
                    >
                      ⠿
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{l.designation}</span>
                      <span className="text-xs text-muted">{kg(l.poids)}</span>
                    </span>
                    <AssignSelect action={affecterPont.bind(null, prestationId, l.id)} fieldName="pont_id" value={l.pontId} options={pontOptions} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">Glisse la poignée <strong>⠿</strong> d&apos;une charge sur un pont pour l&apos;affecter.</p>
      </aside>
    </div>
  );
}
