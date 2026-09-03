"use client";

import Link from "next/link";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { NOMENCLATURE, typeLabel } from "@/lib/finance";
import type { EcritureFinanciere, SensFinancier } from "@/lib/types";

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

type Prestation = { id: string; nom: string; est_evenement?: boolean };

export function EcritureForm({
  action,
  ecriture,
  prestations = [],
  submitLabel = "+ Ajouter l'écriture",
  cancelHref,
  retour,
  inModal = false,
  nomenclature = NOMENCLATURE,
}: {
  action: (formData: FormData) => void;
  /** Chemin de retour après enregistrement (champ caché lu par l'action). */
  retour?: string;
  ecriture?: EcritureFinanciere;
  prestations?: Prestation[];
  submitLabel?: string;
  cancelHref?: string;
  inModal?: boolean;
  nomenclature?: Record<SensFinancier, Record<string, string[]>>;
}) {
  const [sens, setSens] = useState<SensFinancier>(ecriture?.sens ?? "sortie");
  const [type, setType] = useState(ecriture?.type ?? "");
  const [spec, setSpec] = useState(ecriture?.specification ?? "");

  const types = Object.keys(nomenclature[sens] ?? {});
  const specs = type && nomenclature[sens]?.[type] ? nomenclature[sens][type] : [];
  const typeInconnu = !!type && !types.includes(type);
  const specInconnue = !!spec && !!type && !specs.includes(spec);

  const factureUrl = ecriture?.facture?.startsWith("https://") ? ecriture.facture : null;

  const Wrapper = (inModal ? ModalForm : "form") as React.ElementType;

  return (
    <Wrapper action={action} className="space-y-3">
      {retour && <input type="hidden" name="retour" value={retour} />}
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Sens</span>
          <select
            name="sens"
            value={sens}
            onChange={(e) => { setSens(e.target.value as SensFinancier); setType(""); setSpec(""); }}
            className={input}
          >
            <option value="sortie">Sortie (dépense)</option>
            <option value="entree">Entrée (recette)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Statut</span>
          <select name="statut" defaultValue={ecriture?.statut ?? "reel"} className={input}>
            <option value="reel">Réel</option>
            <option value="previsionnel">Prévisionnel</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Date</span>
          <input name="date" type="date" defaultValue={ecriture?.date ?? ""} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Montant TTC (€)</span>
          <input name="montant_ttc" type="number" inputMode="decimal" step="0.01" defaultValue={ecriture?.montant_ttc ?? ""} onWheel={(e) => (e.target as HTMLInputElement).blur()} className={input} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Dénomination</span>
        <input name="denomination" defaultValue={ecriture?.denomination ?? ""} placeholder="Ex. Location Audiotec, Acompte soirée X…" className={input} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Catégorie</span>
          <select name="type" value={type} onChange={(e) => { setType(e.target.value); setSpec(""); }} className={`${input} ${typeInconnu ? "border-red-400 text-red-700" : ""}`}>
            <option value="">— Choisir —</option>
            {typeInconnu && <option value={type}>⚠ {typeLabel(type)} (inconnue)</option>}
            {types.map((t) => (
              <option key={t} value={t}>{typeLabel(t)}</option>
            ))}
          </select>
          {typeInconnu && <span className="mt-1 block text-xs text-red-600">Catégorie inconnue — choisis-en une valide.</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Sous-catégorie</span>
          <select name="specification" value={spec} onChange={(e) => setSpec(e.target.value)} disabled={!type} className={`${input} disabled:opacity-50 ${specInconnue ? "border-red-400 text-red-700" : ""}`}>
            <option value="">— Choisir —</option>
            {specInconnue && <option value={spec}>⚠ {spec} (inconnue)</option>}
            {specs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Effectué par</span>
          <input name="effectue_par" defaultValue={ecriture?.effectue_par ?? ""} className={input} />
        </label>
        {prestations.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Prestation liée</span>
            <select name="prestation_id" defaultValue={ecriture?.prestation_id ?? ""} className={input}>
              <option value="">— Aucune —</option>
              {prestations.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="block">
        <span className="mb-1 block text-sm font-medium">Facture / justificatif</span>
        {factureUrl ? (
          <div className="mb-1.5 flex items-center gap-2 text-sm">
            <a href={factureUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Voir le fichier existant
            </a>
            <span className="text-muted text-xs">(remplacer ci-dessous)</span>
          </div>
        ) : ecriture?.facture ? (
          <div className="mb-1.5">
            <input name="facture" defaultValue={ecriture.facture} className={`${input} mb-1`} placeholder="Réf. ou numéro de facture" />
          </div>
        ) : null}
        {!ecriture?.facture && (
          <input name="facture" defaultValue="" className={`${input} mb-1`} placeholder="Réf. ou numéro de facture (optionnel)" />
        )}
        <input
          name="facture_pdf"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-background"
        />
        <p className="mt-1 text-xs text-muted">PDF, image — max 10 Mo. Si un fichier est sélectionné, il remplace la référence textuelle.</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes</span>
        <input name="notes" defaultValue={ecriture?.notes ?? ""} className={input} />
      </label>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>{submitLabel}</SubmitButton>
        {inModal && <ModalCancelButton />}
        {!inModal && cancelHref && <Link href={cancelHref} className="text-sm text-muted hover:underline">Annuler</Link>}
      </div>
    </Wrapper>
  );
}
