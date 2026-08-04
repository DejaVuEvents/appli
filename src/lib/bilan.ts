// Bilan comptable simplifié (Actif / Passif) pour une association loi 1901.
// Snapshot « à date » pour les créances/dettes (non historisées), trésorerie de fin d'exercice.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EcritureFinanciere } from "@/lib/types";

export type BilanActifPassif = {
  // Actif
  immobilisations: number;      // matériel acheté (valeur d'achat brute)
  creances: number;             // factures clients émises non encaissées
  tresorerie: number;           // solde de trésorerie en fin d'exercice
  totalActif: number;
  // Passif
  dettesFournisseurs: number;   // factures fournisseurs non payées
  reportANouveau: number;       // fonds propres antérieurs (variable d'équilibre)
  resultatExercice: number;     // produits − charges de l'exercice
  fondsPropres: number;         // reportANouveau + resultatExercice
  totalPassif: number;
};

const round = (n: number) => Math.round(n * 100) / 100;
const NON_DUES = ["paye", "annule"];

/** Solde de trésorerie réel à une borne (< borne), à partir du solde initial. */
export function soldeTresorerieA(
  ecritures: Pick<EcritureFinanciere, "date" | "sens" | "statut" | "montant_ttc">[],
  soldeInitial: number,
  soldeInitialDate: string | null,
  borne: string,
): number {
  return round(
    ecritures.reduce((solde, e) => {
      if (e.statut !== "reel") return solde;
      if (soldeInitialDate && e.date < soldeInitialDate) return solde; // déjà dans le solde initial
      if (e.date >= borne) return solde;
      return solde + (e.sens === "entree" ? 1 : -1) * Number(e.montant_ttc || 0);
    }, soldeInitial),
  );
}

/**
 * Assemble le bilan Actif/Passif. On fournit la trésorerie de fin d'exercice et le
 * résultat de l'exercice (produits − charges) ; les créances, dettes et immobilisations
 * sont lues en base. Les fonds propres équilibrent l'actif (report à nouveau = plug).
 */
export async function calculerBilanActifPassif(
  supabase: SupabaseClient,
  tresorerie: number,
  resultatExercice: number,
): Promise<BilanActifPassif> {
  const [{ data: fac }, { data: four }, { data: roi }] = await Promise.all([
    supabase.from("devis_facture").select("montant_ttc, statut_paiement, numero, type"),
    supabase.from("facture_fournisseur").select("montant_ttc, statut_paiement"),
    supabase.from("roi_materiel").select("cout_initial, est_achete"),
  ]);

  const creances = (fac ?? [])
    .filter((f) => f.type === "facture" && f.numero && !NON_DUES.includes(f.statut_paiement ?? ""))
    .reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
  const dettesFournisseurs = (four ?? [])
    .filter((f) => !NON_DUES.includes(f.statut_paiement ?? ""))
    .reduce((s, f) => s + Number(f.montant_ttc || 0), 0);
  const immobilisations = (roi ?? [])
    .filter((r) => r.est_achete)
    .reduce((s, r) => s + Number(r.cout_initial || 0), 0);

  const totalActif = round(immobilisations + creances + tresorerie);
  const fondsPropres = round(totalActif - dettesFournisseurs);
  const reportANouveau = round(fondsPropres - resultatExercice);

  return {
    immobilisations: round(immobilisations),
    creances: round(creances),
    tresorerie: round(tresorerie),
    totalActif,
    dettesFournisseurs: round(dettesFournisseurs),
    reportANouveau,
    resultatExercice: round(resultatExercice),
    fondsPropres,
    totalPassif: round(dettesFournisseurs + fondsPropres),
  };
}
