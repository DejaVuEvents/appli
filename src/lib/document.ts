// Assemblage du contenu d'un devis/facture (données + totaux), partagé entre la page,
// l'émission (archivage PDF) et la route de téléchargement PDF.
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculerTotaux, type RemiseType } from "@/lib/devis";
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
};

export type DocContenu = {
  ent: ParametresEntreprise | null;
  client: { nom: string; adresse: string | null } | null;
  prestationNom: string;
  groupes: { nom: string; items: DocLigne[] }[];
  transportTotal: number;
  totaux: { sousTotalHT: number; remiseHT: number; totalHT: number };
  tva: { taux: number; montant: number; totalTtc: number };
};

export async function assemblerContenuDocument(
  supabase: SupabaseClient,
  devisId: string,
): Promise<DocContenu | null> {
  const { data: devisData } = await supabase
    .from("devis")
    .select("prestation_id, nom, remise_globale_type, remise_globale_valeur")
    .eq("id", devisId)
    .single();
  if (!devisData) return null;
  const devis = devisData as {
    prestation_id: string;
    nom: string | null;
    remise_globale_type: RemiseType;
    remise_globale_valeur: number;
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
  const lignes = (lignesData ?? []) as DocLigne[];
  // Résout la catégorie RACINE d'une ligne : les sous-catégories (ex. « Laser »,
  // « Têtes mobiles ») remontent à leur famille (« Lumière & Effets »).
  type CatRow = { id: string; nom: string; parent_id: string | null; ordre: number | null };
  const catById = new Map((cats ?? []).map((c) => [c.id, c as CatRow]));
  function racine(id: string | null): { nom: string; ordre: number } {
    let cur = id ? catById.get(id) ?? null : null;
    const vus = new Set<string>();
    while (cur && cur.parent_id && catById.has(cur.parent_id) && !vus.has(cur.id)) {
      vus.add(cur.id);
      cur = catById.get(cur.parent_id)!;
    }
    return cur ? { nom: cur.nom, ordre: cur.ordre ?? 999 } : { nom: "Divers", ordre: 1000 };
  }
  const transportTotal = (transports ?? []).reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
  const totaux = calculerTotaux({
    lignes,
    transportTotal,
    remiseGlobaleType: devis.remise_globale_type,
    remiseGlobaleValeur: Number(devis.remise_globale_valeur ?? 0),
  });
  const ent = entData as ParametresEntreprise | null;
  const taux = Number(ent?.taux_tva ?? 0);
  const montant = Math.round(totaux.totalHT * (taux / 100) * 100) / 100;

  const g = new Map<string, { items: DocLigne[]; ordre: number }>();
  for (const l of lignes) {
    const { nom, ordre } = racine(l.categorie_id);
    if (!g.has(nom)) g.set(nom, { items: [], ordre });
    g.get(nom)!.items.push(l);
  }
  const groupes = [...g.entries()]
    .sort((a, b) => {
      if (a[0] === "Divers") return 1;
      if (b[0] === "Divers") return -1;
      return a[1].ordre - b[1].ordre || a[0].localeCompare(b[0]);
    })
    .map(([nom, v]) => ({ nom, items: v.items }));

  return {
    ent,
    client: prestation.client ?? null,
    prestationNom: devis.nom && devis.nom !== "Devis" && devis.nom !== "Facture" ? `${prestation.nom} — ${devis.nom}` : prestation.nom,
    groupes,
    transportTotal,
    totaux,
    tva: { taux, montant, totalTtc: Math.round((totaux.totalHT + montant) * 100) / 100 },
  };
}
