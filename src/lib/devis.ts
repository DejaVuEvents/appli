// Moteur de calcul des prix d'un devis.

export type Palier = { jour_min: number; coefficient: number };
export type RemiseType = "pct" | "montant";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Montant d'une remise (pourcentage ou montant fixe) appliquée à une base. */
export function montantRemise(base: number, type: RemiseType, valeur: number): number {
  const v = valeur || 0;
  return round2(type === "montant" ? Math.min(v, base) : (base * v) / 100);
}

/** Calcul d'une ligne : brut = prix × qté ; net = brut − remise ligne. */
export function montantLigne(args: {
  prixUnitaire: number;
  quantite: number;
  remiseType: RemiseType;
  remiseValeur: number;
}): { brut: number; remise: number; net: number } {
  const brut = round2((args.prixUnitaire || 0) * (args.quantite || 0));
  const remise = montantRemise(brut, args.remiseType, args.remiseValeur);
  return { brut, remise, net: round2(brut - remise) };
}

/**
 * Facteur "jours" = somme des coefficients jour par jour.
 * Jour 1 = plein tarif (coef 1). À partir d'un palier (jour_min), le coefficient
 * de ce palier s'applique à chaque jour concerné.
 * Ex. palier {jour_min:2, coef:0.5} sur 3 jours => 1 + 0.5 + 0.5 = 2.0.
 */
export function facteurJours(nbJours: number, paliers: Palier[]): number {
  if (nbJours <= 0) return 0;
  const tries = [...paliers].sort((a, b) => a.jour_min - b.jour_min);
  let total = 0;
  for (let jour = 1; jour <= nbJours; jour++) {
    let coef = 1;
    for (const p of tries) {
      if (p.jour_min <= jour) coef = p.coefficient;
      else break;
    }
    total += coef;
  }
  return total;
}

/**
 * Prix d'une ligne :
 * - prixUnitaire = prix d'UNE unité pour toute la durée (dégressif + remise client)
 * - prixTotal    = prixUnitaire × quantité
 */
export function prixLigne({
  prixJour,
  quantite,
  nbJours,
  paliers,
  clientPct = 0,
}: {
  prixJour: number;
  quantite: number;
  nbJours: number;
  paliers: Palier[];
  clientPct?: number;
}): { prixUnitaire: number; prixTotal: number } {
  const facteur = facteurJours(nbJours, paliers);
  const remise = 1 - (clientPct || 0) / 100;
  const prixUnitaire = round2(prixJour * facteur * remise);
  const prixTotal = round2(prixUnitaire * quantite);
  return { prixUnitaire, prixTotal };
}

/** Totaux d'un devis/facture (sous-total brut, remise HT cumulée, total HT). */
/**
 * Total d'un devis à partir du net des lignes (transport compris).
 * Ordre de calcul : on applique D'ABORD le coefficient multi-jours, PUIS la remise
 * globale — une remise de 200 € retire donc bien 200 € du prix final affiché.
 */
export function totalApresCoeffEtRemise(
  netAvecTransport: number,
  remiseType: RemiseType,
  remiseValeur: number,
  coefficientDuree = 1,
): number {
  const coeff = coefficientDuree > 0 ? coefficientDuree : 1;
  const apresCoeff = round2(netAvecTransport * coeff);
  return round2(apresCoeff - montantRemise(apresCoeff, remiseType, remiseValeur));
}

export function calculerTotaux(args: {
  lignes: { prix_unitaire: number | null; quantite: number; prix_total: number | null }[];
  transportTotal: number;
  remiseGlobaleType: RemiseType;
  remiseGlobaleValeur: number;
  /** Coefficient multi-jours, appliqué AVANT la remise globale. Défaut 1. */
  coefficientDuree?: number;
}): { sousTotalHT: number; remiseHT: number; totalHT: number } {
  const coeff = args.coefficientDuree && args.coefficientDuree > 0 ? args.coefficientDuree : 1;
  // Le coefficient multiplie d'abord les lignes, la remise globale se déduit ensuite
  // du montant obtenu : une remise de 200 € retire 200 € du prix final.
  const sousTotalBrut = args.lignes.reduce((s, l) => s + Number(l.prix_unitaire ?? 0) * l.quantite, 0);
  const netLignes = args.lignes.reduce((s, l) => s + Number(l.prix_total ?? 0), 0);
  const sousTotalHT = round2((sousTotalBrut + args.transportTotal) * coeff);
  const totalHT = totalApresCoeffEtRemise(
    netLignes + args.transportTotal,
    args.remiseGlobaleType,
    args.remiseGlobaleValeur,
    coeff,
  );
  return { sousTotalHT, remiseHT: round2(sousTotalHT - totalHT), totalHT };
}

/** Coût de transport = (véhicules × coût/jour) + (km × coût/km). */
export function coutTransport({
  nbVehicules,
  coutJour,
  km,
  coutKm,
}: {
  nbVehicules: number;
  coutJour: number;
  km: number;
  coutKm: number;
}): number {
  return round2(nbVehicules * coutJour + km * coutKm);
}

/** Période de réservation d'une prestation (prépa -> retour). Null si dates incomplètes. */
export function periodeReservation(p: {
  date_prepa: string | null;
  date_event_debut: string | null;
  date_event_fin: string | null;
  date_retour: string | null;
}): { debut: string; fin: string } | null {
  const debut = p.date_prepa ?? p.date_event_debut;
  const fin = p.date_retour ?? p.date_event_fin;
  return debut && fin ? { debut, fin } : null;
}

/** Nombre de jours de location suggéré à partir des dates d'une prestation. */
export function joursSuggeres(p: {
  date_prepa: string | null;
  date_event_debut: string | null;
  date_event_fin: string | null;
  date_retour: string | null;
}): number {
  const diffJours = (a: string, b: string) => {
    const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
    return Math.max(1, Math.round(d) + 1);
  };
  if (p.date_event_debut && p.date_event_fin) return diffJours(p.date_event_debut, p.date_event_fin);
  if (p.date_prepa && p.date_retour) return diffJours(p.date_prepa, p.date_retour);
  return 1;
}
