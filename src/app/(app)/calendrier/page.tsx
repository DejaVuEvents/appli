import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { CalendarView } from "./calendar-view";
import { getMembreActuel } from "@/lib/membre";
import { listerEvenementsCalendar } from "@/lib/google-calendar";

type MembreLite = { id: string; prenom: string | null; nom: string | null; email: string | null };

export default async function CalendrierPage() {
  const supabase = await createClient();
  const moi = await getMembreActuel(supabase);

  // Fenêtre d'import Google Agenda : ~3 mois avant → ~18 mois après.
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const timeMax = new Date(now.getFullYear() + 1, now.getMonth() + 6, 1).toISOString();

  const [{ data: prestData }, { data: ecrData }, { data: reunionsData }, { data: membresData }, { data: locData }, { data: mesPrestaData }, googleEvents] = await Promise.all([
    supabase
      .from("prestation")
      .select("id, nom, statut, date_prepa, date_event_debut, date_event_fin, date_retour, client(nom)")
      .eq("est_evenement", true)
      .neq("statut", "annule"),
    supabase
      .from("ecriture_financiere")
      .select("id, date, denomination, sens, montant_ttc, statut, prestation_id")
      .eq("statut", "previsionnel"),
    supabase
      .from("reunion")
      .select("id, titre, date, heure_debut, heure_fin, lieu, description, meet_url, google_html_link, participants:reunion_participant(membre:membre_id(id, prenom, nom, email))")
      .order("date"),
    supabase.from("membre").select("id, prenom, nom, email").eq("actif", true).order("prenom"),
    supabase.from("location").select("id, titre, sens, client_id, tiers, lieu, date_debut, date_fin, montant, statut").neq("statut", "annule"),
    moi ? supabase.from("prestation_membre").select("prestation_id").eq("membre_id", moi.id) : Promise.resolve({ data: [] }),
    listerEvenementsCalendar(timeMin, timeMax),
  ]);

  const mesPrestationIds = ((mesPrestaData ?? []) as { prestation_id: string }[]).map((r) => r.prestation_id);
  const locations = (locData ?? []) as {
    id: string; titre: string; sens: string; client_id: string | null; tiers: string | null;
    lieu: string | null; date_debut: string; date_fin: string; montant: number | null; statut: string;
  }[];

  const membres = (membresData ?? []) as MembreLite[];
  const reunions = ((reunionsData ?? []) as unknown as {
    id: string; titre: string; date: string; heure_debut: string | null; heure_fin: string | null;
    lieu: string | null; description: string | null; meet_url: string | null; google_html_link: string | null;
    participants: { membre: MembreLite | null }[];
  }[]).map((r) => ({
    ...r,
    participants: (r.participants ?? []).map((p) => p.membre).filter(Boolean) as MembreLite[],
  }));

  return (
    <div className="max-w-7xl">
      <PageHeader title="Calendrier" />
      <CalendarView
        prestations={(prestData ?? []) as unknown as Parameters<typeof CalendarView>[0]["prestations"]}
        ecritures={(ecrData ?? []) as unknown as Parameters<typeof CalendarView>[0]["ecritures"]}
        reunions={reunions}
        membres={membres}
        locations={locations}
        googleEvents={googleEvents}
        moiId={moi?.id ?? null}
        mesPrestationIds={mesPrestationIds}
      />
    </div>
  );
}
