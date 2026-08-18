import { Field, Select } from "@/components/form";
import { UniteConnecteurs } from "./unite-connecteurs";
import { ETAT_LABELS, type EtatUnite, type Unite } from "@/lib/types";

const etatOptions = (Object.keys(ETAT_LABELS) as EtatUnite[]).map((e) => ({
  value: e,
  label: ETAT_LABELS[e],
}));

/** Champs d'une unité, réutilisés pour l'ajout et l'édition. */
export function UniteFields({
  unite,
  refPuissance,
  refData,
}: {
  unite?: Unite;
  refPuissance: string[];
  refData: string[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <Field label="N° de série" name="numero_serie" defaultValue={unite?.numero_serie} />
        <Select label="État" name="etat" defaultValue={unite?.etat ?? "ok"} options={etatOptions} />
        <Field label="QR code" name="qr_code" defaultValue={unite?.qr_code} />
        <Field label="Date d'achat" name="date_achat" type="date" defaultValue={unite?.date_achat} />
        <Field label="Prix d'achat (€)" name="prix_achat" type="number" step="0.01" defaultValue={unite?.prix_achat} />
        <Field label="Zone de stockage" name="lieu_stockage" defaultValue={unite?.lieu_stockage ?? ""} placeholder="Local 1… (défaut : réf.)" />
      </div>
      <UniteConnecteurs
        refPuissance={refPuissance}
        refData={refData}
        unitePuissance={unite?.connecteurs_puissance ?? null}
        uniteData={unite?.connecteurs_data ?? null}
      />
    </div>
  );
}
