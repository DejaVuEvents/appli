import {
  IconBox, IconWrench, IconTruck, IconCloud, IconGlobe, IconBuilding, IconShield,
  IconBank, IconUser, IconMusic, IconCamera, IconPalette, IconMegaphone,
  IconTicket, IconGift, IconRefresh, IconTag, IconEuro,
} from "@/components/icons";

type Ico = (p: { className?: string }) => React.ReactElement;

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
};

const PAR_TYPE: Record<string, Ico> = {
  "Matériel": IconBox,
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
  const Ico = (specification && PAR_SPECIFICATION[specification]) || (type && PAR_TYPE[type]) || IconEuro;
  return <Ico className={className} />;
}
