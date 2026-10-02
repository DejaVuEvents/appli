/**
 * Nom d'une unité physique.
 *
 * Sur le terrain, on dit « Laser 3 » ou « Beam 11 », pas le numéro de série du
 * fabricant — illisible, souvent absent, et qui ne dit pas de quelle lyre on parle.
 * Le numéro interne est donc le nom d'usage ; le numéro de série reste disponible
 * pour la garantie et le SAV.
 */
export type UniteNommable = {
  numero_interne?: number | null;
  numero_serie?: string | null;
  reference?: { nom?: string | null; prefixe_unite?: string | null } | null;
};

export function nomUnite(u: UniteNommable, refNom?: string | null): string {
  const prefixe = u.reference?.prefixe_unite;
  if (prefixe && u.numero_interne != null) return `${prefixe} ${u.numero_interne}`;
  if (u.numero_serie) return u.numero_serie;
  const nom = refNom ?? u.reference?.nom;
  return u.numero_interne != null && nom ? `${nom} ${u.numero_interne}` : (nom ?? "Unité");
}

/** Détail secondaire : numéro de série, quand il existe et qu'il n'est pas déjà le nom. */
export function serieUnite(u: UniteNommable): string | null {
  if (!u.numero_serie) return null;
  return u.reference?.prefixe_unite && u.numero_interne != null ? u.numero_serie : null;
}
