"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { EtatConstateSelect } from "./etat-select";
import { togglePresent, setEtatConstate, setRemarqueInventaire } from "../actions";

type LigneRow = {
  id: string;
  present: boolean;
  etat_constate: string | null;
  remarque_maintenance: string | null;
  unite_id: string;
  unite: {
    numero_serie: string | null;
    qr_code: string | null;
    reference: { nom: string } | null;
  } | null;
};

export function InventaireListe({ sessionId, lignes }: { sessionId: string; lignes: LigneRow[] }) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "a_pointer" | "pointes">("tous");

  const filtrees = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (filtre === "a_pointer" && l.present) return false;
      if (filtre === "pointes" && !l.present) return false;
      if (!lq) return true;
      const ref = l.unite?.reference?.nom ?? "";
      const num = l.unite?.numero_serie ?? "";
      return `${ref} ${num}`.toLowerCase().includes(lq);
    });
  }, [lignes, q, filtre]);

  // Regroupement par référence
  const groupes = useMemo(() => {
    const m = new Map<string, LigneRow[]>();
    for (const l of filtrees) {
      const nom = l.unite?.reference?.nom ?? "Sans référence";
      if (!m.has(nom)) m.set(nom, []);
      m.get(nom)!.push(l);
    }
    return [...m.entries()];
  }, [filtrees]);

  const chip = (v: typeof filtre, label: string) => (
    <button
      onClick={() => setFiltre(v)}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${filtre === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-background"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Recherche + filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔎 Rechercher (référence, n° de série)…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-8 text-sm"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Effacer">✕</button>
          )}
        </div>
        {chip("tous", "Tous")}
        {chip("a_pointer", "À pointer")}
        {chip("pointes", "Pointés")}
      </div>

      {groupes.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-muted">Aucune unité ne correspond.</Card>
      ) : (
        groupes.map(([nom, items]) => (
          <div key={nom}>
            <h3 className="mb-1 text-sm font-semibold">{nom} <span className="text-muted">· {items.length}</span></h3>
            <Card className="divide-y divide-border overflow-hidden">
              {items.map((l) => (
                <div key={l.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <form action={togglePresent.bind(null, sessionId, l.id)}>
                      <button
                        type="submit"
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-base ${l.present ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                        title={l.present ? "Présent" : "Marquer présent"}
                      >
                        {l.present ? "✓" : ""}
                      </button>
                    </form>
                    <Link href={`/u/${l.unite?.qr_code || l.unite_id}`} className="flex-1 truncate font-medium hover:underline">
                      {l.unite?.numero_serie || "Unité"}
                    </Link>
                    <EtatConstateSelect action={setEtatConstate.bind(null, sessionId, l.id, l.unite_id)} etat={l.etat_constate} />
                  </div>
                  <form action={setRemarqueInventaire.bind(null, sessionId, l.id)} className="mt-2 flex gap-1">
                    <input
                      name="remarque"
                      defaultValue={l.remarque_maintenance ?? ""}
                      placeholder="Remarque / maintenance…"
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background" title="Enregistrer la remarque">💾</button>
                  </form>
                </div>
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
