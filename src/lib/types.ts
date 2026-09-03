// Types métier alignés sur docs/schema_deja_vu.sql.
// (On pourra plus tard générer ces types automatiquement avec la CLI Supabase.)

export type EtatUnite = "ok" | "maintenance" | "hs" | "reforme";
export type Phase = "mono" | "tri";

export interface Categorie {
  id: string;
  nom: string;
  parent_id: string | null;
}

export interface MaterielReference {
  id: string;
  nom: string;
  designation: string | null;
  photo_url: string | null;
  categorie_id: string | null;
  description: string | null;
  prix_location_jour: number;
  cout_location_jour: number | null; // coût fournisseur/jour (sous-location) ; null si matériel possédé
  puissance_w: number | null;
  intensite_a: number | null;
  phase: Phase | null;
  connecteurs_puissance: string[];
  connecteurs_data: string[];
  poids_kg: number | null;
  charge_max_kg: number | null;
  dimensions: string | null;
  lieu_stockage: string | null;
  fournisseur: string | null;
  remise_fournisseur_pct: number;
  tva_fournisseur_pct: number;
  est_consommable: boolean;
  created_at: string;
}

// Tarif dégressif GLOBAL (paramètres devis/facturation), appliqué à tous les devis.
export interface TarifDegressifGlobal {
  id: string;
  jour_min: number;
  coefficient: number;
}

export interface KitRegle {
  id: string;
  reference_parent_id: string;
  reference_accessoire_id: string;
  quantite_par_unite: number;
  obligatoire: boolean; // true = ajouté auto ; false = optionnel (proposé au devis)
}

export interface Unite {
  id: string;
  reference_id: string;
  numero_serie: string | null;
  qr_code: string | null;
  etat: EtatUnite;
  compteur_heures: number;
  compteur_sorties: number;
  date_derniere_maintenance: string | null;
  maintenance_intervalle_jours: number | null;
  maintenance_intervalle_heures: number | null;
  date_achat: string | null;
  prix_achat: number | null;
  lieu_stockage: string | null;
  connecteurs_puissance: string[] | null;
  connecteurs_data: string[] | null;
  remarques: string | null;
  created_at: string;
}

/** Calcule si une unité est due/en retard de maintenance préventive. */
export function maintenanceStatut(u: {
  date_derniere_maintenance: string | null;
  maintenance_intervalle_jours: number | null;
  maintenance_intervalle_heures: number | null;
  compteur_heures: number;
}): { prochaineDate: string | null; enRetard: boolean; dueHeures: boolean } {
  let prochaineDate: string | null = null;
  let enRetard = false;
  if (u.maintenance_intervalle_jours && u.date_derniere_maintenance) {
    const d = new Date(u.date_derniere_maintenance);
    d.setDate(d.getDate() + u.maintenance_intervalle_jours);
    prochaineDate = d.toISOString().slice(0, 10);
    enRetard = prochaineDate < new Date().toISOString().slice(0, 10);
  }
  const dueHeures = !!u.maintenance_intervalle_heures && u.compteur_heures >= u.maintenance_intervalle_heures;
  return { prochaineDate, enRetard, dueHeures };
}

export interface Client {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  siret: string | null;
  tva_intra: string | null;
  iban: string | null;
  bic: string | null;
  tarif_preferentiel_pct: number;
  notes: string | null;
}

export interface ClientContact {
  id: string;
  client_id: string;
  nom: string;
  role: string | null;
  email: string | null;
  telephone: string | null;
  created_at: string;
}

export interface Vehicule {
  id: string;
  nom: string;
  type: string | null;
  cout_location_jour: number;
  cout_km: number; // legacy — conservé comme repli si conso non renseignée
  type_carburant: string | null; // 'essence' | 'diesel'
  conso_l_100km: number | null; // consommation moyenne (L/100 km)
  capacite_m3: number | null;
}

export type PrestationStatut = "brouillon" | "envoye" | "signe" | "realise" | "annule";

export const PRESTATION_STATUT_LABELS: Record<PrestationStatut, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  signe: "Signé",
  realise: "Réalisé",
  annule: "Annulé",
};

export type RemiseType = "pct" | "montant";

export interface Prestation {
  id: string;
  client_id: string | null;
  nom: string;
  lieu: string | null;
  date_prepa: string | null;
  date_event_debut: string | null;
  date_event_fin: string | null;
  date_retour: string | null;
  statut: PrestationStatut;
  remise_globale_type: RemiseType;
  remise_globale_valeur: number;
  remise_globale_libelle: string | null;
  created_at: string;
}

