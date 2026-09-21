"use client";

import { useState } from "react";
import { Field, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ModalForm, ModalCancelButton } from "@/components/modal";
import { SelecteurPrestation } from "@/components/selecteur-prestation";

type Option = { id: string; nom: string; date_event_debut?: string | null; date?: string | null };
type DevisModele = { id: string; label: string };

/**
 * Création d'un devis ou d'une facture.
 *
 * Ce qu'on nomme ici, c'est le DOCUMENT, pas l'événement : on part du devis qu'on
 * veut rédiger. L'événement vient après, et seulement s'il a un sens —
 *   • vente de matériel : aucun événement, aucune date, la cession n'a pas de durée ;
 *   • location / prestation : soit on rattache à un événement existant, soit on en
 *     crée un, et c'est à ce moment-là qu'on demande lieu et dates.
 */
export function NouveauDocumentForm({
  action,
  clients,
  evenements,
  devisModeles,
  type,
}: {
  action: (formData: FormData) => void | Promise<void>;
  clients: { id: string; nom: string }[];
  evenements: Option[];
  devisModeles?: DevisModele[];
  type: "devis" | "facture";
}) {
  const [nature, setNature] = useState<"location" | "vente">("location");
  const [rattachement, setRattachement] = useState<"existant" | "nouveau">(
    evenements.length > 0 ? "existant" : "nouveau",
  );

  // Une facture suit toujours un événement ; seul un devis peut être une vente.
  const estVente = type === "devis" && nature === "vente";
  const nouvelEvenement = rattachement === "nouveau";

  const carte = (actif: boolean) =>
    `flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-background ${
      actif ? "border-primary bg-primary/5" : "border-border"
    }`;

  return (
    <ModalForm action={action}>
      <div className="space-y-4">
        <input type="hidden" name="devis_type" value={type} />

        {type === "devis" && (
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium">Nature du devis</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { v: "location", t: "Location / prestation", d: "Rattachée à un événement" },
                { v: "vente", t: "Vente de matériel", d: "Prix unitaires, installation" },
              ] as const).map((o) => (
                <label key={o.v} className={carte(nature === o.v)}>
                  <input
                    type="radio" name="devis_nature" value={o.v}
                    checked={nature === o.v}
                    onChange={() => setNature(o.v)}
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
        )}

        <Field
          label={type === "facture" ? "Nom de la facture" : "Nom du devis"}
          name="devis_nom"
          required
          placeholder={estVente ? "Vente + installation — Le Cercle" : "Sono & lumière — Festival X"}
        />

        {estVente ? (
          <Select
            label="Client"
            name="client_id"
            options={[{ value: "", label: "— Aucun —" }, ...clients.map((c) => ({ value: c.id, label: c.nom }))]}
          />
        ) : (
          <>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium">Événement</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { v: "existant", t: "Événement existant", d: "Ajouter le document à un événement déjà créé" },
                  { v: "nouveau", t: "Nouvel événement", d: "Le créer maintenant" },
                ] as const).map((o) => (
                  <label key={o.v} className={carte(rattachement === o.v)}>
                    <input
                      type="radio" name="rattachement" value={o.v}
                      checked={rattachement === o.v}
                      onChange={() => setRattachement(o.v)}
                      disabled={o.v === "existant" && evenements.length === 0}
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

            {nouvelEvenement ? (
              <div className="space-y-4 rounded-lg border border-border p-3">
                <Field label="Nom de l'événement" name="nom" required placeholder="Festival X — scène principale" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Client"
                    name="client_id"
                    options={[{ value: "", label: "— Aucun —" }, ...clients.map((c) => ({ value: c.id, label: c.nom }))]}
                  />
                  <Field label="Lieu" name="lieu" placeholder="Ville / salle" />
                  <Field label="Événement — début" name="date_event_debut" type="date" />
                  <Field label="Événement — fin" name="date_event_fin" type="date" />
                </div>
              </div>
            ) : (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Événement</span>
                <SelecteurPrestation
                  name="prestation_id"
                  options={evenements.map((e) => ({ id: e.id, nom: e.nom, date: e.date_event_debut ?? e.date ?? null }))}
                  placeholder="Chercher un événement…"
                />
              </label>
            )}
          </>
        )}

        {type === "facture" && devisModeles && devisModeles.length > 0 && (
          <Select
            label="Facture de départ"
            name="source_devis_id"
            options={[
              { value: "", label: "— Facture vierge —" },
              ...devisModeles.map((d) => ({ value: d.id, label: `Copier : ${d.label}` })),
            ]}
          />
        )}
      </div>

      <div className="flex items-center gap-3 pt-4">
        <SubmitButton>{type === "facture" ? "Créer la facture" : "Créer le devis"}</SubmitButton>
        <ModalCancelButton />
      </div>
    </ModalForm>
  );
}
