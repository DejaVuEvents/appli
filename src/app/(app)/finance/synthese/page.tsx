import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { FinanceTabs } from "../finance-tabs";
import { syntheseMensuelle, pivotParPoste, typeLabel, MOIS } from "@/lib/finance";
import { euros } from "@/lib/format";
import { Calendrier } from "./calendrier";
import { calculerBilanActifPassif, soldeTresorerieA, type BilanActifPassif } from "@/lib/bilan";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

export default async function SynthesePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; vue?: string }>;
}) {
  const sp = await searchParams;
  const annee = Number(sp?.annee) || new Date().getFullYear();
  const vue = sp?.vue === "journaliere" ? "journaliere" : "mensuelle";

  const supabase = await createClient();
  const [{ data: entData }, { data: ecrData }] = await Promise.all([
    supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("*"),
  ]);
  const ent = entData as ParametresEntreprise | null;
  const ecritures = (ecrData ?? []) as EcritureFinanciere[];
  const soldeInitial = Number(ent?.solde_initial ?? 0);
  const seuil = Number(ent?.seuil_alerte ?? 0);
  const soldeInitialDate = ent?.solde_initial_date ?? null;

  // Pour le Calendrier : on ne passe que les écritures à partir du solde_initial_date
  // afin d'éviter de cumuler les entrées historiques sur le soldeDebutHistoire
  const ecrCalendrier = soldeInitialDate
    ? ecritures.filter((e) => e.date >= soldeInitialDate)
    : ecritures;

  // Bilan Actif/Passif au 31/12 de l'exercice
  const y0 = `${annee}-01-01`, y1 = `${annee}-12-31`;
  let entAn = 0, depAn = 0;
  for (const e of ecritures) {
    if (e.statut !== "reel" || e.date < y0 || e.date > y1) continue;
    if (e.sens === "entree") entAn += Number(e.montant_ttc || 0);
    else depAn += Number(e.montant_ttc || 0);
  }
  const resultatExercice = Math.round((entAn - depAn) * 100) / 100;
  const soldeFin = soldeTresorerieA(ecritures, soldeInitial, soldeInitialDate, `${annee + 1}-01-01`);
  const bilan = await calculerBilanActifPassif(supabase, soldeFin, resultatExercice);

  return (
    <div className="max-w-7xl">
      <PageHeader title="Finance / Trésorerie" />
      <FinanceTabs annee={annee} />

      {/* Sous-onglets */}
      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        <Link
          href={`/finance/synthese?annee=${annee}&vue=mensuelle`}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            vue === "mensuelle" ? "bg-background shadow-sm border border-border" : "text-muted hover:bg-background/60"
          }`}
        >
          Synthèse mensuelle
        </Link>
        <Link
          href={`/finance/synthese?annee=${annee}&vue=journaliere`}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            vue === "journaliere" ? "bg-background shadow-sm border border-border" : "text-muted hover:bg-background/60"
          }`}
        >
          Vue journalière
        </Link>
      </div>

      {vue === "journaliere" ? (
        <Calendrier
          ecritures={ecrCalendrier.map((e) => ({
            date: e.date,
            sens: e.sens,
            montant_ttc: Number(e.montant_ttc),
          }))}
          soldeDebutHistoire={soldeInitial}
          seuil={seuil}
        />
      ) : (
        <MensuellePage ecritures={ecritures} soldeInitial={soldeInitial} soldeInitialDate={soldeInitialDate} seuil={seuil} annee={annee} bilan={bilan} />
      )}
    </div>
  );
}

