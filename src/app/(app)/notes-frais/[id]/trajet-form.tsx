"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/form";
import { FileDropzone } from "@/components/file-dropzone";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { AdresseAutocomplete } from "@/components/adresse-autocomplete";
import { CarteTrajet } from "@/components/carte-trajet";
import { chercherAdresses, type Adresse } from "@/lib/adresse";
import { euros } from "@/lib/format";
import { coutTrajet, type ModeTrajet } from "@/lib/trajet";
import { itineraireNDF } from "../actions";

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

type EtatItineraire =
  | { etat: "vide" }
  | { etat: "calcul" }
  | { etat: "ok"; min: number }
  | { etat: "ko"; motif: string };

/**
 * Saisie d'un déplacement, sur le modèle du calculateur de Mappy : suggestions
 * d'adresses pendant la frappe, carte du trajet, distance et durée calculées, puis
 * le coût (consommation, prix du carburant, péages) — le tout dans l'outil, au lieu
 * de reporter à la main un montant obtenu sur un site extérieur.
 *
 * Le véhicule peut être choisi parmi ceux de l'association : sa motorisation et sa
 * consommation pré-remplissent le calcul.
 */
export function TrajetForm({
  action,
  vehicules,
  prixEssence,
  prixDiesel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  vehicules: VehiculeTrajet[];
  prixEssence: number;
  prixDiesel: number;
}) {
  const [mode, setMode] = useState<ModeTrajet>("reel");
  const [departTxt, setDepartTxt] = useState("");
  const [arriveeTxt, setArriveeTxt] = useState("");
  const [depart, setDepart] = useState<Adresse | null>(null);
  const [arrivee, setArrivee] = useState<Adresse | null>(null);
  const [trace, setTrace] = useState<[number, number][] | null>(null);
  const [itin, setItin] = useState<EtatItineraire>({ etat: "vide" });

  const [vehiculeId, setVehiculeId] = useState("");
  // Consommation par défaut d'une voiture, comme le calculateur de Mappy :
  // le coût s'affiche tout de suite, quitte à l'ajuster.
  const [conso, setConso] = useState("6.5");
  const [prix, setPrix] = useState(String(prixEssence || 1.8));
  const [peages, setPeages] = useState("");
  const [km, setKm] = useState("");
  const [tarifKm, setTarifKm] = useState("0.5");
  const [allerRetour, setAllerRetour] = useState(true);
  const [eviterPeages, setEviterPeages] = useState(false);
  const [peageSurRoute, setPeageSurRoute] = useState<boolean | undefined>(undefined);

  // Adresse tapée sans passer par la liste : on retient la meilleure proposition,
  // comme le fait Mappy. Sans ça, un utilisateur qui saisit une adresse correcte
  // mais ne clique aucune suggestion se retrouvait bloqué, sans trajet ni distance.
  useEffect(() => {
    if (depart || departTxt.trim().length < 4) return;
    const t = setTimeout(async () => {
      const r = await chercherAdresses(departTxt);
      if (r[0]) setDepart(r[0]);
    }, 900);
    return () => clearTimeout(t);
  }, [departTxt, depart]);
  useEffect(() => {
    if (arrivee || arriveeTxt.trim().length < 4) return;
    const t = setTimeout(async () => {
      const r = await chercherAdresses(arriveeTxt);
      if (r[0]) setArrivee(r[0]);
    }, 900);
    return () => clearTimeout(t);
  }, [arriveeTxt, arrivee]);

  // Itinéraire dès que les deux points sont localisés. On ignore la réponse d'une
  // requête périmée : sinon un ancien tracé écrase le bon.
  const requete = useRef(0);
  useEffect(() => {
    if (!depart || !arrivee) {
      setItin({ etat: "vide" });
      setTrace(null);
      setPeageSurRoute(undefined);
      return;
    }
    const jeton = ++requete.current;
    setItin({ etat: "calcul" });
    (async () => {
      const r = await itineraireNDF(depart.coord, arrivee.coord, eviterPeages);
      if (jeton !== requete.current) return;
      if ("erreur" in r) {
        setItin({ etat: "ko", motif: r.erreur });
        setTrace(null);
        return;
      }
      setKm(String(r.km));
      setTrace(r.trace);
      setPeageSurRoute(r.peage);
      setItin({ etat: "ok", min: r.dureeMin });
    })();
  }, [depart, arrivee, eviterPeages]);

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

  const dureeTotale = itin.etat === "ok" ? itin.min * (allerRetour ? 2 : 1) : null;

  // Ce qui empêche encore d'enregistrer, dit avant le clic.
  const manque =
    !departTxt.trim() || !arriveeTxt.trim()
      ? "Renseigne le départ et l'arrivée."
      : itin.etat === "calcul"
        ? "Calcul de l'itinéraire en cours…"
        : n(km) <= 0
          ? "Distance inconnue : choisis les adresses dans les suggestions, ou saisis-la."
          : mode === "reel" && n(conso) * n(prix) <= 0 && n(peages) <= 0
            ? "Renseigne la consommation et le prix du carburant, ou des péages."
            : mode === "bareme" && n(tarifKm) <= 0
              ? "Renseigne le tarif au kilomètre."
              : null;

  return (
    <ModalForm action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      {/* Coordonnées retenues : le serveur retrace l'itinéraire pour produire le
          justificatif PDF, sans refaire de géocodage ni transporter le tracé. */}
      {depart && <input type="hidden" name="depart_coord" value={depart.coord.join(",")} />}
      {arrivee && <input type="hidden" name="arrivee_coord" value={arrivee.coord.join(",")} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* ---- Colonne gauche : la saisie ---- */}
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium">Méthode de calcul</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { v: "reel", t: "Coût réel", d: "Carburant + péages" },
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
            <AdresseAutocomplete
              label="Départ" name="depart" placeholder="14 rue Marie-Louise Dissard, Toulouse"
              valeur={departTxt}
              onChoisir={(a, t) => { setDepartTxt(t); setDepart(a); }}
            />
            <AdresseAutocomplete
              label="Arrivée" name="arrivee" placeholder="Léguevin"
              valeur={arriveeTxt}
              onChoisir={(a, t) => { setArriveeTxt(t); setArrivee(a); }}
            />
          </div>

          <p className="-mt-1 text-xs">
            {itin.etat === "calcul" && <span className="text-muted">Calcul de l&apos;itinéraire…</span>}
            {itin.etat === "ok" && (
              <span className="text-green-700 dark:text-green-400">
                Itinéraire calculé · {detail.km} km · {dureeTotale} min{allerRetour ? " aller-retour" : ""}
              </span>
            )}
            {itin.etat === "ko" && (
              <span className="text-amber-700 dark:text-amber-400">{itin.motif} Saisis la distance à la main.</span>
            )}
            {itin.etat === "vide" && (
              <span className="text-muted">Choisis les adresses dans la liste de suggestions pour tracer le trajet.</span>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Date" name="date" type="date" />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Distance aller (km)</span>
              <input
                name="km" type="number" step="0.1" inputMode="decimal" className={input}
                value={km} onChange={(e) => setKm(e.target.value)}
                placeholder={itin.etat === "calcul" ? "…" : "ex. 84"}
              />
            </label>
            <div className="space-y-1.5 pb-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox" name="aller_retour" checked={allerRetour}
                  onChange={(e) => setAllerRetour(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Aller-retour
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox" name="eviter_peages" checked={eviterPeages}
                  onChange={(e) => setEviterPeages(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Éviter les péages
              </label>
            </div>
          </div>

          {/* Éviter les péages est une préférence forte, pas une interdiction :
              quand il n'existe pas d'alternative, on le dit plutôt que de laisser
              croire à un trajet gratuit. */}
          {peageSurRoute !== undefined && itin.etat === "ok" && (
            <p className="-mt-2 text-xs text-muted">
              {peageSurRoute
                ? eviterPeages
                  ? "Un péage subsiste malgré l'évitement : aucun contournement raisonnable. Vérifie sur place et saisis-le le cas échéant."
                  : "Cet itinéraire comporte un péage — saisis son montant ci-dessous, ou coche « Éviter les péages »."
                : "Aucun péage sur cet itinéraire."}
            </p>
          )}

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
        </div>

        {/* ---- Colonne droite : la carte et le coût ---- */}
        <div className="flex flex-col gap-3">
          <div className="h-64 lg:h-[22rem]">
            <CarteTrajet depart={depart} arrivee={arrivee} trace={trace} />
          </div>

          {/* Le coût se lit avant d'enregistrer : c'est ce qu'on allait chercher sur Mappy. */}
          <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
            {n(km) <= 0 ? (
              <span className="text-muted">Le coût s&apos;affiche dès que la distance est connue.</span>
            ) : (
              <>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-medium">Coût du trajet</span>
                  <span className="text-base font-bold">{euros(detail.total)}</span>
                </div>
                <div className="text-xs text-muted">
                  {detail.km} km{dureeTotale ? ` · ${dureeTotale} min` : ""}
                  {mode === "reel" ? (
                    <>
                      <br />Carburant {euros(detail.carburant)}
                      {detail.peages > 0 && <> · Péages {euros(detail.peages)}</>}
                    </>
                  ) : (
                    <> × {n(tarifKm).toFixed(2)} €/km</>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="block">
        <span className="mb-1 block text-sm font-medium">Justificatif (optionnel)</span>
        <FileDropzone name="justificatif" accept="image/*,application/pdf" />
        <p className="mt-1 text-xs text-muted">
          Le trajet est déjà tracé et daté ici ; tu peux joindre un ticket de péage ou un plein.
        </p>
      </div>

      {/* Le serveur refuse un déplacement sans distance ni adresses exploitables ;
          Next masque le message d'une Server Action en production, donc on dit ici
          ce qui manque plutôt que de laisser une page d'erreur. */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Enregistrement…" disabled={!!manque}>
          Ajouter le déplacement
        </SubmitButton>
        <ModalCancelButton />
        {manque && <span className="text-xs text-amber-700 dark:text-amber-400">{manque}</span>}
      </div>
    </ModalForm>
  );
}
