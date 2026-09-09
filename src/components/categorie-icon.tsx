import {
  IconBox, IconWrench, IconTruck, IconCloud, IconGlobe, IconBuilding, IconShield,
  IconBank, IconUser, IconMusic, IconCamera, IconPalette, IconMegaphone,
  IconTicket, IconGift, IconRefresh, IconTag, IconEuro,
} from "@/components/icons";

type Ico = (p: { className?: string }) => React.ReactElement;

/**
 * Clé de recherche insensible à la casse, aux accents, aux tirets bas et aux
 * espaces. Les catégories cohabitent en base sous plusieurs graphies héritées
 * des imports (« Frais Fixes » / « Frais_Fixes », « Materiel » / « Matériel »,
 * « Subventions/Dons » / « Subventions_Dons ») : sans normalisation, la moitié
 * des lignes retombait sur l'icône euro générique.
 */
const cle = (v: string): string =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function chercher(table: Record<string, Ico>, valeur?: string | null): Ico | null {
  if (!valeur) return null;
  const k = cle(valeur);
  for (const [nom, ico] of Object.entries(table)) if (cle(nom) === k) return ico;
  return null;
}

/**
 * Icône illustrant une catégorie financière. La spécification prime sur le type
 * (« Transport » est plus parlant que « Frais techniques »).
 */
const PAR_SPECIFICATION: Record<string, Ico> = {
  "Achat de matériel": IconBox,
  "Location de matériel": IconBox,
  "Frais Entretien": IconWrench,
  "Frais IT": IconCloud,
  "Google Drive": IconCloud,
  "Site Internet": IconGlobe,
  "Local": IconBuilding,
  "Salle": IconBuilding,
  "Assurance": IconShield,
  "Frais Bancaires": IconBank,
  "Techniciens": IconUser,
  "Transport": IconTruck,
  "Booking DJ": IconMusic,
  "Photographe/Vidéaste": IconCamera,
  "DA/Graphiste": IconPalette,
  "Communication": IconMegaphone,
  "Vente de Materiel": IconTag,
  "Recettes Evenement": IconTicket,
  "Don": IconGift,
  "Subvention": IconGift,
  "Remboursement": IconRefresh,
  "Billetterie": IconTicket,
};

const PAR_TYPE: Record<string, Ico> = {
  "Matériel": IconBox,
  "Prestation": IconBox,
  "Évènement": IconTicket,
  "Subventions/Dons": IconGift,
  "Vente Materiel": IconTag,
  "Frais_Fixes": IconBuilding,
  "Frais_Techniques": IconUser,
  "Frais_Artistiques": IconMusic,
  "Prestation_Tech": IconBox,
  "Vente_Materiel": IconTag,
  "Recettes_Evenement": IconTicket,
  "Subventions_Dons": IconGift,
  "Remboursement": IconRefresh,
};

export function CategorieIcon({
  type,
  specification,
  className = "h-4 w-4",
}: {
  type?: string | null;
  specification?: string | null;
  className?: string;
}) {
  const Ico = chercher(PAR_SPECIFICATION, specification) ?? chercher(PAR_TYPE, type) ?? IconEuro;
  return <Ico className={className} />;
}
