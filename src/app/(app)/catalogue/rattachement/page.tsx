import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { suggerer } from "@/lib/rattachement";
import { RattachementListe, type LibelleLibre } from "./rattachement-liste";

export const dynamic = "force-dynamic";

type LigneRow = {
  designation: string | null;
  quantite: number;
  prix_total: number | null;
  prix_unitaire: number | null;
  prestation: { nom: string | null } | null;
};

/**
 * File de rattachement des lignes de devis au catalogue.
 *
 * Une ligne « hors catalogue » n'existe pour personne : ni le ROI, ni la
 * réservation d'unités, ni la check-list par unité, ni le plan levage/élec. Comme
 * le même matériel a été tapé sous plusieurs orthographes au fil des années, on
 * regroupe par libellé et on rattache toutes ses lignes d'un seul geste.
 */
export default async function RattachementPage() {
  const supabase = await createClient();
  const [{ data: lignesData }, { data: refData }, { data: ignoresData }] = await Promise.all([
    supabase
      .from("ligne_prestation")
      .select("designation, quantite, prix_total, prix_unitaire, prestation:prestation_id(nom)")
      .is("reference_id", null),
    supabase.from("materiel_reference").select("id, nom, designation").order("nom"),
    supabase.from("libelle_ignore").select("designation"),
  ]);

  const references = (refData ?? []) as { id: string; nom: string; designation: string | null }[];
  const ignores = new Set(((ignoresData ?? []) as { designation: string }[]).map((i) => i.designation));

  // Regroupement par libellé exact : c'est l'unité de travail de l'écran.
  const parLibelle = new Map<string, LibelleLibre>();
  for (const l of (lignesData ?? []) as unknown as LigneRow[]) {
    const d = (l.designation ?? "").trim();
    if (!d) continue;
    const e = parLibelle.get(d) ?? {
      designation: d, lignes: 0, quantite: 0, montant: 0, evenements: [], suggestions: [],
    };
    e.lignes++;
    e.quantite += Number(l.quantite ?? 0);
    e.montant += Number(l.prix_total ?? (l.prix_unitaire ?? 0) * (l.quantite ?? 0));
    const nom = l.prestation?.nom;
    if (nom && !e.evenements.includes(nom)) e.evenements.push(nom);
    parLibelle.set(d, e);
  }

  const tous = [...parLibelle.values()].sort((a, b) => b.lignes - a.lignes || b.montant - a.montant);
  const aTraiter = tous
    .filter((l) => !ignores.has(l.designation))
    .map((l) => ({ ...l, suggestions: suggerer(l.designation, references) }));
  const ecartes = tous
    .filter((l) => ignores.has(l.designation))
    .map((l) => ({ designation: l.designation, lignes: l.lignes }));

  const lignesRestantes = aTraiter.reduce((s, l) => s + l.lignes, 0);
  const avecSuggestion = aTraiter.filter((l) => l.suggestions.length > 0).length;

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        title="Rattacher au catalogue"
        action={
          <Link href="/catalogue" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background">
            ← Catalogue
          </Link>
        }
      />

      <Card className="p-4 text-sm">
        <p>
          <strong>{lignesRestantes} ligne{lignesRestantes > 1 ? "s" : ""}</strong> de devis et de factures
          ne sont reliées à aucune référence, réparties sur{" "}
          <strong>{aTraiter.length} libellé{aTraiter.length > 1 ? "s" : ""}</strong> — dont {avecSuggestion} avec
          une suggestion. Tant qu&apos;une ligne n&apos;est pas rattachée, elle est invisible du ROI, ne réserve
          aucune unité et n&apos;apparaît pas dans la check-list par unité.
        </p>
        <p className="mt-2 text-muted">
          Rattacher agit sur <strong>toutes</strong> les lignes portant exactement le même libellé, sur tous les
          documents. Les montants ne bougent pas et aucun accessoire de kit n&apos;est ajouté : ces documents sont
          déjà émis. La main d&apos;œuvre, le transport, le câblage au mètre et les consommables n&apos;ont
          rien à faire ici — écarte-les.
        </p>
      </Card>

      <RattachementListe
        libelles={aTraiter}
        references={references.map((r) => ({ id: r.id, nom: r.nom }))}
        ignores={ecartes}
      />
    </div>
  );
}
