import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { FinanceTabs } from "./finance-tabs";
import { SoldeProjeteChart } from "./solde-chart";
import { InfoHint } from "@/components/info-hint";
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
  const [{ data: entData }, { data: ecrData }, { data: cliDues }, { data: fouDues }, { data: ndfData }, { data: membresData }] = await Promise.all([
    supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("*"),
    supabase
      .from("devis_facture")
      .select("devis_id, prestation_id, numero, montant_ttc, statut_paiement, date_echeance, prestation:prestation_id(client(nom))")
      .eq("type", "facture").in("statut_paiement", ["en_attente", "retard"]).not("numero", "is", null),
    supabase
      .from("facture_fournisseur")
      .select("id, fournisseur, numero, montant_ttc, date_echeance, statut_paiement")
      .neq("statut_paiement", "paye"),
    supabase
      .from("note_frais")
      .select("id, titre, demandeur_id, ecriture_id, created_at, lignes:ligne_note_frais(montant_ttc)")
      .eq("statut", "validee"),
    supabase.from("membre").select("id, prenom, nom"),
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
  type Cli = { devis_id: string; prestation_id: string | null; numero: string | null; montant_ttc: number | null; statut_paiement: string | null; date_echeance: string | null; prestation: { client: { nom: string } | null } | null };
  type Fou = { id: string; fournisseur: string | null; numero: string | null; montant_ttc: number | null; date_echeance: string | null; statut_paiement: string | null };
  // Uniquement les FACTURES en retard de paiement (statut « retard » ou échéance dépassée) — pas les devis, pas les factures non échues.
  const clients = ((cliDues ?? []) as unknown as Cli[])
    .filter((c) => c.statut_paiement === "retard" || (c.date_echeance != null && c.date_echeance < today))
    .sort((a, b) => (a.date_echeance ?? "9999").localeCompare(b.date_echeance ?? "9999"));
  const fournisseurs = ((fouDues ?? []) as Fou[]).sort((a, b) => (a.date_echeance ?? "9999").localeCompare(b.date_echeance ?? "9999"));

  // NDF validées non encore remboursées (écriture liée pas encore « réelle »).
  type Ndf = { id: string; titre: string | null; demandeur_id: string | null; ecriture_id: string | null; created_at: string; lignes: { montant_ttc: number }[] };
  const ecrReelSet = new Set(ecritures.filter((e) => e.statut === "reel").map((e) => e.id));
  const membreNom = new Map((membresData ?? []).map((m) => {
    const mm = m as { id: string; prenom: string | null; nom: string | null };
    return [mm.id, [mm.prenom, mm.nom].filter(Boolean).join(" ") || "—"];
  }));
  const ndfAPayer = ((ndfData ?? []) as unknown as Ndf[])
    .filter((n) => !(n.ecriture_id && ecrReelSet.has(n.ecriture_id)))
    .map((n) => ({ id: n.id, titre: n.titre ?? "Note de frais", qui: membreNom.get(n.demandeur_id ?? "") ?? "—", montant: (n.lignes ?? []).reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0), created_at: n.created_at }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const totalDu = clients.reduce((s, c) => s + Number(c.montant_ttc ?? 0), 0);
  const totalAPayer = fournisseurs.reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0) + ndfAPayer.reduce((s, n) => s + n.montant, 0);

  // Série multi-années pour le graphe à fenêtre glissante navigable.
  // Libellés courts DISTINCTS (Juin ≠ Juil) + clé AAAA-MM, comparable en tant que
  // chaîne (« 2026-02 » et non « 2026-1 », qui passerait pour postérieur à « 2026-09 »).
  const MOIS_COURT = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
  const anneesSerie = [annee - 1, annee, annee + 1];
  const serieSolde = anneesSerie.flatMap((y) =>
    syntheseMensuelle(ecritures, Number(ent?.solde_initial ?? 0), y, seuil, ent?.solde_initial_date ?? null)
      .months.map((mo, i) => ({ key: `${y}-${String(i + 1).padStart(2, "0")}`, label: `${MOIS_COURT[i]} ${String(y).slice(2)}`, value: mo.soldeProjCum })),
  );

  const stat = (label: string, value: number, cls: string) => (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${cls}`}>{euros(value)}</span>
    </div>
  );

  return (
    <div className="max-w-6xl">
      <PageHeader title="Comptabilité" />
      <FinanceTabs annee={annee} />

      {/* Résumé : 3 cartes alignées */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted">Solde actuel</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${soldeActuelReel < 0 ? "text-red-600" : "text-foreground"}`}>{euros(soldeActuelReel)}</div>
        </Card>
        <Card className="p-4">
          <div className="mb-1 text-xs text-muted">Flux réels ({annee})</div>
          {stat("Entrées", totaux.entReel, "text-green-700 dark:text-green-400")}
          {stat("Sorties", totaux.depReel, "text-red-600")}
        </Card>
        <Card className="p-4">
          <div className="mb-1 text-xs text-muted">Solde projeté</div>
          {stat("fin de mois", soldeProjeteFinMois, soldeProjeteFinMois < 0 ? "text-red-600" : "text-foreground")}
          {stat("fin d'année", soldeProjete, soldeProjete < 0 ? "text-red-600" : "text-foreground")}
        </Card>
      </div>

      {/* Paiement en attente (moitié gauche) + graphe du solde projeté (moitié droite) */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Paiement en attente</h2>

          {/* Sortie — ce qu'on doit */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              Sortie
              <InfoHint text="Factures reçues non payées : échéances fournisseurs et notes de frais à rembourser." />
            </span>
            <span className={`text-sm font-bold tabular-nums ${totalAPayer > 0 ? "text-red-600" : "text-muted"}`}>
              {euros(totalAPayer)}
            </span>
          </div>
          {ndfAPayer.length === 0 && fournisseurs.length === 0 ? (
            <p className="mb-4 text-sm text-muted">Rien à rembourser ni à payer</p>
          ) : (
            <div className="mb-4 space-y-3">
              {ndfAPayer.length > 0 && (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {ndfAPayer.map((n) => (
                    <Link key={n.id} href={`/notes-frais/${n.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-background">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{n.titre}</span>
                        <span className="text-xs text-muted">NDF · {n.qui}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums">{euros(n.montant)}</span>
                        <span className="text-[10px] font-semibold text-amber-600">à rembourser</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {fournisseurs.length > 0 && (
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
                          {enRetard && <span className="text-[10px] font-semibold text-red-600">en retard</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Entrée — ce qu'on nous doit */}
          <div className="mb-2 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-medium">
              Entrée
              <InfoHint text="Retard client : factures émises dont l'échéance est dépassée et le règlement non reçu." />
            </span>
            <span className={`text-sm font-bold tabular-nums ${totalDu > 0 ? "text-amber-600" : "text-muted"}`}>
              {euros(totalDu)}
            </span>
          </div>
          {clients.length === 0 ? (
            <p className="text-sm text-muted">Aucune facture en retard</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {clients.map((c) => (
                <Link key={c.devis_id} href={`/prestations/${c.prestation_id}/document?devis=${c.devis_id}&type=facture`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-background">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.prestation?.client?.nom ?? "Client"}</span>
                    <span className="text-xs text-muted">Facture n°{c.numero ?? "—"}{c.date_echeance ? ` · échéance ${dateFr(c.date_echeance)}` : ""}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{euros(c.montant_ttc)}</span>
                    <span className="text-[10px] font-semibold text-red-600">à relancer</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <SoldeProjeteChart points={serieSolde} defautStart={12} seuil={seuil} />
      </div>

      {!ent?.solde_initial && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Renseigne le <strong>solde initial</strong> dans Paramètres → Trésorerie pour des soldes exacts.
        </p>
      )}
    </div>
  );
}
