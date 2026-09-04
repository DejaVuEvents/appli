import { createClient } from "@/lib/supabase/server";
import { IconSearch } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { CatalogueSearch } from "./catalogue-search";
import { Modal } from "@/components/modal";
import { ReferenceForm } from "./reference-form";
import { createReference } from "./actions";

// Ordre d'affichage des onglets (par ID stable)
const TAB_ORDER = [
  "6f506567-9308-4427-9e03-900b7ac2581c", // Lumière & Effets
  "61b04e83-992f-455e-8aed-b5046d374da3", // Son
  "fa9f04e3-553d-4e6b-9195-3f9e23dcf9b3", // Structure & Scène
  "257d1349-d060-434e-8a72-e9f6553f5677", // Électricité
  "689422d2-a615-4967-ba58-f93214602fdd", // Catalogue Externe
];

const EXTERNE_ID = "689422d2-a615-4967-ba58-f93214602fdd";

type CategorieRow = {
  id: string;
  nom: string;
  parent_id: string | null;
  ordre: number;
};

type RefRow = {
  id: string;
  nom: string;
  designation: string | null;
  photo_url: string | null;
  prix_location_jour: number;
  cout_location_jour: number | null;
  tva_fournisseur_pct: number | null;
  est_consommable: boolean;
  puissance_w: number | null;
  poids_kg: number | null;
  categorie_id: string;
  categorie: { nom: string; parent_id: string | null } | null;
  unite: { count: number }[];
};

const REF_SELECT =
  "id, nom, designation, photo_url, prix_location_jour, cout_location_jour, tva_fournisseur_pct, est_consommable, puissance_w, poids_kg, categorie_id, categorie(nom, parent_id), unite(count)";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp?.q ?? "").trim();
  const supabase = await createClient();

  // Toutes les catégories
  const { data: catData } = await supabase
    .from("categorie")
    .select("id, nom, parent_id, ordre")
    .order("ordre", { ascending: true })
    .order("nom");
  const allCats = (catData ?? []) as CategorieRow[];

  // ─── Recherche globale (toutes catégories) ─────────────────────────────────
  if (q.length >= 2) {
    const safe = q.replace(/[%,()]/g, " ").trim();
    const { data: refData } = await supabase
      .from("materiel_reference")
      .select(REF_SELECT)
      .or(`nom.ilike.%${safe}%,designation.ilike.%${safe}%`)
      .order("nom")
      .limit(300);
    const refs = (refData ?? []) as unknown as RefRow[];

    // Regroupement par catégorie pour situer chaque résultat
    const groupsMap = new Map<string, RefRow[]>();
    for (const r of refs) {
      const key = r.categorie?.nom ?? "Autre";
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(r);
    }
    const groups = [...groupsMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, items]) => ({ label, items }));

    return (
      <div className="max-w-7xl">
        <PageHeader title="Catalogue matériel" subtitle={`Recherche globale — ${refs.length} résultat${refs.length !== 1 ? "s" : ""}`} />
        <GlobalSearchForm q={q} />
        <div className="mb-4">
          <Link href="/catalogue" className="text-sm text-primary hover:underline">← Retour au catalogue par catégorie</Link>
        </div>
        {refs.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-14 text-center text-sm text-muted">
            Aucun article ne correspond à « {q} ».
          </div>
        ) : (
          <CatalogueSearch groups={groups} isExterne={false} activeCatId={null} showFilter={false} />
        )}
      </div>
    );
  }

  // Onglets = catégories racines, triées selon l'ordre défini
  const rootCats = TAB_ORDER.map((id) => allCats.find((c) => c.id === id)).filter(Boolean) as CategorieRow[];

  // Catégorie active
  const activeCatId = sp?.cat && rootCats.find((c) => c.id === sp.cat) ? sp.cat : rootCats[0]?.id ?? null;

  // IDs à inclure : la catégorie active + ses enfants
  const childCatIds = allCats.filter((c) => c.parent_id === activeCatId).map((c) => c.id);
  const catIdsToFetch = [activeCatId, ...childCatIds].filter(Boolean) as string[];

  // Références pour cet onglet
  const { data: refData } = await supabase
    .from("materiel_reference")
    .select(REF_SELECT)
    .in("categorie_id", catIdsToFetch)
    .order("nom");
  const refs = (refData ?? []) as unknown as RefRow[];

  const isExterne = activeCatId === EXTERNE_ID;

  const nouvelleReference = (
    <Modal trigger="+ Nouvelle référence" title="Nouvelle référence" panelClassName="max-w-6xl">
      <ReferenceForm action={createReference} categories={allCats} defaultCatId={activeCatId ?? undefined} inModal />
    </Modal>
  );

  // Regrouper par sous-catégorie si applicable (ex. Câbles sous Lumière)
  const hasSubcats = childCatIds.length > 0;
  const groups: { label: string | null; items: RefRow[] }[] = [];
  if (hasSubcats) {
    // Groupe principal (directement dans la catégorie racine)
    const main = refs.filter((r) => r.categorie_id === activeCatId);
    if (main.length > 0) groups.push({ label: null, items: main });
    // Sous-groupes (dans l'ordre des catégories)
    const childIdsOrdered = allCats.filter((c) => c.parent_id === activeCatId).map((c) => c.id);
    for (const childId of childIdsOrdered) {
      const childName = allCats.find((c) => c.id === childId)?.nom ?? null;
      const items = refs.filter((r) => r.categorie_id === childId);
      if (items.length > 0) groups.push({ label: childName, items });
    }
  } else {
    groups.push({ label: null, items: refs });
  }

  const tabCls = (active: boolean) =>
    `shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
      active
        ? "bg-background shadow-sm border border-border"
        : "text-muted hover:text-foreground hover:bg-background/60"
    }`;

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Catalogue matériel"
        subtitle={`${refs.length} référence${refs.length !== 1 ? "s" : ""}`}
        action={nouvelleReference}
      />

      <GlobalSearchForm q={q} />

      {/* Onglets catégories — scroll horizontal sur mobile */}
      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-xl border border-border bg-surface p-1 sm:w-auto sm:flex-wrap">
          {rootCats.map((cat) => (
            <Link
              key={cat.id}
              href={`/catalogue?cat=${cat.id}`}
              className={tabCls(cat.id === activeCatId)}
            >
              {cat.id === EXTERNE_ID ? "" : ""}
              {cat.nom}
            </Link>
          ))}
        </div>
      </div>

      {/* Bandeau Catalogue Externe */}
      {isExterne && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>Sous-location partenaires.</strong> Ces références ne sont pas la propriété de Déjà Vu — elles sont
          proposées via des partenaires ou prestataires externes. Penser à vérifier la disponibilité auprès du fournisseur.
        </div>
      )}

      {/* Grille avec recherche (client) */}
      {refs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-14 text-center text-sm text-muted">
          <p className="mb-3 text-base font-semibold">Aucune référence dans cette catégorie</p>
          <div className="flex justify-center">{nouvelleReference}</div>
        </div>
      ) : (
        <CatalogueSearch groups={groups} isExterne={isExterne} activeCatId={activeCatId} />
      )}
    </div>
  );
}

/** Barre de recherche globale (server-side, sur toutes les catégories). */
function GlobalSearchForm({ q }: { q: string }) {
  return (
    <form method="get" action="/catalogue" className="relative mb-6">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted"><IconSearch className="h-4 w-4" /></span>
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Rechercher dans tout le catalogue (toutes catégories)…"
        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 sm:max-w-md"
      />
    </form>
  );
}
