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

/** Trouve une catégorie par nom (insensible à la casse) ou la crée. */
async function findOrCreateCategorie(
  supabase: Awaited<ReturnType<typeof createSupabase>>,
  nom: string | null,
): Promise<string | null> {
  if (!nom) return null;
  const { data: existing } = await supabase
    .from("categorie")
    .select("id")
    .ilike("nom", nom)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("categorie")
    .insert({ nom })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

async function uploadPhoto(
  supabase: Awaited<ReturnType<typeof createSupabase>>,
  file: File,
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = await file.arrayBuffer();
  const { data, error } = await supabase.storage.from("catalogue").upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`Upload photo: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from("catalogue").getPublicUrl(data.path);
  return publicUrl;
}

async function referenceFromForm(
  supabase: Awaited<ReturnType<typeof createSupabase>>,
  formData: FormData,
  existingPhotoUrl?: string | null,
) {
  const phase = str(formData.get("phase"));
  const categorie_id = await findOrCreateCategorie(
    supabase,
    str(formData.get("categorie_nom")),
  );
  const photoFile = formData.get("photo") as File | null;
  const removePhoto = formData.get("remove_photo") === "1";
  let photo_url = existingPhotoUrl ?? null;
  if (removePhoto) {
    photo_url = null;
  } else if (photoFile && photoFile.size > 0) {
    photo_url = await uploadPhoto(supabase, photoFile);
  }
  return {
    nom: String(formData.get("nom") ?? "").trim(),
    designation: str(formData.get("designation")),
    photo_url,
    categorie_id,
    description: str(formData.get("description")),
    prix_location_jour: num(formData.get("prix_location_jour")) ?? 0,
    // Coût fournisseur (sous-location). Vide → NULL (matériel possédé par Déjà Vu).
    cout_location_jour: num(formData.get("cout_location_jour")),
    puissance_w: num(formData.get("puissance_w")),
    intensite_a: num(formData.get("intensite_a")),
    phase: phase === "mono" || phase === "tri" ? phase : null,
    connecteurs_puissance: formData.getAll("connecteurs_puissance").map(String),
    connecteurs_data: formData.getAll("connecteurs_data").map(String),
    poids_kg: num(formData.get("poids_kg")),
    charge_max_kg: num(formData.get("charge_max_kg")),
    dimensions: str(formData.get("dimensions")),
    est_consommable: formData.get("est_consommable") === "on",
  };
}

// ---------- Références ----------

export async function createReference(formData: FormData) {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("materiel_reference")
    .insert(await referenceFromForm(supabase, formData, null))
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/catalogue");
  // On reste en mode édition pour pouvoir enchaîner (unités, accessoires).
  redirect(`/catalogue/${data.id}?edit=1`);
}

export async function updateReference(id: string, formData: FormData) {
  const supabase = await createSupabase();
  // Récupère la photo actuelle pour la conserver si pas de nouvelle photo
  const { data: existing } = await supabase
    .from("materiel_reference")
    .select("photo_url")
    .eq("id", id)
    .single();
  const { error } = await supabase
    .from("materiel_reference")
    .update(await referenceFromForm(supabase, formData, existing?.photo_url ?? null))
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalogue/${id}`);
  revalidatePath("/catalogue");
  redirect(`/catalogue/${id}?edit=1`);
}

export async function deleteReference(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("materiel_reference").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/catalogue");
  redirect("/catalogue");
}

// ---------- Unités sérialisées ----------

function uniteFromForm(formData: FormData) {
  // Surcharge des connecteurs : si la case n'est pas cochée, l'unité hérite
  // de la référence (on stocke NULL).
  const override = formData.get("override_connecteurs") === "on";
  return {
    numero_serie: str(formData.get("numero_serie")),
    qr_code: str(formData.get("qr_code")),
    etat: str(formData.get("etat")) ?? "ok",
    date_achat: str(formData.get("date_achat")),
    prix_achat: num(formData.get("prix_achat")),
    connecteurs_puissance: override
      ? formData.getAll("u_connecteurs_puissance").map(String)
      : null,
    connecteurs_data: override
      ? formData.getAll("u_connecteurs_data").map(String)
      : null,
  };
}

