"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { dateFr } from "@/lib/format";

type Evt = { id: string; nom: string; date_event_debut: string | null; client: string | null };

export function AssocierEvenement({
  devisId,
  events,
  action,
  triggerClassName,
}: {
  devisId: string;
  events: Evt[];
  action: (devisId: string, formData: FormData) => void | Promise<void>;
  triggerClassName?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? events.filter((e) => `${e.nom} ${e.client ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : events;

  return (
    <Modal
      trigger={<>Associer à un événement</>}
      title="Associer à un événement"
      triggerClassName={triggerClassName ?? "flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"}
    >
      <div className="space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un événement…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          autoFocus
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted">Aucun événement{q ? " pour cette recherche" : ""}.</p>
          ) : (
            filtered.map((e) => (
              <form key={e.id} action={action.bind(null, devisId)}>
                <input type="hidden" name="prestation_id" value={e.id} />
                <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-primary/40 hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.nom}</span>
                    {e.client && <span className="block truncate text-xs text-muted">{e.client}</span>}
                  </span>
                  {e.date_event_debut && <span className="shrink-0 text-xs text-muted">{dateFr(e.date_event_debut)}</span>}
                </button>
              </form>
            ))
          )}
        </div>

        <div className="border-t border-border pt-3">
          <Link href="/planification" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            + Créer un événement
          </Link>
          <p className="mt-1 text-xs text-muted">Crée l&apos;événement dans Planification, puis reviens l&apos;associer ici.</p>
        </div>
      </div>
    </Modal>
  );
}
