"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { appliquerSortie, appliquerRetour, resoudrePrestationUnite } from "@/lib/mouvements";

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/** Pointe une unité dans une session d'inventaire (présence + état + remarque). */
export async function pointerInventaire(
  code: string,
  sessionId: string,
  uniteId: string,
  formData: FormData,
) {
  const supabase = await createSupabase();
  const present = formData.get("present") === "on";
  const etat = str(formData.get("etat_constate")); // null si non fourni → on n'écrase rien
  const remarque = str(formData.get("remarque"));

  const { data: existing } = await supabase
    .from("ligne_inventaire")
    .select("id")
    .eq("session_id", sessionId)
    .eq("unite_id", uniteId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("ligne_inventaire")
      .update({ present, etat_constate: etat, remarque_maintenance: remarque })
      .eq("id", existing.id);
  } else {
    await supabase.from("ligne_inventaire").insert({
      session_id: sessionId,
      unite_id: uniteId,
      present,
      etat_constate: etat,
      remarque_maintenance: remarque,
    });
  }

  // Aligne l'état réel de l'unité UNIQUEMENT si un état a été constaté explicitement
  // (évite de réinitialiser à « ok » et d'écraser un état maintenance/HS existant).
  if (etat) await supabase.from("unite").update({ etat }).eq("id", uniteId);

  revalidatePath(`/u/${code}`);
  revalidatePath(`/inventaire/${sessionId}`);
}

/** Met à jour l'état, la date de dernière maintenance et les remarques de l'unité. */
export async function updateUniteMaintenance(code: string, uniteId: string, formData: FormData) {
  const supabase = await createSupabase();
  const etat = str(formData.get("etat")) ?? "ok";
  const intJours = str(formData.get("maintenance_intervalle_jours"));
  const intHeures = str(formData.get("maintenance_intervalle_heures"));
  const { error } = await supabase
    .from("unite")
    .update({
      etat,
      date_derniere_maintenance: str(formData.get("date_derniere_maintenance")),
      maintenance_intervalle_jours: intJours ? parseInt(intJours, 10) : null,
      maintenance_intervalle_heures: intHeures ? Number(intHeures.replace(",", ".")) : null,
      remarques: str(formData.get("remarques")),
    })
    .eq("id", uniteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/u/${code}`);
}

export async function ficheSortie(code: string, uniteId: string) {
  const supabase = await createSupabase();
  const { data } = await supabase.auth.getUser();
  await appliquerSortie(supabase, uniteId, await resoudrePrestationUnite(supabase, uniteId), data.user?.id ?? null);
  revalidatePath(`/u/${code}`);
}

export async function ficheRetour(code: string, uniteId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { data } = await supabase.auth.getUser();
  await appliquerRetour(
    supabase,
    uniteId,
    await resoudrePrestationUnite(supabase, uniteId),
    data.user?.id ?? null,
    num(formData.get("heures")),
  );
  revalidatePath(`/u/${code}`);
}
