import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { GroupesView, NouveauGroupe, type Groupe, type RefOption } from "./groupes-view";

export const dynamic = "force-dynamic";

const EXTERNE = "Catalogue Externe";

/** Groupes du catalogue : des références qui en contiennent d'autres. */
export default async function GroupesPage() {
  const supabase = await createClient();
  const [{ data: refsData }, { data: catsData }, { data: reglesData }, { data: unitesData }, { data: lignesData }] =
    await Promise.all([
      supabase
        .from("materiel_reference")
        .select("id, nom, designation, prix_location_jour, categorie_id, est_groupe")
        .order("nom"),
      supabase.from("categorie").select("id, nom, parent_id"),
      supabase.from("kit_regle").select("reference_parent_id, reference_accessoire_id, quantite_par_unite").eq("obligatoire", true),
      supabase.from("unite").select("reference_id"),
      supabase.from("ligne_prestation").select("reference_id").not("reference_id", "is", null),
    ]);

  const refs = (refsData ?? []) as {
    id: string; nom: string; designation: string | null;
    prix_location_jour: number | null; categorie_id: string | null; est_groupe: boolean | null;
  }[];
  const cats = (catsData ?? []) as { id: string; nom: string; parent_id: string | null }[];
  const parentDe = new Map(cats.map((c) => [c.id, c.parent_id]));
  const nomCat = new Map(cats.map((c) => [c.id, c.nom]));

  // Un article est « externe » si sa catégorie descend du Catalogue Externe.
  const estExterne = (catId: string | null) => {
    let cur = catId;
    for (let i = 0; cur && i < 10; i++) {
      if (nomCat.get(cur) === EXTERNE) return true;
      cur = parentDe.get(cur) ?? null;
    }
    return false;
  };

  const nbUnites = new Map<string, number>();
  for (const u of (unitesData ?? []) as { reference_id: string }[]) {
    nbUnites.set(u.reference_id, (nbUnites.get(u.reference_id) ?? 0) + 1);
  }
  const nbLignes = new Map<string, number>();
  for (const l of (lignesData ?? []) as { reference_id: string }[]) {
    nbLignes.set(l.reference_id, (nbLignes.get(l.reference_id) ?? 0) + 1);
  }

  const parId = new Map(refs.map((r) => [r.id, r]));
  const groupes: Groupe[] = refs
    .filter((r) => r.est_groupe)
    .map((g) => ({
      id: g.id,
      nom: g.nom,
      designation: g.designation,
      prix_location_jour: g.prix_location_jour,
      utilisations: nbLignes.get(g.id) ?? 0,
      composants: ((reglesData ?? []) as { reference_parent_id: string; reference_accessoire_id: string; quantite_par_unite: number }[])
        .filter((k) => k.reference_parent_id === g.id)
        .map((k) => {
          const r = parId.get(k.reference_accessoire_id);
          return {
            reference_id: k.reference_accessoire_id,
            nom: r?.nom ?? "Référence supprimée",
            quantite: Number(k.quantite_par_unite ?? 1),
            unites: nbUnites.get(k.reference_accessoire_id) ?? 0,
            externe: estExterne(r?.categorie_id ?? null),
          };
        })
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    }));

  const references: RefOption[] = refs
    .filter((r) => !r.est_groupe)
    .map((r) => ({ id: r.id, nom: r.nom, externe: estExterne(r.categorie_id) }));

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="Groupes"
        subtitle="Du matériel qui part toujours ensemble"
        action={
          <div className="flex items-center gap-2">
            <Link href="/catalogue" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background">
              ← Catalogue
            </Link>
            <NouveauGroupe />
          </div>
        }
      />
      <GroupesView groupes={groupes} references={references} />
    </div>
  );
}
