"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { toggleTache, deleteTache, ajouterTachePerso } from "./reunions/actions";

export type TachePerso = { id: string; texte: string; fait: boolean; source_type: string };

export function MesTaches({ taches }: { taches: TachePerso[] }) {
  const [texte, setTexte] = useState("");
  const aFaire = taches.filter((t) => !t.fait);
  const faites = taches.filter((t) => t.fait);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Mes tâches</h2>
        <span className="text-xs text-muted">{aFaire.length} à faire</span>
      </div>

      <div className="space-y-1">
        {aFaire.length === 0 && faites.length === 0 && (
          <p className="py-1 text-sm text-muted">Aucune tâche. Les actions issues des réunions apparaîtront ici.</p>
        )}
        {aFaire.map((t) => (
          <div key={t.id} className="group flex items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-background">
            <form action={toggleTache.bind(null, t.id, t.fait)}>
              <button className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border hover:border-primary" title="Marquer fait" />
            </form>
            <span className="min-w-0 flex-1 text-sm">{t.texte}</span>
            {t.source_type === "reunion" && <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" title="Issue d'une réunion">réunion</span>}
            <form action={deleteTache.bind(null, t.id)}>
              <button className="shrink-0 text-muted opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" title="Supprimer">✕</button>
            </form>
          </div>
        ))}
      </div>

      {/* Ajout rapide */}
      <form action={ajouterTachePerso} className="mt-2 flex gap-2">
        <input
          name="texte"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="+ Ajouter une tâche…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        />
        <button className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">Ajouter</button>
      </form>

      {faites.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">{faites.length} tâche(s) terminée(s)</summary>
          <div className="mt-1 space-y-1">
            {faites.map((t) => (
              <div key={t.id} className="flex items-start gap-2.5 rounded-lg px-1 py-1">
                <form action={toggleTache.bind(null, t.id, t.fait)}>
                  <button className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary bg-primary text-[10px] text-primary-foreground" title="Rouvrir">✓</button>
                </form>
                <span className="min-w-0 flex-1 text-sm text-muted line-through">{t.texte}</span>
                <form action={deleteTache.bind(null, t.id)}>
                  <button className="shrink-0 text-muted hover:text-red-600" title="Supprimer">✕</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
