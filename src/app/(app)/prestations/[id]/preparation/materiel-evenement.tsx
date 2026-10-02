"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { Modal, ModalForm, ModalCancelButton } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { normaliser } from "@/lib/rattachement";
import {
  basculerMaterielUtilise,
  ajouterMaterielEvenement,
  supprimerMaterielEvenement,
} from "./actions";

export type MaterielRow = {
  id: string;
  designation: string | null;
  quantite: number;
  utilise: boolean;
  origine: string;
  note: string | null;
  /** Unités physiques affectées à cette ligne (« Laser 1 », « Laser 2 »…). */
  unites?: string[];
};

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

/**
 * Liste du matériel réellement engagé sur l'événement.
 *
 * Elle naît des documents (devis, facture) mais ne leur appartient pas : décocher
 * une lyre restée au local ne change ni le devis ni la facture — seulement ce que
 * l'outil considère comme sorti. C'est cette liste qui alimente le ROI et
 * l'historique d'usage des unités.
 */
export function MaterielEvenement({
  prestationId,
  materiel,
  references,
}: {
  prestationId: string;
  materiel: MaterielRow[];
  references: { id: string; nom: string }[];
}) {
  const [recherche, setRecherche] = useState("");
  const utilises = materiel.filter((m) => m.utilise).length;
  const ajouts = materiel.filter((m) => m.origine === "ajout").length;

  const liste = useMemo(() => {
    const n = normaliser(recherche);
    return (n ? references.filter((r) => normaliser(r.nom).includes(n)) : references).slice(0, 200);
  }, [recherche, references]);

  const ajouter = (
    <Modal
      trigger={<>+ Ajouter du matériel</>}
      title="Matériel embarqué en plus"
      triggerClassName="w-full rounded-lg border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted hover:border-primary/40 hover:text-foreground"
    >
      <ModalForm action={ajouterMaterielEvenement.bind(null, prestationId)} className="space-y-3">
        <p className="text-sm text-muted">
          Du matériel décidé au dernier moment, absent des documents. Il compte dans l&apos;usage du
          matériel mais ne rapporte rien : pour le facturer, crée une facture rattachée à
          l&apos;événement — ses lignes rejoindront cette liste d&apos;elles-mêmes.
        </p>
        <input
          className={input}
          placeholder="Filtrer le catalogue…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Référence</span>
          <select name="reference_id" className={input} required defaultValue="">
            <option value="" disabled>— Choisir —</option>
            {liste.map((r) => (
              <option key={r.id} value={r.id}>{r.nom}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Quantité</span>
            <input name="quantite" type="number" min="1" step="1" defaultValue={1} className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Note (optionnel)</span>
            <input name="note" className={input} placeholder="Remplacement d'une lyre HS" />
          </label>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <SubmitButton>Ajouter</SubmitButton>
          <ModalCancelButton />
        </div>
      </ModalForm>
    </Modal>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Matériel de l&apos;événement
        </h2>
        <span className="text-xs text-muted">
          {utilises} / {materiel.length} utilisé{utilises > 1 ? "s" : ""}
          {ajouts > 0 && ` · ${ajouts} ajout${ajouts > 1 ? "s" : ""}`}
        </span>
      </div>

      <p className="text-xs text-muted">
        Décocher un matériel le retire du ROI et de l&apos;historique d&apos;usage — le devis et la facture,
        eux, ne bougent pas.
      </p>

      {materiel.length === 0 ? (
        <Card className="px-4 py-3 text-sm text-muted">
          Aucun matériel de catalogue sur cet événement. Ajoute des lignes au devis, ou du matériel
          ci-dessous.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {materiel.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <form
                action={basculerMaterielUtilise.bind(null, prestationId, m.id, !m.utilise)}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <button
                  type="submit"
                  aria-label={m.utilise ? "Marquer non utilisé" : "Marquer utilisé"}
                  title={m.utilise ? "Marquer non utilisé" : "Marquer utilisé"}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                    m.utilise
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-transparent hover:border-primary/50"
                  }`}
                >
                  ✓
                </button>
                <span className={`min-w-0 ${m.utilise ? "" : "text-muted line-through"}`}>
                  <span className="truncate font-medium">{m.designation ?? "Matériel"}</span>
                  <span className="ml-1.5 text-xs text-muted">× {m.quantite}</span>
                  {m.origine === "ajout" && (
                    <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                      ajout
                    </span>
                  )}
                  {m.note && <span className="ml-2 text-xs italic text-muted">{m.note}</span>}
                  {/* Quelles unités partent, et ce que le parc ne couvre pas :
                      le manque, c'est de la sous-location à prévoir. */}
                  <span className="mt-0.5 block text-xs text-muted">
                    {m.unites && m.unites.length > 0 ? m.unites.join(", ") : "aucune unité affectée"}
                    {m.unites && m.unites.length < m.quantite && (
                      <span className="text-amber-700 dark:text-amber-400">
                        {" "}· {m.quantite - m.unites.length} à sous-louer
                      </span>
                    )}
                  </span>
                </span>
              </form>
              {m.origine === "ajout" && (
                <form action={supprimerMaterielEvenement.bind(null, prestationId, m.id)}>
                  <ConfirmButton
                    confirm={`Retirer « ${m.designation ?? "ce matériel"} » de la liste ?`}
                    className="shrink-0 text-muted hover:text-red-600"
                    title="Retirer"
                  >
                    ✕
                  </ConfirmButton>
                </form>
              )}
            </div>
          ))}
        </Card>
      )}

      {ajouter}
    </section>
  );
}
