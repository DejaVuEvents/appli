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
  const [{ data: lignesData }, { data: refData }, { data: ignoresData }, { data: catsData }] = await Promise.all([
    supabase
      .from("ligne_prestation")
      .select("designation, quantite, prix_total, prix_unitaire, prestation:prestation_id(nom)")
      .is("reference_id", null),
    supabase.from("materiel_reference").select("id, nom, designation, categorie_id, est_groupe").order("nom"),
    supabase.from("libelle_ignore").select("designation"),
    supabase.from("categorie").select("id, nom, parent_id"),
  ]);

  const references = (refData ?? []) as {
    id: string; nom: string; designation: string | null; categorie_id: string | null; est_groupe: boolean | null;
  }[];

  // Famille = catégorie racine. C'est elle qui permet de naviguer : une ligne
  // « technicien » ne se cherche pas dans les projecteurs.
  const cats = (catsData ?? []) as { id: string; nom: string; parent_id: string | null }[];
  const parentDe = new Map(cats.map((c) => [c.id, c.parent_id]));
  const nomCat = new Map(cats.map((c) => [c.id, c.nom]));
  const familleDe = (catId: string | null): string => {
    let cur = catId;
    for (let i = 0; cur && i < 10; i++) {
      const parent = parentDe.get(cur) ?? null;
      if (!parent) return nomCat.get(cur) ?? "Sans famille";
      cur = parent;
    }
    return "Sans famille";
  };
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

      <Card className="px-4 py-2.5 text-sm">
        <strong>{lignesRestantes}</strong> ligne{lignesRestantes > 1 ? "s" : ""} hors catalogue ·{" "}
        {aTraiter.length} libellé{aTraiter.length > 1 ? "s" : ""} · {avecSuggestion} avec suggestion
      </Card>

      <RattachementListe
        libelles={aTraiter}
        references={references.map((r) => ({
          id: r.id,
          nom: r.nom,
          categorieNom: r.categorie_id ? nomCat.get(r.categorie_id) ?? null : null,
          externe: familleDe(r.categorie_id) === "Catalogue Externe",
          groupe: !!r.est_groupe,
        }))}
        ignores={ecartes}
      />
    </div>
  );
}
