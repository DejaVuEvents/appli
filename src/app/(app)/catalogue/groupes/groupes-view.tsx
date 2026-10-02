"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { Field, TextArea } from "@/components/form";
import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { IconEdit } from "@/components/icons";
import { euros } from "@/lib/format";
import { normaliser } from "@/lib/rattachement";
import { creerGroupe, renommerGroupe, ajouterComposant, retirerComposant, supprimerGroupe } from "./actions";

export type Composant = {
  reference_id: string;
  nom: string;
  quantite: number;
  unites: number;
  externe: boolean;
};
export type Groupe = {
  id: string;
  nom: string;
  designation: string | null;
  prix_location_jour: number | null;
  composants: Composant[];
  /** Nombre de lignes de devis qui pointent sur ce groupe. */
  utilisations: number;
};
export type RefOption = { id: string; nom: string; externe: boolean };

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function Provenance({ externe }: { externe: boolean }) {
  return externe ? (
    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
      Externe
    </span>
  ) : (
    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/50 dark:text-green-300">
      À nous
    </span>
  );
}

function FormulaireComposant({ groupe, references }: { groupe: Groupe; references: RefOption[] }) {
  const [recherche, setRecherche] = useState("");
  const dedans = new Set(groupe.composants.map((c) => c.reference_id));
  const liste = useMemo(() => {
    const n = normaliser(recherche);
    return references
      .filter((r) => r.id !== groupe.id && !dedans.has(r.id) && (!n || normaliser(r.nom).includes(n)))
      .slice(0, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche, references, groupe]);

  return (
    <ModalForm action={ajouterComposant.bind(null, groupe.id)} className="space-y-3">
      <input className={input} placeholder="Filtrer le catalogue…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Référence</span>
        <select name="reference_id" className={input} required defaultValue="">
          <option value="" disabled>— Choisir —</option>
          {liste.map((r) => (
            <option key={r.id} value={r.id}>{r.nom}{r.externe ? " (externe)" : ""}</option>
          ))}
        </select>
      </label>
      <Field label="Quantité dans le groupe" name="quantite" type="number" step="1" defaultValue={1} />
      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>Ajouter au groupe</SubmitButton>
        <ModalCancelButton />
      </div>
    </ModalForm>
  );
}

/**
 * Groupes du catalogue : « Régie Lumière grandMA2 » = une console, deux wings et un
 * flightcase. Un groupe se met sur un devis comme n'importe quelle référence, mais
 * l'engager engage tout ce qu'il contient — compteurs d'unité, historique de fiche
 * et ROI de chaque composant.
 */
export function GroupesView({ groupes, references }: { groupes: Groupe[]; references: RefOption[] }) {
  const [recherche, setRecherche] = useState("");
  const visibles = useMemo(() => {
    const n = normaliser(recherche);
    return n ? groupes.filter((g) => normaliser(g.nom).includes(n)) : groupes;
  }, [groupes, recherche]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${input} sm:max-w-xs`} placeholder="Chercher un groupe…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <span className="text-sm text-muted">{visibles.length} groupe{visibles.length > 1 ? "s" : ""}</span>
      </div>

      {visibles.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-muted">Aucun groupe.</Card>
      ) : (
        <div className="space-y-3">
          {visibles.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{g.nom}</h3>
                    <Modal
                      trigger={<IconEdit className="h-4 w-4" />}
                      triggerTitle="Renommer le groupe"
                      triggerClassName="rounded p-1 text-muted hover:bg-background hover:text-foreground"
                      title="Modifier le groupe"
                    >
                      <ModalForm action={renommerGroupe.bind(null, g.id)} className="space-y-3">
                        <Field label="Nom" name="nom" defaultValue={g.nom} required />
                        <TextArea label="Désignation (sur le devis)" name="designation" defaultValue={g.designation ?? ""} />
                        <Field label="Prix de location / jour (€)" name="prix_location_jour" type="number" step="0.01" defaultValue={g.prix_location_jour ?? 0} />
                        <div className="flex items-center gap-3">
                          <SubmitButton>Enregistrer</SubmitButton>
                          <ModalCancelButton />
                        </div>
                      </ModalForm>
                    </Modal>
                  </div>
                  {g.designation && <p className="mt-0.5 text-sm text-muted">{g.designation}</p>}
                  <p className="mt-0.5 text-xs text-muted">
                    {euros(g.prix_location_jour ?? 0)}/jour · {g.composants.length} composant{g.composants.length > 1 ? "s" : ""}
                    {g.utilisations > 0 && ` · sur ${g.utilisations} ligne${g.utilisations > 1 ? "s" : ""} de devis`}
                  </p>
                </div>
                <form action={supprimerGroupe.bind(null, g.id)}>
                  <ConfirmButton
                    confirm={`Supprimer le groupe « ${g.nom} » ? Les références qu'il contient ne sont pas touchées.`}
                    className="rounded-lg border border-border px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Supprimer le groupe"
                  >
                    ✕ Supprimer
                  </ConfirmButton>
                </form>
              </div>

              <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                {g.composants.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted">Groupe vide.</p>
                )}
                {g.composants.map((c) => (
                  <div key={c.reference_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Link href={`/catalogue/${c.reference_id}`} className="truncate hover:underline">{c.nom}</Link>
                      <span className="shrink-0 text-xs text-muted">× {c.quantite}</span>
                      <Provenance externe={c.externe} />
                      {!c.externe && c.unites === 0 && (
                        <span className="shrink-0 text-xs text-muted" title="Aucune unité sérialisée : rien à réserver">
                          sans unité
                        </span>
                      )}
                    </span>
                    <form action={retirerComposant.bind(null, g.id, c.reference_id)}>
                      <ConfirmButton confirm={`Retirer « ${c.nom} » du groupe ?`} className="shrink-0 text-muted hover:text-red-600" title="Retirer">✕</ConfirmButton>
                    </form>
                  </div>
                ))}
              </div>

              <div className="mt-2">
                <Modal
                  trigger={<>+ Ajouter un composant</>}
                  title={`Ajouter au groupe « ${g.nom} »`}
                  triggerClassName="w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted hover:border-primary/40 hover:text-foreground"
                >
                  <FormulaireComposant groupe={g} references={references} />
                </Modal>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function NouveauGroupe() {
  return (
    <Modal trigger="+ Nouveau groupe" title="Nouveau groupe">
      <ModalForm action={creerGroupe} className="space-y-3">
        <Field label="Nom" name="nom" required placeholder="Régie Lumière — grandMA2 onPC" />
        <TextArea label="Désignation (sur le devis)" name="designation" />
        <Field label="Prix de location / jour (€)" name="prix_location_jour" type="number" step="0.01" defaultValue={0} />
        <div className="flex items-center gap-3 pt-1">
          <SubmitButton>Créer le groupe</SubmitButton>
          <ModalCancelButton />
        </div>
      </ModalForm>
    </Modal>
  );
}
