"use client";

import { useState, useRef, useEffect } from "react";
import { saveNote } from "./actions";

/**
 * Cellule d'avancement éditable en place : affiche la note ; au clic, un champ
 * texte apparaît directement (sans changer de semaine). Enregistre via l'action
 * serveur puis se referme. `current` surligne la vraie semaine en cours.
 */
export function EditableCell({
  projetId,
  annee,
  semaine,
  note,
  current = false,
  reporte = false,
  fallback = "",
}: {
  projetId: string;
  annee: number;
  semaine: number;
  note: string;
  current?: boolean;
  reporte?: boolean;
  fallback?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const v = ref.current.value;
      ref.current.setSelectionRange(v.length, v.length);
    }
  }, [editing]);

  if (editing) {
    return (
      <form
        action={async (fd) => { setSaving(true); await saveNote(projetId, annee, semaine, fd); setSaving(false); setEditing(false); }}
        className="space-y-1"
      >
        <textarea
          ref={ref}
          name="note"
          defaultValue={note || fallback}
          rows={4}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.currentTarget.form?.requestSubmit(); }
          }}
          className="w-full rounded-lg border border-primary bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex items-center gap-1">
          <button disabled={saving} className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">
            {saving ? "…" : "Enregistrer"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2 py-0.5 text-[11px] text-muted hover:text-foreground">Annuler</button>
          <span className="ml-auto text-[10px] text-muted">⌘↵</span>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full whitespace-pre-line rounded-md px-1.5 py-1 text-left text-xs leading-snug hover:bg-primary/5"
      title="Cliquer pour modifier"
    >
      {reporte && !note && <span className="mb-0.5 block text-[10px] font-semibold text-primary">↩ à reporter</span>}
      {note ? (
        <span className={current ? "" : "text-foreground/80"}>{note}</span>
      ) : (
        <span className="text-muted/40">—</span>
      )}
    </button>
  );
}
