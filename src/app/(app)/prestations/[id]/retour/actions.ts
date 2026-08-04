"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { BUCKET_PRIVE } from "@/lib/storage";

type Supa = Awaited<ReturnType<typeof createSupabase>>;

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

async function uploadPhoto(supabase: Supa, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `retour/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, await file.arrayBuffer(), {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`Upload photo retour: ${error.message}`);
  return data.path;
}

/** Enregistre le contrôle de retour d'une unité (état, remarque, photo). */
export async function saveControleRetour(prestationId: string, uniteId: string, formData: FormData) {
  const supabase = await createSupabase();
  const etat = str(formData.get("etat")) ?? "ok";
  const remarque = str(formData.get("remarque"));
  const photoUrl = await uploadPhoto(supabase, formData.get("photo") as File | null);

  const { data: existant } = await supabase
    .from("controle_retour")
    .select("id, photo_url")
    .eq("prestation_id", prestationId)
    .eq("unite_id", uniteId)
    .maybeSingle();

  const patch: Record<string, unknown> = { etat, remarque, controle: true };
  if (photoUrl) patch.photo_url = photoUrl;

  if (existant) {
    await supabase.from("controle_retour").update(patch).eq("id", existant.id);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("controle_retour").insert({ prestation_id: prestationId, unite_id: uniteId, ...patch, created_by: user?.id ?? null });
  }

  // Répercussion sur l'état de l'unité (casse → maintenance, HS → hs)
  if (etat === "casse") await supabase.from("unite").update({ etat: "maintenance" }).eq("id", uniteId);
  else if (etat === "hs") await supabase.from("unite").update({ etat: "hs" }).eq("id", uniteId);

  revalidatePath(`/prestations/${prestationId}/retour`);
  revalidatePath(`/u/${uniteId}`);
}
