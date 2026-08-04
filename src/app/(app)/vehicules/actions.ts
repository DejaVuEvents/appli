"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function fromForm(formData: FormData) {
  return {
    nom: String(formData.get("nom") ?? "").trim(),
    type: str(formData.get("type")),
    cout_location_jour: num(formData.get("cout_location_jour")) ?? 0,
    cout_km: num(formData.get("cout_km")) ?? 0,
    capacite_m3: num(formData.get("capacite_m3")),
  };
}

export async function createVehicule(formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("vehicule").insert(fromForm(formData));
  if (error) throw new Error(error.message);
  revalidatePath("/vehicules");
}

export async function updateVehicule(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("vehicule").update(fromForm(formData)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/vehicules");
  redirect("/vehicules");
}

export async function deleteVehicule(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("vehicule").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/vehicules");
  redirect("/vehicules");
}
