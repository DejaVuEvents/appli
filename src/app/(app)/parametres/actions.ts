"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { getMembreActuel } from "@/lib/membre";
import { BUCKET_PRIVE } from "@/lib/storage";

/** Vérifie que l'utilisateur courant est co-président (sinon lève une erreur). */
async function assertCoPresident(supabase: Awaited<ReturnType<typeof createSupabase>>) {
  const moi = await getMembreActuel(supabase);
  if (moi?.role !== "co_president") throw new Error("Action réservée aux co-présidents.");
}

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function addTarifDegressifGlobal(formData: FormData) {
  const supabase = await createSupabase();
  await assertCoPresident(supabase);
  const { error } = await supabase.from("tarif_degressif_global").insert({
    jour_min: num(formData.get("jour_min")) ?? 2,
    coefficient: num(formData.get("coefficient")) ?? 1,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
}

export async function deleteTarifDegressifGlobal(tarifId: string) {
  const supabase = await createSupabase();
  await assertCoPresident(supabase);
  const { error } = await supabase.from("tarif_degressif_global").delete().eq("id", tarifId);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function int(v: FormDataEntryValue | null): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function logoFromForm(formData: FormData): Promise<{ logo?: string | null }> {
  // Suppression demandée
  if (formData.get("supprimer_logo") === "on") return { logo: null };
  const file = formData.get("logo_file");
  if (file && file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Le logo doit être une image.");
    if (file.size > 1_000_000) throw new Error("Logo trop volumineux (max 1 Mo).");
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { logo: `data:${file.type};base64,${base64}` };
  }
  // Pas de changement de logo
  return {};
}

async function uploadProfil(supabase: Awaited<ReturnType<typeof createSupabase>>, file: File | null, kind: string): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Le fichier doit être une image (PNG, JPG…).");
  if (file.size > 2_000_000) throw new Error("Image trop volumineuse (max 2 Mo).");
  const ext = file.name.split(".").pop() ?? "png";
  const path = `profils/${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = await file.arrayBuffer();
  // Bucket privé : on stocke le CHEMIN (photo de profil et signature = données personnelles),
  // affiché via URL signée temporaire.
  const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, buffer, {
    contentType: file.type, upsert: false,
  });
  if (error) throw new Error(`Upload ${kind} : ${error.message}`);
  return data.path;
}

/** Met à jour le profil du membre connecté (Mon compte) : infos + photo + signature. */
export async function updateMonCompte(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");

  const photo = await uploadProfil(supabase, formData.get("photo") as File | null, "photo");
  const signature = await uploadProfil(supabase, formData.get("signature") as File | null, "signature");

  const patch: Record<string, unknown> = {
    nom: str(formData.get("nom")),
    prenom: str(formData.get("prenom")),
    adresse: str(formData.get("adresse")),
    telephone: str(formData.get("telephone")),
    iban: str(formData.get("iban")),
    fonction: str(formData.get("fonction")),
  };
  if (photo) patch.photo_url = photo;
  if (signature) patch.signature_url = signature;
  if (formData.get("supprimer_signature") === "on") patch.signature_url = null;
  if (formData.get("supprimer_photo") === "on") patch.photo_url = null;

  const { error } = await supabase.from("membre").update(patch).eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
}

/**
 * Réglages « admin » d'un membre (rôle, actif, compétences) — réservé aux co-présidents.
 * Le NOM/PRÉNOM n'est PAS modifiable ici : chaque personne édite le sien dans « Mon compte ».
 */
export async function updateMembre(id: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertCoPresident(supabase);
  const roleRaw = String(formData.get("role") ?? "membre");
  const role = ["co_president", "technique", "membre"].includes(roleRaw) ? roleRaw : "membre";
  const competences = formData.getAll("competences").map((v) => String(v)).filter(Boolean);
  const { error } = await supabase
    .from("membre")
    .update({
      role,
      actif: formData.get("actif") === "on",
      competences,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
}

export async function updateEntreprise(id: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertCoPresident(supabase);
  const logoPatch = await logoFromForm(formData);
  const { error } = await supabase
    .from("parametres_entreprise")
    .update({
      ...logoPatch,
      raison_sociale: str(formData.get("raison_sociale")),
      adresse: str(formData.get("adresse")),
      code_postal: str(formData.get("code_postal")),
      ville: str(formData.get("ville")),
      pays: str(formData.get("pays")),
      iban: str(formData.get("iban")),
      siren: str(formData.get("siren")),
      mention_tva: str(formData.get("mention_tva")),
      taux_tva: num(formData.get("taux_tva")) ?? 0,
      conditions_devis: str(formData.get("conditions_devis")),
      conditions_facture: str(formData.get("conditions_facture")),
      prochain_num_devis: int(formData.get("prochain_num_devis")),
      prochain_num_facture: int(formData.get("prochain_num_facture")),
      format_date: str(formData.get("format_date")) ?? "fr",
      qonto_login: str(formData.get("qonto_login")),
      qonto_token: str(formData.get("qonto_token")),
      qonto_account_slug: str(formData.get("qonto_account_slug")),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
}

/** Modèle de message e-mail pré-rempli pour l'envoi des devis/factures.
 *  Action dédiée : ne casse pas les autres réglages si la colonne n'existe pas encore. */
export async function updateEmailModele(id: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertCoPresident(supabase);
  const { error } = await supabase
    .from("parametres_entreprise")
    .update({ email_message: str(formData.get("email_message")) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
}
