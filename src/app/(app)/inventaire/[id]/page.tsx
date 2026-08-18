import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { dateFr } from "@/lib/format";
import { QrScanner } from "@/components/qr-scanner";
import { InventaireListe } from "./liste";
import {
  updateSessionNotes,
  deleteSession,
} from "../actions";
import type { SessionInventaire } from "@/lib/types";

type LigneRow = {
  id: string;
  present: boolean;
  etat_constate: string | null;
  remarque_maintenance: string | null;
  unite_id: string;
  unite: {
    numero_serie: string | null;
    qr_code: string | null;
    reference: { nom: string } | null;
  } | null;
};

export default async function SessionInventairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: session }, { data: lignesData }] = await Promise.all([
    supabase.from("session_inventaire").select("*").eq("id", id).single(),
    supabase
      .from("ligne_inventaire")
      .select("id, present, etat_constate, remarque_maintenance, unite_id, unite:unite(numero_serie, qr_code, reference:materiel_reference(nom))")
      .eq("session_id", id),
  ]);

  if (!session) notFound();
  const sess = session as SessionInventaire;
  const lignes = (lignesData ?? []) as unknown as LigneRow[];

  // Tri par référence puis n° de série
  lignes.sort((a, b) => {
    const na = a.unite?.reference?.nom ?? "";
    const nb = b.unite?.reference?.nom ?? "";
    if (na !== nb) return na.localeCompare(nb);
    return (a.unite?.numero_serie ?? "").localeCompare(b.unite?.numero_serie ?? "");
  });

  const total = lignes.length;
  const presents = lignes.filter((l) => l.present).length;
  const pct = total > 0 ? Math.round((presents / total) * 100) : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={`Inventaire du ${dateFr(sess.date)}`}
        action={<Link href="/inventaire" className="text-sm text-primary hover:underline">← Sessions</Link>}
      />

      {/* Note + progression */}
      <Card className="p-4">
        <form action={updateSessionNotes.bind(null, id)} className="flex items-end gap-2">
          <Field label="Note de session" name="notes" defaultValue={sess.notes} className="flex-1" />
          <SubmitButton>OK</SubmitButton>
        </form>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-medium">{presents} / {total} présents</span>
          <span className="text-muted">{pct}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <QrScanner label="Scanner une unité" />
          <span className="text-xs text-muted">
            Scanne les étiquettes QR à la suite pour ouvrir chaque fiche et la pointer dans cette session.
          </span>
        </div>
      </Card>

      {total === 0 ? (
        <Card className="px-4 py-4 text-sm text-muted">
          Aucune unité dans le catalogue. Ajoute des unités (avec n° de série) pour les inventorier.
        </Card>
      ) : (
        <InventaireListe sessionId={id} lignes={lignes} />
      )}

      <form action={deleteSession.bind(null, id)}>
        <SubmitButton variant="danger" pendingLabel="Suppression…" confirm="Supprimer cette session d'inventaire et tous ses pointages ?">Supprimer la session</SubmitButton>
      </form>
    </div>
  );
}
