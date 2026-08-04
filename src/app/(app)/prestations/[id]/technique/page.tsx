import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { poidsLigne, courantLigne } from "@/lib/technique";
import { type Pont, type CircuitElec } from "@/lib/types";
import { ElecTree } from "./elec-tree";
import { LevagePlan } from "./levage-plan";
import { InfoHint } from "@/components/info-hint";
import { EventTabBar } from "@/components/event-tab-bar";

type LigneRow = {
  id: string;
  designation: string | null;
  quantite: number;
  reference: { poids_kg: number | null; intensite_a: number | null; puissance_w: number | null; phase: "mono" | "tri" | null } | null;
};

export default async function TechniquePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sous?: string }>;
}) {
  const { id } = await params;
  const sous = (await searchParams)?.sous === "elec" ? "elec" : "levage";
  const supabase = await createClient();

  const { data: prest } = await supabase.from("prestation").select("nom").eq("id", id).single();
  if (!prest) notFound();

  const { data: plan } = await supabase.from("plan_technique").select("id").eq("prestation_id", id).maybeSingle();
  const planId = plan?.id ?? null;

  const [{ data: pontsData }, { data: circuitsData }, { data: lignesData }] = await Promise.all([
    planId ? supabase.from("pont").select("*").eq("plan_id", planId).order("nom") : Promise.resolve({ data: [] }),
    planId ? supabase.from("circuit_elec").select("*").eq("plan_id", planId).order("nom") : Promise.resolve({ data: [] }),
    supabase
      .from("ligne_prestation")
      .select("id, designation, quantite, reference:materiel_reference(poids_kg, intensite_a, puissance_w, phase)")
      .eq("prestation_id", id),
  ]);

  const ponts = (pontsData ?? []) as Pont[];
  const circuits = (circuitsData ?? []) as CircuitElec[];
  const lignes = (lignesData ?? []) as unknown as LigneRow[];

  const lineIds = lignes.map((l) => l.id);
  const { data: affData } = lineIds.length
    ? await supabase.from("affectation").select("ligne_prestation_id, pont_id, circuit_id").in("ligne_prestation_id", lineIds)
    : { data: [] };
  const affectations = (affData ?? []) as { ligne_prestation_id: string; pont_id: string | null; circuit_id: string | null }[];

  const pontDeLigne = new Map<string, string>();
  const circuitDeLigne = new Map<string, string>();
  for (const a of affectations) {
    if (a.pont_id) pontDeLigne.set(a.ligne_prestation_id, a.pont_id);
    if (a.circuit_id) circuitDeLigne.set(a.ligne_prestation_id, a.circuit_id);
  }

  const lignesPoids = lignes.filter((l) => poidsLigne(l.reference?.poids_kg ?? null, l.quantite) > 0);
  const lignesElec = lignes.filter((l) => courantLigne(l.reference ?? { puissance_w: null, intensite_a: null, phase: null }, l.quantite) > 0);

  const totalPont = (pontId: string) =>
    lignes.filter((l) => pontDeLigne.get(l.id) === pontId).reduce((s, l) => s + poidsLigne(l.reference?.poids_kg ?? null, l.quantite), 0);

  // --- Arborescence électrique ---
  const enfantsDe = new Map<string | null, CircuitElec[]>();
  for (const c of circuits) {
    const key = c.parent_id ?? null;
    if (!enfantsDe.has(key)) enfantsDe.set(key, []);
    enfantsDe.get(key)!.push(c);
  }
  // Conso directement branchée sur un nœud
  const consoDirecte = (nodeId: string) =>
    lignes
      .filter((l) => circuitDeLigne.get(l.id) === nodeId)
      .reduce((s, l) => s + courantLigne(l.reference ?? { puissance_w: null, intensite_a: null, phase: null }, l.quantite), 0);
  // Conso totale = directe + somme des enfants (remontée)
  const cacheTotal = new Map<string, number>();
  const totalNoeud = (nodeId: string): number => {
    if (cacheTotal.has(nodeId)) return cacheTotal.get(nodeId)!;
    const t = consoDirecte(nodeId) + (enfantsDe.get(nodeId) ?? []).reduce((s, e) => s + totalNoeud(e.id), 0);
    cacheTotal.set(nodeId, Math.round(t * 100) / 100);
    return cacheTotal.get(nodeId)!;
  };
  // Liste à plat (indentée) pour les menus de sélection
  const noeudsAplatis: { id: string; nom: string }[] = [];
  const aplatir = (parentId: string | null, depth: number) => {
    for (const n of enfantsDe.get(parentId) ?? []) {
      noeudsAplatis.push({ id: n.id, nom: `${"· ".repeat(depth)}${n.nom}` });
      aplatir(n.id, depth + 1);
    }
  };
  aplatir(null, 0);

  const noVal = { puissance_w: null, intensite_a: null, phase: null };

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader title="Plan technique" subtitle={prest.nom} />
      <EventTabBar eventId={id} active="technique" />

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        ⚠️ <strong>Aide à la décision uniquement.</strong> Ces calculs sont indicatifs. La validation
        finale (notamment le levage au-dessus du public) revient à une <strong>personne compétente</strong>.
      </div>

      {/* Sous-onglets Charge utile / Électricité */}
      <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        <Link href={`/prestations/${id}/technique?sous=levage`} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${sous === "levage" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>
          🏗️ Charge utile
        </Link>
        <Link href={`/prestations/${id}/technique?sous=elec`} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${sous === "elec" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>
          ⚡ Électricité
        </Link>
      </div>

      {/* CHARGE UTILE / LEVAGE */}
      {sous === "levage" && (
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Levage — ponts & charges</h2>
        <LevagePlan
          prestationId={id}
          ponts={ponts.map((p) => ({ id: p.id, nom: p.nom, capacite_kg: p.capacite_kg, total: totalPont(p.id) }))}
          lignes={lignesPoids.map((l) => ({
            id: l.id,
            designation: l.designation,
            poids: poidsLigne(l.reference?.poids_kg ?? null, l.quantite),
            pontId: pontDeLigne.get(l.id) ?? null,
          }))}
        />
      </section>
      )}

      {/* ÉLECTRICITÉ — arborescence interactive */}
      {sous === "elec" && (
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Électricité — arborescence & charges
          <InfoHint text="Source (groupe / secteur) → armoires → prises. Cliquer sur + pour ajouter un sous-circuit, ou glisser une source/un nœud sur un autre pour le déplacer. La conso remonte à chaque niveau. Une source triphasée compte pour 3× son calibre (32A tri = 96A mono)." />
        </h2>

        <ElecTree
          prestationId={id}
          circuits={circuits}
          noeuds={noeudsAplatis}
          lignes={lignesElec.map((l) => ({
            id: l.id,
            designation: l.designation,
            courant: courantLigne(l.reference ?? noVal, l.quantite),
            circuitId: circuitDeLigne.get(l.id) ?? null,
          }))}
        />
      </section>
      )}
    </div>
  );
}
