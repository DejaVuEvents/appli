/**
 * Rapprochement des lignes de devis « hors catalogue » avec les références.
 *
 * Les libellés ont été tapés à la main pendant des années : « Lyre wash 19*15W »,
 * « Lyre Wash - 19*15W », « Shehds Lyre Wash 19x15w » désignent le même projecteur.
 * On propose donc les références les plus proches, mais on ne rattache jamais tout
 * seul : c'est une aide au tri, pas une décision automatique.
 */
export function normaliser(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mots trop courants pour discriminer une référence. */
const VIDES = new Set([
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "en", "pour", "avec",
  "sur", "dj", "type", "sans",
]);

function jetons(t: string): string[] {
  return normaliser(t).split(" ").filter((m) => m.length > 1 && !VIDES.has(m));
}

export type ReferenceCandidate = { id: string; nom: string; designation?: string | null };

export type Suggestion = { id: string; nom: string; score: number };

/**
 * Score entre un libellé et une référence : part des mots du libellé retrouvés dans
 * la référence, pondérée par la part inverse. Les mots portant un chiffre (« 19x15w »,
 * « 75m », « 63a ») comptent double : c'est eux qui distinguent deux modèles voisins.
 */
function score(jLibelle: string[], jRef: string[]): number {
  if (jLibelle.length === 0 || jRef.length === 0) return 0;
  const poids = (m: string) => (/\d/.test(m) ? 2 : 1);
  const ref = new Set(jRef);
  let communs = 0;
  let totalLibelle = 0;
  for (const m of jLibelle) {
    totalLibelle += poids(m);
    if (ref.has(m)) communs += poids(m);
  }
  const totalRef = jRef.reduce((s, m) => s + poids(m), 0);
  // Moyenne harmonique : pénalise autant un libellé mal couvert qu'une référence
  // beaucoup plus large que le libellé (« Pied » ne vaut pas « Pied TV 75-85 pouces »).
  const rappel = communs / totalLibelle;
  const precision = communs / totalRef;
  return rappel + precision === 0 ? 0 : (2 * rappel * precision) / (rappel + precision);
}

export function suggerer(
  designation: string,
  references: ReferenceCandidate[],
  max = 5,
): Suggestion[] {
  const j = jetons(designation);
  return references
    .map((r) => ({
      id: r.id,
      nom: r.nom,
      score: Math.max(score(j, jetons(r.nom)), r.designation ? score(j, jetons(r.designation)) : 0),
    }))
    .filter((s) => s.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
