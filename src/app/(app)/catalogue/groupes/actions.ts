"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function rafraichir() {
  revalidatePath("/catalogue/groupes");
  revalidatePath("/catalogue");
}

/** Identifiant de la catégorie « Groupes », créée au besoin. */
async function categorieGroupes(supabase: Awaited<ReturnType<typeof createSupabase>>) {
  const { data } = await supabase.from("categorie").select("id").eq("nom", "Groupes").maybeSingle();
  if (data) return data.id as string;
  const { data: cree } = await supabase
    .from("categorie").insert({ nom: "Groupes" }).select("id").single();
  return cree?.id as string | undefined;
}

/**
 * Crée un groupe : une référence qui en contient d'autres. C'est une référence à
 * part entière — elle a un prix, elle s'ajoute à un devis, elle peut porter sa
 * propre fiche ROI — mais engager le groupe engage tout ce qu'il contient.
 */
export async function creerGroupe(formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) throw new Error("Donne un nom au groupe.");
  const { error } = await supabase.from("materiel_reference").insert({
    nom,
    designation: str(formData.get("designation")),
    prix_location_jour: num(formData.get("prix_location_jour")),
    categorie_id: await categorieGroupes(supabase),
    est_groupe: true,
    est_consommable: false,
  });
  if (error) throw new Error(error.message);
  rafraichir();
}

export async function renommerGroupe(groupeId: string, formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) throw new Error("Le nom est obligatoire.");
  const { error } = await supabase
    .from("materiel_reference")
    .update({
      nom,
      designation: str(formData.get("designation")),
      prix_location_jour: num(formData.get("prix_location_jour")),
    })
    .eq("id", groupeId);
  if (error) throw new Error(error.message);
  rafraichir();
}

/** Ajoute (ou met à jour) un composant du groupe. */
export async function ajouterComposant(groupeId: string, formData: FormData) {
  const supabase = await createSupabase();
  const referenceId = str(formData.get("reference_id"));
  if (!referenceId) throw new Error("Choisis une référence du catalogue.");
  if (referenceId === groupeId) throw new Error("Un groupe ne peut pas se contenir lui-même.");

  // Un groupe ne contient pas un autre groupe : le dépliage serait récursif et la
  // moindre boucle rendrait la liste du matériel infinie.
  const { data: ref } = await supabase
    .from("materiel_reference").select("est_groupe").eq("id", referenceId).maybeSingle();
  if (ref?.est_groupe) throw new Error("Un groupe ne peut pas contenir un autre groupe.");

  const quantite = Math.max(1, num(formData.get("quantite")) || 1);
  const { error } = await supabase.from("kit_regle").upsert(
    {
      reference_parent_id: groupeId,
      reference_accessoire_id: referenceId,
      quantite_par_unite: quantite,
      obligatoire: true,
    },
    { onConflict: "reference_parent_id,reference_accessoire_id" },
  );
  if (error) throw new Error(error.message);
  rafraichir();
}

export async function retirerComposant(groupeId: string, referenceId: string) {
  const supabase = await createSupabase();
  await supabase
    .from("kit_regle")
    .delete()
    .eq("reference_parent_id", groupeId)
    .eq("reference_accessoire_id", referenceId);
  rafraichir();
}

export async function supprimerGroupe(groupeId: string) {
  const supabase = await createSupabase();
  const { count } = await supabase
    .from("ligne_prestation")
    .select("id", { count: "exact", head: true })
    .eq("reference_id", groupeId);
  if ((count ?? 0) > 0) {
    throw new Error(
      `Ce groupe est utilisé sur ${count} ligne(s) de devis : le supprimer les laisserait sans référence. Retire-le d'abord de ces documents.`,
    );
  }
  await supabase.from("kit_regle").delete().eq("reference_parent_id", groupeId);
  await supabase.from("materiel_reference").delete().eq("id", groupeId);
  rafraichir();
}
