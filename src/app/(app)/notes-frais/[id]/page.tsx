import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { FileDropzone } from "@/components/file-dropzone";
import { JustificatifPreview } from "@/components/justificatif-preview";
import { euros, dateFr } from "@/lib/format";
import { getMembreActuel, nomMembre } from "@/lib/membre";
import {
  addLigneNDF, deleteLigneNDF, soumettreNDF, repasserBrouillonNDF, validerNDF, refuserNDF, deleteNoteFrais, signerNDF, ajouterTrajetNDF, setPredepenseInfos,
} from "../actions";
import { orsConfigured } from "@/lib/ors";
import { mappyUrl, googleMapsUrl } from "@/lib/itineraire";
import { urlDocument } from "@/lib/storage";
import { STATUT_NDF_LABELS, TYPE_NDF_LABELS, type LigneNoteFrais, type NoteFrais, type StatutNoteFrais } from "@/lib/types";

const STATUT_CLS: Record<StatutNoteFrais, string> = {
  brouillon: "bg-surface text-muted",
  soumise: "bg-amber-100 text-amber-800",
  validee: "bg-green-100 text-green-700",
  refusee: "bg-red-100 text-red-700",
};

export default async function NoteFraisDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const membre = await getMembreActuel(supabase);

  const [{ data: ndfData }, { data: lignesData }] = await Promise.all([
    supabase.from("note_frais").select("*").eq("id", id).single(),
    supabase.from("ligne_note_frais").select("*").eq("note_frais_id", id).order("date"),
  ]);
  if (!ndfData) notFound();
  const ndf = ndfData as NoteFrais;
  const lignes = (lignesData ?? []) as LigneNoteFrais[];
  const total = lignes.reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);

  // Justificatifs : URL signée temporaire (bucket privé), ou URL publique pour les anciens fichiers.
  const justifUrl = new Map<string, string | null>();
  await Promise.all(
    lignes.filter((l) => l.justificatif_url).map(async (l) => {
      justifUrl.set(l.id, await urlDocument(supabase, l.justificatif_url));
    }),
  );

  const ids = [ndf.demandeur_id, ndf.valide_par].filter(Boolean) as string[];
  const { data: membresData } = ids.length
    ? await supabase.from("membre").select("id, nom, email").in("id", ids)
    : { data: [] };
  const mMap = new Map((membresData ?? []).map((m) => [m.id, nomMembre(m)]));
  const demandeur = mMap.get(ndf.demandeur_id ?? "") ?? "—";

  const estDemandeur = membre?.id === ndf.demandeur_id;
  const editable = ndf.statut === "brouillon" && estDemandeur;
  const peutValider = membre?.role === "co_president" && !estDemandeur && ndf.statut === "soumise";
  const estPredepense = ndf.type_ndf === "predepense";

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/notes-frais" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Notes de frais</Link>
      <PageHeader
        title={ndf.titre || "Note de frais"}
        subtitle={`${TYPE_NDF_LABELS[ndf.type_ndf]} · Demandeur : ${demandeur} · ${dateFr(ndf.created_at)}`}
        action={
          <div className="flex items-center gap-2">
            <a href={`/notes-frais/${id}/pdf`} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background">PDF</a>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUT_CLS[ndf.statut]}`}>{STATUT_NDF_LABELS[ndf.statut]}</span>
          </div>
        }
      />

      {ndf.statut === "refusee" && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Refusée</strong> par {mMap.get(ndf.valide_par ?? "") ?? "—"} le {dateFr(ndf.valide_le)}.
          {ndf.motif_refus && <div className="mt-1">Motif : {ndf.motif_refus}</div>}
        </Card>
      )}
      {ndf.statut === "validee" && (
        <Card className="border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>{estPredepense ? "Achat autorisé" : "Validée"}</strong> par {mMap.get(ndf.valide_par ?? "") ?? "—"} le {dateFr(ndf.valide_le)}.
          {estPredepense && <div className="mt-1">Tu peux procéder à l&apos;achat. Crée ensuite une note de frais « Dépenses » avec le justificatif pour le remboursement.</div>}
          {!estPredepense && ndf.ecriture_id && (
            <div className="mt-1">
              Une ligne <strong>prévisionnelle</strong> (sortie) a été créée dans la trésorerie —{" "}
              <Link href="/finance/journal" className="underline">voir le journal</Link>.
            </div>
          )}
        </Card>
      )}

      {/* Pré-dépense : détails de la demande d'autorisation */}
      {estPredepense && (
        <section>
          <Card className="border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="mb-2 text-xs text-muted">
              <strong>Pré-dépense</strong> — demande d&apos;autorisation pour un achat supérieur à 500 €, à valider par un co-président <strong>avant</strong> l&apos;engagement de la dépense.
            </p>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              <div><span className="text-muted">Montant estimé : </span><span className="font-semibold">{ndf.montant_estime != null ? euros(ndf.montant_estime) : "—"}</span></div>
              <div><span className="text-muted">Fournisseur / prestataire : </span>{ndf.fournisseur ?? "—"}</div>
              <div className="sm:col-span-2"><span className="text-muted">Justification : </span>{ndf.justification ?? "—"}</div>
            </div>
          </Card>
          {editable && (
            <Card className="mt-3 p-4">
              <h3 className="mb-3 text-sm font-semibold">Détails de la pré-dépense</h3>
              <form action={setPredepenseInfos.bind(null, id)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Montant estimé (€)" name="montant_estime" type="number" step="0.01" defaultValue={ndf.montant_estime ?? undefined} />
                  <Field label="Fournisseur / prestataire" name="fournisseur" defaultValue={ndf.fournisseur ?? undefined} placeholder="Nom du fournisseur" />
                </div>
                <TextArea label="Justification (pourquoi cet achat ?)" name="justification" rows={3} defaultValue={ndf.justification ?? undefined} />
                <SubmitButton>Enregistrer les détails</SubmitButton>
              </form>
            </Card>
          )}
        </section>
      )}

      {/* Lignes / justificatifs */}
      {!estPredepense && (
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Justificatifs</h2>
        <Card className="divide-y divide-border overflow-hidden">
          {lignes.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucune ligne. Ajoute tes dépenses ci-dessous.</p>}
          {lignes.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{l.libelle || "Dépense"}</div>
                <div className="text-xs text-muted">{dateFr(l.date)}</div>
                {l.depart && l.arrivee && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted">Relevé d&apos;itinéraire :</span>
                    <a href={mappyUrl(l.depart, l.arrivee)} target="_blank" rel="noopener noreferrer" className="rounded border border-border px-1.5 py-0.5 hover:bg-background">Mappy</a>
                    <a href={googleMapsUrl(l.depart, l.arrivee)} target="_blank" rel="noopener noreferrer" className="rounded border border-border px-1.5 py-0.5 hover:bg-background">Google Maps</a>
                    {l.distance_km != null && <span className="text-muted">{l.distance_km} km</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {justifUrl.get(l.id) && <JustificatifPreview url={justifUrl.get(l.id)!} libelle={l.libelle} />}
                <span className="font-semibold">{euros(l.montant_ttc)}</span>
                {editable && (
                  <form action={deleteLigneNDF.bind(null, id, l.id)}>
                    <ConfirmButton confirm="Supprimer cette ligne ?" className="text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
                  </form>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 text-sm font-bold">
            <span>Total</span><span>{euros(total)}</span>
          </div>
        </Card>
      </section>
      )}

      {/* Ajout de ligne (brouillon, demandeur) */}
      {editable && ndf.type_ndf === "depense" && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Ajouter une dépense</h3>
          <form action={addLigneNDF.bind(null, id)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Libellé" name="libelle" placeholder="Péage, repas, matériel…" className="sm:col-span-2" />
              <Field label="Date" name="date" type="date" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Field label="Montant TTC (€)" name="montant_ttc" type="number" step="0.01" />
              <div className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium">Justificatif (photo / PDF)</span>
                <FileDropzone name="justificatif" accept="image/*,application/pdf" />
              </div>
            </div>
            <SubmitButton>+ Ajouter la dépense</SubmitButton>
          </form>
        </Card>
      )}

      {/* Frais de déplacement (véhicule perso) — calcul auto de la distance */}
      {editable && ndf.type_ndf === "km" && !orsConfigured() && (
        <Card className="p-4 text-sm text-amber-700">Calcul d&apos;itinéraire non configuré (clé OpenRouteService manquante).</Card>
      )}
      {editable && ndf.type_ndf === "km" && orsConfigured() && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Frais de déplacement (véhicule perso)</h3>
          <p className="mb-3 text-xs text-muted">Distance calculée automatiquement (OpenRouteService) puis appliquée au barème kilométrique.</p>
          <form action={ajouterTrajetNDF.bind(null, id)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Départ (adresse / ville)" name="depart" placeholder="19 rue Achille Viadieu, Toulouse" />
              <Field label="Arrivée (adresse / ville)" name="arrivee" placeholder="Lieu de la prestation" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Field label="Date" name="date" type="date" />
              <Field label="Tarif (€/km)" name="tarif_km" type="number" step="0.01" defaultValue={0.5} />
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="aller_retour" defaultChecked className="h-4 w-4 rounded border-border" />
                Aller-retour
              </label>
            </div>
            <div className="block">
              <span className="mb-1 block text-sm font-medium">Relevé Mappy / itinéraire (optionnel)</span>
              <FileDropzone name="justificatif" accept="image/*,application/pdf" />
              <p className="mt-1 text-xs text-muted">Un lien Mappy et Google Maps est généré automatiquement pour justifier la distance ; tu peux aussi joindre une capture.</p>
            </div>
            <SubmitButton pendingLabel="Calcul…">Calculer & ajouter</SubmitButton>
          </form>
        </Card>
      )}

      {/* Signature du demandeur (lu et approuvé) */}
      {estDemandeur && !estPredepense && (
        <Card className="p-4">
          {ndf.demandeur_signe_le ? (
            <p className="text-sm text-green-700">✓ Tu as signé cette note le {dateFr(ndf.demandeur_signe_le)} (« lu et approuvé »).</p>
          ) : membre?.signature_url ? (
            <form action={signerNDF.bind(null, id)} className="flex flex-wrap items-center gap-3">
              <SubmitButton confirm="Confirmes-tu signer cette note de frais « lu et approuvé » ? Ta signature enregistrée sera apposée sur le document PDF.">Signer (lu et approuvé)</SubmitButton>
              <span className="text-xs text-muted">Appose ta signature enregistrée sur le document.</span>
            </form>
          ) : (
            <p className="text-sm text-amber-700">
              Pour signer, ajoute d&apos;abord ta signature dans{" "}
              <Link href="/parametres?tab=moncompte" className="underline">Paramètres → Mon compte</Link>.
            </p>
          )}
        </Card>
      )}

      {/* Actions de workflow */}
      <Card className="p-4 space-y-3">
        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <form action={soumettreNDF.bind(null, id)}>
              <SubmitButton confirm={estPredepense ? "Soumettre cette pré-dépense pour autorisation ?" : (lignes.length === 0 ? "Aucune ligne — soumettre quand même ?" : "Soumettre cette note de frais pour validation ?")}>
                {estPredepense ? "Soumettre pour autorisation" : "Soumettre pour validation"}
              </SubmitButton>
            </form>
          </div>
        )}

        {ndf.statut === "soumise" && estDemandeur && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>En attente de validation par un co-président (autre que toi).</span>
            <form action={repasserBrouillonNDF.bind(null, id)}>
              <button className="text-primary underline" type="submit">Repasser en brouillon</button>
            </form>
          </div>
        )}

        {ndf.statut === "soumise" && membre?.role === "co_president" && estDemandeur && (
          <p className="text-sm text-muted">Tu es le demandeur : un <strong>autre</strong> co-président doit valider.</p>
        )}

        {peutValider && (
          <div className="space-y-3">
            <form action={validerNDF.bind(null, id)}>
              {estPredepense ? (
                <SubmitButton confirm={`Autoriser cette pré-dépense${ndf.montant_estime != null ? ` (${euros(ndf.montant_estime)})` : ""} ? L'achat pourra être engagé.`}>✓ Autoriser l&apos;achat</SubmitButton>
              ) : (
                <SubmitButton confirm={`Valider et signer (« lu et approuvé ») cette note de frais (${euros(total)}) ? Ta signature enregistrée sera apposée et une ligne prévisionnelle sera créée en trésorerie.`}>✓ Valider & signer ({euros(total)})</SubmitButton>
              )}
            </form>
            <form action={refuserNDF.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Motif de refus" name="motif" className="flex-1 min-w-[12rem]" placeholder="Justificatif manquant…" />
              <SubmitButton variant="danger" confirm="Refuser cette note de frais ?">Refuser</SubmitButton>
            </form>
          </div>
        )}

        {(ndf.statut === "validee" || ndf.statut === "refusee") && estDemandeur && (
          <form action={repasserBrouillonNDF.bind(null, id)}>
            <button className="text-sm text-primary underline" type="submit">Repasser en brouillon (corriger)</button>
          </form>
        )}

        {/* Suppression — toujours disponible */}
        <div className="border-t border-border pt-3">
          <form action={deleteNoteFrais.bind(null, id)}>
            <SubmitButton variant="danger" pendingLabel="Suppression…" confirm="Supprimer définitivement cette note de frais ?">
              Supprimer la note de frais
            </SubmitButton>
          </form>
        </div>
      </Card>
    </div>
  );
}
