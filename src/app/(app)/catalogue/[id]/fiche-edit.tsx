import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { Field, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ReferenceForm } from "../reference-form";
import { UniteFields } from "./unite-fields";
import {
  updateReference,
  deleteReference,
  addUnite,
  updateUnite,
  deleteUnite,
  genererQrCode,
  addKitRegle,
  deleteKitRegle,
} from "../actions";
import { ETAT_LABELS, type MaterielReference, type Unite, type EtatUnite } from "@/lib/types";
import type { KitRow } from "./fiche-types";

export function FicheEdit({
  id,
  reference,
  cats,
  listeUnites,
  accessoiresObligatoires,
  accessoiresOptionnels,
  autresRefs,
}: {
  id: string;
  reference: MaterielReference;
  cats: { id: string; nom: string }[];
  listeUnites: Unite[];
  accessoiresObligatoires: KitRow[];
  accessoiresOptionnels: KitRow[];
  autresRefs: { id: string; nom: string }[];
}) {
  return (
    <div className="space-y-8">
      {/* Fiche / specs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Fiche</h2>
        <ReferenceForm action={updateReference.bind(null, id)} reference={reference} categories={cats} />
      </section>

      {/* Unités sérialisées */}
      {!reference.est_consommable && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Unités ({listeUnites.length})
          </h2>

          {listeUnites.length === 0 && (
            <Card className="px-4 py-4 text-sm text-muted">Aucune unité enregistrée.</Card>
          )}

          <div className="space-y-3">
            {listeUnites.map((u, i) => (
              <Card key={u.id} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Unité #{i + 1}
                    <span className="ml-2 font-normal text-muted">
                      {u.compteur_heures} h · {u.compteur_sorties} sorties
                    </span>
                  </span>
                  <form action={deleteUnite.bind(null, id, u.id)}>
                    <button className="rounded-md px-2 py-1 text-sm text-muted hover:text-red-600" title="Supprimer l'unité">
                      ✕ Supprimer
                    </button>
                  </form>
                </div>
                <form action={updateUnite.bind(null, id, u.id)}>
                  <UniteFields
                    unite={u}
                    refPuissance={reference.connecteurs_puissance}
                    refData={reference.connecteurs_data}
                  />
                  <div className="mt-3">
                    <SubmitButton>Enregistrer</SubmitButton>
                  </div>
                </form>

                {/* QR code */}
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
                  {u.qr_code ? (
                    <>
                      <span className="text-muted">QR code prêt</span>
                      <a
                        href={`/api/unite/${u.id}/qrcode`}
                        download
                        className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-background"
                      >
                        Télécharger le QR
                      </a>
                      <Link href={`/u/${u.qr_code}`} className="text-primary hover:underline">
                        Ouvrir la fiche
                      </Link>
                    </>
                  ) : (
                    <form action={genererQrCode.bind(null, id, u.id)}>
                      <SubmitButton pendingLabel="Génération…">Générer le QR code</SubmitButton>
                    </form>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Ajout d'unité */}
          <Card className="mt-3 p-4">
            <p className="mb-3 text-sm font-semibold">Ajouter une unité</p>
            <form action={addUnite.bind(null, id)}>
              <UniteFields refPuissance={reference.connecteurs_puissance} refData={reference.connecteurs_data} />
              <div className="mt-3">
                <SubmitButton>+ Ajouter</SubmitButton>
              </div>
            </form>
          </Card>
        </section>
      )}

      {/* Accessoires (obligatoires + optionnels) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Accessoires</h2>
        <p className="mb-4 text-sm text-muted">
          Pour chaque unité de « {reference.nom} », les accessoires <strong>obligatoires</strong> sont
          ajoutés automatiquement au devis et à la check-list ; les <strong>optionnels</strong> seront
          proposés (à cocher) au moment de la création du devis.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Obligatoires (auto)</h3>
            <Card className="divide-y divide-border overflow-hidden">
              {accessoiresObligatoires.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucun.</p>}
              {accessoiresObligatoires.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span><strong>{k.quantite_par_unite}</strong> × {k.accessoire?.nom ?? "?"}</span>
                  <form action={deleteKitRegle.bind(null, id, k.id)}>
                    <button className="rounded-md px-2 py-1 text-muted hover:text-red-600" title="Supprimer">✕</button>
                  </form>
                </div>
              ))}
            </Card>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Optionnels (proposés au devis)</h3>
            <Card className="divide-y divide-border overflow-hidden">
              {accessoiresOptionnels.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucun.</p>}
              {accessoiresOptionnels.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span><strong>{k.quantite_par_unite}</strong> × {k.accessoire?.nom ?? "?"}</span>
                  <form action={deleteKitRegle.bind(null, id, k.id)}>
                    <button className="rounded-md px-2 py-1 text-muted hover:text-red-600" title="Supprimer">✕</button>
                  </form>
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* Ajout d'un accessoire */}
        <Card className="mt-4 p-4">
          <form action={addKitRegle.bind(null, id)} className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <div className="sm:col-span-2">
              <label htmlFor="accessoire_nom" className="block text-sm font-medium mb-1">
                Accessoire <span className="text-red-500">*</span>
              </label>
              <input
                id="accessoire_nom"
                name="accessoire_nom"
                list="refs-accessoires"
                required
                placeholder="Câble DMX 3m, Élingue 1m, Crochet…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <datalist id="refs-accessoires">
                {autresRefs.map((r) => (
                  <option key={r.id} value={r.nom} />
                ))}
              </datalist>
            </div>
            <Field label="Quantité / unité" name="quantite_par_unite" type="number" step="0.01" defaultValue={1} />
            <Select
              label="Type"
              name="obligatoire"
              defaultValue="obligatoire"
              options={[
                { value: "obligatoire", label: "Obligatoire" },
                { value: "optionnel", label: "Optionnel" },
              ]}
            />
            <div className="sm:col-span-4">
              <SubmitButton>+ Ajouter l&apos;accessoire</SubmitButton>
            </div>
          </form>
          <p className="mt-2 text-xs text-muted">
            Si l&apos;accessoire n&apos;existe pas encore, tape son nom : il sera créé automatiquement
            (comme consommable, modifiable ensuite dans le catalogue).
          </p>
        </Card>
      </section>

      {/* Récap des états d'unités */}
      {!reference.est_consommable && listeUnites.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {(["ok", "maintenance", "hs", "reforme"] as EtatUnite[]).map((etat) => {
            const n = listeUnites.filter((u) => u.etat === etat).length;
            if (n === 0) return null;
            return (
              <Badge key={etat} tone={etat}>
                {n} {ETAT_LABELS[etat]}
              </Badge>
            );
          })}
        </section>
      )}

      {/* Suppression */}
      <form action={deleteReference.bind(null, id)}>
        <SubmitButton variant="danger" pendingLabel="Suppression…">
          Supprimer cette référence
        </SubmitButton>
      </form>
    </div>
  );
}
