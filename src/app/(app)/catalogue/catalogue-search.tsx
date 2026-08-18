"use client";

import { useState, useMemo } from "react";
import { IconBox } from "@/components/icons";
import Link from "next/link";
import { euros } from "@/lib/format";

type RefRow = {
  id: string;
  nom: string;
  designation: string | null;
  photo_url: string | null;
  prix_location_jour: number;
  est_consommable: boolean;
  puissance_w: number | null;
  poids_kg: number | null;
  categorie_id: string;
  unite: { count: number }[];
};

type Group = { label: string | null; items: RefRow[] };

/** Une référence non consommable dont le poids OU la conso n'est pas renseigné(e). */
function specsIncompletes(r: RefRow): boolean {
  return !r.est_consommable && (r.poids_kg == null || r.puissance_w == null);
}

export function CatalogueSearch({
  groups,
  isExterne,
  activeCatId,
  showFilter = true,
}: {
  groups: Group[];
  isExterne: boolean;
  activeCatId: string | null;
  showFilter?: boolean;
}) {
  const [q, setQ] = useState("");
  const [seulementIncompletes, setSeulementIncompletes] = useState(false);

  const nbIncompletes = useMemo(
    () => groups.reduce((s, g) => s + g.items.filter(specsIncompletes).length, 0),
    [groups],
  );

  const filteredGroups = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (r) =>
            (!seulementIncompletes || specsIncompletes(r)) &&
            (!lq || r.nom.toLowerCase().includes(lq) || (r.designation ?? "").toLowerCase().includes(lq)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, q, seulementIncompletes]);

  const totalFiltered = filteredGroups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div>
      {nbIncompletes > 0 && (
        <button
          type="button"
          onClick={() => setSeulementIncompletes((v) => !v)}
          className={`mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${seulementIncompletes ? "border-amber-400 bg-amber-100 text-amber-800" : "border-border bg-surface hover:bg-background"}`}
          title="Références sans poids ou sans consommation (utile pour les calculateurs élec & levage)"
        >
          ⚠ Specs incomplètes ({nbIncompletes}){seulementIncompletes ? " — tout afficher" : ""}
        </button>
      )}
      {filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {q ? `Aucun résultat pour « ${q} »` : "Aucune référence dans cette catégorie"}
        </div>
      ) : (
        <div className="space-y-8">
          {q && (
            <p className="text-xs text-muted -mt-4">
              {totalFiltered} résultat{totalFiltered !== 1 ? "s" : ""}
            </p>
          )}
          {filteredGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span className="h-px flex-1 bg-border" />
                  {group.label}
                  <span className="h-px flex-1 bg-border" />
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((r) => {
                  const nbUnites = r.unite?.[0]?.count ?? 0;
                  return (
                    <Link
                      key={r.id}
                      href={`/catalogue/${r.id}`}
                      className="group relative flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-md hover:border-primary/30"
                    >
                      {/* Texte */}
                      <div className="min-w-0 flex-1">
                        {isExterne && (
                          <span className="mb-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Sous-location
                          </span>
                        )}
                        <p className="font-semibold leading-snug group-hover:text-primary">
                          {r.designation ?? r.nom}
                        </p>
                        {r.designation && (
                          <p className="text-xs text-muted">{r.nom}</p>
                        )}

                        {specsIncompletes(r) && (
                          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800" title={`${r.poids_kg == null ? "Poids" : ""}${r.poids_kg == null && r.puissance_w == null ? " et " : ""}${r.puissance_w == null ? "conso" : ""} à renseigner`}>
                            ⚠ Specs incomplètes
                          </span>
                        )}

                        <p className="mt-1 text-xs text-muted">
                          {r.puissance_w ? `${r.puissance_w} W` : ""}
                          {r.puissance_w && (r.est_consommable || nbUnites > 0) ? " · " : ""}
                          {r.est_consommable ? (
                            <span className="rounded-full bg-surface px-1.5 py-0.5">Consommable</span>
                          ) : (
                            <span>
                              {nbUnites} unité{nbUnites !== 1 ? "s" : ""}
                            </span>
                          )}
                        </p>

                        <div className="mt-2 text-sm">
                          {r.prix_location_jour > 0 ? (
                            <>
                              <span className="font-semibold">{euros(r.prix_location_jour)}</span>
                              <span className="text-xs text-muted">/j</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted">Prix non renseigné</span>
                          )}
                        </div>
                      </div>

                      {/* Miniature photo */}
                      {r.photo_url ? (
                        <img
                          src={r.photo_url}
                          alt={r.designation ?? r.nom}
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-lg object-contain"
                        />
                      ) : (
                        <div className="h-16 w-16 shrink-0 rounded-lg border border-border bg-surface flex items-center justify-center text-2xl text-muted/40">
                          <IconBox className="h-8 w-8" />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
