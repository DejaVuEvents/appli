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
    email: str(formData.get("email")),
    telephone: str(formData.get("telephone")),
    adresse: str(formData.get("adresse")),
    siret: str(formData.get("siret")),
    tva_intra: str(formData.get("tva_intra")),
    iban: str(formData.get("iban")),
    bic: str(formData.get("bic")),
    tarif_preferentiel_pct: num(formData.get("tarif_preferentiel_pct")) ?? 0,
    notes: str(formData.get("notes")),
  };
}

export async function createClientFiche(formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("client").insert(fromForm(formData));
  if (error) throw new Error(error.message);
  revalidatePath("/clients");
}

export async function updateClientFiche(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("client").update(fromForm(formData)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function deleteClientFiche(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("client").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateClientNotes(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("client").update({ notes: str(formData.get("notes")) }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${id}`);
}

export async function addContact(clientId: string, formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) return;
  const { error } = await supabase.from("client_contact").insert({
    client_id: clientId,
    nom,
    role: str(formData.get("role")),
    email: str(formData.get("email")),
    telephone: str(formData.get("telephone")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteContact(clientId: string, contactId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("client_contact").delete().eq("id", contactId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
}
