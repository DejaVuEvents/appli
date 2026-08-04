"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export async function createSession(formData: FormData) {
  const supabase = await createSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: session, error } = await supabase
    .from("session_inventaire")
    .insert({ notes: str(formData.get("notes")), utilisateur_id: user?.id ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Pré-remplit une ligne par unité encore exploitable (on exclut réformé / HS).
  const { data: unites } = await supabase
    .from("unite")
    .select("id, etat")
    .not("etat", "in", "(reforme,hs)");
  if (unites && unites.length > 0) {
    const { error: insErr } = await supabase.from("ligne_inventaire").insert(
      unites.map((u) => ({
        session_id: session.id,
        unite_id: u.id,
        present: false,
        etat_constate: u.etat,
      })),
    );
    if (insErr) throw new Error(insErr.message);
  }

  revalidatePath("/inventaire");
  redirect(`/inventaire/${session.id}`);
}

export async function updateSessionNotes(sessionId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("session_inventaire")
    .update({ notes: str(formData.get("notes")) })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/inventaire/${sessionId}`);
}

export async function deleteSession(sessionId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("session_inventaire").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath("/inventaire");
  redirect("/inventaire");
}

export async function togglePresent(sessionId: string, ligneId: string) {
  const supabase = await createSupabase();
  const { data: l } = await supabase.from("ligne_inventaire").select("present").eq("id", ligneId).single();
  const { error } = await supabase
    .from("ligne_inventaire")
    .update({ present: !l?.present })
    .eq("id", ligneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/inventaire/${sessionId}`);
}

/** Met à jour l'état constaté de la ligne ET l'état réel de l'unité. */
export async function setEtatConstate(
  sessionId: string,
  ligneId: string,
  uniteId: string,
  formData: FormData,
) {
  const supabase = await createSupabase();
  const etat = str(formData.get("etat_constate")) ?? "ok";
  const { error } = await supabase
    .from("ligne_inventaire")
    .update({ etat_constate: etat })
    .eq("id", ligneId);
  if (error) throw new Error(error.message);
  await supabase.from("unite").update({ etat }).eq("id", uniteId);
  revalidatePath(`/inventaire/${sessionId}`);
}

export async function setRemarqueInventaire(sessionId: string, ligneId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("ligne_inventaire")
    .update({ remarque_maintenance: str(formData.get("remarque")) })
    .eq("id", ligneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/inventaire/${sessionId}`);
}
