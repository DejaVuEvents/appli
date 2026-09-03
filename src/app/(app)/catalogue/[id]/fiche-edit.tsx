import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { InfoHint } from "@/components/info-hint";
import { IconEdit, IconDownload } from "@/components/icons";
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
import { ETAT_LABELS, type MaterielReference, type Unite } from "@/lib/types";
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
  const champsUnite = (u?: Unite) => (
    <UniteFields unite={u} refPuissance={reference.connecteurs_puissance} refData={reference.connecteurs_data} />
  );

  return (
    <div className="space-y-8">
      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1 space-y-8">
      {/* Fiche / specs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Fiche</h2>
        <ReferenceForm action={updateReference.bind(null, id)} reference={reference} categories={cats} />
      </section>

      {/* Unités sérialisées — panneau de droite, une ligne par unité */}
      {/* Accessoires (obligatoires + optionnels) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Accessoires
          <InfoHint
            text={`Pour chaque unité de « ${reference.nom} », les accessoires obligatoires sont ajoutés automatiquement au devis et à la check-list ; les optionnels seront proposés (à cocher) au moment de la création du devis.`}
          />
        </h2>

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

        <div className="mt-4">
          <Modal
            trigger={<>+ Ajouter un accessoire</>}
            title="Ajouter un accessoire"
            triggerClassName="rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted hover:border-primary/40 hover:text-foreground"
          >
            <ModalForm action={addKitRegle.bind(null, id)} className="space-y-4">
              <div>
                <label htmlFor="accessoire_nom" className="mb-1 block text-sm font-medium">
                  Accessoire <span className="text-red-500">*</span>
                </label>
                <input
                  id="accessoire_nom"
                  name="accessoire_nom"
                  list="refs-accessoires"
                  required
                  autoFocus
                  placeholder="Câble DMX 3m, Élingue 1m, Crochet…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <datalist id="refs-accessoires">
                  {autresRefs.map((r) => (
                    <option key={r.id} value={r.nom} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-muted">
                  Si l&apos;accessoire n&apos;existe pas encore, tape son nom : il sera créé automatiquement
                  (comme consommable, modifiable ensuite dans le catalogue).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
              <div className="flex items-center gap-3">
                <SubmitButton>+ Ajouter</SubmitButton>
                <ModalCancelButton />
              </div>
            </ModalForm>
          </Modal>
        </div>

      </section>

        </div>

        {/* Unités — colonne de droite */}
        {!reference.est_consommable && (
          <aside className="mt-8 lg:mt-0 lg:sticky lg:top-24 lg:w-80 lg:shrink-0">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Unités ({listeUnites.length})
            </h2>

            <Card className="divide-y divide-border overflow-hidden">
              {listeUnites.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted">Aucune unité enregistrée.</p>
              )}
              {listeUnites.map((u, i) => (
                <div key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-6 shrink-0 text-muted">#{i + 1}</span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={`${u.compteur_heures} h · ${u.compteur_sorties} sorties`}
                  >
                    {u.numero_serie || <span className="text-muted">Sans n° de série</span>}
                  </span>
                  <Badge tone={u.etat}>{ETAT_LABELS[u.etat]}</Badge>
                  <Modal
                    trigger={<IconEdit className="h-4 w-4" />}
                    triggerTitle="Modifier cette unité"
                    title={`Unité #${i + 1}${u.numero_serie ? ` — ${u.numero_serie}` : ""}`}
                    triggerClassName="shrink-0 rounded-md p-1 text-muted hover:bg-background hover:text-foreground"
                  >
                    <p className="mb-4 text-sm text-muted">
                      {u.compteur_heures} h d&apos;usage · {u.compteur_sorties} sortie{u.compteur_sorties > 1 ? "s" : ""}
                    </p>

                    <ModalForm action={updateUnite.bind(null, id, u.id)}>
                      {champsUnite(u)}
                      <div className="mt-4 flex items-center gap-3">
                        <SubmitButton>Enregistrer</SubmitButton>
                        <ModalCancelButton />
                      </div>
                    </ModalForm>

                    {/* QR code */}
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
                      {u.qr_code ? (
                        <>
                          <span className="text-muted">QR code prêt</span>
                          <a
                            href={`/api/unite/${u.id}/qrcode`}
                            download
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-background"
                            title="Télécharger le QR code"
                          >
                            <IconDownload className="h-4 w-4" /> QR
                          </a>
                          <Link href={`/u/${u.qr_code}`} className="text-primary hover:underline">
                            Ouvrir la fiche
                          </Link>
                        </>
                      ) : (
                        <ModalForm action={genererQrCode.bind(null, id, u.id)}>
                          <SubmitButton pendingLabel="Génération…">Générer le QR code</SubmitButton>
                        </ModalForm>
                      )}
                    </div>

                    <div className="mt-5 border-t border-border pt-4">
                      <ModalForm action={deleteUnite.bind(null, id, u.id)}>
                        <SubmitButton
                          variant="danger"
                          pendingLabel="Suppression…"
                          confirm="Supprimer cette unité ? Son historique d'usage et d'inventaire sera perdu."
                        >
                          Supprimer l&apos;unité
                        </SubmitButton>
                      </ModalForm>
                    </div>
                  </Modal>
                </div>
              ))}
            </Card>

            <Modal
              trigger={<>+ Ajouter une unité</>}
              title="Ajouter une unité"
              triggerClassName="mt-3 w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted hover:border-primary/40 hover:text-foreground"
            >
              <ModalForm action={addUnite.bind(null, id)}>
                {champsUnite()}
                <div className="mt-4 flex items-center gap-3">
                  <SubmitButton>+ Ajouter</SubmitButton>
                  <ModalCancelButton />
                </div>
              </ModalForm>
            </Modal>
          </aside>
        )}
      </div>

      {/* Suppression */}
      <form action={deleteReference.bind(null, id)}>
        <SubmitButton variant="danger" pendingLabel="Suppression…">
          Supprimer cette référence
        </SubmitButton>
      </form>
    </div>
  );
}
