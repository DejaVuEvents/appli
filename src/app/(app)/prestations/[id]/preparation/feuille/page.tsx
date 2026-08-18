import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { poidsLigne, courantLigne, niveauAlerte } from "@/lib/technique";
import { dateFr } from "@/lib/format";
import type { CircuitElec, Pont } from "@/lib/types";

const ZONE_INCONNUE = "Zone non renseignée";
const amp = (n: number) => `${n.toFixed(1)} A`;
const kg = (n: number) => `${Math.round(n)} kg`;

/** Capacité effective en A mono (source tri = 3× calibre). */
function capaciteEffective(i: number | null, phase: string | null): number | null {
  if (i == null) return null;
  return phase === "tri" ? i * 3 : i;
}

type RefElec = { poids_kg: number | null; charge_max_kg: number | null; intensite_a: number | null; puissance_w: number | null; phase: "mono" | "tri" | null; nom: string; lieu_stockage: string | null } | null;
type LigneRow = { id: string; designation: string | null; quantite: number; unite: string | null; reference_id: string | null; reference: RefElec };
type ResaRow = { unite: { id: string; numero_serie: string | null; lieu_stockage: string | null; reference_id: string; reference: RefElec } | null };

export default async function FeuillePreparationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: prest }, { data: resaData }, { data: lignesData }, { data: plan }, { data: membresData }] = await Promise.all([
    supabase.from("prestation").select("*, client(nom)").eq("id", id).single(),
    supabase
      .from("reservation_unite")
      .select("unite:unite(id, numero_serie, lieu_stockage, reference_id, reference:materiel_reference(nom, lieu_stockage, poids_kg, charge_max_kg, intensite_a, puissance_w, phase))")
      .eq("prestation_id", id),
    supabase
      .from("ligne_prestation")
      .select("id, designation, quantite, unite, reference_id, reference:materiel_reference(nom, lieu_stockage, poids_kg, charge_max_kg, intensite_a, puissance_w, phase)")
      .eq("prestation_id", id)
      .order("created_at"),
    supabase.from("plan_technique").select("id").eq("prestation_id", id).maybeSingle(),
    supabase.from("prestation_membre").select("role, membre:membre_id(prenom, nom)").eq("prestation_id", id),
  ]);

  if (!prest) notFound();
  const prestation = prest as unknown as {
    nom: string; lieu: string | null; date_prepa: string | null; date_event_debut: string | null;
    date_event_fin: string | null; date_retour: string | null; client: { nom: string } | null;
  };
  const reservations = (resaData ?? []) as unknown as ResaRow[];
  const lignes = (lignesData ?? []) as unknown as LigneRow[];
  const planId = plan?.id ?? null;

  // --- Plan technique (levage + élec) ---
  const [{ data: pontsData }, { data: circuitsData }, { data: affData }] = planId
    ? await Promise.all([
        supabase.from("pont").select("*").eq("plan_id", planId).order("nom"),
        supabase.from("circuit_elec").select("*").eq("plan_id", planId).order("nom"),
        supabase.from("affectation").select("ligne_prestation_id, pont_id, circuit_id, rang").in("ligne_prestation_id", lignes.map((l) => l.id).length ? lignes.map((l) => l.id) : ["00000000-0000-0000-0000-000000000000"]),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const ponts = (pontsData ?? []) as Pont[];
  const circuits = (circuitsData ?? []) as CircuitElec[];
  const affectations = (affData ?? []) as { ligne_prestation_id: string; pont_id: string | null; circuit_id: string | null; rang: number | null }[];
  const ligneById = new Map(lignes.map((l) => [l.id, l]));

  // ===== Section 1 : Matériel par zone de stockage =====
  const refsReservees = new Set(reservations.map((r) => r.unite?.reference_id).filter(Boolean) as string[]);
  type ZoneEntry = { refs: Map<string, { nom: string; series: string[] }>; autres: { nom: string; qte: string }[] };
  const zones = new Map<string, ZoneEntry>();
  const zoneDe = (v: string | null | undefined) => (v && v.trim() ? v.trim() : ZONE_INCONNUE);
  const getZone = (z: string) => {
    if (!zones.has(z)) zones.set(z, { refs: new Map(), autres: [] });
    return zones.get(z)!;
  };
  // Unités sérialisées réservées
  for (const r of reservations) {
    const u = r.unite;
    if (!u) continue;
    const z = zoneDe(u.lieu_stockage ?? u.reference?.lieu_stockage);
    const entry = getZone(z);
    const refNom = u.reference?.nom ?? "Matériel";
    if (!entry.refs.has(u.reference_id)) entry.refs.set(u.reference_id, { nom: refNom, series: [] });
    entry.refs.get(u.reference_id)!.series.push(u.numero_serie || "unité");
  }
  // Matériel non sérialisé (lignes sans unités réservées)
  for (const l of lignes) {
    if (l.reference_id && refsReservees.has(l.reference_id)) continue;
    const z = zoneDe(l.reference?.lieu_stockage);
    getZone(z).autres.push({ nom: l.designation ?? l.reference?.nom ?? "Élément", qte: `${l.quantite}${l.unite ? ` ${l.unite}` : ""}` });
  }
  // Ordre : zones nommées d'abord, "non renseigné" en dernier
  const zonesTriees = [...zones.entries()].sort((a, b) => {
    if (a[0] === ZONE_INCONNUE) return 1;
    if (b[0] === ZONE_INCONNUE) return -1;
    return a[0].localeCompare(b[0]);
  });

  // ===== Section 2 : Levage =====
  const pontDeLigne = new Map<string, string>();
  for (const a of affectations) if (a.pont_id) pontDeLigne.set(a.ligne_prestation_id, a.pont_id);
  const lignesPont = (pontId: string) =>
    lignes.filter((l) => pontDeLigne.get(l.id) === pontId).map((l) => ({
      designation: l.designation ?? l.reference?.nom ?? "—",
      poids: poidsLigne(l.reference?.poids_kg ?? null, l.quantite),
    }));
  const totalPont = (pontId: string) => lignesPont(pontId).reduce((s, x) => s + x.poids, 0);

  // ===== Section 3 : Électricité =====
  const enfantsElec = new Map<string | null, CircuitElec[]>();
  for (const c of circuits) {
    const k = c.parent_id ?? null;
    if (!enfantsElec.has(k)) enfantsElec.set(k, []);
    enfantsElec.get(k)!.push(c);
  }
  const noVal = { puissance_w: null, intensite_a: null, phase: null };
  const consoDirecte = (nodeId: string) =>
    affectations
      .filter((a) => a.circuit_id === nodeId && a.rang != null)
      .reduce((s, a) => {
        const ref = ligneById.get(a.ligne_prestation_id)?.reference ?? noVal;
        return s + courantLigne(ref, 1);
      }, 0);
  const cache = new Map<string, number>();
  const totalNoeud = (nodeId: string): number => {
    if (cache.has(nodeId)) return cache.get(nodeId)!;
    const t = consoDirecte(nodeId) + (enfantsElec.get(nodeId) ?? []).reduce((s, e) => s + totalNoeud(e.id), 0);
    cache.set(nodeId, Math.round(t * 100) / 100);
    return cache.get(nodeId)!;
  };
  const rootsElec = enfantsElec.get(null) ?? [];

  const renderCircuit = (n: CircuitElec, depth: number): React.ReactNode => {
    const total = totalNoeud(n.id);
    const capEff = capaciteEffective(n.intensite_max_a, n.phase);
    const al = niveauAlerte(total, capEff, 0.9);
    const cls = al === "depasse" ? "text-red-600 font-semibold" : al === "warn" ? "text-amber-600" : "";
    return (
      <div key={n.id}>
        <div className="flex items-center justify-between border-b border-border/60 py-1" style={{ paddingLeft: `${depth * 1.25}rem` }}>
          <span className="text-sm">
            {depth > 0 && <span className="mr-1 text-border">└</span>}
            {n.type && <span className="mr-1.5 rounded bg-surface px-1 text-[10px] font-semibold uppercase text-muted">{n.type}</span>}
            {n.nom}
          </span>
          <span className={`text-xs tabular-nums ${cls}`}>{amp(total)}{capEff != null ? ` / ${amp(capEff)}` : ""}{al === "depasse" ? " ⚠" : ""}</span>
        </div>
        {(enfantsElec.get(n.id) ?? []).map((c) => renderCircuit(c, depth + 1))}
      </div>
    );
  };

  // ===== Section 4 : Planning / équipe =====
  const membres = (membresData ?? []) as unknown as { role: string | null; membre: { prenom: string | null; nom: string | null } | null }[];
  const nomMembre = (m: { prenom: string | null; nom: string | null } | null) => [m?.prenom, m?.nom].filter(Boolean).join(" ") || "—";

  const totalUnites = reservations.length;

  return (
    <div className="mx-auto max-w-[820px] space-y-6 p-4 sm:p-6">
      {/* Barre d'action (masquée à l'impression) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/prestations/${id}/preparation`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Préparation</Link>
        <PrintButton label="Imprimer / PDF" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 text-foreground print:border-0 print:bg-transparent print:p-0">
        {/* En-tête */}
        <div className="border-b border-foreground pb-3">
          <h1 className="text-xl font-bold">Feuille de préparation</h1>
          <div className="mt-1 text-sm text-muted">
            {prestation.nom}{prestation.client?.nom ? ` · ${prestation.client.nom}` : ""}{prestation.lieu ? ` · ${prestation.lieu}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-muted">
            {prestation.date_prepa && <span>Prépa : {dateFr(prestation.date_prepa)}</span>}
            {prestation.date_event_debut && <span>Event : {dateFr(prestation.date_event_debut)}{prestation.date_event_fin && prestation.date_event_fin !== prestation.date_event_debut ? ` → ${dateFr(prestation.date_event_fin)}` : ""}</span>}
            {prestation.date_retour && <span>Retour : {dateFr(prestation.date_retour)}</span>}
          </div>
        </div>

        {/* Section 1 — Matériel par zone de stockage */}
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Matériel par zone de stockage</h2>
          {zonesTriees.length === 0 ? (
            <p className="text-sm text-muted">Aucun matériel à charger.</p>
          ) : (
            <div className="space-y-4">
              {zonesTriees.map(([zone, entry]) => (
                <div key={zone} className="break-inside-avoid">
                  <h3 className="border-b border-border bg-surface px-1 py-1 text-sm font-semibold print:bg-transparent">{zone}</h3>
                  <div className="mt-1 space-y-1.5">
                    {[...entry.refs.values()].map((r) => (
                      <div key={r.nom} className="text-sm">
                        <div className="font-medium">{r.nom} <span className="font-normal text-muted">×{r.series.length}</span></div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-3 text-xs">
                          {r.series.map((s, i) => (
                            <span key={`${s}-${i}`} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 border border-foreground" /> {s}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {entry.autres.map((a, i) => (
                      <div key={`autre-${i}`} className="flex items-center gap-1.5 text-sm">
                        <span className="inline-block h-3 w-3 border border-foreground" /> {a.nom} <span className="text-muted">— {a.qte}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted">{totalUnites} unité{totalUnites > 1 ? "s" : ""} sérialisée{totalUnites > 1 ? "s" : ""} réservée{totalUnites > 1 ? "s" : ""}.</p>
        </section>

        {/* Section 2 — Plan de charge (levage) */}
        {ponts.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Plan de charge — levage</h2>
            <div className="space-y-3">
              {ponts.map((p) => {
                const total = totalPont(p.id);
                const cap = Number(p.capacite_kg ?? 0);
                const depasse = cap > 0 && total > cap;
                return (
                  <div key={p.id} className="text-sm">
                    <div className="flex items-center justify-between border-b border-border py-0.5">
                      <span className="font-medium">{p.nom}</span>
                      <span className={`text-xs tabular-nums ${depasse ? "text-red-600 font-semibold" : ""}`}>{kg(total)}{cap > 0 ? ` / ${kg(cap)}` : ""}{depasse ? " ⚠" : ""}</span>
                    </div>
                    <div className="pl-3 text-xs text-muted">
                      {lignesPont(p.id).length === 0 ? "—" : lignesPont(p.id).map((x, i) => (
                        <span key={i} className="mr-3 inline-block">{x.designation} ({kg(x.poids)})</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 3 — Plan électrique */}
        {rootsElec.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Plan électrique</h2>
            <div className="rounded-lg border border-border">
              {rootsElec.map((r) => renderCircuit(r, 0))}
            </div>
          </section>
        )}

        {/* Section 4 — Planning / équipe */}
        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Planning &amp; équipe</h2>
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted">Dates</div>
              <ul className="space-y-0.5">
                {prestation.date_prepa && <li>Préparation : <strong>{dateFr(prestation.date_prepa)}</strong></li>}
                {prestation.date_event_debut && <li>Événement : <strong>{dateFr(prestation.date_event_debut)}{prestation.date_event_fin && prestation.date_event_fin !== prestation.date_event_debut ? ` → ${dateFr(prestation.date_event_fin)}` : ""}</strong></li>}
                {prestation.date_retour && <li>Retour : <strong>{dateFr(prestation.date_retour)}</strong></li>}
                {prestation.lieu && <li>Lieu : <strong>{prestation.lieu}</strong></li>}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted">Équipe</div>
              {membres.length === 0 ? (
                <p className="text-muted">Aucune personne affectée.</p>
              ) : (
                <ul className="space-y-0.5">
                  {membres.map((m, i) => (
                    <li key={i}>{nomMembre(m.membre)}{m.role ? <span className="text-muted"> — {m.role}</span> : ""}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
