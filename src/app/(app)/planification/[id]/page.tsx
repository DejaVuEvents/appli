import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field, Select, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { PrintButton } from "@/components/print-button";
import { dateFr, euros } from "@/lib/format";
import { addEtape, deleteEtape, toggleEtapeFait, deplacerEtape, calculerItineraire, setVehiculeTournee } from "../actions";
import { orsConfigured } from "@/lib/ors";
import { coutKmVehicule } from "@/lib/vehicule";
import { ajouterJourVehicule, supprimerJourVehicule } from "../actions";
import { InfoHint } from "@/components/info-hint";
import { EventTabBar } from "@/components/event-tab-bar";

type Presta = {
  id: string;
  nom: string;
  lieu: string | null;
  date_prepa: string | null;
  date_event_debut: string | null;
  date_event_fin: string | null;
  date_retour: string | null;
  vehicule_id: string | null;
  client: { nom: string } | null;
};
type Vehicule = { id: string; nom: string; cout_location_jour: number | null; cout_km: number | null; conso_l_100km: number | null; type_carburant: string | null };
type Etape = {
  id: string;
  ordre: number;
  type: string;
  lieu: string | null;
  adresse: string | null;
  materiel: string | null;
  heure: string | null;
  notes: string | null;
  fait: boolean;
  distance_km: number | null;
  duree_min: number | null;
};

