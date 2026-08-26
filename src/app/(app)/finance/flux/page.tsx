import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { FinanceTabs } from "../finance-tabs";
import { fluxJournalier } from "@/lib/finance";
import { euros, dateFr } from "@/lib/format";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

const STATUT_CLS = { ok: "text-green-600", faible: "text-amber-600", decouvert: "text-red-600" } as const;
const STATUT_LBL = { ok: "OK", faible: "Faible", decouvert: "Découvert" } as const;

export default async function FluxPage({
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
  const { rows, premierDecouvert } = fluxJournalier(
    ecritures, Number(ent?.solde_initial ?? 0), annee, seuil, ent?.solde_initial_date ?? null,
  );

  return (
    <div className="max-w-7xl">
      <PageHeader title="Comptabilité" />
      <FinanceTabs annee={annee} />

      <p className="mb-4 text-sm text-muted">
        Solde cumulé <strong>projeté</strong> (réel + prévisionnel), jour par jour, sur les dates avec mouvement.
        Seuil d&apos;alerte : {euros(seuil)}.
        {premierDecouvert && (
          <span className="ml-1 font-medium text-red-600">1er découvert : {dateFr(premierDecouvert)}.</span>
        )}
      </p>

      {rows.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-muted">Aucun mouvement en {annee}.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-2 py-2">Entrées réel</th>
                <th className="px-2 py-2">Entrées prév</th>
                <th className="px-2 py-2">Sorties réel</th>
                <th className="px-2 py-2">Sorties prév</th>
                <th className="px-2 py-2">Flux net</th>
                <th className="px-3 py-2">Solde cumulé</th>
                <th className="px-2 py-2 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="border-b border-border/60">
                  <td className="px-3 py-1.5 text-left">{dateFr(r.date)}</td>
                  <td className="px-2 py-1.5">{r.entR ? euros(r.entR) : "—"}</td>
                  <td className="px-2 py-1.5 text-muted">{r.entP ? euros(r.entP) : "—"}</td>
                  <td className="px-2 py-1.5">{r.depR ? euros(r.depR) : "—"}</td>
                  <td className="px-2 py-1.5 text-muted">{r.depP ? euros(r.depP) : "—"}</td>
                  <td className={r.net < 0 ? "px-2 py-1.5 text-red-600" : "px-2 py-1.5 text-green-600"}>
                    {r.net >= 0 ? "+" : ""}{euros(r.net)}
                  </td>
                  <td className={`px-3 py-1.5 font-medium ${r.solde < 0 ? "text-red-600" : ""}`}>{euros(r.solde)}</td>
                  <td className={`px-2 py-1.5 text-center font-medium ${STATUT_CLS[r.statut]}`}>{STATUT_LBL[r.statut]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
