/**
 * Revenu réel par référence de catalogue, pour le ROI.
 *
 * Un événement porte plusieurs documents : un devis, ses versions successives, puis
 * la facture — et convertir un devis en facture DUPLIQUE ses lignes sous un nouveau
 * document. Additionner toutes les lignes d'un événement comptait donc son chiffre
 * d'affaires deux à quatre fois.
 *
 * On ne retient qu'UN document par événement, choisi parmi ceux qui portent
 * réellement du matériel : la facture si l'une d'elles en porte, sinon le devis ; et
 * à nature égale, celui qui a le plus de lignes de catalogue (puis le plus gros
 * montant) — c'est la version complète, pas un devis partiel abandonné.
 *
 * Le filtre « porte du matériel » est essentiel : une facture d'acompte n'a qu'une
 * ligne « Acompte 50 % », hors catalogue. La préférer ferait disparaître tout le
 * chiffre d'affaires matériel de l'événement.
 */
export type LigneRevenu = {
  reference_id: string | null;
  devis_id: string | null;
  prix_total: number | null;
  prix_unitaire: number | null;
  quantite: number;
  prestation_id: string | null;
  prestation: { statut: string; date_event_debut: string | null } | null;
};

export const montantLigne = (l: LigneRevenu) =>
  Number(l.prix_total ?? (l.prix_unitaire ?? 0) * l.quantite);

/** Documents retenus (un par événement) et revenu par référence. */
export type RevenuReel = {
  parReference: Map<string, number>;
  /** Pour expliquer le calcul : événement → identifiant du document retenu. */
  documentRetenu: Map<string, string>;
  /** Documents écartés parce qu'un autre document du même événement fait foi. */
  documentsEcartes: number;
};

export function revenuReelParReference(
  lignes: LigneRevenu[],
  annee: number,
  /** Documents (`devis.id`) ayant donné lieu à une facture émise. */
  devisFactures: Set<string>,
): RevenuReel {
  // 1. Ne garder que les événements signés ou réalisés de l'année.
  const retenues = lignes.filter((l) => {
    if (!l.prestation) return false;
    if (!["signe", "realise"].includes(l.prestation.statut)) return false;
    const d = l.prestation.date_event_debut;
    return !!d && new Date(d).getFullYear() === annee;
  });

  // 2. Regrouper par événement puis par document.
  type Doc = { cle: string; estFacture: boolean; lignesCatalogue: number; total: number; lignes: LigneRevenu[] };
  const parEvenement = new Map<string, Map<string, Doc>>();
  for (const l of retenues) {
    const ev = l.prestation_id ?? "—";
    // Une ligne sans document (donnée ancienne) forme son propre document.
    const cle = l.devis_id ?? `ligne-sans-document:${ev}`;
    const docs = parEvenement.get(ev) ?? new Map<string, Doc>();
    const doc = docs.get(cle)
      ?? { cle, estFacture: l.devis_id ? devisFactures.has(l.devis_id) : false, lignesCatalogue: 0, total: 0, lignes: [] };
    doc.lignes.push(l);
    if (l.reference_id) {
      doc.lignesCatalogue++;
      doc.total += montantLigne(l);
    }
    docs.set(cle, doc);
    parEvenement.set(ev, docs);
  }

  // 3. Un seul document par événement.
  const parReference = new Map<string, number>();
  const documentRetenu = new Map<string, string>();
  let documentsEcartes = 0;

  for (const [ev, docs] of parEvenement) {
    const avecMateriel = [...docs.values()].filter((d) => d.lignesCatalogue > 0);
    if (avecMateriel.length === 0) continue;
    const factures = avecMateriel.filter((d) => d.estFacture);
    const candidats = factures.length > 0 ? factures : avecMateriel;
    const gagnant = candidats.reduce((a, b) =>
      b.lignesCatalogue !== a.lignesCatalogue ? (b.lignesCatalogue > a.lignesCatalogue ? b : a) : (b.total > a.total ? b : a),
    );
    documentRetenu.set(ev, gagnant.cle);
    documentsEcartes += avecMateriel.length - 1;

    for (const l of gagnant.lignes) {
      if (!l.reference_id) continue;
      parReference.set(l.reference_id, (parReference.get(l.reference_id) ?? 0) + montantLigne(l));
    }
  }

  return { parReference, documentRetenu, documentsEcartes };
}