function dureeTxt(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

const TYPE_LABEL: Record<string, string> = {
  chargement: "Chargement", dechargement: "Déchargement", montage: "Montage",
  demontage: "Démontage", route: "Route", autre: "Autre",
};
const TYPE_CLS: Record<string, string> = {
  chargement: "bg-blue-100 text-blue-700", dechargement: "bg-amber-100 text-amber-800",
  montage: "bg-green-100 text-green-700", demontage: "bg-purple-100 text-purple-700",
  route: "bg-surface text-muted", autre: "bg-surface text-muted",
};

export default async function PlanificationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: prestData }, { data: etapesData }, { data: vehData }, { data: jourData }, { data: paramData }] = await Promise.all([
    supabase.from("prestation").select("id, nom, lieu, date_prepa, date_event_debut, date_event_fin, date_retour, vehicule_id, client(nom)").eq("id", id).single(),
    supabase.from("etape_logistique").select("*").eq("prestation_id", id).order("ordre", { ascending: true }),
    supabase.from("vehicule").select("id, nom, cout_location_jour, cout_km, conso_l_100km, type_carburant").order("nom"),
    supabase.from("vehicule_jour").select("id, date").eq("prestation_id", id).order("date"),
    supabase.from("parametres_entreprise").select("prix_essence, prix_diesel").limit(1).maybeSingle(),
  ]);
  if (!prestData) notFound();
  const p = prestData as unknown as Presta;
  const etapes = (etapesData ?? []) as Etape[];
  const vehicules = (vehData ?? []) as Vehicule[];
  const joursVehicule = (jourData ?? []) as { id: string; date: string }[];
  const prixCarb = { essence: Number(paramData?.prix_essence ?? 0), diesel: Number(paramData?.prix_diesel ?? 0) };

  const totalKm = Math.round(etapes.reduce((s, e) => s + Number(e.distance_km ?? 0), 0) * 10) / 10;
  const totalMin = etapes.reduce((s, e) => s + Number(e.duree_min ?? 0), 0);
  const aDistances = etapes.some((e) => e.distance_km != null);
  const peutCalculer = orsConfigured() && etapes.filter((e) => e.adresse || e.lieu).length >= 2;

  // Coût estimé de la tournée avec le véhicule choisi.
  const vehicule = vehicules.find((v) => v.id === p.vehicule_id) ?? null;
  // Journées saisies à la main si elles existent, sinon toute la période prépa → retour.
  const joursManuels = joursVehicule.length > 0;
  const nbJours = (() => {
    if (joursManuels) return joursVehicule.length;
    if (!p.date_prepa || !p.date_retour) return 1;
    const d = Math.round((new Date(p.date_retour).getTime() - new Date(p.date_prepa).getTime()) / 86400000) + 1;
    return d > 0 ? d : 1;
  })();
  const coutParKm = vehicule ? coutKmVehicule(vehicule, prixCarb) : 0;
  const coutKm = vehicule ? totalKm * coutParKm : 0;
  const coutJours = vehicule ? nbJours * Number(vehicule.cout_location_jour ?? 0) : 0;
  const coutTournee = coutKm + coutJours;

  const jalons = [
    { label: "Préparation", date: p.date_prepa },
    { label: "Événement (début)", date: p.date_event_debut },
    { label: "Événement (fin)", date: p.date_event_fin },
    { label: "Retour", date: p.date_retour },
  ].filter((j) => j.date);

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title={p.nom}
        subtitle={`${p.client?.nom ?? "Sans client"}${p.lieu ? ` · ${p.lieu}` : ""}`}
        action={<PrintButton label="Feuille de tournée" />}
      />
      <EventTabBar eventId={id} active="planification" />

      {/* Jalons / dates clés */}
      {jalons.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Dates clés</h2>
          <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {jalons.map((j) => (
              <div key={j.label} className="flex justify-between border-b border-border/60 py-1">
                <span className="text-muted">{j.label}</span>
                <span className="font-medium">{dateFr(j.date)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tournée logistique */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Tournée logistique (jour J)
          <InfoHint text="Ordonne les étapes : chargement aux entrepôts, route, déchargement, montage, démontage, retour. Utile quand le matériel est réparti sur plusieurs lieux." />
        </h2>

        {/* Itinéraire : total + recalcul auto des distances */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-sm">
            {aDistances ? (
              <span><strong>Itinéraire :</strong> {totalKm} km · {dureeTxt(totalMin)}</span>
            ) : (
              <span className="text-muted">Renseigne une adresse (ou un lieu) par arrêt pour calculer l&apos;itinéraire.</span>
            )}
          </div>
          {peutCalculer && (
            <form action={calculerItineraire.bind(null, id)} className="print:hidden">
              <SubmitButton pendingLabel="Calcul…">{aDistances ? "Recalculer l'itinéraire" : "Calculer l'itinéraire"}</SubmitButton>
            </form>
          )}
        </div>

        {/* Véhicule de la tournée + coût estimé */}
        <div className="mb-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form action={setVehiculeTournee.bind(null, id)} className="flex items-center gap-2">
              <label className="text-sm font-medium">Véhicule :</label>
              <select name="vehicule_id" defaultValue={p.vehicule_id ?? ""} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                <option value="">— Aucun —</option>
                {vehicules.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
              </select>
              <SubmitButton className="!px-3 !py-1.5 !text-sm">OK</SubmitButton>
            </form>
            {vehicule && (
              <div className="text-right text-sm">
                <div className="font-bold">{euros(coutTournee)}<span className="ml-1 text-xs font-normal text-muted">coût estimé</span></div>
                <div className="text-xs text-muted">
                  {totalKm} km × {euros(coutParKm)}/km{coutJours > 0 ? ` + ${nbJours} j × ${euros(vehicule.cout_location_jour)}/j` : ""}
                  {vehicule.conso_l_100km ? ` (${vehicule.conso_l_100km} L/100km)` : ""}
                </div>
              </div>
            )}
          </div>
          {vehicule && !aDistances && (
            <p className="mt-1 text-xs text-muted">Calcule l&apos;itinéraire ci-dessus pour estimer le coût kilométrique.</p>
          )}

          {/* Journées de location — le camion n'est pas forcément pris sur toute la période */}
          {vehicule && (
            <div className="mt-3 border-t border-border pt-3 print:hidden">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Journées de location</span>
                <span className="text-xs text-muted">
                  {joursManuels
                    ? `${nbJours} journée${nbJours > 1 ? "s" : ""} facturée${nbJours > 1 ? "s" : ""}`
                    : `${nbJours} jour${nbJours > 1 ? "s" : ""} — toute la période préparation → retour, faute de dates saisies`}
                </span>
              </div>
              {joursVehicule.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {joursVehicule.map((j) => (
                    <span key={j.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                      {dateFr(j.date)}
                      <form action={supprimerJourVehicule.bind(null, id, j.id)}>
                        <button className="text-muted hover:text-red-600" title="Retirer cette journée">✕</button>
                      </form>
                    </span>
                  ))}
                </div>
              )}
              <form action={ajouterJourVehicule.bind(null, id)} className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={p.date_event_debut ?? undefined}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
                <SubmitButton className="!px-3 !py-1.5 !text-sm">+ Ajouter une journée</SubmitButton>
              </form>
            </div>
          )}
        </div>

        <Card className="divide-y divide-border overflow-hidden">
          {etapes.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucune étape. Ajoute la première ci-dessous.</p>}
          {etapes.map((e, i) => (
            <div key={e.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex flex-col items-center gap-1 print:hidden">
                <form action={deplacerEtape.bind(null, id, e.id, -1)}>
                  <button className="text-muted hover:text-foreground disabled:opacity-30" disabled={i === 0} title="Monter">▲</button>
                </form>
                <form action={deplacerEtape.bind(null, id, e.id, 1)}>
                  <button className="text-muted hover:text-foreground disabled:opacity-30" disabled={i === etapes.length - 1} title="Descendre">▼</button>
                </form>
              </div>
              <div className="w-6 pt-0.5 text-center text-sm font-bold text-muted">{i + 1}</div>
              <div className="min-w-0 flex-1">
                {e.distance_km != null && (
                  <div className="mb-1 text-xs font-medium text-primary">↳ {e.distance_km} km · {dureeTxt(e.duree_min ?? 0)} depuis l&apos;arrêt précédent</div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_CLS[e.type] ?? "bg-surface"}`}>{TYPE_LABEL[e.type] ?? e.type}</span>
                  {e.heure && <span className="text-xs font-medium">{e.heure}</span>}
                  <span className="font-medium">{e.lieu ?? "—"}</span>
                </div>
                {e.adresse && <div className="text-xs text-muted">{e.adresse}</div>}
                {e.materiel && <div className="mt-0.5 text-sm">{e.materiel}</div>}
                {e.notes && <div className="text-xs text-muted">{e.notes}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form action={toggleEtapeFait.bind(null, id, e.id, e.fait)}>
                  <button
                    className={`flex h-6 w-6 items-center justify-center rounded border ${e.fait ? "border-green-600 bg-green-600 text-white" : "border-border"}`}
                    title={e.fait ? "Fait" : "Marquer fait"}
                  >
                    {e.fait ? "✓" : ""}
                  </button>
                </form>
                <form action={deleteEtape.bind(null, id, e.id)} className="print:hidden">
                  <ConfirmButton confirm="Supprimer cette étape ?" className="text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </Card>

        {/* Ajout d'étape */}
        <Card className="mt-3 p-4 print:hidden">
          <h3 className="mb-3 text-sm font-semibold">Ajouter une étape</h3>
          <form action={addEtape.bind(null, id)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Select
                label="Type"
                name="type"
                defaultValue="chargement"
                options={[
                  { value: "chargement", label: "Chargement" },
                  { value: "route", label: "Route" },
                  { value: "dechargement", label: "Déchargement" },
                  { value: "montage", label: "Montage" },
                  { value: "demontage", label: "Démontage" },
                  { value: "autre", label: "Autre" },
                ]}
              />
              <Field label="Heure" name="heure" placeholder="08:00" />
              <Field label="Lieu" name="lieu" placeholder="Entrepôt A, scène…" className="sm:col-span-2" />
            </div>
            <Field label="Adresse (optionnel)" name="adresse" placeholder="12 rue…, ville" />
            <Field label="Matériel concerné (optionnel)" name="materiel" placeholder="Son façade, 4 lyres, praticables…" />
            <TextArea label="Notes (optionnel)" name="notes" rows={2} />
            <SubmitButton>+ Ajouter l&apos;étape</SubmitButton>
          </form>
        </Card>
      </section>
    </div>
  );
}
