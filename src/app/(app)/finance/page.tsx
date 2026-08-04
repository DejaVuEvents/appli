import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { FinanceTabs } from "./finance-tabs";
import { syntheseMensuelle, topCategories, typeLabel, type AlerteSolva } from "@/lib/finance";
import { euros } from "@/lib/format";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

const ALERTE: Record<AlerteSolva, { label: string; cls: string; dot: string }> = {
  ok: { label: "OK", cls: "text-green-600", dot: "bg-green-500" },
  faible: { label: "Faible", cls: "text-amber-600", dot: "bg-amber-500" },
  deficit: { label: "Déficit / découvert", cls: "text-red-600", dot: "bg-red-500" },
};

export default async function FinanceDashboard({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();
  const [{ data: entData }, { data: ecrData }] = await Promise.all([
    supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("*"),
  ]);
  const ent = entData as ParametresEntreprise | null;
  const ecritures = (ecrData ?? []) as EcritureFinanciere[];
  const seuil = Number(ent?.seuil_alerte ?? 0);
  const { months, totaux, soldeActuelReel, soldeProjete } = syntheseMensuelle(
    ecritures, Number(ent?.solde_initial ?? 0), annee, seuil, ent?.solde_initial_date ?? null,
  );

  const cards = [
    { label: "Solde actuel (réel)", value: soldeActuelReel, color: soldeActuelReel < 0 ? "text-red-600" : "text-foreground" },
    { label: "Solde projeté (fin d'année)", value: soldeProjete, color: soldeProjete < 0 ? "text-red-600" : "text-green-600" },
    { label: "Entrées réelles", value: totaux.entReel, color: "text-foreground" },
    { label: "Sorties réelles", value: totaux.depReel, color: "text-foreground" },
  ];

  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.soldeProjCum)));
  const moisRisque = months.filter((m) => m.alerte !== "ok");
  const topDep = topCategories(ecritures, annee, "sortie", "reel");
  const maxDep = Math.max(1, ...topDep.map((t) => t.total));

  return (
    <div className="max-w-7xl">
      <PageHeader title="Finance / Trésorerie" />
      <FinanceTabs annee={annee} />

      {/* Cartes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className={`text-xl font-bold ${c.color}`}>{euros(c.value)}</div>
            <div className="mt-0.5 text-xs text-muted">{c.label}</div>
          </Card>
        ))}
      </div>

      {/* Graphe solde projeté */}
      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold">Solde projeté cumulé — {annee}</h2>
        <div className="flex items-stretch gap-1">
          {months.map((m) => {
            const v = m.soldeProjCum;
            const h = Math.round((Math.abs(v) / maxAbs) * 44);
            const color = v < 0 ? "bg-red-500" : v < seuil ? "bg-amber-500" : "bg-green-500";
            return (
              <div key={m.mois} className="flex-1" title={`${m.mois} : ${euros(v)}`}>
                <div className="flex h-11 items-end justify-center">
                  {v >= 0 && <div className={`w-3 rounded-t ${color}`} style={{ height: `${h}px` }} />}
                </div>
                <div className="h-px bg-border" />
                <div className="flex h-11 items-start justify-center">
                  {v < 0 && <div className={`w-3 rounded-b ${color}`} style={{ height: `${h}px` }} />}
                </div>
                <div className="mt-1 text-center text-[10px] text-muted">{m.mois.slice(0, 3)}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Mois à risque */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Mois à risque</h2>
          {moisRisque.length === 0 ? (
            <p className="text-sm text-muted">Aucun mois sous le seuil 👍</p>
          ) : (
            <div className="space-y-2">
              {moisRisque.map((m) => (
                <div key={m.mois} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${ALERTE[m.alerte].dot}`} />
                    {m.mois}
                  </span>
                  <span className={ALERTE[m.alerte].cls}>{euros(m.soldeProjCum)} · {ALERTE[m.alerte].label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Top dépenses par catégorie (réel) */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Dépenses par catégorie (réel)</h2>
          {topDep.length === 0 ? (
            <p className="text-sm text-muted">Aucune dépense réelle cette année.</p>
          ) : (
            <div className="space-y-2">
              {topDep.map((t) => (
                <div key={t.type}>
                  <div className="flex justify-between text-sm">
                    <span>{typeLabel(t.type)}</span>
                    <span className="text-muted">{euros(t.total)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((t.total / maxDep) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {!ent?.solde_initial && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          💡 Renseigne le <strong>solde initial</strong> dans ⚙️ Paramètres → Trésorerie pour des soldes exacts.
        </p>
      )}
    </div>
  );
}