function MensuellePage({
  ecritures,
  soldeInitial,
  soldeInitialDate,
  seuil,
  annee,
  bilan,
}: {
  ecritures: EcritureFinanciere[];
  soldeInitial: number;
  soldeInitialDate: string | null;
  seuil: number;
  annee: number;
  bilan: BilanActifPassif;
}) {
  const { months, totaux, soldeActuelReel, soldeProjete } = syntheseMensuelle(
    ecritures, soldeInitial, annee, seuil, soldeInitialDate,
  );

  type Ligne =
    | { label: string; get: (m: (typeof months)[number]) => number; total: number; fort?: boolean; color?: (v: number) => string; dim?: boolean }
    | { separator: true; label: string };

  const lignes: Ligne[] = [
    { label: "Entrées réelles", get: (m) => m.entReel, total: totaux.entReel, color: (v) => v > 0 ? "text-green-600" : "" },
    { label: "Sorties réelles", get: (m) => m.depReel, total: totaux.depReel, color: (v) => v > 0 ? "text-red-600" : "" },
    { label: "Solde réel cumulé", get: (m) => m.soldeReelCum, total: soldeActuelReel, fort: true, color: (v) => v < 0 ? "text-red-600" : "text-green-700" },
    { separator: true, label: "Prévisionnel" },
    { label: "Entrées prévisionnelles", get: (m) => m.entPrev, total: totaux.entPrev, color: (v) => v > 0 ? "text-green-600" : "", dim: true },
    { label: "Sorties prévisionnelles", get: (m) => m.depPrev, total: totaux.depPrev, color: (v) => v > 0 ? "text-red-600" : "", dim: true },
    { label: "Solde projeté cumulé", get: (m) => m.soldeProjCum, total: soldeProjete, fort: true, color: (v) => v < 0 ? "text-red-600" : "text-green-700", dim: true },
  ];

  const pivotReel = pivotParPoste(ecritures, annee, "sortie", "reel");
  const pivotPrev = pivotParPoste(ecritures, annee, "sortie", "previsionnel");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <span>Solde réel : <strong className={soldeActuelReel < 0 ? "text-red-600" : "text-green-700"}>{euros(soldeActuelReel)}</strong></span>
        <span className="text-muted">·</span>
        <span>Solde projeté fin d&apos;année : <strong className={soldeProjete < 0 ? "text-red-600" : "text-green-700"}>{euros(soldeProjete)}</strong></span>
        <a href={`/finance/bilan/pdf?annee=${annee}`} className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background">Compte de résultat + bilan {annee} (PDF)</a>
      </div>

      <Card className="mb-8 overflow-x-auto">
        <table className="w-full border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left">Poste</th>
              {MOIS.map((m) => <th key={m} className="px-2 py-2">{m.slice(0, 3)}</th>)}
              <th className="px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((row, i) => {
              if ("separator" in row) {
                return (
                  <tr key={`sep-${i}`}>
                    <td className="sticky left-0 z-10 bg-blue-50 px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-blue-600/70 dark:bg-blue-950/40 dark:text-blue-300/70">
                      {row.label}
                    </td>
                    <td colSpan={13} className="bg-blue-50 border-t border-blue-100 dark:bg-blue-950/40 dark:border-blue-900/40" />
                  </tr>
                );
              }
              const colorCls = row.color ? row.color(row.total) : "";
              const stickyBg = row.fort ? "bg-background" : "bg-surface";
              return (
                <tr key={row.label} className={`border-b border-border/60 ${row.dim ? "opacity-80" : ""}`}>
                  <td className={`sticky left-0 z-10 ${stickyBg} px-3 py-1.5 text-left ${row.fort ? "font-semibold" : ""}`}>{row.label}</td>
                  {months.map((m) => {
                    const v = row.get(m);
                    return (
                      <td key={m.mois} className={`px-2 py-1.5 ${row.color ? row.color(v) : ""} ${row.fort ? "font-semibold" : ""}`}>
                        {v ? euros(v) : "—"}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-1.5 ${row.fort ? "font-semibold" : ""} ${colorCls}`}>{euros(row.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Bilan Actif / Passif */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Bilan au 31/12/{annee} (simplifié)</h2>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Actif <span className="text-xs font-normal text-muted">— ce que possède l&apos;association</span></h3>
          <BilanLigne label="Immobilisations (matériel, brut)" valeur={bilan.immobilisations} />
          <BilanLigne label="Créances clients (factures dues)" valeur={bilan.creances} />
          <BilanLigne label="Trésorerie (banque)" valeur={bilan.tresorerie} />
          <BilanTotal label="Total actif" valeur={bilan.totalActif} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Passif <span className="text-xs font-normal text-muted">— ressources & dettes</span></h3>
          <BilanLigne label="Report à nouveau" valeur={bilan.reportANouveau} />
          <BilanLigne label="Résultat de l'exercice" valeur={bilan.resultatExercice} signe color={bilan.resultatExercice >= 0 ? "text-green-600" : "text-red-600"} />
          <BilanLigne label="Fonds propres" valeur={bilan.fondsPropres} fort />
          <BilanLigne label="Dettes fournisseurs" valeur={bilan.dettesFournisseurs} color="text-red-600" />
          <BilanTotal label="Total passif" valeur={bilan.totalPassif} />
        </Card>
      </div>
      <p className="-mt-6 mb-8 text-xs text-muted">
        Immobilisations en valeur d&apos;achat brute (amortissements non suivis) · créances/dettes = encours à date · le report à nouveau équilibre l&apos;actif et le passif. Document indicatif.
      </p>

      <DepensesVisual pivot={pivotReel} label="Dépenses réelles par poste" className="mb-6" />
      <DepensesVisual pivot={pivotPrev} label="Dépenses prévisionnelles par poste" />
    </>
  );
}

function BilanLigne({ label, valeur, fort, signe, color }: { label: string; valeur: number; fort?: boolean; signe?: boolean; color?: string }) {
  return (
    <div className={`flex items-center justify-between border-b border-border/60 py-1.5 text-sm ${fort ? "font-semibold" : ""}`}>
      <span className={fort ? "" : "text-muted"}>{label}</span>
      <span className={`tabular-nums ${color ?? ""}`}>{signe && valeur >= 0 ? "+" : ""}{euros(valeur)}</span>
    </div>
  );
}

function BilanTotal({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="mt-2 flex items-center justify-between border-t-2 border-border pt-2 text-sm font-bold">
      <span>{label}</span>
      <span className="tabular-nums">{euros(valeur)}</span>
    </div>
  );
}

const PALETTE = [
  { bar: "#3b82f6", dim: "#dbeafe" },
  { bar: "#10b981", dim: "#d1fae5" },
  { bar: "#f59e0b", dim: "#fef3c7" },
  { bar: "#ef4444", dim: "#fee2e2" },
  { bar: "#8b5cf6", dim: "#ede9fe" },
  { bar: "#06b6d4", dim: "#cffafe" },
  { bar: "#f97316", dim: "#ffedd5" },
];

function DepensesVisual({
  pivot,
  label,
  className = "",
}: {
  pivot: { type: string; lignes: { spec: string; total: number }[]; total: number }[];
  label: string;
  className?: string;
}) {
  if (pivot.length === 0) return null;
  const grandTotal = pivot.reduce((s, g) => s + g.total, 0);
  const segments = pivot.map((g, i) => ({
    ...g,
    pct: grandTotal > 0 ? (g.total / grandTotal) * 100 : 0,
    pal: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className={className}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{label}</h2>
      <Card className="p-5">
        {/* Barre empilée horizontale */}
        <div className="mb-1 flex h-8 w-full overflow-hidden rounded-lg">
          {segments.map((s) => (
            <div
              key={s.type}
              className="h-full transition-all"
              style={{ width: `${s.pct}%`, background: s.pal.bar }}
              title={`${typeLabel(s.type)} : ${euros(s.total)} (${Math.round(s.pct)}%)`}
            />
          ))}
        </div>
        <div className="mb-5 flex justify-between text-xs text-muted">
          <span>0 €</span>
          <span className="font-semibold text-foreground">{euros(grandTotal)} total</span>
        </div>

        {/* Légende détaillée */}
        <div className="space-y-4">
          {segments.map((s) => (
            <div key={s.type}>
              {/* En-tête catégorie */}
              <div className="flex items-center gap-2.5 mb-2">
                <div className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: s.pal.bar }} />
                <span className="flex-1 font-medium">{typeLabel(s.type)}</span>
                <span className="text-sm font-semibold">{euros(s.total)}</span>
                <span className="w-9 text-right text-xs text-muted">{Math.round(s.pct)}%</span>
              </div>
              {/* Barre proportion */}
              <div className="ml-6 mb-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: s.pal.dim }}>
                  <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.pal.bar }} />
                </div>
              </div>
              {/* Sous-catégories */}
              <div className="ml-6 space-y-1">
                {s.lignes.map((l) => (
                  <div key={l.spec} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 text-muted truncate">{l.spec}</span>
                    <div
                      className="w-24 overflow-hidden rounded-full"
                      style={{ background: s.pal.dim, height: "3px" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${s.total > 0 ? (l.total / s.total) * 100 : 0}%`, background: s.pal.bar, opacity: 0.7 }}
                      />
                    </div>
                    <span className="w-16 text-right text-muted">{euros(l.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
