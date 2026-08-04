import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Field } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { dateFr } from "@/lib/format";
import { createSession } from "./actions";
import { QrScanner } from "@/components/qr-scanner";
import type { SessionInventaire } from "@/lib/types";

export default async function InventairePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_inventaire")
    .select("*")
    .order("date", { ascending: false });
  const sessions = (data ?? []) as SessionInventaire[];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Inventaire"
        subtitle={`${sessions.length} session${sessions.length > 1 ? "s" : ""}`}
        action={<QrScanner label="📷 Scanner une unité" />}
      />

      {/* Nouvelle session */}
      <Card className="mb-6 p-4">
        <form action={createSession} className="flex flex-wrap items-end gap-3">
          <Field label="Nouvelle session — note (optionnel)" name="notes" className="flex-1 min-w-[12rem]" placeholder="Inventaire annuel, retour festival X…" />
          <SubmitButton>+ Démarrer une session</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted">
          Crée une liste à cocher de toutes les unités du catalogue (présence, état constaté, remarques).
        </p>
      </Card>

      {sessions.length === 0 ? (
        <EmptyState title="Aucune session d'inventaire" description="Démarre ta première session ci-dessus." />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/inventaire/${s.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-background"
            >
              <div className="min-w-0">
                <div className="font-medium">Session du {dateFr(s.date)}</div>
                {s.notes && <div className="text-sm text-muted truncate">{s.notes}</div>}
              </div>
              <span className="text-sm text-primary">Ouvrir →</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
