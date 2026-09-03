import Link from "next/link";
import { IconDownload } from "@/components/icons";
import { SousLocationBadge } from "@/components/sous-location-badge";
import { HorsCatalogueBadge } from "@/components/hors-catalogue-badge";
import { chargerSousLocation, type SousLocInfo } from "@/lib/sous-location";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { urlDocument } from "@/lib/storage";
import { PrintButton } from "@/components/print-button";
import { calculerTotaux, type RemiseType } from "@/lib/devis";
import { ORDRE_BUCKETS, bucketPour } from "@/lib/devis-buckets";
import { euros, dateFr, adresseMultiligne, type DateFormat } from "@/lib/format";
import { statutFactureAffichage } from "@/lib/facture-statut";
import type { LignePrestation, ParametresEntreprise, DevisFacture } from "@/lib/types";

type LigneRow = LignePrestation;

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; devis?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const type: "devis" | "facture" = sp?.type === "facture" ? "facture" : "devis";
  const supabase = await createClient();

  // Devis ciblé : paramètre ?devis, sinon le premier devis de l'événement.
  let devisId = sp?.devis ?? null;
  if (!devisId) {
    const { data: first } = await supabase.from("devis").select("id").eq("prestation_id", id).order("created_at").limit(1).maybeSingle();
    devisId = first?.id ?? null;
  }
  if (!devisId) notFound();

  const { data: devisRow } = await supabase
    .from("devis")
    .select("prestation_id, nom, remise_globale_type, remise_globale_valeur, coefficient_duree, pdf_import, statut_signature, pdf_signe")
    .eq("id", devisId)
    .single();
  if (!devisRow) notFound();
  const pdfSigneUrl = devisRow.pdf_signe ? await urlDocument(supabase, devisRow.pdf_signe) : null;

  // Document importé : l'original ne s'affiche que tant qu'il n'a pas été repris dans
  // l'outil (redirection décidée plus bas, une fois les lignes connues).

  const [{ data: prest }, { data: lignesData }, { data: cats }, { data: transports }, { data: entData }, { data: docData }] =
    await Promise.all([
      supabase.from("prestation").select("nom, client(nom, adresse, email)").eq("id", id).single(),
      supabase.from("ligne_prestation").select("*").eq("devis_id", devisId).order("created_at"),
      supabase.from("categorie").select("id, nom, ordre, parent_id"),
      supabase.from("transport").select("cout_calcule").eq("devis_id", devisId),
      supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
      supabase.from("devis_facture").select("*").eq("devis_id", devisId).eq("type", type).maybeSingle(),
    ]);

  // Sous-location : matériel loué à un fournisseur. Repéré dans l'outil seulement
  // (pastille masquée à l'impression et absente du PDF).
  const sousLocParRef = await chargerSousLocation(supabase, ((lignesData ?? []) as LigneRow[]).map((l) => l.reference_id));

  if (!prest) notFound();
  const prestation = prest as unknown as {
    nom: string;
    client: { nom: string; adresse: string | null; email: string | null } | null;
  };
  const lignes = (lignesData ?? []) as LigneRow[];
  if (devisRow.pdf_import && lignes.length === 0) {
    const url = await urlDocument(supabase, devisRow.pdf_import);
    if (url) redirect(url);
  }
  const categories = (cats ?? []) as { id: string; nom: string; ordre?: number | null; parent_id?: string | null }[];
  const ent = entData as ParametresEntreprise | null;
  const doc = docData as DevisFacture | null;
  const fmt = (ent?.format_date ?? "fr") as DateFormat;

  const transportTotal = (transports ?? []).reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
  const coeffDuree = Number(devisRow.coefficient_duree ?? 0) > 0 ? Number(devisRow.coefficient_duree) : 1;
  const totaux = calculerTotaux({
    lignes,
    transportTotal,
    remiseGlobaleType: devisRow.remise_globale_type as RemiseType,
    remiseGlobaleValeur: Number(devisRow.remise_globale_valeur ?? 0),
    coefficientDuree: coeffDuree,
  });
  // Surcharge multi-jours affichée comme ligne du tableau (pour que le tableau réconcilie avec le sous-total).
  const materielBrut1j = lignes.reduce((s, l) => s + Number(l.prix_unitaire ?? 0) * l.quantite, 0);
  const surchargeDuree = Math.round((materielBrut1j + transportTotal) * (coeffDuree - 1) * 100) / 100;
  const tauxTva = Number(ent?.taux_tva ?? 0);
  const montantTva = Math.round(totaux.totalHT * (tauxTva / 100) * 100) / 100;
  const totalTtc = Math.round((totaux.totalHT + montantTva) * 100) / 100;

  // Regroupement en 4 familles (Lumière & Effets / Son / Structure / Technique),
  // cohérent avec le constructeur — voir src/lib/devis-buckets.ts.
  const catById = new Map(categories.map((c) => [c.id, c]));
  const groupes = new Map<string, LigneRow[]>();
  for (const l of lignes) {
    const nom = bucketPour(l.designation, l.categorie_id ? catById.get(l.categorie_id)?.nom ?? null : null);
    if (!groupes.has(nom)) groupes.set(nom, []);
    groupes.get(nom)!.push(l);
  }
  const groupesTries: [string, LigneRow[]][] = ORDRE_BUCKETS.filter((b) => groupes.has(b)).map((nom) => [nom, groupes.get(nom)!] as [string, LigneRow[]]);

  const titre = type === "devis" ? "Devis" : "Facture";
  const numero = doc?.numero ?? null;
  const emis = Boolean(numero);
  const statutFacture = statutFactureAffichage(emis, doc?.statut_paiement);
  // Devis dont la validité est dépassée : à redater avant envoi au client.
  const validiteExpiree = type === "devis" && !!doc?.date_echeance && doc.date_echeance < new Date().toISOString().slice(0, 10);

  // Facture émise à partir du même devis : on récupère le n° du devis source (s'il existe).
  let devisSourceNumero: string | null = null;
  if (type === "facture") {
    const { data: devisDoc } = await supabase
      .from("devis_facture")
      .select("numero")
      .eq("devis_id", devisId)
      .eq("type", "devis")
      .maybeSingle();
    devisSourceNumero = devisDoc?.numero ?? null;
  }

  const mailto = prestation.client?.email
    ? `mailto:${prestation.client.email}?subject=${encodeURIComponent(`${titre}${numero ? ` N° ${numero}` : ""} — ${prestation.nom}`)}&body=${encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint notre ${titre.toLowerCase()} pour « ${prestation.nom} ».\n\nBien cordialement,\n${ent?.raison_sociale ?? ""}`)}`
    : null;

  const villeLigne = [ent?.code_postal, ent?.ville].filter(Boolean).join(" ");

  const card = "flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left text-sm font-medium hover:border-primary/40 hover:shadow-sm";

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      {/* Panneau — gauche, masqué à l'impression. Les actions (émettre, statut, envoi…)
          sont désormais sur la page du devis ; ici on ne fait que consulter / imprimer. */}
      <aside className="print:hidden mb-4 space-y-3 lg:mb-0 lg:w-64 lg:shrink-0">
        <Link href={`/prestations/devis/${devisId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Retour au devis</Link>

        {/* Bascule Devis / Facture */}
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          <Link href={`/prestations/${id}/document?devis=${devisId}&type=devis`} className={`flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium ${type === "devis" ? "bg-primary text-primary-foreground" : "text-muted hover:bg-background"}`}>Devis</Link>
          <Link href={`/prestations/${id}/document?devis=${devisId}&type=facture`} className={`flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium ${type === "facture" ? "bg-primary text-primary-foreground" : "text-muted hover:bg-background"}`}>Facture</Link>
        </div>

        <a href={`/prestations/${id}/document/pdf?devis=${devisId}&type=${type}`} download className={card}>
          <IconDownload className="h-4 w-4" /> PDF
        </a>

        <PrintButton label="Imprimer" />
      </aside>

      {/* Colonne document */}
      <div className="min-w-0 flex-1">
        {validiteExpiree && (
          <p className="print:hidden mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300">
            Validité dépassée depuis le {dateFr(doc?.date_echeance, fmt)} — redate le devis avant de l&apos;envoyer
            (<Link href={`/prestations/devis/${devisId}`} className="underline">page du devis</Link>).
          </p>
        )}
        {!emis && (
          <p className="print:hidden mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Brouillon — ce {titre.toLowerCase()} n&apos;a pas encore de numéro. Clique « Émettre » pour lui attribuer un numéro et figer les montants.
          </p>
        )}

        {/* Feuille du document */}
        <div className="document-sheet mx-auto max-w-[800px] bg-surface p-4 text-sm text-foreground shadow-sm sm:p-8 print:max-w-none print:p-0 print:shadow-none">
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
        {prestation.client && (
          <div className="mt-5 text-right">
            <div className="font-bold">{prestation.client.nom}</div>
            {prestation.client.adresse && <div className="whitespace-pre-line">{adresseMultiligne(prestation.client.adresse)}</div>}
          </div>
        )}

        {/* Titre */}
        <div className="mt-8">
          <h1 className="text-xl font-bold">{titre} {numero ? `N° ${numero}` : "(brouillon)"}</h1>
          <div className="text-muted">{prestation.nom}</div>
          {type === "facture" && devisSourceNumero && (
            <div className="text-xs text-muted">Facture émise à partir du devis N° {devisSourceNumero}</div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-xs">
            <span>Date d&apos;émission : {dateFr(doc?.date_emission, fmt)}</span>
            <span>
              {type === "devis" ? "Validité : " : "Échéance : "}
              {dateFr(doc?.date_echeance, fmt)}
            </span>
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
            {groupesTries.map(([nom, items]) => (
              <DocGroup key={nom} nom={nom} items={items} sousLoc={sousLocParRef} />
            ))}
            {coeffDuree !== 1 && surchargeDuree !== 0 && (
              <tr className="border-b border-border/60">
                <td className="py-1.5">Location sur plusieurs jours (coefficient ×{coeffDuree})</td>
                <td className="py-1.5 text-right">1</td>
                <td className="py-1.5">forfait</td>
                <td className="py-1.5 text-right">{euros(surchargeDuree)}</td>
                <td className="py-1.5 text-right">{euros(surchargeDuree)}</td>
              </tr>
            )}
            {transportTotal > 0 && (
              <tr className="border-b border-border/60">
                <td className="py-1.5">Transport / logistique</td>
                <td className="py-1.5 text-right">1</td>
                <td className="py-1.5">forfait</td>
                <td className="py-1.5 text-right">{euros(transportTotal)}</td>
                <td className="py-1.5 text-right">{euros(transportTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* Totaux */}
        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted">Sous-total HT</span><span>{euros(totaux.sousTotalHT)}</span></div>
            {totaux.remiseHT > 0 && (
              <div className="flex justify-between text-muted"><span>Remise HT</span><span>− {euros(totaux.remiseHT)}</span></div>
            )}
            <div className="flex justify-between border-t border-foreground pt-1 font-bold"><span>Total HT</span><span>{euros(totaux.totalHT)}</span></div>
            {tauxTva > 0 && (
              <div className="flex justify-between text-muted"><span>TVA {tauxTva} %</span><span>{euros(montantTva)}</span></div>
            )}
            <div className="flex justify-between font-bold"><span>Total TTC</span><span>{euros(totalTtc)}</span></div>
          </div>
        </div>

        {/* Mentions */}
        <div className="mt-8 space-y-2 text-xs text-muted">
          {ent?.mention_tva && <p>{ent.mention_tva}</p>}
          {type === "devis" ? (
            <>
              {ent?.conditions_devis && <p>{ent.conditions_devis}</p>}
              <div className="mt-6 flex justify-end">
                <div className="text-center">
                  <div className="h-20 w-48 rounded border border-border" />
                  <div className="mt-1">Signature</div>
                </div>
              </div>
            </>
          ) : (
            ent?.conditions_facture && <p>{ent.conditions_facture}</p>
          )}
          {ent?.siren && <p className="pt-4 text-center">SIREN {ent.siren}</p>}
        </div>
      </div>
      </div>
    </div>
  );
}

function DocGroup({ nom, items, sousLoc }: { nom: string; items: LigneRow[]; sousLoc: Map<string, SousLocInfo> }) {
  return (
    <>
      <tr className="bg-background/60">
        <td colSpan={5} className="px-1 py-1 font-semibold">{nom}</td>
      </tr>
      {items.map((l) => {
        const brut = Number(l.prix_unitaire ?? 0) * l.quantite;
        const remise = brut - Number(l.prix_total ?? 0);
        return (
          <tr key={l.id} className="border-b border-border align-top">
            <td className="py-1.5">
              {l.designation}
              {l.reference_id && sousLoc.get(l.reference_id) && (
                <span className="ml-1 inline-flex align-middle">
                  <SousLocationBadge sl={sousLoc.get(l.reference_id)!} quantite={l.quantite} />
                </span>
              )}
              {!l.reference_id && (
                <span className="ml-1 inline-flex align-middle">
                  <HorsCatalogueBadge />
                </span>
              )}
              {remise > 0 && (
                <div className="italic text-muted">
                  Remise {l.remise_type === "montant" ? euros(l.remise_valeur) : `${l.remise_valeur}%`}
                </div>
              )}
            </td>
            <td className="py-1.5 text-right">{l.quantite}</td>
            <td className="py-1.5">{l.unite ?? ""}</td>
            <td className="py-1.5 text-right">{euros(l.prix_unitaire)}</td>
            <td className="py-1.5 text-right">
              {euros(brut)}
              {remise > 0 && <div className="italic text-muted">− {euros(remise)}</div>}
            </td>
          </tr>
        );
      })}
    </>
  );
}
