import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { geminiConfigured } from "@/lib/gemini";
import { ReunionCard } from "./reunion-card";

type Reunion = {
  id: string;
  titre: string;
  date: string;
  transcript: string | null;
  resume: string | null;
  resume_at: string | null;
};

export default async function ReunionsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reunion")
    .select("id, titre, date, transcript, resume, resume_at")
    .order("date", { ascending: false });
  const reunions = (data ?? []) as Reunion[];
  const geminiOk = geminiConfigured();

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        title="Réunions"
        subtitle="Transcripts, résumés automatiques et actions"
        action={<Link href="/calendrier" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background">+ Créer une réunion (calendrier)</Link>}
      />

      {!geminiOk && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Le <strong>résumé automatique</strong> (et l&apos;extraction d&apos;actions) s&apos;active dès qu&apos;une clé <strong>Gemini gratuite</strong> est configurée
          (<code>GEMINI_API_KEY</code>, à créer sur <em>aistudio.google.com/apikey</em>). En attendant, tu peux déjà déposer et conserver les transcripts.
        </div>
      )}

      {reunions.length === 0 ? (
        <EmptyState
          title="Aucune réunion"
          description="Crée une réunion depuis le calendrier, puis dépose son transcript ici pour en générer un résumé et des actions."
        />
      ) : (
        <div className="space-y-3">
          {reunions.map((r) => <ReunionCard key={r.id} reunion={r} geminiOk={geminiOk} />)}
        </div>
      )}
    </div>
  );
}
