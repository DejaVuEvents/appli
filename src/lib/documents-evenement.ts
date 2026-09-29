/**
 * Quelles lignes de devis composent le matériel d'un événement.
 *
 * Un événement porte plusieurs documents : un devis, ses versions successives, une
 * facture d'acompte, une facture de solde, parfois une facture complémentaire pour
 * du matériel ajouté sur place. Copier un devis DUPLIQUE ses lignes sous un nouveau
 * document : les additionner compterait deux à quatre fois le même matériel — c'est
 * ce qui gonflait le ROI.
 *
 * La règle retenue traite le matériel de l'événement comme un ENSEMBLE de
 * références : on part du document qui en porte le plus, puis chaque autre document
 * n'apporte que les références absentes de ce qui précède. Une version antérieure
 * n'ajoute donc rien, alors qu'une facture complémentaire ajoute bien son matériel.
 *
 * Ce qu'elle ne sait pas faire : un complément qui rajoute 2 exemplaires d'une
 * référence déjà présente passe inaperçu. C'est assumé — la liste du matériel de
 * l'événement est modifiable à la main, et c'est elle qui fait foi.
 */
export type DocumentAvecLignes = {
  id: string;
  type: string | null;
  lignes: { id: string; reference_id: string; montant: number }[];
};

/** Identifiants des lignes à retenir, doublons de documents écartés. */
export function lignesRetenues(docs: DocumentAvecLignes[]): Set<string> {
  const avecMateriel = docs.filter((d) => d.lignes.length > 0);

  // Le document le plus complet d'abord ; à égalité, la facture, puis le plus gros
  // montant. Une facture d'acompte ne porte qu'une ligne « Acompte 50 % », hors
  // catalogue : elle n'arrive donc jamais en tête, et c'est voulu.
  const ordonnes = [...avecMateriel].sort((a, b) => {
    if (b.lignes.length !== a.lignes.length) return b.lignes.length - a.lignes.length;
    const f = Number(b.type === "facture") - Number(a.type === "facture");
    if (f !== 0) return f;
    const sa = a.lignes.reduce((s, l) => s + l.montant, 0);
    const sb = b.lignes.reduce((s, l) => s + l.montant, 0);
    return sb - sa;
  });

  const referencesVues = new Set<string>();
  const retenues = new Set<string>();
  for (const doc of ordonnes) {
    for (const l of doc.lignes) {
      if (referencesVues.has(l.reference_id)) continue;
      referencesVues.add(l.reference_id);
      retenues.add(l.id);
    }
  }
  return retenues;
}
