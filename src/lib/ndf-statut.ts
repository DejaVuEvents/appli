// Affichage du statut d'une note de frais — SOURCE UNIQUE pour toutes les pages.
//
// UN SEUL statut par document, partout : liste, file de validation, fiche.
// L'échelle va du moins au plus avancé —
//   Brouillon → En attente de validation → Validée → Remboursée,
// « Refusée » étant la sortie de route. Le remboursement est la dernière marche,
// pas une étiquette à part : une note remboursée affiche « Remboursée », point.
// (Deux pastilles côte à côte laissaient croire à deux statuts concurrents.)
import { STATUT_NDF_LABELS, type StatutNoteFrais } from "@/lib/types";

const CLS: Record<StatutNoteFrais, string> = {
  brouillon: "bg-surface text-muted",
  soumise: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  validee: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  refusee: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const REMBOURSEE = {
  label: "Remboursée",
  cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
};

/**
 * Le statut à afficher, en un seul libellé.
 * `remboursee` = une écriture réelle de remboursement existe pour la note.
 */
export function statutNdfAffichage(
  statut: StatutNoteFrais,
  remboursee = false,
): { label: string; cls: string } {
  if (statut === "refusee") return { label: STATUT_NDF_LABELS.refusee, cls: CLS.refusee };
  if (remboursee) return REMBOURSEE;
  return { label: STATUT_NDF_LABELS[statut], cls: CLS[statut] };
}
