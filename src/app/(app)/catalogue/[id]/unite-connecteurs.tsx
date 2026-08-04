"use client";

import { useState } from "react";
import { ConnectorMultiSelect } from "@/components/connector-multiselect";
import { CONNECTEURS_PUISSANCE, CONNECTEURS_DATA } from "@/lib/types";

/**
 * Connecteurs d'une unité : par défaut elle hérite de la référence.
 * En cochant la case, l'unité définit ses propres connecteurs (surcharge).
 */
export function UniteConnecteurs({
  refPuissance,
  refData,
  unitePuissance,
  uniteData,
}: {
  refPuissance: string[];
  refData: string[];
  // null = hérite ; tableau = surcharge déjà enregistrée
  unitePuissance: string[] | null;
  uniteData: string[] | null;
}) {
  const dejaSurcharge = unitePuissance !== null || uniteData !== null;
  const [override, setOverride] = useState(dejaSurcharge);

  // Valeurs initiales des sélecteurs : la surcharge si elle existe, sinon
  // on pré-remplit avec celles de la référence (point de départ pratique).
  const initPuissance = dejaSurcharge ? (unitePuissance ?? []) : refPuissance;
  const initData = dejaSurcharge ? (uniteData ?? []) : refData;

  return (
    <div className="mt-3 rounded-lg bg-background/60 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="override_connecteurs"
          checked={override}
          onChange={(e) => setOverride(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Connecteurs spécifiques à cette unité
      </label>

      {override ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ConnectorMultiSelect
            name="u_connecteurs_puissance"
            label="Connecteurs (alimentation)"
            options={CONNECTEURS_PUISSANCE}
            defaultValues={initPuissance}
          />
          <ConnectorMultiSelect
            name="u_connecteurs_data"
            label="Connecteurs (données / contrôle)"
            options={CONNECTEURS_DATA}
            defaultValues={initData}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Hérite de la référence&nbsp;:{" "}
          {[...refPuissance, ...refData].join(", ") || "aucun connecteur défini"}
        </p>
      )}
    </div>
  );
}
