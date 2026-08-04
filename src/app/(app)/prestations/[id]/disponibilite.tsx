import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { reserverUnites, libererReservations } from "../actions";

type Besoin = { referenceId: string; nom: string; qty: number };

export async function DisponibiliteSection({
  prestationId,
  periode,
  besoin,
}: {
  prestationId: string;
  periode: { debut: string; fin: string } | null;
  besoin: Besoin[];
}) {
  const titre = (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
      Disponibilité & réservation des unités
    </h2>
  );

  if (!periode) {
    return (
      <section>
        {titre}
        <Card className="px-4 py-4 text-sm text-muted">
          Renseigne les dates de <strong>préparation</strong> et de <strong>retour</strong> de la prestation
          pour vérifier la disponibilité et réserver des unités.
        </Card>
      </section>
    );
  }

  if (besoin.length === 0) {
    return (
      <section>
        {titre}
        <Card className="px-4 py-4 text-sm text-muted">
          Aucun matériel sérialisé dans ce devis (rien à réserver).
        </Card>
      </section>
    );
  }

  const supabase = await createClient();
  const refIds = besoin.map((b) => b.referenceId);

  const [{ data: mesRes }, { data: okUnites }, { data: autresRes }] = await Promise.all([
    supabase
      .from("reservation_unite")
      .select("unite_id, unite:unite(reference_id, numero_serie)")
      .eq("prestation_id", prestationId),
    supabase.from("unite").select("id, reference_id").in("reference_id", refIds).eq("etat", "ok"),
    supabase
      .from("reservation_unite")
      .select("unite_id, unite:unite(reference_id), prestation:prestation_id(id, nom)")
      .neq("prestation_id", prestationId)
      .lte("date_debut", periode.fin)
      .gte("date_fin", periode.debut),
  ]);

  type AutreRes = { unite_id: string; unite: { reference_id: string } | null; prestation: { id: string; nom: string } | null };
  const autres = (autresRes ?? []) as unknown as AutreRes[];
  const pris = new Set(autres.map((r) => r.unite_id));
  const dispoParRef = (refId: string) =>
    (okUnites ?? []).filter((u) => u.reference_id === refId && !pris.has(u.id)).length;
  // Événements en concurrence (chevauchement de dates) qui mobilisent le même type de matériel
  const concurrentsParRef = (refId: string) => {
    const m = new Map<string, string>();
    for (const r of autres) if (r.unite?.reference_id === refId && r.prestation) m.set(r.prestation.id, r.prestation.nom);
    return [...m.entries()];
  };

  type ResRow = { unite_id: string; unite: { reference_id: string; numero_serie: string | null } | null };
  const reservParRef = (refId: string) =>
    ((mesRes ?? []) as unknown as ResRow[]).filter((r) => r.unite?.reference_id === refId);

  return (
    <section>
      {titre}
      <Card className="divide-y divide-border overflow-hidden">
        {besoin.map((b) => {
          const dispo = dispoParRef(b.referenceId);
          const reserves = reservParRef(b.referenceId);
          const nbReserve = reserves.length;
          const complet = nbReserve >= b.qty;
          const faisable = dispo >= b.qty;
          return (
            <div key={b.referenceId} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{b.nom}</span>
                <span className="text-muted">
                  demandé {b.qty} · dispo {dispo} · réservé {nbReserve}
                </span>
              </div>
              {nbReserve > 0 && (
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {reserves.map((r) => (
                    <Link
                      key={r.unite_id}
                      href={`/u/${r.unite_id}`}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-primary hover:underline"
                    >
                      {r.unite?.numero_serie || "unité"}
                    </Link>
                  ))}
                </div>
              )}
              <div className="mt-1 text-xs">
                {complet ? (
                  <span className="text-green-600">✓ Réservé</span>
                ) : faisable ? (
                  <span className="text-amber-600">À réserver ({b.qty - nbReserve} restante·s)</span>
                ) : (
                  <span className="text-red-600">
                    ⚠ Conflit : {dispo} dispo pour {b.qty} demandé·s
                  </span>
                )}
                {!faisable && concurrentsParRef(b.referenceId).length > 0 && (
                  <div className="mt-0.5 text-red-600/90">
                    En concurrence sur ces dates avec :{" "}
                    {concurrentsParRef(b.referenceId).map(([pid, nom], i) => (
                      <span key={pid}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/prestations/${pid}`} className="underline hover:no-underline">{nom}</Link>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={reserverUnites.bind(null, prestationId)}>
          <SubmitButton pendingLabel="Réservation…">Réserver automatiquement</SubmitButton>
        </form>
        <form action={libererReservations.bind(null, prestationId)}>
          <button className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background">
            Libérer les réservations
          </button>
        </form>
      </div>
      <p className="mt-2 text-xs text-muted">
        « Réserver » choisit les unités <strong>les moins utilisées</strong> et <strong>disponibles</strong>{" "}
        sur la période {periode.debut} → {periode.fin}, et empêche toute double-réservation.
      </p>
    </section>
  );
}
