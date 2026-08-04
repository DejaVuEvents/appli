export type KitRow = {
  id: string;
  quantite_par_unite: number;
  obligatoire: boolean;
  accessoire: { nom: string } | null;
};
