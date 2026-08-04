"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import type { RoiMateriel, MaterielReference } from "@/lib/types";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const labelCls = "block text-xs text-muted mb-1";

interface Props {
  action: (fd: FormData) => Promise<void>;
  item?: RoiMateriel;
  references: MaterielReference[];
  inModal?: boolean;
}

export function RoiForm({ action, item, references, inModal = false }: Props) {
  const [estAchete, setEstAchete] = useState(item?.est_achete ?? false);
  const Wrapper = (inModal ? ModalForm : "form") as React.ElementType;

  return (
    <Wrapper action={action} className="space-y-5">
      {/* Statut */}
      <div className="flex gap-2">
        <input type="hidden" name="est_achete" value={estAchete ? "1" : "0"} />
        <button
          type="button"
          onClick={() => setEstAchete(false)}
          className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
            !estAchete ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-background"
          }`}
        >
          📋 Projet d'achat
        </button>
        <button
          type="button"
          onClick={() => setEstAchete(true)}
          className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
            estAchete ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-background"
          }`}
        >
          ✅ Déjà acheté
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Nom */}
        <div className="sm:col-span-2">
          <label className={labelCls}>Nom de l'équipement *</label>
          <input name="nom" required defaultValue={item?.nom ?? ""} className={inputCls} placeholder="Ex : Laser 10W" />
        </div>

        {/* Investissement */}
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Investissement</p>
        </div>
        <div>
          <label className={labelCls}>Coût d'achat (€)</label>
          <input name="cout_initial" type="number" step="0.01" min="0" defaultValue={item?.cout_initial ?? 0} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Prix de revente estimé (€)</label>
          <input name="prix_revente" type="number" step="0.01" min="0" defaultValue={item?.prix_revente ?? 0} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Durée d'utilisation (années)</label>
          <input name="duree_investissement_ans" type="number" min="1" max="20" defaultValue={item?.duree_investissement_ans ?? 3} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Maintenance annuelle (€)</label>
          <input name="maintenance_annuelle" type="number" step="0.01" min="0" defaultValue={item?.maintenance_annuelle ?? 0} className={inputCls} />
        </div>

        {/* Prestation */}
        <div className="sm:col-span-2 mt-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Usage prestation (loué à un client)</p>
        </div>
        <div>
          <label className={labelCls}>Prix facturé au client (€/event) — TVA non applicable</label>
          <input name="prix_location_ttc" type="number" step="0.01" min="0" defaultValue={item?.prix_location_ttc ?? 0} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Nombre de prestations facturées par an</label>
          <input name="volume_prevu_par_an" type="number" min="0" defaultValue={item?.volume_prevu_par_an ?? 0} className={inputCls} />
        </div>

        {/* Interne */}
        <div className="sm:col-span-2 mt-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Usage interne (propres soirées, sans recette)</p>
        </div>
        <div>
          <label className={labelCls}>Nombre d'utilisations internes par an</label>
          <input name="volume_interne_par_an" type="number" min="0" defaultValue={item?.volume_interne_par_an ?? 0} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Coût de location chez le prestataire externe (€/event)</label>
          <input name="cout_location_externe" type="number" step="0.01" min="0" defaultValue={item?.cout_location_externe ?? 0} className={inputCls} />
          <p className="mt-1 text-[11px] text-muted">Valable pour prestation ET interne — ce que vous paieriez si vous ne possédiez pas l'équipement.</p>
        </div>

        {/* Lien catalogue */}
        <div className="sm:col-span-2 mt-1">
          <label className={labelCls}>Lier à une référence catalogue — active le comparatif Réel vs Attendu</label>
          <select name="reference_id" defaultValue={item?.reference_id ?? ""} className={inputCls}>
            <option value="">— Non lié (réel non disponible) —</option>
            {references.map((r) => (
              <option key={r.id} value={r.id}>{r.nom}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea name="notes" rows={2} defaultValue={item?.notes ?? ""} className={inputCls} placeholder="Ex : priorité d'achat, alternatives envisagées…" />
        </div>
      </div>

      <div className="flex gap-3">
        <SubmitButton>{item ? "Enregistrer" : "Ajouter"}</SubmitButton>
        {inModal ? (
          <ModalCancelButton />
        ) : (
          <a href="/finance/roi" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-background">Annuler</a>
        )}
      </div>
    </Wrapper>
  );
}
