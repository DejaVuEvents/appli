"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { getMembreActuel, nomMembre } from "@/lib/membre";
import { envoyerMail, baseUrl } from "@/lib/mail";
import { valeursParDefaut } from "@/lib/attestation-data";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

const CHAMPS = [
  "manifestation", "lieu_montage", "dates_exploitation", "organisateur",
  "organisateur_adresse", "installateur", "responsable_montage",
  "installateur_adresse", "documents_plans", "moyens_par", "descriptif",
  "soussigne", "fait_a",
] as const;

function rafraichir(prestationId: string) {
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath(`/prestations/${prestationId}/attestation`);
  revalidatePath("/");
}

/** Crée l'attestation de l'événement, pré-remplie, si elle n'existe pas déjà. */
export async function genererAttestation(prestationId: string) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);

  const { data: deja } = await supabase
    .from("attestation_montage").select("id").eq("prestation_id", prestationId).maybeSingle();
  if (!deja) {
    const defauts = await valeursParDefaut(supabase, prestationId, membre?.id ?? null);
    const { error } = await supabase.from("attestation_montage").insert({
      prestation_id: prestationId,
      redacteur_id: membre?.id ?? null,
      ...defauts,
    });
    if (error) throw new Error(error.message);
  }
  rafraichir(prestationId);
}

export async function modifierAttestation(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  const { data: a } = await supabase
    .from("attestation_montage").select("id, statut").eq("prestation_id", prestationId).maybeSingle();
  if (a && a.statut !== "brouillon" && a.statut !== "refusee") {
    throw new Error("Attestation déjà soumise : repasse-la en brouillon pour la modifier.");
  }

  const payload: Record<string, string | null> = {};
  for (const c of CHAMPS) payload[c] = str(formData.get(c));
  const faitLe = str(formData.get("fait_le"));

  // Première sauvegarde = création : la popup est pré-remplie avant même
  // qu'une ligne existe, enregistrer suffit à la créer.
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
 * Le monteur signe puis soumet : sa signature doit exister, sinon le document
 * partirait en validation avec une case vide.
 */
export async function soumettreAttestation(prestationId: string) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre?.signature_url) {
    throw new Error("Aucune signature enregistrée : ajoute-la dans Paramètres → Mon compte.");
  }
  const { data: a } = await supabase
    .from("attestation_montage")
    .select("id, statut, manifestation, descriptif")
    .eq("prestation_id", prestationId)
    .maybeSingle();
  if (!a) throw new Error("Attestation introuvable.");
  if (!a.manifestation || !a.descriptif) {
    throw new Error("Complète au moins la manifestation et le descriptif des moyens mis en place.");
  }

  await supabase
    .from("attestation_montage")
    .update({
      statut: "soumise",
      redacteur_id: membre.id,
      redacteur_signe_le: new Date().toISOString(),
      motif_refus: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", a.id);

  // Prévenir les co-présidents habilités à valider — tous sauf le rédacteur.
  const { data: copres } = await supabase
    .from("membre").select("email, nom, prenom").eq("role", "co_president").neq("id", membre.id).eq("actif", true);
  const destinataires = ((copres ?? []) as { email: string | null }[]).map((c) => c.email ?? "").filter(Boolean);
  if (destinataires.length > 0) {
    await envoyerMail({
      to: destinataires,
      sujet: `Attestation de bon montage à valider — ${a.manifestation}`,
      corps:
        `${nomMembre(membre)} a soumis l'attestation de bon montage de « ${a.manifestation} ».\n\n`
        + `Elle attend ta signature : ${baseUrl()}/prestations/${prestationId}?attestation=1\n`,
    });
  }
  rafraichir(prestationId);
}

export async function repasserBrouillonAttestation(prestationId: string) {
  const supabase = await createSupabase();
  await supabase
    .from("attestation_montage")
    .update({ statut: "brouillon", redacteur_signe_le: null, updated_at: new Date().toISOString() })
    .eq("prestation_id", prestationId);
  rafraichir(prestationId);
}

/**
 * Validation par un autre co-président : elle appose SA signature sur la case
 * « organisateur » du document. Sans image enregistrée, la case resterait vide et
 * l'attestation ne vaudrait rien.
 */
export async function validerAttestation(prestationId: string) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre || membre.role !== "co_president") throw new Error("Seul un co-président peut valider.");
  if (!membre.signature_url) {
    throw new Error("Tu n'as aucune signature enregistrée : ajoute-la dans Paramètres → Mon compte, puis valide.");
  }

  const { data: a } = await supabase
    .from("attestation_montage")
    .select("id, statut, redacteur_id, manifestation")
    .eq("prestation_id", prestationId)
    .maybeSingle();
  if (!a || a.statut !== "soumise") throw new Error("Attestation introuvable ou non soumise.");
  if (a.redacteur_id === membre.id) throw new Error("Le rédacteur ne peut pas valider sa propre attestation.");

  await supabase
    .from("attestation_montage")
    .update({
      statut: "validee",
      valide_par: membre.id,
      valide_le: new Date().toISOString(),
      motif_refus: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", a.id);

  // Prévenir le rédacteur : c'est lui qui attend le document.
  const { data: red } = a.redacteur_id
    ? await supabase.from("membre").select("email").eq("id", a.redacteur_id).maybeSingle()
    : { data: null };
  const email = (red as { email: string | null } | null)?.email;
  if (email) {
    await envoyerMail({
      to: [email],
      sujet: `Attestation validée — ${a.manifestation}`,
      corps:
        `${nomMembre(membre)} a signé l'attestation de bon montage de « ${a.manifestation} ».\n\n`
        + `Tu peux la télécharger : ${baseUrl()}/prestations/${prestationId}?attestation=1\n`,
    });
  }
  rafraichir(prestationId);
}

export async function refuserAttestation(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre || membre.role !== "co_president") throw new Error("Seul un co-président peut refuser.");
  const motif = str(formData.get("motif_refus"));
  if (!motif) throw new Error("Indique ce qui bloque : sans motif, le rédacteur ne sait pas quoi corriger.");

  await supabase
    .from("attestation_montage")
    .update({ statut: "refusee", motif_refus: motif, updated_at: new Date().toISOString() })
    .eq("prestation_id", prestationId);
  rafraichir(prestationId);
}

export async function supprimerAttestation(prestationId: string) {
  const supabase = await createSupabase();
  await supabase.from("attestation_montage").delete().eq("prestation_id", prestationId);
  rafraichir(prestationId);
}
