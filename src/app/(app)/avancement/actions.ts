"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function intv(v: FormDataEntryValue | null): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// ---------- Projets ----------

export async function createProjet(formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("projet_suivi").insert({
    nom: str(formData.get("nom")) ?? "Projet",
    responsable: str(formData.get("responsable")),
    support: str(formData.get("support")),
    type: str(formData.get("type")),
    evenement: str(formData.get("evenement")),
    avancement: str(formData.get("avancement")) ?? "pas_demarre",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

/** Change l'événement rattaché à un projet (select auto-submit). */
export async function setEvenement(projetId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("projet_suivi").update({ evenement: str(formData.get("evenement")) }).eq("id", projetId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

/** Archive / désarchive un projet. */
export async function archiverProjet(projetId: string, archive: boolean) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("projet_suivi").update({ archive }).eq("id", projetId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

export async function updateProjet(projetId: string, formData: FormData) {
  const supabase = await createSupabase();
  const patch: Record<string, unknown> = {};
  for (const k of ["nom", "responsable", "support", "type", "avancement"]) {
    if (formData.has(k)) patch[k] = str(formData.get(k));
  }
  if (formData.has("archive")) patch.archive = formData.get("archive") === "on";
  const { error } = await supabase.from("projet_suivi").update(patch).eq("id", projetId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

/** Change uniquement l'avancement (select auto-submit). */
export async function setAvancement(projetId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("projet_suivi").update({ avancement: str(formData.get("avancement")) ?? "pas_demarre" }).eq("id", projetId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

export async function deleteProjet(projetId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("projet_suivi").delete().eq("id", projetId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

// ---------- Notes hebdomadaires ----------

export async function saveNote(projetId: string, annee: number, semaine: number, formData: FormData) {
  const supabase = await createSupabase();
  const note = str(formData.get("note"));
  const { error } = await supabase
    .from("projet_note")
    .upsert({ projet_id: projetId, annee, semaine, note, updated_at: new Date().toISOString() }, { onConflict: "projet_id,annee,semaine" });
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

export async function saveSemaineInfo(annee: number, semaine: number, formData: FormData) {
  const supabase = await createSupabase();
  const note = str(formData.get("note"));
  const { error } = await supabase
    .from("semaine_info")
    .upsert({ annee, semaine, note, updated_at: new Date().toISOString() }, { onConflict: "annee,semaine" });
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

// ---------- Contenu communication (Orga_Comm) ----------

export async function createContenu(formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("contenu_comm").insert({
    type: str(formData.get("type")),
    concept: str(formData.get("concept")),
    deadline: str(formData.get("deadline")),
    commentaires: str(formData.get("commentaires")),
    inspirations: str(formData.get("inspirations")),
    musiques: str(formData.get("musiques")),
    respo: str(formData.get("respo")),
    statut: str(formData.get("statut")) ?? "a_faire",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

export async function updateContenu(contenuId: string, formData: FormData) {
  const supabase = await createSupabase();
  const patch: Record<string, unknown> = {};
  for (const k of ["type", "concept", "deadline", "commentaires", "inspirations", "musiques", "respo", "statut"]) {
    if (formData.has(k)) patch[k] = str(formData.get(k));
  }
  const { error } = await supabase.from("contenu_comm").update(patch).eq("id", contenuId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

export async function setContenuStatut(contenuId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("contenu_comm").update({ statut: str(formData.get("statut")) ?? "a_faire" }).eq("id", contenuId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}

export async function deleteContenu(contenuId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("contenu_comm").delete().eq("id", contenuId);
  if (error) throw new Error(error.message);
  revalidatePath("/avancement");
}
