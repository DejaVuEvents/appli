"use client";

import { useMemo, useState } from "react";
import { DateInput } from "@/components/date-input";
import { JustificatifPreview } from "@/components/justificatif-preview";
import Link from "next/link";
import { euros, dateFr } from "@/lib/format";
import { FilterDrawer } from "@/components/filter-drawer";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteNoteFrais } from "./actions";
import { STATUT_NDF_LABELS, TYPE_NDF_LABELS, type StatutNoteFrais, type TypeNoteFrais } from "@/lib/types";

const delBtn = "shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30";

const STATUT_CLS: Record<StatutNoteFrais, string> = {
  brouillon: "bg-surface text-muted",
  soumise: "bg-amber-100 text-amber-800",
  validee: "bg-green-100 text-green-700",
  refusee: "bg-red-100 text-red-700",
};

const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export type NoteLite = {
  id: string;
  titre: string | null;
  type_ndf: TypeNoteFrais;
  statut: StatutNoteFrais;
  demandeur_id: string | null;
  demandeur_nom: string;
  created_at: string;
  total: number;
  paye?: boolean;
};

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function NotesFraisListe({ notes, membres }: { notes: NoteLite[]; membres: { id: string; nom: string }[] }) {
  const [q, setQ] = useState("");
  const [auteur, setAuteur] = useState("");
  const [statut, setStatut] = useState("");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [prixMin, setPrixMin] = useState("");
  const [prixMax, setPrixMax] = useState("");

  const filtres = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return notes.filter((n) => {
      if (lq && !`${n.titre ?? ""} ${n.demandeur_nom}`.toLowerCase().includes(lq)) return false;
      if (auteur && n.demandeur_id !== auteur) return false;
      if (statut && n.statut !== statut) return false;
      const jour = n.created_at.slice(0, 10);
      if (dateMin && jour < dateMin) return false;
      if (dateMax && jour > dateMax) return false;
      if (prixMin && n.total < parseFloat(prixMin)) return false;
      if (prixMax && n.total > parseFloat(prixMax)) return false;
      return true;
    });
  }, [notes, q, auteur, statut, dateMin, dateMax, prixMin, prixMax]);

  // Groupage par mois (created_at desc)
  const groupes = useMemo(() => {
    const map = new Map<string, NoteLite[]>();
    for (const n of [...filtres].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const key = n.created_at.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return [...map.entries()];
  }, [filtres]);

  const activeCount = [q, auteur, statut, dateMin, dateMax, prixMin, prixMax].filter(Boolean).length;
  const reset = () => { setQ(""); setAuteur(""); setStatut(""); setDateMin(""); setDateMax(""); setPrixMin(""); setPrixMax(""); };

  const monthLabel = (key: string) => { const [y, m] = key.split("-"); return `${MOIS_FR[parseInt(m, 10) - 1]} ${y}`; };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{filtres.length} note{filtres.length > 1 ? "s" : ""} · {euros(filtres.reduce((s, n) => s + n.total, 0))}</span>
        <FilterDrawer activeCount={activeCount} onReset={reset} title="Filtrer les notes de frais">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Recherche</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Intitulé, demandeur…" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Auteur</span>
            <select value={auteur} onChange={(e) => setAuteur(e.target.value)} className={input}>
              <option value="">Tous</option>
              {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Statut</span>
            <select value={statut} onChange={(e) => setStatut(e.target.value)} className={input}>
              <option value="">Tous</option>
              {(Object.keys(STATUT_NDF_LABELS) as StatutNoteFrais[]).map((s) => <option key={s} value={s}>{STATUT_NDF_LABELS[s]}</option>)}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium">Période</span>
            <div className="grid grid-cols-2 gap-2">
              <DateInput value={dateMin} onChange={setDateMin} />
              <DateInput value={dateMax} onChange={setDateMax} />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">Montant (€)</span>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.01" value={prixMin} onChange={(e) => setPrixMin(e.target.value)} placeholder="Min" className={input} />
              <input type="number" step="0.01" value={prixMax} onChange={(e) => setPrixMax(e.target.value)} placeholder="Max" className={input} />
            </div>
          </div>
        </FilterDrawer>
      </div>

      {groupes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">Aucune note de frais.</div>
      ) : (
        <div className="space-y-4">
          {groupes.map(([key, items]) => (
            <div key={key}>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{monthLabel(key)}</h3>
                <span className="text-xs text-muted">{euros(items.reduce((s, n) => s + n.total, 0))}</span>
              </div>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {items.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
                    <Link href={`/notes-frais/${n.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{n.titre || "Note de frais"}</div>
                        <div className="text-xs text-muted">{TYPE_NDF_LABELS[n.type_ndf]} · {n.demandeur_nom} · {dateFr(n.created_at)}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-semibold">{euros(n.total)}</span>
                        {n.paye ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-950/50 dark:text-green-300">Remboursée</span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUT_CLS[n.statut]}`}>{STATUT_NDF_LABELS[n.statut]}</span>
                        )}
                      </div>
                    </Link>
                    {/* Aperçu du PDF sans quitter la liste */}
                    <JustificatifPreview url={`/notes-frais/${n.id}/pdf`} libelle={n.titre || "Note de frais"} />
                    <form action={deleteNoteFrais.bind(null, n.id)}>
                      <ConfirmButton confirm={`Supprimer la note de frais « ${n.titre || "Note de frais"} » ?`} className={delBtn} title="Supprimer">✕</ConfirmButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
