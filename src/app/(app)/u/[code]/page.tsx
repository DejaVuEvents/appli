import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Field, Select, TextArea } from "@/components/form";
import { euros, dateFr } from "@/lib/format";
import { etatDepuisMouvements, resoudrePrestationUnite } from "@/lib/mouvements";
import { ficheSortie, ficheRetour, updateUniteMaintenance, pointerInventaire } from "./actions";
import {
  ETAT_LABELS,
  PHASE_LABELS,
  maintenanceStatut,
  type EtatUnite,
  type Unite,
  type MaterielReference,
} from "@/lib/types";

const ETAT_OPTIONS = (Object.keys(ETAT_LABELS) as EtatUnite[]).map((e) => ({ value: e, label: ETAT_LABELS[e] }));

type MvtRow = { id: string; type: string; date: string; heures_ajoutees: number; prestation_id: string | null };
type InvRow = {
  present: boolean;
  etat_constate: string | null;
  remarque_maintenance: string | null;
  session: { date: string } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UniteAvecRef = Unite & { reference: MaterielReference | null };

function Ligne({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm border-b border-border last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default async function FicheUnitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const select = "*, reference:materiel_reference(*)";

  // Recherche par code QR, puis par identifiant (si le code est un UUID).
  let { data } = await supabase.from("unite").select(select).eq("qr_code", code).maybeSingle();
  if (!data && UUID_RE.test(code)) {
    ({ data } = await supabase.from("unite").select(select).eq("id", code).maybeSingle());
  }
  if (!data) notFound();

  const u = data as unknown as UniteAvecRef;
  const ref = u.reference;

  // Mouvements + historique d'inventaire
  const [{ data: mvtsData }, { data: invData }] = await Promise.all([
    supabase.from("mouvement").select("id, type, date, heures_ajoutees, prestation_id").eq("unite_id", u.id).order("date", { ascending: false }),
    supabase
      .from("ligne_inventaire")
      .select("present, etat_constate, remarque_maintenance, session:session_inventaire(date)")
      .eq("unite_id", u.id),
  ]);
  const mvts = (mvtsData ?? []) as MvtRow[];
  const inventaires = (invData ?? []) as unknown as InvRow[];
  inventaires.sort((a, b) => (b.session?.date ?? "").localeCompare(a.session?.date ?? ""));
  // État sortie/retour calculé sur la prestation pertinente (cohérent avec l'action),
  // pas sur l'ensemble des prestations passées de l'unité.
  const prestActive = await resoudrePrestationUnite(supabase, u.id);
  const mvtsPrest = prestActive ? mvts.filter((m) => m.prestation_id === prestActive) : mvts;
  const sorti = etatDepuisMouvements(mvtsPrest) === "sorti";

  // Dernière session d'inventaire (pour pointer l'unité directement depuis la fiche)
  const { data: sessData } = await supabase
    .from("session_inventaire")
    .select("id, date")
    .order("date", { ascending: false })
    .limit(1);
  const session = sessData?.[0] as { id: string; date: string } | undefined;
  let ligneInv: { present: boolean; etat_constate: string | null; remarque_maintenance: string | null } | null = null;
  if (session) {
    const { data } = await supabase
      .from("ligne_inventaire")
      .select("present, etat_constate, remarque_maintenance")
      .eq("session_id", session.id)
      .eq("unite_id", u.id)
      .maybeSingle();
    ligneInv = data;
  }

  // Connecteurs effectifs : surcharge de l'unité sinon ceux de la référence.
  const connPuissance = u.connecteurs_puissance ?? ref?.connecteurs_puissance ?? [];
  const connData = u.connecteurs_data ?? ref?.connecteurs_data ?? [];
  const surcharge = u.connecteurs_puissance !== null || u.connecteurs_data !== null;

  return (
    <div className="max-w-2xl">
      <Link
        href={ref?.id ? `/catalogue/${ref.id}` : "/catalogue"}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        ← {ref?.nom ?? "Catalogue"}
      </Link>
      <PageHeader
        title={ref?.nom ?? "Unité"}
        subtitle={u.numero_serie ? `N° de série ${u.numero_serie}` : "Fiche unité"}
        action={<Badge tone={u.etat as EtatUnite}>{ETAT_LABELS[u.etat as EtatUnite]}</Badge>}
      />

      <div className="space-y-6">
        {/* Mouvement (scan QR) */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Mouvement</h2>
              <p className="mt-1 text-sm">
                {sorti ? (
                  <span className="text-blue-700">Cette unité est actuellement <strong>sortie</strong>.</span>
                ) : (
                  <span className="text-green-700">Cette unité est <strong>en stock</strong>.</span>
                )}
              </p>
            </div>
            {sorti ? (
              <form action={ficheRetour.bind(null, code, u.id)} className="flex items-center gap-1">
                <input name="heures" type="number" step="0.5" min="0" placeholder="h" title="Heures d'usage (optionnel)"
                  className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                <SubmitButton pendingLabel="…">Retour</SubmitButton>
              </form>
            ) : (
              <form action={ficheSortie.bind(null, code, u.id)}>
                <SubmitButton pendingLabel="…">Sortie</SubmitButton>
              </form>
            )}
          </div>
        </Card>

        {/* Pointage inventaire (scan QR -> ici) */}
        {session && (
          <Card className="p-5 border-primary/30">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary">
              Inventaire — session du {dateFr(session.date)}
            </h2>
            {ligneInv && (
              <p className="mb-3 text-xs text-muted">
                Dernier pointage : {ligneInv.present ? "présent" : "non pointé"}
                {ligneInv.etat_constate ? ` · ${ETAT_LABELS[ligneInv.etat_constate as EtatUnite] ?? ligneInv.etat_constate}` : ""}
              </p>
            )}
            <form action={pointerInventaire.bind(null, code, session.id, u.id)} className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="present" defaultChecked={ligneInv?.present ?? true} className="h-4 w-4 rounded border-border" />
                Présent
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="État constaté" name="etat_constate" defaultValue={ligneInv?.etat_constate ?? u.etat} options={ETAT_OPTIONS} />
                <Field label="Remarque" name="remarque" defaultValue={ligneInv?.remarque_maintenance ?? ""} placeholder="Observation / maintenance…" />
              </div>
              <SubmitButton pendingLabel="…">Pointer dans l&apos;inventaire</SubmitButton>
            </form>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Usage & suivi</h2>
          <Ligne label="Heures d'usage" value={`${u.compteur_heures} h`} />
          <Ligne label="Nombre de sorties" value={u.compteur_sorties} />
          <Ligne label="Dernière maintenance" value={dateFr(u.date_derniere_maintenance)} />
          {(() => {
            const maint = maintenanceStatut(u);
            if (!maint.prochaineDate && !maint.dueHeures) return null;
            return (
              <Ligne
                label="Prochaine maintenance"
                value={
                  <span className={maint.enRetard || maint.dueHeures ? "font-semibold text-red-600" : "text-foreground"}>
                    {maint.prochaineDate ? dateFr(maint.prochaineDate) : "seuil d'heures"}
                    {maint.enRetard ? " · en retard" : ""}
                    {maint.dueHeures ? " · seuil d'heures atteint" : ""}
                  </span>
                }
              />
            );
          })()}
          <Ligne label="Date d'achat" value={dateFr(u.date_achat)} />
          <Ligne label="Prix d'achat" value={u.prix_achat != null ? euros(u.prix_achat) : "—"} />
        </Card>

        {ref && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Caractéristiques techniques
            </h2>
            <Ligne label="Consommation" value={ref.puissance_w != null ? `${ref.puissance_w} W` : "—"} />
            <Ligne label="Intensité" value={ref.intensite_a != null ? `${ref.intensite_a} A` : "—"} />
            <Ligne label="Phase" value={ref.phase ? PHASE_LABELS[ref.phase] : "—"} />
            <Ligne label="Poids" value={ref.poids_kg != null ? `${ref.poids_kg} kg` : "—"} />
            <Ligne label="Dimensions" value={ref.dimensions ?? "—"} />
            <Ligne
              label={`Connecteurs alim.${surcharge ? " (spécifiques)" : ""}`}
              value={connPuissance.length ? connPuissance.join(", ") : "—"}
            />
            <Ligne
              label={`Connecteurs données${surcharge ? " (spécifiques)" : ""}`}
              value={connData.length ? connData.join(", ") : "—"}
            />
          </Card>
        )}

        {/* Maintenance & état (éditable) */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Maintenance & état</h2>
          <form action={updateUniteMaintenance.bind(null, code, u.id)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="État" name="etat" defaultValue={u.etat} options={ETAT_OPTIONS} />
              <Field label="Dernière maintenance" name="date_derniere_maintenance" type="date" defaultValue={u.date_derniere_maintenance} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Maintenance préventive — tous les (jours)" name="maintenance_intervalle_jours" type="number" defaultValue={u.maintenance_intervalle_jours} placeholder="ex. 180" />
              <Field label="… ou toutes les (heures d'usage)" name="maintenance_intervalle_heures" type="number" step="0.1" defaultValue={u.maintenance_intervalle_heures} placeholder="ex. 500" />
            </div>
            <TextArea label="Remarques" name="remarques" defaultValue={u.remarques} />
            <SubmitButton>Enregistrer</SubmitButton>
          </form>
        </Card>

        {/* Historique d'usage */}
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Historique d'usage</h2>
          {mvts.length === 0 ? (
            <p className="text-sm text-muted">Aucun mouvement enregistré.</p>
          ) : (
            <div className="divide-y divide-border">
              {mvts.map((m) => (
                <div key={m.id} className="flex justify-between py-1.5 text-sm">
                  <span>{m.type === "sortie" ? "↗ Sortie" : "↙ Retour"}</span>
                  <span className="text-muted">
                    {dateFr(m.date)}{m.heures_ajoutees ? ` · +${m.heures_ajoutees} h` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Historique d'inventaire */}
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Historique d'inventaire</h2>
          {inventaires.length === 0 ? (
            <p className="text-sm text-muted">Aucun passage en inventaire.</p>
          ) : (
            <div className="divide-y divide-border">
              {inventaires.map((inv, i) => (
                <div key={i} className="py-1.5 text-sm">
                  <div className="flex justify-between">
                    <span>{dateFr(inv.session?.date)}</span>
                    <span className={inv.present ? "text-green-600" : "text-red-600"}>
                      {inv.present ? "Présent" : "Absent"}
                      {inv.etat_constate ? ` · ${ETAT_LABELS[inv.etat_constate as EtatUnite] ?? inv.etat_constate}` : ""}
                    </span>
                  </div>
                  {inv.remarque_maintenance && (
                    <div className="text-xs text-muted">{inv.remarque_maintenance}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {ref && (
          <Link
            href={`/catalogue/${ref.id}`}
            className="inline-flex text-sm font-medium text-primary hover:underline"
          >
            → Voir / modifier la référence « {ref.nom} »
          </Link>
        )}
      </div>
    </div>
  );
}
