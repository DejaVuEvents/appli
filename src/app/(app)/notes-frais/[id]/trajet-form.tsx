"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/form";
import { FileDropzone } from "@/components/file-dropzone";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { euros } from "@/lib/format";
import { coutTrajet, type ModeTrajet } from "@/lib/trajet";
import { distanceItineraire } from "../actions";

export type VehiculeTrajet = {
  id: string;
  nom: string;
  type_carburant: string | null;
  conso_l_100km: number | null;
};

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const carte = (actif: boolean) =>
  `flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-background ${
    actif ? "border-primary bg-primary/5" : "border-border"
  }`;

/**
 * Saisie d'un déplacement, avec les mêmes champs que le calculateur de Mappy
 * (consommation, prix du carburant, péages) — pour que le chiffrage se fasse ici
 * plutôt que sur un site extérieur dont on ne garde qu'une capture d'écran.
 *
 * Le véhicule peut être choisi parmi ceux de l'association : sa motorisation et sa
 * consommation pré-remplissent le calcul, au lieu d'être ressaisies à chaque fois.
 */
export function TrajetForm({
  action,
  vehicules,
  prixEssence,
  prixDiesel,
  itineraireAuto,
}: {
  action: (formData: FormData) => void | Promise<void>;
  vehicules: VehiculeTrajet[];
  prixEssence: number;
  prixDiesel: number;
  /** Le calcul automatique de distance est disponible (clé d'itinéraire configurée). */
  itineraireAuto: boolean;
}) {
  const [mode, setMode] = useState<ModeTrajet>("reel");
  const [depart, setDepart] = useState("");
  const [arrivee, setArrivee] = useState("");
  const [itineraire, setItineraire] = useState<
    { etat: "vide" } | { etat: "calcul" } | { etat: "ok"; label: string; min: number } | { etat: "ko"; motif: string }
  >({ etat: "vide" });
  const [vehiculeId, setVehiculeId] = useState("");
  const [conso, setConso] = useState("");
  const [prix, setPrix] = useState(String(prixEssence || 1.8));
  const [peages, setPeages] = useState("");
  const [km, setKm] = useState("");
  const [tarifKm, setTarifKm] = useState("0.5");
  const [allerRetour, setAllerRetour] = useState(true);

  // Distance calculée depuis les adresses, pendant la saisie — comme sur Mappy.
  // On attend une pause de frappe, et on ignore la réponse d'une requête périmée
  // (adresse modifiée entre-temps), sinon un ancien résultat écrase le bon.
  const requete = useRef(0);
  useEffect(() => {
    const d = depart.trim();
    const a = arrivee.trim();
    if (d.length < 3 || a.length < 3) {
      setItineraire({ etat: "vide" });
      return;
    }
    const jeton = ++requete.current;
    setItineraire({ etat: "calcul" });
    const t = setTimeout(async () => {
      const r = await distanceItineraire(d, a);
      if (jeton !== requete.current) return;
      if ("erreur" in r) {
        setItineraire({ etat: "ko", motif: r.erreur });
        return;
      }
      setKm(String(r.km));
      setItineraire({ etat: "ok", label: `${r.departLabel} → ${r.arriveeLabel}`, min: r.dureeMin });
    }, 700);
    return () => clearTimeout(t);
  }, [depart, arrivee]);

  // Choisir un véhicule enregistré reprend sa motorisation et sa consommation.
  const choisirVehicule = (id: string) => {
    setVehiculeId(id);
    const v = vehicules.find((x) => x.id === id);
    if (!v) return;
    if (v.conso_l_100km != null) setConso(String(v.conso_l_100km));
    const p = v.type_carburant === "diesel" ? prixDiesel : prixEssence;
    if (p) setPrix(String(p));
  };

  const n = (s: string) => Number(String(s).replace(",", ".")) || 0;
  const detail = useMemo(
    () =>
      coutTrajet({
        mode,
        km: n(km),
        allerRetour,
        conso: n(conso),
        prixCarburant: n(prix),
        peages: n(peages),
        tarifKm: n(tarifKm),
      }),
    [mode, km, allerRetour, conso, prix, peages, tarifKm],
  );

  const distanceInconnue = n(km) <= 0;

  return (
    <ModalForm action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">Méthode de calcul</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { v: "reel", t: "Coût réel", d: "Carburant + péages, comme Mappy" },
            { v: "bareme", t: "Barème kilométrique", d: "Un forfait au kilomètre" },
          ] as const).map((o) => (
            <label key={o.v} className={carte(mode === o.v)}>
              <input
                type="radio" name="mode_radio" value={o.v}
                checked={mode === o.v}
                onChange={() => setMode(o.v)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block font-medium">{o.t}</span>
                <span className="block text-xs text-muted">{o.d}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Départ (adresse / ville)</span>
          <input name="depart" className={input} value={depart} onChange={(e) => setDepart(e.target.value)}
            placeholder="19 rue Achille Viadieu, Toulouse" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Arrivée (adresse / ville)</span>
          <input name="arrivee" className={input} value={arrivee} onChange={(e) => setArrivee(e.target.value)}
            placeholder="Lieu de l'événement" />
        </label>
      </div>

      {/* État du calcul : l'utilisateur doit savoir si la distance vient de l'outil
          ou s'il doit la saisir. */}
      <p className="-mt-1 text-xs">
        {itineraire.etat === "calcul" && <span className="text-muted">Calcul de l&apos;itinéraire…</span>}
        {itineraire.etat === "ok" && (
          <span className="text-green-700 dark:text-green-400">
            Itinéraire trouvé : {itineraire.label} · {itineraire.min} min
          </span>
        )}
        {itineraire.etat === "ko" && (
          <span className="text-amber-700 dark:text-amber-400">
            {itineraire.motif} Saisis la distance à la main ci-dessous.
          </span>
        )}
        {itineraire.etat === "vide" && (
          <span className="text-muted">La distance se calcule toute seule dès que les deux adresses sont renseignées.</span>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
        <Field label="Date" name="date" type="date" />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Distance aller (km)</span>
          <input
            name="km" type="number" step="0.1" inputMode="decimal" className={input}
            value={km} onChange={(e) => setKm(e.target.value)}
            placeholder={itineraire.etat === "calcul" ? "…" : "ex. 84"}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox" name="aller_retour" checked={allerRetour}
            onChange={(e) => setAllerRetour(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Aller-retour
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">
        Distance remplie automatiquement, modifiable si ton relevé diffère.
        {allerRetour && " L'aller-retour double la distance et les péages."}
      </p>

      {mode === "reel" ? (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Véhicule</span>
            <select
              name="vehicule_id" className={input}
              value={vehiculeId} onChange={(e) => choisirVehicule(e.target.value)}
            >
              <option value="">Véhicule personnel (saisie libre)</option>
              {vehicules.map((v) => (
                <option key={v.id} value={v.id}>{v.nom}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Consommation (L/100 km)</span>
              <input name="conso" type="number" step="0.1" inputMode="decimal" className={input}
                value={conso} onChange={(e) => setConso(e.target.value)} placeholder="6.5" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Prix du carburant (€/L)</span>
              <input name="prix_carburant" type="number" step="0.001" inputMode="decimal" className={input}
                value={prix} onChange={(e) => setPrix(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Péages (€, aller)</span>
              <input name="peages" type="number" step="0.01" inputMode="decimal" className={input}
                value={peages} onChange={(e) => setPeages(e.target.value)} placeholder="0" />
            </label>
          </div>
        </>
      ) : (
        <label className="block sm:max-w-xs">
          <span className="mb-1 block text-sm font-medium">Tarif (€/km)</span>
          <input name="tarif_km" type="number" step="0.01" inputMode="decimal" className={input}
            value={tarifKm} onChange={(e) => setTarifKm(e.target.value)} />
        </label>
      )}

      {/* Le total se lit avant d'enregistrer : c'est ce qu'on allait chercher sur Mappy. */}
      <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
        {distanceInconnue ? (
          <span className="text-muted">
            {itineraireAuto
              ? "Coût calculé à l'enregistrement, une fois la distance connue."
              : "Saisis la distance pour voir le coût."}
          </span>
        ) : (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted">
              {detail.km} km
              {mode === "reel"
                ? ` · carburant ${euros(detail.carburant)}${detail.peages > 0 ? ` · péages ${euros(detail.peages)}` : ""}`
                : ` × ${n(tarifKm).toFixed(2)} €/km`}
            </span>
            <span className="text-base font-bold">{euros(detail.total)}</span>
          </div>
        )}
      </div>

      <div className="block">
        <span className="mb-1 block text-sm font-medium">Justificatif (optionnel)</span>
        <FileDropzone name="justificatif" accept="image/*,application/pdf" />
        <p className="mt-1 text-xs text-muted">
          Un lien Mappy et Google Maps est généré sur la ligne pour justifier la distance ; tu peux aussi joindre une capture ou un ticket de péage.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Calcul…">Ajouter le déplacement</SubmitButton>
        <ModalCancelButton />
      </div>
    </ModalForm>
  );
}
