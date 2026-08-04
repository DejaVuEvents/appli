"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { creerEvenementCalendar, supprimerEvenementCalendar } from "@/lib/google-calendar";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export async function createReunion(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const titre = str(formData.get("titre"));
  const date = str(formData.get("date"));
  if (!titre || !date) throw new Error("Titre et date requis.");

  const heureDebut = str(formData.get("heure_debut"));
  const heureFin = str(formData.get("heure_fin"));
  const lieu = str(formData.get("lieu"));
  const description = str(formData.get("description"));
  let meetUrl = str(formData.get("meet_url"));

  const participantIds = formData.getAll("participants").map((v) => String(v)).filter(Boolean);

  // E-mails des participants (pour les invitations Google)
  let emails: string[] = [];
  if (participantIds.length > 0) {
    const { data: membres } = await supabase.from("membre").select("email").in("id", participantIds);
    emails = (membres ?? []).map((m) => m.email).filter(Boolean) as string[];
  }

  // Sync Google Agenda + Meet (best-effort : ne bloque pas si non configuré / scope manquant)
  let googleEventId: string | null = null;
  let googleHtmlLink: string | null = null;
  const g = await creerEvenementCalendar({ titre, date, heureDebut, heureFin, lieu, description, emails });
  if (g) {
    googleEventId = g.eventId;
    googleHtmlLink = g.htmlLink;
    if (!meetUrl && g.meetUrl) meetUrl = g.meetUrl;
  }

  const { data, error } = await supabase
    .from("reunion")
    .insert({
      titre, date, heure_debut: heureDebut, heure_fin: heureFin, lieu, description,
      meet_url: meetUrl,
      google_event_id: googleEventId,
      google_html_link: googleHtmlLink,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (participantIds.length > 0) {
    await supabase.from("reunion_participant").insert(
      participantIds.map((membre_id) => ({ reunion_id: data.id, membre_id })),
    );
  }
  revalidatePath("/calendrier");
  revalidatePath("/");
}

export async function deleteReunion(reunionId: string) {
  const supabase = await createSupabase();
  const { data: r } = await supabase.from("reunion").select("google_event_id").eq("id", reunionId).maybeSingle();
  if (r?.google_event_id) await supprimerEvenementCalendar(r.google_event_id);
  const { error } = await supabase.from("reunion").delete().eq("id", reunionId);
  if (error) throw new Error(error.message);
  revalidatePath("/calendrier");
  revalidatePath("/");
}
