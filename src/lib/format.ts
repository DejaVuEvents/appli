/** Met l'adresse sur plusieurs lignes : retour à la ligne avant le code postal
 *  (5 chiffres), pour séparer la rue du « CP + ville ». Respecte les retours déjà présents. */
export function adresseMultiligne(adresse: string | null | undefined): string {
  if (!adresse) return "";
  if (adresse.includes("\n")) return adresse.trim();
  return adresse.replace(/\s*,?\s*(\d{5}\b)/, "\n$1").trim();
}

/** Formatage en euros (fr-FR). */
export function euros(montant: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(montant ?? 0);
}

export type DateFormat = "fr" | "iso" | "long";

/** Formatage de date sans dépendance timezone.
 *  "fr" → JJ/MM/AAAA (défaut)   "iso" → AAAA-MM-JJ   "long" → JJ mois AAAA */
export function dateFr(iso: string | null | undefined, format: DateFormat = "fr"): string {
  if (!iso) return "—";
  const s = String(iso).trim().slice(0, 10);
  const parts = s.split("-");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return s;
  const [y, m, d] = parts;
  if (format === "iso") return `${y}-${m}-${d}`;
  if (format === "long") {
    const MOIS = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    return `${parseInt(d)} ${MOIS[parseInt(m) - 1] ?? "?"} ${y}`;
  }
  return `${d}/${m}/${y}`;
}

/**
 * Rend insécable l'espace qui précède la ponctuation double française (? ! ; :) et
 * qui suit un guillemet ouvrant. Sans ça, « Soumettre cette note pour validation ? »
 * peut renvoyer le « ? » seul à la ligne suivante.
 *
 * Espace fine insécable (U+202F) devant ? ! ; et », espace insécable (U+00A0) devant
 * les deux-points, conformément à l'usage typographique.
 */
export function ponctuationFr(texte: string): string {
  return texte
    .replace(/\s+([?!;»])/g, "\u202f$1")
    .replace(/\s+(:)/g, "\u00a0$1")
    .replace(/(«)\s+/g, "«\u202f");
}
