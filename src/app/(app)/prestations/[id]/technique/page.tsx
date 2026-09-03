import Link from "next/link";
import { bucketPour, BUCKETS } from "@/lib/devis-buckets";
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
  reference_id: string | null;
  reference: { poids_kg: number | null; charge_max_kg: number | null; intensite_a: number | null; puissance_w: number | null; phase: "mono" | "tri" | null } | null;
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
      .select("id, designation, quantite, reference_id, reference:materiel_reference(poids_kg, charge_max_kg, intensite_a, puissance_w, phase)")
      .eq("prestation_id", id),
  ]);

  const ponts = (pontsData ?? []) as Pont[];
  const circuits = (circuitsData ?? []) as CircuitElec[];
  const lignes = (lignesData ?? []) as unknown as LigneRow[];

  const lineIds = lignes.map((l) => l.id);
  const { data: affData } = lineIds.length
    ? await supabase.from("affectation").select("ligne_prestation_id, pont_id, circuit_id, rang").in("ligne_prestation_id", lineIds)
    : { data: [] };
  const affectations = (affData ?? []) as { ligne_prestation_id: string; pont_id: string | null; circuit_id: string | null; rang: number | null }[];

  const pontDeLigne = new Map<string, string>();
  const circuitDeExemplaire = new Map<string, string>(); // clé `${ligneId}:${rang}` → circuit
  for (const a of affectations) {
    if (a.pont_id) pontDeLigne.set(a.ligne_prestation_id, a.pont_id);
    if (a.circuit_id && a.rang != null) circuitDeExemplaire.set(`${a.ligne_prestation_id}:${a.rang}`, a.circuit_id);
  }

  // Unités réservées pour l'événement → n° de série par référence (pour nommer les exemplaires).
  const { data: resData } = await supabase
    .from("reservation_unite")
    .select("unite:unite(id, reference_id, numero_serie)")
    .eq("prestation_id", id);
  const serialsParRef = new Map<string, { id: string; numero_serie: string | null }[]>();
  for (const r of (resData ?? []) as unknown as { unite: { id: string; reference_id: string; numero_serie: string | null } | null }[]) {
    const u = r.unite;
    if (!u) continue;
    const arr = serialsParRef.get(u.reference_id) ?? [];
    arr.push({ id: u.id, numero_serie: u.numero_serie });
    serialsParRef.set(u.reference_id, arr);
  }

  // Toutes les lignes de MATÉRIEL sont proposées au levage, y compris celles dont le poids
  // n'est pas renseigné : les masquer donnait une charge sous-estimée sans le signaler.
  // Seules la main-d'œuvre et le transport sont écartés (rien à suspendre).
  const lignesPoids = lignes.filter((l) => {
    const b = bucketPour(l.designation, null);
    return b !== BUCKETS.TECH && b !== BUCKETS.TRANSPORT;
  });
  const lignesElec = lignes.filter((l) => courantLigne(l.reference ?? { puissance_w: null, intensite_a: null, phase: null }, l.quantite) > 0);

  // Exemplaires élec : une entrée par unité de chaque ligne (placement individuel sur les circuits).
  const noValElec = { puissance_w: null, intensite_a: null, phase: null };
  const exemplairesElec = lignesElec.flatMap((l) => {
    const q = Math.max(1, Math.floor(l.quantite));
    const courantUnite = courantLigne(l.reference ?? noValElec, 1);
    const serials = l.reference_id ? serialsParRef.get(l.reference_id) ?? [] : [];
    return Array.from({ length: q }, (_, rang) => {
      const serial = serials[rang]?.numero_serie ?? null;
      const suffixe = q > 1 ? ` #${serial ?? rang + 1}` : serial ? ` #${serial}` : "";
      return {
        key: `${l.id}:${rang}`,
        ligneId: l.id,
        rang,
        uniteId: serials[rang]?.id ?? null,
        designation: `${l.designation ?? "Appareil"}${suffixe}`,
        courant: courantUnite,
        circuitId: circuitDeExemplaire.get(`${l.id}:${rang}`) ?? null,
      };
    });
  });

  const totalPont = (pontId: string) =>
    lignes.filter((l) => pontDeLigne.get(l.id) === pontId).reduce((s, l) => s + poidsLigne(l.reference?.poids_kg ?? null, l.quantite), 0);

  // --- Arborescence électrique ---
  const enfantsDe = new Map<string | null, CircuitElec[]>();
  for (const c of circuits) {
    const key = c.parent_id ?? null;
    if (!enfantsDe.has(key)) enfantsDe.set(key, []);
    enfantsDe.get(key)!.push(c);
  }
  // Liste à plat (indentée) pour les menus de sélection
  const noeudsAplatis: { id: string; nom: string }[] = [];
  const aplatir = (parentId: string | null, depth: number) => {
    for (const n of enfantsDe.get(parentId) ?? []) {
      noeudsAplatis.push({ id: n.id, nom: `${"· ".repeat(depth)}${n.nom}` });
      aplatir(n.id, depth + 1);
    }
  };
  aplatir(null, 0);

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
          Charge utile
        </Link>
        <Link href={`/prestations/${id}/technique?sous=elec`} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${sous === "elec" ? "bg-background shadow-sm border border-border" : "text-muted hover:text-foreground"}`}>
          Électricité
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
            quantite: l.quantite,
            poids: poidsLigne(l.reference?.poids_kg ?? null, l.quantite),
            poidsConnu: (l.reference?.poids_kg ?? 0) > 0,
            referenceId: l.reference_id,
            pontId: pontDeLigne.get(l.id) ?? null,
          }))}
          lignesLevage={lignes
            .filter((l) => (l.reference?.charge_max_kg ?? 0) > 0)
            .map((l) => ({
              designation: l.designation ?? "Levage",
              chargeUnitaire: Number(l.reference!.charge_max_kg),
              quantite: l.quantite,
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
          exemplaires={exemplairesElec}
        />
      </section>
      )}
    </div>
  );
}
