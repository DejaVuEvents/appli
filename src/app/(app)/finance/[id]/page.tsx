import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { EcritureForm } from "../ecriture-form";
import { updateEcriture, ajouterJustificatifs, supprimerJustificatif } from "../actions";
import type { EcritureFinanciere, Justificatif } from "@/lib/types";
import { urlDocument } from "@/lib/storage";
import { euros } from "@/lib/format";
import { chargerNomenclature } from "@/lib/finance";

export default async function EditEcriturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, { data: prestData }, { data: justifData }, { data: liensData }] = await Promise.all([
    supabase.from("ecriture_financiere").select("*").eq("id", id).single(),
    supabase.from("prestation").select("id, nom").order("date_event_debut", { ascending: false }),
    supabase.from("justificatif").select("*").eq("ecriture_id", id).order("created_at"),
    supabase.from("ecriture_facture").select("devis_facture:devis_facture_id(id, numero, montant_ttc, type, prestation_id)").eq("ecriture_id", id),
  ]);
  if (!data) notFound();
  const prestations = (prestData ?? []) as { id: string; nom: string }[];
  const prestNom = new Map(prestations.map((p) => [p.id, p.nom]));
  const justificatifs = (justifData ?? []) as Justificatif[];
  const facturesReglees = ((liensData ?? []) as unknown as { devis_facture: { id: string; numero: string | null; montant_ttc: number | null; type: string; prestation_id: string | null } | null }[])
    .map((l) => l.devis_facture).filter(Boolean) as { id: string; numero: string | null; montant_ttc: number | null; type: string; prestation_id: string | null }[];

  // Lien affichable par justificatif : fichier (URL signée ou publique legacy) sinon null (référence texte).
  const lienJustif = new Map<string, string | null>();
  await Promise.all(justificatifs.map(async (j) => lienJustif.set(j.id, await urlDocument(supabase, j.url))));

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Modifier l'écriture" />
      <Card className="p-5">
        <EcritureForm
          action={updateEcriture.bind(null, id)}
          ecriture={data as EcritureFinanciere}
          prestations={prestations}
          submitLabel="Enregistrer"
          cancelHref="/finance/journal"
          nomenclature={await chargerNomenclature(supabase)}
        />
      </Card>

      {/* Factures réglées par cette entrée (liaison N–N) */}
      {facturesReglees.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Facture{facturesReglees.length > 1 ? "s" : ""} réglée{facturesReglees.length > 1 ? "s" : ""} par cette entrée
          </h2>
          <p className="mb-3 text-xs text-muted">Une entrée d&apos;argent peut régler plusieurs factures (acompte + solde, factures groupées…).</p>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {facturesReglees.map((fr) => (
              <a
                key={fr.id}
                href={fr.prestation_id ? `/prestations/${fr.prestation_id}` : "#"}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-surface"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{fr.type === "facture" ? "Facture" : "Devis"} n° {fr.numero ?? "—"}</span>
                  {fr.prestation_id && <span className="text-muted"> · {prestNom.get(fr.prestation_id) ?? ""}</span>}
                </span>
                <span className="shrink-0 tabular-nums font-medium">{fr.montant_ttc != null ? euros(Number(fr.montant_ttc)) : "—"}</span>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Justificatifs multiples */}
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Justificatifs</h2>
        <p className="mb-3 text-xs text-muted">Plusieurs pièces peuvent être associées à cette opération (factures, tickets, bons de commande…).</p>

        {justificatifs.length === 0 ? (
          <p className="mb-3 text-sm text-muted">Aucun justificatif pour l&apos;instant.</p>
        ) : (
          <div className="mb-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {justificatifs.map((j) => {
              const lien = lienJustif.get(j.id);
              return (
                <div key={j.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  {lien ? (
                    <a href={lien} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline">
                      📎 {j.nom || "Justificatif"}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">🔖 {j.nom || j.url}</span>
                  )}
                  <form action={supprimerJustificatif.bind(null, j.id, id)}>
                    <ConfirmButton confirm="Supprimer ce justificatif ?" className="shrink-0 text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <form action={ajouterJustificatifs.bind(null, id)} className="space-y-2">
          <input
            name="justificatifs"
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-background"
          />
          <input
            name="justificatif_ref"
            placeholder="…ou une référence / lien (optionnel)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <SubmitButton pendingLabel="Ajout…">+ Ajouter le(s) justificatif(s)</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