export async function addUnite(referenceId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("unite").insert({
    reference_id: referenceId,
    ...uniteFromForm(formData),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/catalogue/${referenceId}`);
}

export async function updateUnite(
  referenceId: string,
  uniteId: string,
  formData: FormData,
) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("unite")
    .update(uniteFromForm(formData))
    .eq("id", uniteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalogue/${referenceId}`);
}

export async function deleteUnite(referenceId: string, uniteId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("unite").delete().eq("id", uniteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalogue/${referenceId}`);
}

/** Génère le code QR d'une unité si elle n'en a pas (= son identifiant). */
export async function genererQrCode(referenceId: string, uniteId: string) {
  const supabase = await createSupabase();
  const { data: u } = await supabase
    .from("unite")
    .select("qr_code")
    .eq("id", uniteId)
    .single();
  if (!u?.qr_code) {
    const { error } = await supabase
      .from("unite")
      .update({ qr_code: uniteId })
      .eq("id", uniteId);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/catalogue/${referenceId}`);
}

// ---------- Accessoires (règles de kit : obligatoires + optionnels) ----------

/** Trouve une référence par nom (insensible à la casse) ou la crée (consommable par défaut). */
async function findOrCreateAccessoire(
  supabase: Awaited<ReturnType<typeof createSupabase>>,
  nom: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("materiel_reference")
    .select("id")
    .ilike("nom", nom)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("materiel_reference")
    .insert({ nom, est_consommable: true })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

export async function addKitRegle(referenceId: string, formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("accessoire_nom"));
  if (!nom) throw new Error("Nom de l'accessoire requis");

  const accessoireId = await findOrCreateAccessoire(supabase, nom);
  if (accessoireId === referenceId) {
    throw new Error("Un objet ne peut pas être son propre accessoire.");
  }

  const { error } = await supabase.from("kit_regle").insert({
    reference_parent_id: referenceId,
    reference_accessoire_id: accessoireId,
    quantite_par_unite: num(formData.get("quantite_par_unite")) ?? 1,
    obligatoire: formData.get("obligatoire") === "obligatoire",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/catalogue/${referenceId}`);
}

export async function deleteKitRegle(referenceId: string, regleId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("kit_regle").delete().eq("id", regleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/catalogue/${referenceId}`);
}

/** Met à jour l'ordre d'affichage et le nom des catégories (ordre_<id>, nom_<id>). */
export async function updateCategoriesOrdre(formData: FormData) {
  const supabase = await createSupabase();
  const updates = new Map<string, { ordre?: number; nom?: string }>();
  for (const [key, value] of formData.entries()) {
    const mOrdre = key.match(/^ordre_(.+)$/);
    const mNom = key.match(/^nom_(.+)$/);
    if (mOrdre) {
      const n = Number(String(value).trim());
      updates.set(mOrdre[1], { ...updates.get(mOrdre[1]), ordre: Number.isFinite(n) ? n : 0 });
    } else if (mNom) {
      const s = String(value).trim();
      if (s) updates.set(mNom[1], { ...updates.get(mNom[1]), nom: s });
    }
  }
  for (const [id, patch] of updates) {
    await supabase.from("categorie").update(patch).eq("id", id);
  }
  revalidatePath("/parametres");
  revalidatePath("/catalogue");
}

/**
 * Crée une catégorie de matériel, éventuellement comme sous-catégorie (parent_id).
 */
export async function createCategorie(parentId: string | null, formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) return;
  const { error } = await supabase
    .from("categorie")
    .insert({ nom, parent_id: parentId, ordre: num(formData.get("ordre")) ?? 99 });
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
  revalidatePath("/catalogue");
}

/**
 * Supprime une catégorie de matériel.
 * Bloque si des références de matériel ou des sous-catégories y sont rattachées.
 */
export async function deleteCategorie(id: string) {
  const supabase = await createSupabase();

  const [{ count: refCount }, { count: enfantCount }] = await Promise.all([
    supabase.from("materiel_reference").select("id", { count: "exact", head: true }).eq("categorie_id", id),
    supabase.from("categorie").select("id", { count: "exact", head: true }).eq("parent_id", id),
  ]);

  if ((refCount ?? 0) > 0) {
    throw new Error(`Impossible de supprimer : ${refCount} référence(s) de matériel utilisent cette catégorie. Réaffecte-les d'abord.`);
  }
  if ((enfantCount ?? 0) > 0) {
    throw new Error(`Impossible de supprimer : cette catégorie contient ${enfantCount} sous-catégorie(s). Supprime-les d'abord.`);
  }

  const { error } = await supabase.from("categorie").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
  revalidatePath("/catalogue");
}
