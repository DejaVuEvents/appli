/** Statuts de paiement d'une facture (colonne devis_facture.statut_paiement). */
export type StatutPaiement = "en_attente" | "paye" | "retard" | "annule";

export const STATUT_PAIEMENT_LABELS: Record<StatutPaiement, string> = {
  en_attente: "En attente de paiement",
  paye: "Payée",
  retard: "En retard",
  annule: "Annulée",
};

export const STATUT_PAIEMENT_CLS: Record<StatutPaiement, string> = {
  en_attente: "bg-amber-100 text-amber-800",
  paye: "bg-green-100 text-green-700",
  retard: "bg-red-100 text-red-700",
  annule: "bg-gray-200 text-gray-500 line-through",
};

export const BROUILLON_CLS = "bg-gray-200 text-gray-600";

/** Libellé/style d'affichage : « Brouillon » si pas encore émise (pas de numéro). */
export function statutFactureAffichage(emis: boolean, statut: string | null | undefined): { label: string; cls: string } {
  if (!emis) return { label: "Brouillon", cls: BROUILLON_CLS };
  const s = (statut ?? "en_attente") as StatutPaiement;
  return { label: STATUT_PAIEMENT_LABELS[s] ?? STATUT_PAIEMENT_LABELS.en_attente, cls: STATUT_PAIEMENT_CLS[s] ?? STATUT_PAIEMENT_CLS.en_attente };
}

/**
 * Libellé/style d'un DEVIS, sur la même échelle que l'événement :
 * Brouillon (pas encore émis) → Envoyé (numéroté, sans réponse) → Signé / Refusé.
 */
export function statutDevisAffichage(emis: boolean, statutSignature: string | null | undefined): { label: string; cls: string } {
  if (statutSignature === "signe") return { label: "Signé", cls: "bg-green-100 text-green-700" };
  if (statutSignature === "refuse") return { label: "Refusé", cls: "bg-red-100 text-red-700" };
  if (!emis) return { label: "Brouillon", cls: BROUILLON_CLS };
  return { label: "Envoyé", cls: "bg-blue-100 text-blue-700" };
}
