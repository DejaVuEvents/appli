import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembreActuel } from "@/lib/membre";
import { assemblerContenuDocument } from "@/lib/document";
import { urlDocument } from "@/lib/storage";
import { euros, dateFr, adresseMultiligne } from "@/lib/format";
import type { DateFormat } from "@/lib/format";

/**
 * Aperçu HTML autonome d'un devis/facture (hors layout applicatif → pas de barre de
 * navigation). Rendu fiable dans un iframe (jamais de téléchargement, contrairement au PDF).
 */
export default async function ApercuDevisPage({
  params,
  searchParams,
}: {
  params: Promise<{ devisId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { devisId } = await params;
  const type = (await searchParams)?.type === "facture" ? "facture" : "devis";
  const supabase = await createClient();

  const moi = await getMembreActuel(supabase);
  if (moi?.role !== "co_president") redirect("/prestations");

  // Document importé Tiime : on renvoie l'ancien PDF d'origine.
  const { data: dv } = await supabase.from("devis").select("pdf_import").eq("id", devisId).maybeSingle();
  if (dv?.pdf_import) {
    const url = await urlDocument(supabase, dv.pdf_import);
    if (url) redirect(url);
  }

  const c = await assemblerContenuDocument(supabase, devisId);
  if (!c) notFound();

  const { data: doc } = await supabase
    .from("devis_facture")
    .select("numero, date_emission, date_echeance")
    .eq("devis_id", devisId)
    .eq("type", type)
    .maybeSingle();

  const ent = c.ent;
  const fmt = (ent?.format_date ?? "fr") as DateFormat;
  const titre = type === "facture" ? "Facture" : "Devis";
  const villeLigne = [ent?.code_postal, ent?.ville].filter(Boolean).join(" ");

  return (
    <div className="document-sheet min-h-dvh bg-white p-4 sm:p-10">
      <div className="mx-auto max-w-[800px] text-sm text-foreground">
        {/* En-tête société */}
        <div>
          {ent?.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ent.logo} alt="Logo" className="mb-2 h-16 max-w-[180px] object-contain" />
          )}
          <div className="text-lg font-bold">{ent?.raison_sociale ?? "—"}</div>
          {ent?.adresse && <div>{ent.adresse}</div>}
          {villeLigne && <div>{villeLigne}{ent?.pays ? `, ${ent.pays}` : ""}</div>}
          {ent?.iban && <div className="mt-2 text-xs text-muted">IBAN : {ent.iban}</div>}
        </div>

        {/* Client — aligné à droite, sous la société et au-dessus du numéro */}
        {c.client && (
          <div className="mt-5 text-right">
            <div className="font-bold">{c.client.nom}</div>
            {c.client.adresse && <div className="whitespace-pre-line">{adresseMultiligne(c.client.adresse)}</div>}
          </div>
        )}

        {/* Titre */}
        <div className="mt-8">
          <h1 className="text-xl font-bold">{titre} {doc?.numero ? `N° ${doc.numero}` : "(brouillon)"}</h1>
          <div className="text-muted">{c.prestationNom}</div>
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-xs">
            <span>Date d&apos;émission : {dateFr(doc?.date_emission ?? null, fmt)}</span>
            <span>{type === "devis" ? "Validité : " : "Échéance : "}{dateFr(doc?.date_echeance ?? null, fmt)}</span>
          </div>
        </div>

        {/* Tableau */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-foreground text-left">
                <th className="py-1.5">Désignation</th>
                <th className="py-1.5 text-right">Qté</th>
                <th className="py-1.5">Unité</th>
                <th className="py-1.5 text-right">P.U. HT</th>
                <th className="py-1.5 text-right">Montant HT</th>
              </tr>
            </thead>
            <tbody>
              {c.groupes.map((g) => (
                <Fragment key={g.nom}>
                  <tr className="border-b border-border/60">
                    <td colSpan={5} className="pt-3 pb-1 font-semibold uppercase tracking-wide text-muted">{g.nom}</td>
                  </tr>
                  {g.items.map((l) => (
                    <tr key={l.id} className="border-b border-border/60">
                      <td className="py-1.5">{l.designation}</td>
                      <td className="py-1.5 text-right">{l.quantite}</td>
                      <td className="py-1.5">{l.unite ?? ""}</td>
                      <td className="py-1.5 text-right">{euros(l.prix_unitaire)}</td>
                      <td className="py-1.5 text-right">{euros(l.prix_total)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {c.transportTotal > 0 && (
                <tr className="border-b border-border/60">
                  <td className="py-1.5">Transport / logistique</td>
                  <td className="py-1.5 text-right">1</td>
                  <td className="py-1.5">forfait</td>
                  <td className="py-1.5 text-right">{euros(c.transportTotal)}</td>
                  <td className="py-1.5 text-right">{euros(c.transportTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totaux */}
        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted">Sous-total HT</span><span>{euros(c.totaux.sousTotalHT)}</span></div>
            {c.totaux.remiseHT > 0 && <div className="flex justify-between text-muted"><span>Remise HT</span><span>− {euros(c.totaux.remiseHT)}</span></div>}
            <div className="flex justify-between border-t border-foreground pt-1 font-bold"><span>Total HT</span><span>{euros(c.totaux.totalHT)}</span></div>
            {c.tva.taux > 0 && <div className="flex justify-between"><span className="text-muted">TVA {c.tva.taux} %</span><span>{euros(c.tva.montant)}</span></div>}
            <div className="flex justify-between text-base font-bold"><span>Total TTC</span><span>{euros(c.tva.totalTtc)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
