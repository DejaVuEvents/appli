// Trésorerie — nomenclature (calquée sur l'Excel) + calculs du tableau de bord.

import type { SensFinancier } from "./types";

/** Catégories (type) et sous-catégories (spécification) par sens. */
export const NOMENCLATURE: Record<SensFinancier, Record<string, string[]>> = {
  sortie: {
    Matériel: ["Achat de matériel", "Frais Entretien", "Location de matériel"],
    Frais_Fixes: ["Frais IT", "Google Drive", "Site Internet", "Local", "Assurance", "Frais Bancaires"],
    Frais_Techniques: ["Techniciens", "Transport", "Salle"],
    Frais_Artistiques: ["Booking DJ", "Photographe/Vidéaste", "DA/Graphiste", "Communication"],
  },
  entree: {
    Prestation_Tech: ["Location de matériel", "Techniciens"],
    Vente_Materiel: ["Vente de Materiel"],
    Recettes_Evenement: ["Recettes Evenement"],
    Subventions_Dons: ["Don", "Subvention"],
    Remboursement: ["Remboursement"],
  },
};

/** Charge la nomenclature (catégories/sous-catégories) depuis la base ; repli sur la
 *  nomenclature par défaut si les tables sont vides. */
export async function chargerNomenclature(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<Record<SensFinancier, Record<string, string[]>>> {
  const [{ data: cats }, { data: subs }] = await Promise.all([
    supabase.from("finance_categorie").select("id, sens, nom, ordre").order("ordre").order("nom"),
    supabase.from("finance_sous_categorie").select("categorie_id, nom, ordre").order("ordre").order("nom"),
  ]);
  if (!cats || cats.length === 0) return NOMENCLATURE;
  const subsByCat = new Map<string, string[]>();
  for (const s of subs ?? []) {
    if (!subsByCat.has(s.categorie_id)) subsByCat.set(s.categorie_id, []);
    subsByCat.get(s.categorie_id)!.push(s.nom);
  }
  const out: Record<SensFinancier, Record<string, string[]>> = { entree: {}, sortie: {} };
  for (const c of cats) out[c.sens as SensFinancier][c.nom] = subsByCat.get(c.id) ?? [];
  return out;
}

export type Nomenclature = Record<SensFinancier, Record<string, string[]>>;

/**
 * `true` si la catégorie (type) d'une écriture est absente ou inconnue de la
 * nomenclature pour son sens → à signaler / corriger avant validation.
 */
export function categorieManquante(
  nomenclature: Nomenclature,
  sens: SensFinancier,
  type: string | null | undefined,
): boolean {
  if (!type || !type.trim()) return true;
  return !nomenclature[sens]?.[type];
}

/**
 * Catégorie / sous-catégorie par défaut **existante** pour un sens donné, en
 * préférant des noms si fournis (et s'ils existent encore). Sert au
 * pré-remplissage automatique des écritures issues de factures.
 */
export function categorieDefaut(
  nomenclature: Nomenclature,
  sens: SensFinancier,
  preferType: string | null = null,
  preferSpec: string | null = null,
): { type: string | null; specification: string | null } {
  const map = nomenclature[sens] ?? {};
  const types = Object.keys(map);
  const type = preferType && map[preferType] ? preferType : types[0] ?? null;
  const subs = type ? map[type] ?? [] : [];
  const specification = preferSpec && subs.includes(preferSpec) ? preferSpec : subs[0] ?? null;
  return { type, specification };
}

// ─── Calculateur ROI ─────────────────────────────────────────────────────────

export type ResultatROI = {
  coutAnnuel: number;
  gainsAnnuels: number;      // prix_location_ttc × 0.8 × volume
  roiPct: number;            // (gains - coût) / gains
  gainSansAchat: number | null;  // gain sur durée si on loue à l'extérieur plutôt qu'acheter
  gainsSiAchat: number;      // bénéfice net sur durée en possédant
  moisRentabilite: number | null;
};

export function calcROI(r: {
  cout_initial: number;
  maintenance_annuelle: number;
  duree_investissement_ans: number;
  prix_location_ttc: number;
  volume_prevu_par_an: number;     // locations facturées à un client
  volume_interne_par_an: number;   // utilisations propres soirées (économie, pas de recette)
  prix_revente: number;
  cout_location_externe: number;
}): ResultatROI {
  const dur = r.duree_investissement_ans || 1;
  const volPrest = r.volume_prevu_par_an;
  const volInterne = r.volume_interne_par_an;

  const coutAnnuel = r2((r.cout_initial - r.prix_revente) / dur + r.maintenance_annuelle);

  // TVA non applicable → le prix facturé TTC est le montant réellement encaissé (pas de × 0,8).
  // Gains = recettes clients (prix plein) + économies internes (coût externe évité)
  const gainsPrestation = r.prix_location_ttc * volPrest;
  const gainsInterne = r.cout_location_externe * volInterne;
  const gainsAnnuels = r2(gainsPrestation + gainsInterne);

  const roiPct = gainsAnnuels > 0 ? r2((gainsAnnuels - coutAnnuel) / gainsAnnuels) : 0;
  const gainsSiAchat = r2((gainsAnnuels - coutAnnuel) * dur);

  // Gain si on n'achetait pas (on loue à l'extérieur à chaque fois) :
  //   prestation : on encaisse le prix client MAIS on paye cout_ext → net = prix - cout_ext
  //   interne    : on paye cout_ext sans recette → net = -cout_ext
  const gainSansAchat =
    r.cout_location_externe > 0
      ? r2(
          ((r.prix_location_ttc - r.cout_location_externe) * volPrest -
            r.cout_location_externe * volInterne) *
            dur,
        )
      : null;

  // Mois avant retour sur investissement : (achat - revente) / gain mensuel net
  const gainMensuelNet = (gainsAnnuels - r.maintenance_annuelle) / 12;
  const moisRentabilite =
    gainMensuelNet > 0
      ? r2((r.cout_initial - r.prix_revente) / gainMensuelNet)
      : null;

  return { coutAnnuel, gainsAnnuels, roiPct, gainSansAchat, gainsSiAchat, moisRentabilite };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Report du solde réel des années antérieures (carry-over).
 * Si soldeInitialDate est défini, on ne compte que les écritures à partir de cette date
 * (les antérieures sont déjà incluses dans soldeInitial).
 */
function reportAnneesAnterieures(
  ecritures: { date: string; sens: SensFinancier; statut: string; montant_ttc: number }[],
  annee: number,
  soldeInitialDate: string | null = null,
): number {
  let r = 0;
  for (const e of ecritures) {
    if (new Date(e.date).getFullYear() < annee && e.statut === "reel") {
      if (!soldeInitialDate || e.date >= soldeInitialDate) {
        r += (e.sens === "entree" ? 1 : -1) * (Number(e.montant_ttc) || 0);
      }
    }
  }
  return Math.round(r * 100) / 100;
}

/** Libellé lisible d'un type (Frais_Fixes -> "Frais fixes"). */
export function typeLabel(type: string | null): string {
  return (type ?? "—").replace(/_/g, " ");
}

export const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export type AlerteSolva = "ok" | "faible" | "deficit";

export type MoisSynthese = {
  mois: string;
  depReel: number;
  entReel: number;
  netReel: number;
  soldeReelCum: number;
  depPrev: number;
  entPrev: number;
  soldeProjCum: number;
  alerte: AlerteSolva;
};

type EcritureCalcul = {
  date: string;
  sens: SensFinancier;
  statut: "reel" | "previsionnel";
  montant_ttc: number;
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

type EcriturePivot = {
  date: string;
  sens: SensFinancier;
  statut: "reel" | "previsionnel";
  type: string | null;
  specification: string | null;
  montant_ttc: number;
};

/** Pivot catégorie → sous-catégorie × 12 mois, pour un sens + statut donnés. */
export function pivotParPoste(
  ecritures: EcriturePivot[],
  annee: number,
  sens: SensFinancier,
  statut: "reel" | "previsionnel",
) {
  const data = new Map<string, Map<string, number[]>>();
  for (const e of ecritures) {
    if (e.sens !== sens || e.statut !== statut) continue;
    const d = new Date(e.date);
    if (d.getFullYear() !== annee) continue;
    const type = e.type ?? "Autre";
    const spec = e.specification ?? "—";
    if (!data.has(type)) data.set(type, new Map());
    const specs = data.get(type)!;
    if (!specs.has(spec)) specs.set(spec, Array(12).fill(0));
    specs.get(spec)![d.getMonth()] += Number(e.montant_ttc) || 0;
  }
  return [...data.entries()]
    .map(([type, specs]) => ({
      type,
      lignes: [...specs.entries()].map(([spec, mois]) => ({
        spec,
        mois: mois.map(r2),
        total: r2(mois.reduce((a, b) => a + b, 0)),
      })),
      total: r2([...specs.values()].flat().reduce((a, b) => a + b, 0)),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Top catégories (type) par total, pour un sens + statut. */
export function topCategories(
  ecritures: EcriturePivot[],
  annee: number,
  sens: SensFinancier,
  statut: "reel" | "previsionnel",
): { type: string; total: number }[] {
  const m = new Map<string, number>();
  for (const e of ecritures) {
    if (e.sens !== sens || e.statut !== statut) continue;
    const d = new Date(e.date);
    if (d.getFullYear() !== annee) continue;
    const type = e.type ?? "Autre";
    m.set(type, (m.get(type) ?? 0) + (Number(e.montant_ttc) || 0));
  }
  return [...m.entries()].map(([type, total]) => ({ type, total: r2(total) })).sort((a, b) => b.total - a.total);
}

export type FluxJour = {
  date: string;
  entR: number;
  entP: number;
  depR: number;
  depP: number;
  net: number;
  solde: number;
  statut: "ok" | "faible" | "decouvert";
};

/** Flux jour par jour (jours avec mouvement) avec solde cumulé projeté. */
export function fluxJournalier(
  ecritures: EcritureCalcul[],
  soldeInitial: number,
  annee: number,
  seuil: number,
  soldeInitialDate: string | null = null,
): { rows: FluxJour[]; premierDecouvert: string | null } {
  const parJour = new Map<string, { entR: number; entP: number; depR: number; depP: number }>();
  for (const e of ecritures) {
    const d = new Date(e.date);
    if (d.getFullYear() !== annee) continue;
    const key = e.date.slice(0, 10);
    if (!parJour.has(key)) parJour.set(key, { entR: 0, entP: 0, depR: 0, depP: 0 });
    const j = parJour.get(key)!;
    const v = Number(e.montant_ttc) || 0;
    if (e.statut === "reel") e.sens === "entree" ? (j.entR += v) : (j.depR += v);
    else e.sens === "entree" ? (j.entP += v) : (j.depP += v);
  }

  const jours = [...parJour.keys()].sort();
  let solde = soldeInitial + reportAnneesAnterieures(ecritures, annee, soldeInitialDate);
  let premierDecouvert: string | null = null;
  const rows: FluxJour[] = jours.map((date) => {
    const j = parJour.get(date)!;
    const net = j.entR + j.entP - j.depR - j.depP;
    solde = Math.round((solde + net) * 100) / 100;
    const statut = solde < 0 ? "decouvert" : solde < seuil ? "faible" : "ok";
    if (statut === "decouvert" && !premierDecouvert) premierDecouvert = date;
    return { date, entR: j.entR, entP: j.entP, depR: j.depR, depP: j.depP, net: Math.round(net * 100) / 100, solde, statut };
  });
  return { rows, premierDecouvert };
}

/** Synthèse mensuelle d'une année : soldes cumulés réel/projeté + alertes. */
export function syntheseMensuelle(
  ecritures: EcritureCalcul[],
  soldeInitial: number,
  annee: number,
  seuil: number,
  soldeInitialDate: string | null = null,
): {
  months: MoisSynthese[];
  totaux: { entReel: number; depReel: number; entPrev: number; depPrev: number };
  soldeActuelReel: number;
  soldeProjete: number;
} {
  const m = MOIS.map((mois) => ({
    mois, depReel: 0, entReel: 0, depPrev: 0, entPrev: 0,
  }));

  for (const e of ecritures) {
    const d = new Date(e.date);
    if (d.getFullYear() !== annee) continue;
    const idx = d.getMonth();
    const montant = Number(e.montant_ttc) || 0;
    if (e.statut === "reel") {
      if (e.sens === "entree") m[idx].entReel += montant;
      else m[idx].depReel += montant;
    } else {
      if (e.sens === "entree") m[idx].entPrev += montant;
      else m[idx].depPrev += montant;
    }
  }

  const ouverture = soldeInitial + reportAnneesAnterieures(ecritures, annee, soldeInitialDate);
  let cumReel = ouverture;
  let cumProj = ouverture;
  const months: MoisSynthese[] = m.map((x) => {
    const netReel = x.entReel - x.depReel;
    const netProj = netReel + (x.entPrev - x.depPrev);
    cumReel = r2(cumReel + netReel);
    cumProj = r2(cumProj + netProj);
    const alerte: AlerteSolva = cumProj < 0 ? "deficit" : cumProj < seuil ? "faible" : "ok";
    return {
      mois: x.mois,
      depReel: r2(x.depReel),
      entReel: r2(x.entReel),
      netReel: r2(netReel),
      soldeReelCum: cumReel,
      depPrev: r2(x.depPrev),
      entPrev: r2(x.entPrev),
      soldeProjCum: cumProj,
      alerte,
    };
  });

  const totaux = {
    entReel: r2(m.reduce((s, x) => s + x.entReel, 0)),
    depReel: r2(m.reduce((s, x) => s + x.depReel, 0)),
    entPrev: r2(m.reduce((s, x) => s + x.entPrev, 0)),
    depPrev: r2(m.reduce((s, x) => s + x.depPrev, 0)),
  };

  return {
    months,
    totaux,
    soldeActuelReel: cumReel, // solde réel après toutes les écritures réelles de l'année
    soldeProjete: cumProj, // solde projeté fin d'année
  };
}
