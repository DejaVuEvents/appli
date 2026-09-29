"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { getMembreActuel } from "@/lib/membre";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

function rafraichir() {
  revalidatePath("/catalogue/rattachement");
  revalidatePath("/finance/roi");
  revalidatePath("/prestations");
}

/**
 * Rattache d'un coup TOUTES les lignes portant ce libellé exact et encore libres.
 *
 * On ne génère pas les accessoires automatiques du kit, contrairement au
 * rattachement d'une ligne dans le constructeur : ces documents sont émis, parfois
 * facturés, et leur ajouter des lignes après coup changerait leur montant.
 */
export async function rattacherLibelle(formData: FormData) {
  const supabase = await createSupabase();
  const designation = str(formData.get("designation"));
  const referenceId = str(formData.get("reference_id"));
  if (!designation || !referenceId) return;

  const { data: ref } = await supabase
    .from("materiel_reference")
    .select("categorie_id")
    .eq("id", referenceId)
    .maybeSingle();

  const { data: lignes } = await supabase
    .from("ligne_prestation")
    .select("id, categorie_id")
    .is("reference_id", null)
    .eq("designation", designation);

  for (const l of lignes ?? []) {
    await supabase
      .from("ligne_prestation")
      .update({ reference_id: referenceId, categorie_id: l.categorie_id ?? ref?.categorie_id ?? null })
      .eq("id", l.id);
  }
  rafraichir();
}

/** Sort un libellé de la file : ce n'est pas du matériel de catalogue. */
export async function ignorerLibelle(formData: FormData) {
  const supabase = await createSupabase();
  const designation = str(formData.get("designation"));
  if (!designation) return;
  const membre = await getMembreActuel(supabase);
  await supabase
    .from("libelle_ignore")
    .upsert({ designation, ignore_par: membre?.id ?? null }, { onConflict: "designation" });
  rafraichir();
}

/** Remet un libellé dans la file. */
export async function reprendreLibelle(formData: FormData) {
  const supabase = await createSupabase();
  const designation = str(formData.get("designation"));
  if (!designation) return;
  await supabase.from("libelle_ignore").delete().eq("designation", designation);
  rafraichir();
}
