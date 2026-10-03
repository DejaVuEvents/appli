"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { getMembreActuel } from "@/lib/membre";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

const CHAMPS = [
  "manifestation", "lieu_montage", "dates_exploitation", "organisateur",
  "organisateur_adresse", "installateur", "responsable_montage",
  "installateur_adresse", "documents_plans", "fabrique_par", "descriptif",
  "soussigne", "fait_a",
] as const;

function rafraichir(prestationId: string) {
  revalidatePath(`/prestations/${prestationId}`);
}

/**
 * Enregistre l'attestation, et la crée si c'est la première fois : la popup est
 * pré-remplie avant même qu'une ligne existe.
 */
export async function modifierAttestation(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  const { data: a } = await supabase
    .from("attestation_montage").select("id, statut").eq("prestation_id", prestationId).maybeSingle();
  if (a && a.statut === "validee") {
    throw new Error("Attestation déjà signée : retire la signature pour la modifier.");
  }

  const payload: Record<string, string | null> = {};
  for (const c of CHAMPS) payload[c] = str(formData.get(c));
  const faitLe = str(formData.get("fait_le"));

  const { error } = a
    ? await supabase
        .from("attestation_montage")
        .update({ ...payload, fait_le: faitLe, updated_at: new Date().toISOString() })
        .eq("id", a.id)
    : await supabase.from("attestation_montage").insert({
        prestation_id: prestationId,
        redacteur_id: membre?.id ?? null,
        ...payload,
        fait_le: faitLe,
      });
  if (error) throw new Error(error.message);
  rafraichir(prestationId);
}

/**
 * Appose la signature du responsable du montage. Le modèle officiel n'en prévoit
 * qu'une : c'est lui qui certifie avoir monté ou fait monter.
 *
 * Enregistre d'abord la saisie : le bouton vit dans le formulaire, signer sans
 * sauvegarder figerait l'état précédent.
 */
export async function signerAttestation(prestationId: string, formData?: FormData) {
  const supabase = await createSupabase();
  if (formData) await modifierAttestation(prestationId, formData);

  const membre = await getMembreActuel(supabase);
  if (!membre?.signature_url) {
    throw new Error("Aucune signature enregistrée : ajoute-la dans Paramètres → Mon compte.");
  }

  const { data: a } = await supabase
    .from("attestation_montage")
    .select("id, manifestation, descriptif")
    .eq("prestation_id", prestationId)
    .maybeSingle();
  if (!a) throw new Error("Attestation introuvable.");
  if (!a.manifestation || !a.descriptif) {
    throw new Error("Complète au moins la manifestation et la description des moyens mis en place.");
  }

  await supabase
    .from("attestation_montage")
    .update({
      statut: "validee",
      redacteur_id: membre.id,
      redacteur_signe_le: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", a.id);
  rafraichir(prestationId);
}

/** Retire la signature pour pouvoir corriger le document. */
export async function retirerSignatureAttestation(prestationId: string) {
  const supabase = await createSupabase();
  await supabase
    .from("attestation_montage")
    .update({ statut: "brouillon", redacteur_signe_le: null, updated_at: new Date().toISOString() })
    .eq("prestation_id", prestationId);
  rafraichir(prestationId);
}

export async function supprimerAttestation(prestationId: string) {
  const supabase = await createSupabase();
  await supabase.from("attestation_montage").delete().eq("prestation_id", prestationId);
  rafraichir(prestationId);
}
