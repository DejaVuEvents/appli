import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { etatDepuisMouvements, type EtatPrepa } from "@/lib/mouvements";
import { chargerUnite, rentrerUnite, annulerSortieUnite, basculerCharge } from "./actions";
import { PrepaScanner, RemplacerBtn } from "./prepa-scanner";
import type { Prestation } from "@/lib/types";
import { EventTabBar } from "@/components/event-tab-bar";
import { IconPrint } from "@/components/icons";

type ResaRow = {
  unite_id: string;
  unite: {
    numero_serie: string | null;
    qr_code: string | null;
    reference_id: string;
    reference: { nom: string } | null;
  } | null;
};
type LigneRow = {
  id: string;
  designation: string | null;
  quantite: number;
  unite: string | null;
  charge: boolean;
  reference_id: string | null;
};

const ETAT_BADGE: Record<EtatPrepa, { label: string; cls: string }> = {
  a_charger: { label: "À charger", cls: "bg-gray-200 text-gray-700" },
  sorti: { label: "Sorti", cls: "bg-blue-100 text-blue-700" },
  rentre: { label: "Rentré", cls: "bg-green-100 text-green-700" },
};

export default async function PreparationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: prest }, { data: resaData }, { data: mvtData }, { data: lignesData }] = await Promise.all([
    supabase.from("prestation").select("*").eq("id", id).single(),
    supabase
      .from("reservation_unite")
      .select("unite_id, unite:unite(numero_serie, qr_code, reference_id, reference:materiel_reference(nom))")
      .eq("prestation_id", id),
    supabase.from("mouvement").select("unite_id, type").eq("prestation_id", id),
    supabase
      .from("ligne_prestation")
      .select("id, designation, quantite, unite, charge, reference_id")
      .eq("prestation_id", id)
      .order("created_at"),
  ]);

  if (!prest) notFound();
  const prestation = prest as Prestation;
  const reservations = (resaData ?? []) as unknown as ResaRow[];
  const mouvements = (mvtData ?? []) as { unite_id: string; type: string }[];
  const lignes = (lignesData ?? []) as LigneRow[];

  // État de chaque unité réservée
  const etatUnite = (uniteId: string): EtatPrepa =>
    etatDepuisMouvements(mouvements.filter((m) => m.unite_id === uniteId));

  // Regroupement des unités réservées par référence
  const refsReservees = new Set(reservations.map((r) => r.unite?.reference_id).filter(Boolean) as string[]);
  const groupes = new Map<string, ResaRow[]>();
  for (const r of reservations) {
    const nom = r.unite?.reference?.nom ?? "Matériel";
    if (!groupes.has(nom)) groupes.set(nom, []);
    groupes.get(nom)!.push(r);
  }

  // Autres éléments (non couverts par des unités réservées)
  const autres = lignes.filter((l) => !(l.reference_id && refsReservees.has(l.reference_id)));

  // Progression
  const totalUnites = reservations.length;
  const unitesPretes = reservations.filter((r) => etatUnite(r.unite_id) !== "a_charger").length;
  const autresPrets = autres.filter((l) => l.charge).length;
  const total = totalUnites + autres.length;
  const prets = unitesPretes + autresPrets;
  const pct = total > 0 ? Math.round((prets / total) * 100) : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Préparation / chargement"
        subtitle={prestation.nom}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PrepaScanner prestationId={id} />
            <Link href={`/prestations/${id}/preparation/feuille`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background"><IconPrint className="h-4 w-4" /> Feuille PDF</Link>
            <Link href={`/prestations/${id}/retour`} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background">↩ Contrôle de retour</Link>
          </div>
        }
      />
      <EventTabBar eventId={id} active="preparation" />

      {/* Progression */}
      <Card className="p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{prets} / {total} préparés</span>
          <span className="text-muted">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {total === 0 && (
        <Card className="px-4 py-4 text-sm text-muted">
          Rien à préparer. Ajoute du matériel au devis et réserve les unités (section « Disponibilité »).
        </Card>
      )}

      {/* Unités à charger */}
      {reservations.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Unités à charger</h2>
          <div className="space-y-4">
            {[...groupes.entries()].map(([nom, unites]) => (
              <div key={nom}>
                <h3 className="mb-1 text-sm font-semibold">{nom}</h3>
                <Card className="divide-y divide-border overflow-hidden">
                  {unites.map((r) => {
                    const etat = etatUnite(r.unite_id);
                    const badge = ETAT_BADGE[etat];
                    return (
                      <div key={r.unite_id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <Link href={`/u/${r.unite?.qr_code || r.unite_id}`} className="font-medium hover:underline">
                            {r.unite?.numero_serie || "Unité"}
                          </Link>
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {etat === "a_charger" && (
                            <>
                              <RemplacerBtn prestationId={id} uniteId={r.unite_id} />
                              <form action={chargerUnite.bind(null, id, r.unite_id)}>
                                <SubmitButton pendingLabel="…">Charger</SubmitButton>
                              </form>
                            </>
                          )}
                          {etat === "sorti" && (
                            <>
                              <form action={annulerSortieUnite.bind(null, id, r.unite_id)}>
                                <button className="rounded-lg border border-border px-2 py-2 text-sm text-muted hover:bg-background" title="Annuler la sortie">↶</button>
                              </form>
                              <form action={rentrerUnite.bind(null, id, r.unite_id)} className="flex items-center gap-1">
                                <input
                                  name="heures"
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  placeholder="h"
                                  title="Heures d'usage (optionnel)"
                                  className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm"
                                />
                                <SubmitButton pendingLabel="…">Rentrer</SubmitButton>
                              </form>
                            </>
                          )}
                          {etat === "rentre" && <span className="text-sm text-green-600">✓ Rentré</span>}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Autres éléments à préparer */}
      {autres.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Autres éléments</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {autres.map((l) => (
              <form key={l.id} action={basculerCharge.bind(null, id, l.id)}>
                <button type="submit" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-background">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${l.charge ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {l.charge ? "✓" : ""}
                  </span>
                  <span className={`flex-1 ${l.charge ? "text-muted line-through" : ""}`}>
                    {l.designation}
                  </span>
                  <span className="text-sm text-muted">{l.quantite}{l.unite ? ` ${l.unite}` : ""}</span>
                </button>
              </form>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
