// Calculateurs élec / levage — AIDE À LA DÉCISION uniquement.
// La validation finale revient à une personne compétente (levage réglementé).

const V_MONO = 230; // tension monophasée (V)
const V_TRI = 400; // tension entre phases (V)

type RefElec = {
  puissance_w: number | null;
  intensite_a: number | null;
  phase: "mono" | "tri" | null;
};

/** Poids total d'une ligne (kg). */
export function poidsLigne(poidsKg: number | null, quantite: number): number {
  return Math.round((Number(poidsKg ?? 0) * quantite) * 100) / 100;
}

/**
 * Intensité estimée d'une ligne (A).
 * Utilise l'intensité de la référence si renseignée, sinon l'estime depuis la
 * puissance (mono : P/230 ; tri : P/(√3·400)).
 */
export function courantLigne(ref: RefElec, quantite: number): number {
  let i = 0;
  if (ref.intensite_a != null) {
    i = Number(ref.intensite_a);
  } else if (ref.puissance_w != null) {
    const p = Number(ref.puissance_w);
    i = ref.phase === "tri" ? p / (Math.sqrt(3) * V_TRI) : p / V_MONO;
  }
  return Math.round(i * quantite * 100) / 100;
}

/**
 * Niveau d'alerte selon le ratio charge/limite.
 * seuilWarn = ratio à partir duquel on passe en "warn" (ex. 0.9 = marge < 10%).
 */
export function niveauAlerte(
  total: number,
  limite: number | null,
  seuilWarn = 0.8,
): "ok" | "warn" | "depasse" {
  if (!limite || limite <= 0) return "ok";
  const ratio = total / limite;
  if (ratio > 1) return "depasse";
  if (ratio >= seuilWarn) return "warn";
  return "ok";
}

/**
 * Une ligne peut-elle être suspendue à un pont ?
 *
 * Le plan de levage ne doit proposer que ce qui se rigge. En sont exclus, en plus de la
 * main-d'œuvre et du transport : les câbles (ils cheminent, ils ne se suspendent pas),
 * les praticables et leurs pieds (ils sont au sol), et les armoires de distribution
 * électrique. Les laisser dans la liste noyait le matériel réellement accroché.
 */
const NON_SUSPENDABLE_NOM =
  /\bc[âa]bl|multipaire|multiprise|\btouret\b|passe.?c[âa]ble|praticable|\barmoire|distribution [ée]lec|\bgradateur|rallonge|datalink|\baes50\b/i;

const NON_SUSPENDABLE_CAT = /c[âa]bles?|praticable|armoire|distribution|transport|technique/i;

export function estSuspendable(designation: string | null, categorieNom: string | null): boolean {
  if (designation && NON_SUSPENDABLE_NOM.test(designation)) return false;
  if (categorieNom && NON_SUSPENDABLE_CAT.test(categorieNom)) return false;
  return true;
}
