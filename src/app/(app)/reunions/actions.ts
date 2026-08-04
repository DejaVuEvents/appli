"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { resumerTranscript, geminiConfigured } from "@/lib/gemini";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function revalider() {
  revalidatePath("/reunions");
  revalidatePath("/");
  revalidatePath("/calendrier");
}

/** Enregistre (ou remplace) le transcript brut d'une réunion. */
export async function saveTranscript(reunionId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("reunion").update({ transcript: str(formData.get("transcript")) }).eq("id", reunionId);
  if (error) throw new Error(error.message);
  revalider();
}

/**
 * Génère le résumé structuré + les actions via Gemini, puis crée des tâches
 * personnelles pour les actions attribuables à un membre. Re-génère proprement
 * (supprime les tâches issues de cette réunion avant de recréer).
 */
export async function genererResume(reunionId: string) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: r } = await supabase.from("reunion").select("transcript").eq("id", reunionId).maybeSingle();
  const transcript = r?.transcript ?? "";
  if (!transcript.trim()) throw new Error("Aucun transcript à résumer.");
  if (!geminiConfigured()) throw new Error("GEMINI_API_KEY non configurée.");

  const { data: membresData } = await supabase.from("membre").select("id, prenom, nom").eq("actif", true);
  const membres = (membresData ?? []) as { id: string; prenom: string | null; nom: string | null }[];
  const noms = membres.map((m) => `${(m.prenom ?? "").trim()} ${(m.nom ?? "").trim()}`.trim()).filter(Boolean);

  const out = await resumerTranscript(transcript, noms);
  if (!out) throw new Error("Échec de la génération (Gemini).");

  // Matching action.personne -> membre (par prénom / nom / prénom nom)
  const trouveMembre = (personne: string): string | null => {
    const p = personne.trim().toLowerCase();
    if (!p) return null;
    for (const m of membres) {
      const prenom = (m.prenom ?? "").trim().toLowerCase();
      const nom = (m.nom ?? "").trim().toLowerCase();
      const full = `${prenom} ${nom}`.trim();
      if (p === prenom || p === nom || p === full || (prenom && p.includes(prenom))) return m.id;
    }
    return null;
  };

  // Résumé + actions non attribuées ajoutées au texte
  const nonAttribuees = out.actions.filter((a) => !trouveMembre(a.personne));
  let resume = out.resume;
  if (nonAttribuees.length) {
    resume += "\n\n### Actions non attribuées\n" + nonAttribuees.map((a) => `- ${a.texte}`).join("\n");
  }

  await supabase.from("reunion").update({ resume, resume_at: new Date().toISOString() }).eq("id", reunionId);

  // Recrée les tâches issues de cette réunion
  await supabase.from("tache_perso").delete().eq("reunion_id", reunionId);
  const taches = out.actions
    .map((a) => ({ membre: trouveMembre(a.personne), texte: a.texte }))
    .filter((t) => t.membre)
    .map((t) => ({ membre_id: t.membre, texte: t.texte, source_type: "reunion", reunion_id: reunionId, created_by: user?.id ?? null }));
  if (taches.length) await supabase.from("tache_perso").insert(taches);

  revalider();
}

// ---------- Tâches personnelles ----------

export async function toggleTache(id: string, fait: boolean) {
  const supabase = await createSupabase();
  await supabase.from("tache_perso").update({ fait: !fait }).eq("id", id);
  revalidatePath("/");
  revalidatePath("/reunions");
}

export async function deleteTache(id: string) {
  const supabase = await createSupabase();
  await supabase.from("tache_perso").delete().eq("id", id);
  revalidatePath("/");
  revalidatePath("/reunions");
}

export async function ajouterTachePerso(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const texte = str(formData.get("texte"));
  if (!texte) return;
  // Cible : le membre choisi, sinon soi-même
  const membreId = str(formData.get("membre_id")) ?? user?.id ?? null;
  await supabase.from("tache_perso").insert({ membre_id: membreId, texte, source_type: "manuel", created_by: user?.id ?? null });
  revalidatePath("/");
  revalidatePath("/reunions");
}
