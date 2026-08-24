// Classement d'une ligne de devis dans l'une des 4 familles affichées
// (Lumière & Effets / Son / Structure / Technique). Utilisé par le constructeur
// ET par les vues document (lecture, aperçu, PDF) pour un regroupement cohérent.
//
// Règle métier : « Technique » ne contient QUE la main d'œuvre (techniciens,
// opération, montage) et le transport. Tout le reste va dans une famille matériel.

export const BUCKETS = {
  LUM: "Lumière & Effets",
  SON: "Son",
  STR: "Structure",
  ELEC: "Distribution électrique",
  TECH: "Technique",
  TRANSPORT: "Transport",
} as const;
export type BucketNom = (typeof BUCKETS)[keyof typeof BUCKETS];
export const ORDRE_BUCKETS: BucketNom[] = [BUCKETS.LUM, BUCKETS.SON, BUCKETS.STR, BUCKETS.ELEC, BUCKETS.TRANSPORT, BUCKETS.TECH];

const { LUM, SON, STR, ELEC, TECH, TRANSPORT } = BUCKETS;

// Mapping par NOM de (sous-)catégorie du catalogue. « Catalogue Externe » est
// volontairement absent : ses items sont classés par leur sous-catégorie ou par mots-clés.
const PAR_CATEGORIE: Record<string, BucketNom> = {
  "Lumière & Effets": LUM, "Barres & Blinders": LUM, "Contrôle DMX": LUM,
  "Laser": LUM, "Têtes mobiles": LUM, "Wash & PAR LED": LUM, "Lyres & Robotisés": LUM,
  "Projecteurs": LUM, "Effets Scéniques": LUM, "Consoles Lumière": LUM, "Câbles Lumière": LUM,
  "Son": SON, "Amplificateurs": SON, "Enceintes": SON, "Enceintes & Caissons": SON,
  "Tables de mixage": SON, "Consoles de mixage": SON, "Platines & DJ": SON, "Micros & HF": SON,
  "Câbles Son": SON, "Traitement & Divers": SON,
  "Structure & Scène": STR, "Structure": STR, "Accessoires scène": STR, "Accrochage": STR,
  "Praticables": STR, "Levage": STR,
  "Électricité": ELEC, "Armoires & Distribution": ELEC, "Câbles Électricité": ELEC, "Distribution électrique": ELEC,
  "Technique": TECH,
  "Transport": TRANSPORT,
};

// Mots-clés sur la désignation, testés dans l'ordre.
// Main d'œuvre → Technique ; logistique/véhicule → Transport ; distribution → Distribution électrique.
const REGLE_TECH = /^\s*tech\b|technicien|\bmontage\b|d[ée]montage|op[ée]ration|main.?d.?.?oeuvre/i;
const REGLE_TRANSPORT = /\btransport|d[ée]placement|\blivraison|p[ée]age|autoroute|carburant|\bessence|\bdiesel|v[ée]hicule|camion|camionnette|\bfourgon|location.*v[ée]hicule|forfait (?:route|km)|\bkm\b/i;
const REGLE_ELEC = /\barmoire|distribution [ée]lec|c[âa]blage|\bt[ée]tra|\bp17\b|disjoncteur|prolongateur|\brallonge|multipaire|multiprise|\bg\d ?g?\d?\b|groupe [ée]lectrog|coffret [ée]lec|prise (?:16|32|63|125)a/i;
const REGLES_MATIERE: { re: RegExp; bucket: BucketNom }[] = [
  { re: /enceinte|caisson|subwoofer|\bampli|micro\b|\bhf\b|table de mix|\bmidas\b|\bm32\b|\bdl32\b|pioneer|\bxdj\b|\bcdj\b|platine|\bdj\b|aes50|di.?box|\bson\b|monitoring|retour son|l.?acoustics|yamaha|allen ?& ?heath|d&b/i, bucket: SON },
  { re: /laser|\blyre|\bpar\b|\bled\b|\bwash\b|\bbeam\b|\bspot\b|blinder|strobe|stroboscope|projecteur|d[ée]coupe|fresnel|gobo|\bdmx\b|ilda|pangolin|fum[ée]e|brouillard|[ée]tincelle|geyser|\bbulle|\bneige\b|\bco2\b|grandma|avolites|chamsys|r[ée]gie lumi|show lumi|show laser/i, bucket: LUM },
  { re: /praticable|\bpont\b|\btruss\b|perche|\bpied\b|[ée]lingue|crochet|\bsc[èe]ne\b|platelage|passe.?c[âa]ble|\bleste|barri[èe]re|\bguil\b|manfrotto|structure/i, bucket: STR },
];

/** Famille d'affichage d'une ligne, d'après sa désignation et sa (sous-)catégorie. */
export function bucketPour(designation: string | null, categorieNom: string | null): BucketNom {
  const d = (designation ?? "").toLowerCase();
  // 1. Main d'œuvre → Technique (priorité, avant transport).
  if (REGLE_TECH.test(d)) return TECH;
  // 2. Logistique / véhicule → Transport.
  if (REGLE_TRANSPORT.test(d)) return TRANSPORT;
  // 3. Catégorie explicite du catalogue (hors « Catalogue Externe »).
  if (categorieNom && categorieNom !== "Catalogue Externe" && PAR_CATEGORIE[categorieNom]) {
    return PAR_CATEGORIE[categorieNom];
  }
  // 4. Distribution électrique (armoire, câblage puissance…) — pour les lignes sans catégorie.
  if (REGLE_ELEC.test(d)) return ELEC;
  // 5. Mots-clés matière sur la désignation (lignes importées sans catégorie).
  for (const r of REGLES_MATIERE) if (r.re.test(d)) return r.bucket;
  // 6. Par défaut : Technique (fourre-tout ; l'utilisateur peut recatégoriser).
  return TECH;
}