/** Un devis (ou facture) : document commercial rattaché à un événement.
 *  Un événement peut en contenir plusieurs, chacun avec sa propre liste de lignes. */
export interface Devis {
  id: string;
  prestation_id: string;
  nom: string | null;
  numero: string | null;
  type: "devis" | "facture";
  statut: string | null;
  remise_globale_type: RemiseType;
  remise_globale_valeur: number;
  remise_globale_libelle: string | null;
  coefficient_duree: number | null;
  source_devis_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface LignePrestation {
  id: string;
  prestation_id: string;
  devis_id: string | null;
  reference_id: string | null;
  designation: string | null;
  unite: string | null;
  categorie_id: string | null;
  quantite: number;
  nb_jours: number;
  prix_unitaire: number | null;
  remise_type: RemiseType;
  remise_valeur: number;
  prix_total: number | null;
  est_accessoire_auto: boolean;
  ligne_parent_id: string | null;
  charge: boolean;
}

export type TypeMouvement = "sortie" | "retour";

export interface Mouvement {
  id: string;
  unite_id: string;
  prestation_id: string | null;
  type: TypeMouvement;
  date: string;
  heures_ajoutees: number;
  utilisateur_id: string | null;
}

export interface Transport {
  id: string;
  prestation_id: string;
  vehicule_id: string | null;
  nb_vehicules: number;
  km: number;
  cout_calcule: number | null;
}

export interface ParametresEntreprise {
  id: string;
  raison_sociale: string | null;
  logo: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  iban: string | null;
  siren: string | null;
  mention_tva: string | null;
  taux_tva: number; // % de TVA (0 = franchise en base, art. 293 B)
  conditions_devis: string | null;
  conditions_facture: string | null;
  prochain_num_devis: number;
  prochain_num_facture: number;
  solde_initial: number;
  solde_initial_date: string | null;
  seuil_alerte: number;
  prix_essence: number | null; // €/L, pour le calcul des coûts de trajet
  prix_diesel: number | null; // €/L
  qonto_login: string | null;
  qonto_token: string | null;
  qonto_account_slug: string | null;
  qonto_derniere_sync: string | null;
  format_date: string;
}

export type SensFinancier = "entree" | "sortie";
export type StatutFinancier = "reel" | "previsionnel";

export interface Justificatif {
  id: string;
  ecriture_id: string | null;
  ligne_note_frais_id: string | null;
  url: string;
  nom: string | null;
  created_at: string;
}

export interface Reunion {
  id: string;
  titre: string;
  date: string;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  description: string | null;
  meet_url: string | null;
  created_by: string | null;
  created_at: string;
}

// ---- Outil d'avancement ----
export type AvancementProjet = "pas_demarre" | "bloque" | "en_cours" | "termine";
export const AVANCEMENT_LABELS: Record<AvancementProjet, string> = {
  pas_demarre: "Pas démarré",
  bloque: "Bloqué",
  en_cours: "En cours",
  termine: "Terminé",
};
export interface ProjetSuivi {
  id: string;
  nom: string;
  responsable: string | null;
  support: string | null;
  type: string | null;
  evenement: string | null;
  avancement: AvancementProjet;
  ordre: number;
  archive: boolean;
  created_at: string;
}
export interface ProjetNote {
  id: string;
  projet_id: string;
  annee: number;
  semaine: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export interface ContenuComm {
  id: string;
  type: string | null;
  concept: string | null;
  deadline: string | null;
  commentaires: string | null;
  inspirations: string | null;
  musiques: string | null;
  respo: string | null;
  statut: string | null;
  ordre: number;
  created_at: string;
}

export type StatutNoteFrais = "brouillon" | "soumise" | "validee" | "refusee";
export type TypeNoteFrais = "depense" | "km" | "predepense";
export const TYPE_NDF_LABELS: Record<TypeNoteFrais, string> = {
  depense: "Dépenses (justificatifs)",
  km: "Frais kilométriques",
  predepense: "Pré-dépense (autorisation)",
};
export interface NoteFrais {
  id: string;
  demandeur_id: string | null;
  titre: string | null;
  type_ndf: TypeNoteFrais;
  statut: StatutNoteFrais;
  valide_par: string | null;
  valide_le: string | null;
  demandeur_signe_le: string | null;
  motif_refus: string | null;
  prestation_id: string | null;
  ecriture_id: string | null;
  montant_estime: number | null;
  fournisseur: string | null;
  justification: string | null;
  created_at: string;
}
export interface LigneNoteFrais {
  id: string;
  note_frais_id: string;
  libelle: string | null;
  date: string | null;
  montant_ttc: number;
  justificatif_url: string | null;
  depart: string | null;
  arrivee: string | null;
  distance_km: number | null;
  created_at: string;
}
export const STATUT_NDF_LABELS: Record<StatutNoteFrais, string> = {
  brouillon: "Brouillon",
  soumise: "En attente de validation",
  validee: "Validée",
  refusee: "Refusée",
};

export interface EcritureFinanciere {
  id: string;
  date: string;
  denomination: string | null;
  type: string | null;
  specification: string | null;
  sens: SensFinancier;
  statut: StatutFinancier;
  montant_ttc: number;
  facture: string | null;
  effectue_par: string | null;
  notes: string | null;
  prestation_id: string | null;
  devis_facture_id: string | null;
  facture_fournisseur_id: string | null;
  qonto_transaction_id: string | null;
  valide: boolean;
}

export type StatutFournisseur = "a_payer" | "planifie" | "paye" | "retard";
export const STATUT_FOURNISSEUR_LABELS: Record<StatutFournisseur, string> = {
  a_payer: "À payer",
  planifie: "Planifié",
  paye: "Payé",
  retard: "En retard",
};
export interface FactureFournisseur {
  id: string;
  fournisseur: string;
  numero: string | null;
  montant_ttc: number;
  date_facture: string | null;
  date_echeance: string | null;
  statut_paiement: StatutFournisseur;
  fichier_url: string | null;
  prestation_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type TypeDocument = "devis" | "facture";

export interface DevisFacture {
  id: string;
  prestation_id: string;
  type: TypeDocument;
  numero: string | null;
  montant_ht: number | null;
  taux_tva: number | null;
  montant_ttc: number | null;
  date_emission: string | null;
  date_echeance: string | null;
  statut_paiement: string;
}

export interface Pont {
  id: string;
  plan_id: string;
  nom: string;
  capacite_kg: number | null;
}

export interface CircuitElec {
  id: string;
  plan_id: string;
  parent_id: string | null;
  type: string | null;
  nom: string;
  intensite_max_a: number | null;
  phase: Phase | null;
}

export interface SessionInventaire {
  id: string;
  date: string;
  utilisateur_id: string | null;
  notes: string | null;
}

export interface LigneInventaire {
  id: string;
  session_id: string;
  unite_id: string;
  present: boolean;
  etat_constate: string | null;
  remarque_maintenance: string | null;
}

export interface RoiMateriel {
  id: string;
  reference_id: string | null;
  nom: string;
  cout_initial: number;
  maintenance_annuelle: number;
  duree_investissement_ans: number;
  prix_location_ttc: number;
  est_achete: boolean;
  volume_prevu_par_an: number;    // prestations facturées à un client
  volume_interne_par_an: number;  // utilisations internes / propres soirées
  prix_revente: number;
  cout_location_externe: number;
  notes: string | null;
  created_at: string;
}

// Libellés FR pour l'affichage
export const ETAT_LABELS: Record<EtatUnite, string> = {
  ok: "OK",
  maintenance: "En maintenance",
  hs: "Hors service",
  reforme: "Réformé",
};

export const PHASE_LABELS: Record<Phase, string> = {
  mono: "Monophasé",
  tri: "Triphasé",
};

// Listes normalisées pour uniformiser les saisies entre références.
export const CONNECTEURS_PUISSANCE: string[] = [
  "PowerCON",
  "PowerCON TRUE1",
  "IEC (C13/C14)",
  "Schuko / PC16",
  "CEE P17 16A mono",
  "CEE P17 16A tri",
  "CEE P17 32A mono",
  "CEE P17 32A tri",
  "CEE P17 63A tri",
  "Socapex",
  "Harting",
  "Autre",
];

// Connecteurs de données / contrôle (DMX, réseau, laser…)
export const CONNECTEURS_DATA: string[] = [
  "XLR 3 points",
  "XLR 5 points",
  "RJ45 / etherCON",
  "ILDA",
  "Autre",
];
