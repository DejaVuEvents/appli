/** Numérotation des semaines calquée sur le fichier Coordination (semaine 1 = lundi ≤ 1er janvier). */

const MS_JOUR = 86400000;

/** Lundi de la semaine 1 de l'année (le lundi de la semaine contenant le 1er janvier). */
export function ancreLundi(annee: number): number {
  const jan1 = Date.UTC(annee, 0, 1);
  const dow = (new Date(jan1).getUTCDay() + 6) % 7; // Lundi = 0
  return jan1 - dow * MS_JOUR;
}

function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Numéro de semaine (1..53) pour une date donnée dans l'année de référence. */
export function semaineDeDate(annee: number, dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const n = Math.floor((t - ancreLundi(annee)) / (7 * MS_JOUR)) + 1;
  return Math.min(53, Math.max(1, n));
}

/** Semaine courante pour l'année donnée (basée sur la date locale). */
export function semaineActuelle(annee: number): number {
  const now = new Date();
  return semaineDeDate(annee, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
}

/** Plage de dates (JJ/MM – JJ/MM) d'une semaine. */
export function plageSemaine(annee: number, semaine: number): { debut: string; fin: string; label: string } {
  const debutMs = ancreLundi(annee) + (semaine - 1) * 7 * MS_JOUR;
  const finMs = debutMs + 6 * MS_JOUR;
  const debut = ymd(debutMs);
  const fin = ymd(finMs);
  const court = (s: string) => { const [, m, d] = s.split("-"); return `${d}/${m}`; };
  return { debut, fin, label: `${court(debut)} – ${court(fin)}` };
}

export const NB_SEMAINES = 53;
