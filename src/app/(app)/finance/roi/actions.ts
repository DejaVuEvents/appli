"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function revalider() {
  revalidatePath("/finance/roi");
}

export async function createRoiItem(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("roi_materiel").insert({
    nom: formData.get("nom") as string,
    est_achete: formData.get("est_achete") === "1",
    reference_id: (formData.get("reference_id") as string) || null,
    cout_initial: parseFloat(formData.get("cout_initial") as string) || 0,
    maintenance_annuelle: parseFloat(formData.get("maintenance_annuelle") as string) || 0,
    duree_investissement_ans: parseInt(formData.get("duree_investissement_ans") as string) || 3,
    prix_location_ttc: parseFloat(formData.get("prix_location_ttc") as string) || 0,
    volume_prevu_par_an: parseInt(formData.get("volume_prevu_par_an") as string) || 0,
    volume_interne_par_an: parseInt(formData.get("volume_interne_par_an") as string) || 0,
    prix_revente: parseFloat(formData.get("prix_revente") as string) || 0,
    cout_location_externe: parseFloat(formData.get("cout_location_externe") as string) || 0,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) throw error;
  revalider();
  redirect("/finance/roi");
}

export async function updateRoiItem(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("roi_materiel").update({
    nom: formData.get("nom") as string,
    est_achete: formData.get("est_achete") === "1",
    reference_id: (formData.get("reference_id") as string) || null,
    cout_initial: parseFloat(formData.get("cout_initial") as string) || 0,
    maintenance_annuelle: parseFloat(formData.get("maintenance_annuelle") as string) || 0,
    duree_investissement_ans: parseInt(formData.get("duree_investissement_ans") as string) || 3,
    prix_location_ttc: parseFloat(formData.get("prix_location_ttc") as string) || 0,
    volume_prevu_par_an: parseInt(formData.get("volume_prevu_par_an") as string) || 0,
    volume_interne_par_an: parseInt(formData.get("volume_interne_par_an") as string) || 0,
    prix_revente: parseFloat(formData.get("prix_revente") as string) || 0,
    cout_location_externe: parseFloat(formData.get("cout_location_externe") as string) || 0,
    notes: (formData.get("notes") as string) || null,
  }).eq("id", id);
  if (error) throw error;
  revalider();
  redirect("/finance/roi");
}

export async function deleteRoiItem(id: string) {
  const supabase = await createClient();
  await supabase.from("roi_materiel").delete().eq("id", id);
  revalider();
}
