import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { FinanceTabs } from "./finance-tabs";
import { syntheseMensuelle } from "@/lib/finance";
import { euros, dateFr } from "@/lib/format";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

export default async function FinanceDashboard({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();
  const [{ data: entData }, { data: ecrData }, { data: cliDues }, { data: fouDues }] = await Promise.all([
    supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("*"),
    supabase
      .from("devis_facture")
      .select("devis_id, numero, montant_ttc, statut_paiement, date_echeance, prestation:prestation_id(client(nom))")
      .eq("type", "facture").in("statut_paiement", ["en_attente", "retard"]).not("numero", "is", null),
    supabase
      .from("facture_fournisseur")
      .select("id, fournisseur, numero, montant_ttc, date_echeance, statut_paiement")
      .neq("statut_paiement", "paye"),
  ]);
  const ent = entData as ParametresEntreprise | null;
  const ecritures = (ecrData ?? []) as EcritureFinanciere[];
  const seuil = Number(ent?.seuil_alerte ?? 0);
  const { months, totaux, soldeActuelReel, soldeProjete } = syntheseMensuelle(
    ecritures, Number(ent?.solde_initial ?? 0), annee, seuil, ent?.solde_initial_date ?? null,
  );

  const now = new Date();
  const moisIdx = annee === now.getFullYear() ? now.getMonth() : 11;
  const soldeProjeteFinMois = months[moisIdx]?.soldeProjCum ?? soldeProjete;
  const today = now.toISOString().slice(0, 10);

  // Créances : qui nous doit (factures clients impayées) / à qui nous devons (fournisseurs).
  type Cli = { devis_id: string; numero: string | null; montant_ttc: number | null; statut_paiement: string | null; date_echeance: string | null; prestation: { client: { nom: string } | null } | null };
  type Fou = { id: string; fournisseur: string | null; numero: string | null; montant_ttc: number | null; date_echeance: string | null; statut_paiement: string | null };
  const clients = ((cliDues ?? []) as unknown as Cli[]).sort((a, b) => (a.date_echeance ?? "9999").localeCompare(b.date_echeance ?? "9999"));
  const fournisseurs = ((fouDues ?? []) as Fou[]).sort((a, b) => (a.date_echeance ?? "9999").localeCompare(b.date_echeance ?? "9999"));
  const totalDu = clients.reduce((s, c) => s + Number(c.montant_ttc ?? 0), 0);
  const totalAPayer = fournisseurs.reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0);

  const mainCards = [
    { label: "Solde actuel (réel)", value: soldeActuelReel, color: soldeActuelReel < 0 ? "text-red-600" : "text-foreground" },
    { label: "Entrées réelles", value: totaux.entReel, color: "text-green-700 dark:text-green-400" },
    { label: "Sorties réelles", value: totaux.depReel, color: "text-red-600" },
  ];
  const projCards = [
    { label: "Projeté — fin du mois", value: soldeProjeteFinMois },
    { label: "Projeté — fin d'année", value: soldeProjete },
  ];

  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.soldeProjCum)));
  const H = 72; // hauteur max d'un bâton (px)

  return (
    <div className="max-w-7xl">
      <PageHeader title="Finance / Trésorerie" />
      <FinanceTabs annee={annee} />

      {/* KPI principaux */}
      <div className="grid grid-cols-3 gap-3">
        {mainCards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className={`text-xl font-bold ${c.color}`}>{euros(c.value)}</div>
            <div className="mt-0.5 text-xs text-muted">{c.label}</div>
          </Card>
        ))}
      </div>
      {/* Projections (plus petites) */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {projCards.map((c) => (
          <Card key={c.label} className="px-4 py-3">
            <div className={`text-base font-semibold ${c.value < 0 ? "text-red-600" : "text-foreground"}`}>{euros(c.value)}</div>
            <div className="mt-0.5 text-xs text-muted">{c.label}</div>
          </Card>
        ))}
      </div>

      {/* Graphe solde projeté — largeur réduite, bâtons plus hauts */}
      <Card className="mt-6 max-w-2xl p-5">
        <h2 className="mb-4 text-sm font-semibold">Solde projeté cumulé — {annee}</h2>
        <div className="flex items-stretch gap-1.5">
          {months.map((m) => {
            const v = m.soldeProjCum;
            const h = Math.round((Math.abs(v) / maxAbs) * H);
            const color = v < 0 ? "bg-red-500" : v < seuil ? "bg-amber-500" : "bg-green-500";
            return (
              <div key={m.mois} className="flex-1" title={`${m.mois} : ${euros(v)}`}>
                <div className="flex items-end justify-center" style={{ height: H }}>
                  {v >= 0 && <div className={`w-3.5 rounded-t ${color}`} style={{ height: `${h}px` }} />}
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-start justify-center" style={{ height: H }}>
                  {v < 0 && <div className={`w-3.5 rounded-b ${color}`} style={{ height: `${h}px` }} />}
                </div>
                <div className="mt-1 text-center text-[10px] text-muted">{m.mois.slice(0, 3)}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Créances : qui nous doit / à qui nous devons */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* À encaisser — clients */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">💰 On nous doit (à encaisser)</h2>
            <span className="text-sm font-bold text-green-700 dark:text-green-400">{euros(totalDu)}</span>
          </div>
          {clients.length === 0 ? (
            <p className="text-sm text-muted">Aucune facture client en attente 👍</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {clients.map((c) => {
                const enRetard = c.statut_paiement === "retard" || (c.date_echeance && c.date_echeance < today);
                return (
                  <Link key={c.devis_id} href={`/prestations/devis/${c.devis_id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-background">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.prestation?.client?.nom ?? "Client"}</span>
                      <span className="text-xs text-muted">Facture n°{c.numero ?? "—"}{c.date_echeance ? ` · échéance ${dateFr(c.date_echeance)}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{euros(c.montant_ttc)}</span>
                      {enRetard && <span className="text-[10px] font-semibold text-red-600">⚠ en retard · relancer</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        {/* À payer — fournisseurs */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">🧾 On doit (à payer)</h2>
            <span className="text-sm font-bold text-red-600">{euros(totalAPayer)}</span>
          </div>
          {fournisseurs.length === 0 ? (
            <p className="text-sm text-muted">Aucune facture fournisseur en attente 👍</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {fournisseurs.map((f) => {
                const enRetard = f.statut_paiement === "retard" || (f.date_echeance && f.date_echeance < today);
                return (
                  <Link key={f.id} href="/finance/fournisseurs" className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-background">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{f.fournisseur ?? "Fournisseur"}</span>
                      <span className="text-xs text-muted">{f.numero ? `N°${f.numero}` : ""}{f.date_echeance ? ` · échéance ${dateFr(f.date_echeance)}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{euros(f.montant_ttc)}</span>
                      {enRetard && <span className="text-[10px] font-semibold text-red-600">⚠ en retard</span>}
                    </span>
                  </Link>
                );
              })}
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
