// Assemblage du contenu d'un devis/facture (données + totaux), partagé entre la page,
// l'émission (archivage PDF) et la route de téléchargement PDF.
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculerTotaux, type RemiseType } from "@/lib/devis";
import { ORDRE_BUCKETS, bucketPour } from "@/lib/devis-buckets";
import type { ParametresEntreprise } from "@/lib/types";

export type DocLigne = {
  id: string;
  designation: string | null;
  quantite: number;
  unite: string | null;
  prix_unitaire: number | null;
  prix_total: number | null;
  remise_type: string | null;
  remise_valeur: number;
  categorie_id: string | null;
  reference_id: string | null;
  /** Accessoire rattaché à une autre ligne (pieds d'un praticable, élingue d'une lyre…). */
  ligne_parent_id: string | null;
};

export type DocContenu = {
  ent: ParametresEntreprise | null;
  client: { nom: string; adresse: string | null } | null;
  prestationNom: string;
  groupes: { nom: string; items: DocLigne[] }[];
  transportTotal: number;
  coefficientDuree: number;
  surchargeDuree: number;
  totaux: { sousTotalHT: number; remiseHT: number; totalHT: number };
  tva: { taux: number; montant: number; totalTtc: number };
};

export async function assemblerContenuDocument(
  supabase: SupabaseClient,
  devisId: string,
): Promise<DocContenu | null> {
  const { data: devisData } = await supabase
    .from("devis")
    .select("prestation_id, nom, remise_globale_type, remise_globale_valeur, coefficient_duree")
    .eq("id", devisId)
    .single();
  if (!devisData) return null;
  const devis = devisData as {
    prestation_id: string;
    nom: string | null;
    remise_globale_type: RemiseType;
    remise_globale_valeur: number;
    coefficient_duree: number | null;
  };

  const [{ data: prest }, { data: lignesData }, { data: cats }, { data: transports }, { data: entData }] =
    await Promise.all([
      supabase.from("prestation").select("nom, client(nom, adresse)").eq("id", devis.prestation_id).single(),
      supabase.from("ligne_prestation").select("*").eq("devis_id", devisId).order("created_at"),
      supabase.from("categorie").select("id, nom, parent_id, ordre"),
      supabase.from("transport").select("cout_calcule").eq("devis_id", devisId),
      supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    ]);
  if (!prest) return null;

  const prestation = prest as unknown as {
    nom: string;
    client: { nom: string; adresse: string | null } | null;
  };
  const brut = (lignesData ?? []) as DocLigne[];
  // Les accessoires suivent immédiatement la ligne qui les entraîne : sans ce tri, les
  // 4 pieds d'un praticable se retrouvent n'importe où dans la liste.
  const enfants = new Map<string, DocLigne[]>();
  for (const l of brut) {
    if (!l.ligne_parent_id) continue;
    const arr = enfants.get(l.ligne_parent_id) ?? [];
    arr.push(l);
    enfants.set(l.ligne_parent_id, arr);
  }
  const lignes: DocLigne[] = [];
  for (const l of brut) {
    if (l.ligne_parent_id) continue;
    lignes.push(l);
    for (const e of enfants.get(l.id) ?? []) lignes.push(e);
  }
  // Accessoires dont le parent a disparu : on ne les perd pas.
  for (const l of brut) {
    if (l.ligne_parent_id && !lignes.some((x) => x.id === l.id)) lignes.push(l);
  }
  // Regroupement en 4 familles (Lumière & Effets / Son / Structure / Technique),
  // cohérent avec le constructeur — voir src/lib/devis-buckets.ts.
  type CatRow = { id: string; nom: string; parent_id: string | null; ordre: number | null };
  const catById = new Map((cats ?? []).map((c) => [c.id, c as CatRow]));
  const transportTotal = (transports ?? []).reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
  const coefficientDuree = Number(devis.coefficient_duree ?? 0) > 0 ? Number(devis.coefficient_duree) : 1;
  const totaux = calculerTotaux({
    lignes,
    transportTotal,
    remiseGlobaleType: devis.remise_globale_type,
    remiseGlobaleValeur: Number(devis.remise_globale_valeur ?? 0),
    coefficientDuree,
  });
  const materielBrut1j = lignes.reduce((s, l) => s + Number(l.prix_unitaire ?? 0) * l.quantite, 0);
  const surchargeDuree = Math.round((materielBrut1j + transportTotal) * (coefficientDuree - 1) * 100) / 100;
  const ent = entData as ParametresEntreprise | null;
  const taux = Number(ent?.taux_tva ?? 0);
  const montant = Math.round(totaux.totalHT * (taux / 100) * 100) / 100;

  const g = new Map<string, DocLigne[]>();
  for (const l of lignes) {
    const nom = bucketPour(l.designation, l.categorie_id ? catById.get(l.categorie_id)?.nom ?? null : null);
    if (!g.has(nom)) g.set(nom, []);
    g.get(nom)!.push(l);
  }
  const groupes = ORDRE_BUCKETS.filter((b) => g.has(b)).map((nom) => ({ nom, items: g.get(nom)! }));

  return {
    ent,
    client: prestation.client ?? null,
    prestationNom: devis.nom && devis.nom !== "Devis" && devis.nom !== "Facture" ? `${prestation.nom} — ${devis.nom}` : prestation.nom,
    groupes,
    transportTotal,
    coefficientDuree,
    surchargeDuree,
    totaux,
    tva: { taux, montant, totalTtc: Math.round((totaux.totalHT + montant) * 100) / 100 },
  };
}
