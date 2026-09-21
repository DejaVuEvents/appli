"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchQontoTransactions, fetchQontoAttachment, fetchQontoOrg, mapQontoCategorie, dateParis, soldeDeReference } from "@/lib/qonto";
import type { QontoTransaction } from "@/lib/qonto";
import { BUCKET_PRIVE } from "@/lib/storage";

export type QontoPreviewItem = {
  transaction_id: string;
  date: string;
  label: string;
  montant: number;
  sens: "entree" | "sortie";
  type: string;
  specification: string;
  reference: string | null;
  cashflow_cat: string | null;
  cashflow_sub: string | null;
  doublon: boolean;
  pending: boolean;
  attachment_ids: string[];
};

export async function previewQonto(): Promise<
  { ok: true; items: QontoPreviewItem[]; compte: string } |
  { ok: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: ent } = await supabase
      .from("parametres_entreprise")
      .select("qonto_login, qonto_token, qonto_account_slug")
      .limit(1)
      .maybeSingle();

    if (!ent?.qonto_login || !ent?.qonto_token || !ent?.qonto_account_slug) {
      return { ok: false, error: "Identifiants Qonto non configurés (voir Paramètres)." };
    }

    // 1. IDs Qonto déjà importés → exclure complètement
    const { data: alreadySynced } = await supabase
      .from("ecriture_financiere")
      .select("qonto_transaction_id")
      .not("qonto_transaction_id", "is", null);
    const importedIds = new Set((alreadySynced ?? []).map((e) => e.qonto_transaction_id as string));

    // 2. Détection de doublon TOLÉRANTE AUX DATES, sur les écritures RÉELLES **et
    // PRÉVISIONNELLES** : le règlement Qonto d'une facture client, d'une NDF ou d'une
    // facture fournisseur encore « prévue » ne doit pas s'ajouter à sa prévision.
    const { data: manualEntries } = await supabase
      .from("ecriture_financiere")
      .select("date, montant_ttc, sens, statut")
      .is("qonto_transaction_id", null);

    // Signalement, PAS exclusion. Une transaction qui ressemble à une écriture saisie
    // à la main était auparavant écartée de l'import : l'outil gardait la saisie et
    // n'a jamais reçu le mouvement bancaire, définitivement — la suppression n'expirait
    // pas. C'est la source des écarts qui revenaient sans cesse. Désormais la banque
    // fait foi : tout est importé, et c'est la saisie manuelle sans origine bancaire
    // qui est signalée comme l'anomalie à arbitrer.
    const idxReel = new Map<string, number[]>();
    for (const e of manualEntries ?? []) {
      if (e.statut !== "reel") continue;
      const k = `${Math.round(Number(e.montant_ttc) * 100)}|${e.sens}`;
      if (!idxReel.has(k)) idxReel.set(k, []);
      idxReel.get(k)!.push(new Date(e.date).getTime());
    }
    // Une prévision peut être datée d'une échéance éloignée du règlement réel → tolérance large.
    const TOLERANCE_MS = 20 * 24 * 60 * 60 * 1000;
    const estDoublon = (date: string, amount: number, sens: string): boolean => {
      const dates = idxReel.get(`${Math.round(amount * 100)}|${sens}`);
      if (!dates) return false;
      const t = new Date(date).getTime();
      return dates.some((d) => Math.abs(d - t) <= TOLERANCE_MS);
    };

    // 3. Fetch Qonto (inclut les transactions EN ATTENTE de règlement = les plus récentes)
    const txs: QontoTransaction[] = await fetchQontoTransactions(
      ent.qonto_login,
      ent.qonto_token,
      ent.qonto_account_slug,
      undefined,
      true,
    );

    const items: QontoPreviewItem[] = txs
      .filter((t) => !importedIds.has(t.transaction_id))
      .map((t) => {
        const cat = mapQontoCategorie(
          t.side,
          t.cashflow_category?.name ?? null,
          t.cashflow_subcategory?.name ?? null,
          t.label,
        );
        // Les transactions en attente n'ont pas de settled_at → on prend la date d'émission.
        const date = dateParis(t.settled_at ?? t.emitted_at);
        const sens = (t.side === "credit" ? "entree" : "sortie") as "entree" | "sortie";
        return {
          transaction_id: t.transaction_id,
          date,
          label: t.label,
          montant: t.amount,
          sens,
          type: cat.type,
          specification: cat.specification,
          reference: t.reference,
          cashflow_cat: t.cashflow_category?.name ?? null,
          cashflow_sub: t.cashflow_subcategory?.name ?? null,
          doublon: estDoublon(date, t.amount, sens),
          pending: t.status !== "completed",
          attachment_ids: t.attachment_ids ?? [],
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return { ok: true, items, compte: ent.qonto_account_slug };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─────────────────────────── Rapport de rapprochement ───────────────────────────

export type RapportRapprochement =
  | {
      ok: true;
      balanceQonto: number;
      soldeOutil: number;
      ecart: number;
      manquantes: QontoPreviewItem[]; // dans Qonto mais absentes de l'outil
      enTrop: { id: string; date: string; denomination: string; montant: number; sens: string }[]; // dans l'outil mais absentes de Qonto
      netManquantes: number;
      netEnTrop: number;
      /** Transactions Qonto pas encore réglées : comptées dans le solde bancaire, jamais importées. */
      enAttente: { date: string; label: string; montant: number; sens: string }[];
      netEnAttente: number;
      ajustementBaseline: number; // part de l'écart expliquée par le solde initial
      soldeInitial: number;
      soldeInitialDate: string | null;
    }
  | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Analyse l'écart entre le solde bancaire Qonto et le solde de l'outil, depuis la date
 * du solde initial : transactions Qonto manquantes, écritures outil absentes de Qonto,
 * et écart résiduel imputable au solde initial. Ne modifie rien.
 */
export async function rapprochementQonto(): Promise<RapportRapprochement> {
  try {
    const supabase = await createClient();
    const { data: ent } = await supabase
      .from("parametres_entreprise")
      .select("qonto_login, qonto_token, qonto_account_slug, solde_initial, solde_initial_date")
      .limit(1)
      .maybeSingle();
    if (!ent?.qonto_login || !ent?.qonto_token || !ent?.qonto_account_slug) {
      return { ok: false, error: "Identifiants Qonto non configurés (voir Paramètres)." };
    }
    const baseline = ent.solde_initial_date ?? "2000-01-01";
    const soldeInitial = Number(ent.solde_initial ?? 0);

    // Solde bancaire Qonto
    const org = await fetchQontoOrg(ent.qonto_login, ent.qonto_token);
    const compte = org.bank_accounts.find((a) => a.slug === ent.qonto_account_slug) ?? org.bank_accounts[0];
    const balanceQonto = soldeDeReference(compte);

    // Transactions Qonto depuis la date du solde initial. On inclut les EN ATTENTE :
    // le solde renvoyé par Qonto les compte déjà, alors que la synchro ne les importe
    // pas (une transaction non réglée peut encore changer). Sans les isoler ici,
    // l'écart qui en découle était imputé à tort au solde initial.
    // Sans filtre `settled_after` : il s'appuie sur settled_at, que les opérations en
    // attente n'ont pas encore — elles disparaîtraient du rapprochement.
    const toutes = await fetchQontoTransactions(
      ent.qonto_login, ent.qonto_token, ent.qonto_account_slug, undefined, true,
    );
    const txs = toutes.filter((t) => dateParis(t.settled_at ?? t.emitted_at) >= baseline);

    // Purement informatif : ces opérations SONT importées, elles ne creusent donc plus
    // d'écart. On les signale seulement parce que leur montant peut encore bouger.
    const enAttente = toutes
      .filter((t) => t.status !== "completed")
      .map((t) => ({
        date: dateParis(t.settled_at ?? t.emitted_at),
        label: t.label,
        montant: t.amount,
        sens: t.side === "credit" ? "entree" : "sortie",
      }));
    const netEnAttente = r2(enAttente.reduce((s, t) => s + (t.sens === "entree" ? t.montant : -t.montant), 0));

    // Écritures « réelles » de l'outil depuis la date du solde initial
    const { data: toolData } = await supabase
      .from("ecriture_financiere")
      .select("id, date, denomination, montant_ttc, sens, qonto_transaction_id")
      .eq("statut", "reel")
      .gte("date", baseline);
    const toolEntries = (toolData ?? []) as { id: string; date: string; denomination: string | null; montant_ttc: number; sens: string; qonto_transaction_id: string | null }[];

    const soldeOutil = r2(soldeInitial + toolEntries.reduce((s, e) => s + (e.sens === "entree" ? Number(e.montant_ttc) : -Number(e.montant_ttc)), 0));
    const ecart = r2(balanceQonto - soldeOutil);

    // Appariement Qonto ↔ outil
    const linkedIds = new Set(toolEntries.filter((e) => e.qonto_transaction_id).map((e) => e.qonto_transaction_id as string));
    const manuels = toolEntries
      .filter((e) => !e.qonto_transaction_id)
      .map((e) => ({ ...e, used: false, t: new Date(e.date).getTime(), cents: Math.round(Number(e.montant_ttc) * 100) }));
    const TOL = 5 * 24 * 60 * 60 * 1000;

    const manquantes: QontoPreviewItem[] = [];
    for (const tx of txs) {
      if (linkedIds.has(tx.transaction_id)) continue; // déjà importée
      const sens = (tx.side === "credit" ? "entree" : "sortie") as "entree" | "sortie";
      const date = dateParis(tx.settled_at ?? tx.emitted_at);
      const cents = Math.round(tx.amount * 100);
      const t = new Date(date).getTime();
      const jumeau = manuels.find((m) => !m.used && m.sens === sens && m.cents === cents && Math.abs(m.t - t) <= TOL);
      if (jumeau) { jumeau.used = true; continue; } // correspond à une saisie manuelle
      const cat = mapQontoCategorie(tx.side, tx.cashflow_category?.name ?? null, tx.cashflow_subcategory?.name ?? null, tx.label);
      manquantes.push({
        transaction_id: tx.transaction_id, date, label: tx.label, montant: tx.amount, sens,
        type: cat.type, specification: cat.specification, reference: tx.reference,
        cashflow_cat: tx.cashflow_category?.name ?? null, cashflow_sub: tx.cashflow_subcategory?.name ?? null,
        doublon: false, pending: tx.status !== "completed", attachment_ids: tx.attachment_ids ?? [],
      });
    }
    // Écritures réelles que la banque ne connaît pas. Sur une période couverte par
    // Qonto, elles n'ont pas lieu d'être : soit elles doublonnent un mouvement importé,
    // soit elles décrivent un flux qui n'est jamais passé par le compte.
    const enTrop = manuels
      .filter((m) => !m.used)
      .map((m) => ({ id: m.id, date: m.date, denomination: m.denomination ?? "—", montant: Number(m.montant_ttc), sens: m.sens }));

    const netManquantes = r2(manquantes.reduce((s, m) => s + (m.sens === "entree" ? m.montant : -m.montant), 0));
    const netEnTrop = r2(enTrop.reduce((s, m) => s + (m.sens === "entree" ? m.montant : -m.montant), 0));
    // Résiduel imputable au solde initial, une fois retirés les mouvements à importer
    // et les écritures en trop. Les opérations en attente ne sont plus déduites : elles
    // sont importées comme les autres et comptent déjà des deux côtés.
    const ajustementBaseline = r2(ecart - (netManquantes - netEnTrop));

    // Mémorisé pour être signalé ailleurs qu'ici : personne ne vient consulter cette
    // page spontanément, l'écart se découvrait donc longtemps après son apparition.
    await supabase
      .from("parametres_entreprise")
      .update({ qonto_ecart: ecart, qonto_ecart_le: new Date().toISOString() })
      .not("id", "is", null);

    return {
      ok: true, balanceQonto, soldeOutil, ecart, manquantes, enTrop,
      netManquantes, netEnTrop, enAttente, netEnAttente,
      ajustementBaseline, soldeInitial, soldeInitialDate: ent.solde_initial_date ?? null,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Applique un nouveau solde initial (proposé par le rapport de rapprochement). */
export async function ajusterSoldeInitial(nouveauSolde: number): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: ent } = await supabase.from("parametres_entreprise").select("id").limit(1).maybeSingle();
  if (!ent) return { ok: false, error: "Paramètres introuvables." };
  const { error } = await supabase.from("parametres_entreprise").update({ solde_initial: nouveauSolde }).eq("id", ent.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/finance");
  revalidatePath("/finance/qonto");
  return { ok: true };
}

async function uploadQontoAttachment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  login: string,
  token: string,
  attachmentId: string,
): Promise<string | null> {
  try {
    const attachment = await fetchQontoAttachment(login, token, attachmentId);
    const fileResp = await fetch(attachment.url);
    if (!fileResp.ok) return null;
    const buffer = await fileResp.arrayBuffer();
    const ext = attachment.file_name.split(".").pop() ?? "pdf";
    // Nom déterministe basé sur l'ID → pas de doublon si ré-importé
    const path = `qonto-${attachmentId}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, buffer, {
      contentType: attachment.file_content_type || "application/pdf",
      upsert: true,
    });
    if (error) return null;
    return data.path;
  } catch {
    return null;
  }
}

export async function importQontoTransactions(
  items: QontoPreviewItem[],
): Promise<{ ok: true; count: number; withAttachment: number } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: ent } = await supabase
      .from("parametres_entreprise")
      .select("qonto_login, qonto_token")
      .limit(1)
      .maybeSingle();

    // Upload des pièces jointes en parallèle (limité à la première par transaction)
    const factureUrls = await Promise.all(
      items.map(async (t) => {
        if (!t.attachment_ids?.length || !ent?.qonto_login || !ent?.qonto_token) return null;
        return uploadQontoAttachment(supabase, ent.qonto_login, ent.qonto_token, t.attachment_ids[0]);
      }),
    );

    const rows = items.map((t, i) => ({
      date: t.date,
      denomination: t.label,
      type: t.type,
      specification: t.specification,
      sens: t.sens,
      statut: "reel" as const,
      montant_ttc: t.montant,
      effectue_par: "Qonto",
      notes: t.reference ?? null,
      qonto_transaction_id: t.transaction_id,
      facture: factureUrls[i] ?? null,
    }));

    const { error } = await supabase.from("ecriture_financiere").insert(rows);
    if (error) return { ok: false, error: error.message };

    // Consommation des prévisions correspondantes : quand la vraie transaction arrive,
    // la prévision qu'elle réalise disparaît, sinon le solde projeté la compte deux fois.
    //
    // On ne touche PAS aux prévisions rattachées à un document (note de frais, facture
    // client, facture fournisseur) : leur cycle de vie est géré ailleurs — une NDF passe
    // par « marquer remboursée », qui convertit l'écriture au lieu de la supprimer, et
    // la supprimer ici casserait le lien note ↔ trésorerie.
    const { data: prevs } = await supabase
      .from("ecriture_financiere")
      .select("id, date, montant_ttc, sens, depense_recurrente_id")
      .eq("statut", "previsionnel")
      .is("note_frais_id", null)
      .is("devis_facture_id", null)
      .is("devis_id", null)
      .is("facture_fournisseur_id", null);
    const aSupprimer: string[] = [];
    for (const t of items) {
      const tMs = new Date(t.date).getTime();
      const cents = Math.round(t.montant * 100);
      const match = (prevs ?? []).find((p) => {
        if (aSupprimer.includes(p.id) || p.sens !== t.sens) return false;
        if (Math.round(Number(p.montant_ttc) * 100) !== cents) return false;
        // Fenêtre serrée pour les récurrents : à ±20 jours on risquerait d'effacer
        // l'échéance du mois voisin. Plus large pour une prévision saisie à la main,
        // dont la date n'est qu'une estimation.
        const tolerance = (p.depense_recurrente_id ? 7 : 20) * 86400000;
        return Math.abs(new Date(p.date).getTime() - tMs) <= tolerance;
      });
      if (match) aSupprimer.push(match.id);
    }
    if (aSupprimer.length) await supabase.from("ecriture_financiere").delete().in("id", aSupprimer);

    // Sens du rapprochement : c'est l'ARGENT REÇU qui solde la facture, jamais l'inverse.
    // Chaque entrée importée cherche une facture émise, non réglée, de même montant à
    // ±10 jours ; on la rattache, on la passe en « payée » et on retire sa prévision
    // d'encaissement (le mouvement bancaire la remplace).
    await rapprocherFacturesEncaissees(supabase, items);

    await supabase
      .from("parametres_entreprise")
      .update({ qonto_derniere_sync: new Date().toISOString() })
      .not("id", "is", null);

    revalidatePath("/finance");
    revalidatePath("/finance/journal");
    revalidatePath("/finance/qonto");

    const withAttachment = factureUrls.filter(Boolean).length;
    return { ok: true, count: rows.length, withAttachment };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Récupère depuis Qonto les justificatifs (pièces jointes) des écritures déjà importées
 * qui n'en ont pas encore. Ne touche qu'au champ `facture` des écritures Qonto sans document.
 */
export async function recupererJustificatifsQonto(): Promise<
  { ok: true; ajoutes: number; sansPiece: number } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: ent } = await supabase
      .from("parametres_entreprise")
      .select("qonto_login, qonto_token, qonto_account_slug")
      .limit(1)
      .maybeSingle();
    if (!ent?.qonto_login || !ent?.qonto_token || !ent?.qonto_account_slug) {
      return { ok: false, error: "Identifiants Qonto non configurés (voir Paramètres)." };
    }

    // Écritures Qonto sans justificatif
    const { data: sansDoc } = await supabase
      .from("ecriture_financiere")
      .select("id, qonto_transaction_id")
      .not("qonto_transaction_id", "is", null)
      .is("facture", null);
    const parTxn = new Map<string, string>(); // transaction_id → id écriture
    for (const e of sansDoc ?? []) if (e.qonto_transaction_id) parTxn.set(e.qonto_transaction_id as string, e.id as string);
    if (parTxn.size === 0) return { ok: true, ajoutes: 0, sansPiece: 0 };

    // Retrouve les attachment_ids de ces transactions
    const txs = await fetchQontoTransactions(ent.qonto_login, ent.qonto_token, ent.qonto_account_slug, undefined, true);
    let ajoutes = 0;
    let sansPiece = 0;
    for (const tx of txs) {
      const ecrId = parTxn.get(tx.transaction_id);
      if (!ecrId) continue;
      if (!tx.attachment_ids?.length) { sansPiece++; continue; }
      const path = await uploadQontoAttachment(supabase, ent.qonto_login, ent.qonto_token, tx.attachment_ids[0]);
      if (path) {
        await supabase.from("ecriture_financiere").update({ facture: path }).eq("id", ecrId);
        ajoutes++;
      }
    }
    revalidatePath("/finance/journal");
    revalidatePath("/finance/qonto");
    return { ok: true, ajoutes, sansPiece };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Synchronisation globale : importe les nouvelles transactions Qonto propres
 * (hors doublons et hors "en attente") + récupère les justificatifs manquants,
 * en un seul clic. Ne remplace jamais un justificatif déjà présent.
 */
/**
 * Recale DATE et MONTANT des écritures déjà importées sur ce que dit Qonto.
 *
 * Deux raisons de repasser dessus, la synchro sautant les transactions connues :
 *  — les imports antérieurs découpaient l'horodatage UTC, toute opération réglée
 *    après 22 h UTC portait la veille ;
 *  — une opération importée EN ATTENTE peut changer de montant à son règlement
 *    (autorisation carte, pourboire, frais de change) et gagne alors sa date de
 *    règlement, plus tardive que sa date d'émission.
 */
async function corrigerDonneesQonto(): Promise<number> {
  const supabase = await createClient();
  const { data: ent } = await supabase
    .from("parametres_entreprise")
    .select("qonto_login, qonto_token, qonto_account_slug")
    .limit(1)
    .maybeSingle();
  if (!ent?.qonto_login || !ent?.qonto_token || !ent?.qonto_account_slug) return 0;

  const txs = await fetchQontoTransactions(ent.qonto_login, ent.qonto_token, ent.qonto_account_slug, undefined, true);
  const parId = new Map(txs.map((t) => [t.transaction_id, t]));

  const { data: rows } = await supabase
    .from("ecriture_financiere")
    .select("id, date, montant_ttc, qonto_transaction_id")
    .not("qonto_transaction_id", "is", null);

  let corrigees = 0;
  for (const e of (rows ?? []) as { id: string; date: string; montant_ttc: number; qonto_transaction_id: string }[]) {
    const tx = parId.get(e.qonto_transaction_id);
    if (!tx) continue;
    const patch: { date?: string; montant_ttc?: number } = {};
    const date = dateParis(tx.settled_at ?? tx.emitted_at);
    if (date && date !== e.date) patch.date = date;
    if (Math.round(tx.amount * 100) !== Math.round(Number(e.montant_ttc) * 100)) patch.montant_ttc = tx.amount;
    if (!Object.keys(patch).length) continue;
    await supabase.from("ecriture_financiere").update(patch).eq("id", e.id);
    corrigees++;
  }
  return corrigees;
}

export async function syncGlobal(): Promise<
  { ok: true; importees: number; justificatifs: number; ignoresDoublons: number; datesCorrigees: number } | { ok: false; error: string }
> {
  const prev = await previewQonto();
  if (!prev.ok) return { ok: false, error: prev.error };
  // TOUT ce que la banque connaît entre dans le journal — opérations en attente et
  // ressemblances avec une saisie manuelle comprises. Refuser une transaction, c'était
  // garantir un écart permanent puisque rien ne revenait dessus ensuite.
  const propres = prev.items;
  const ignoresDoublons = 0;
  let importees = 0;
  if (propres.length) {
    const r = await importQontoTransactions(propres);
    if (!r.ok) return { ok: false, error: r.error };
    importees = r.count;
  }
  const j = await recupererJustificatifsQonto();
  const justificatifs = j.ok ? j.ajoutes : 0;
  const datesCorrigees = await corrigerDonneesQonto();
  // Recalcul en sortie : l'écart mémorisé reflète l'état APRÈS import.
  await rapprochementQonto();
  return { ok: true, importees, justificatifs, ignoresDoublons, datesCorrigees };
}


type SupaClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Rapproche les encaissements fraîchement importés des factures émises en attente.
 * Une facture n'est jamais soldée par une saisie manuelle de statut : il faut que
 * l'argent soit arrivé sur le compte.
 */
async function rapprocherFacturesEncaissees(supabase: SupaClient, items: QontoPreviewItem[]) {
  const entrees = items.filter((t) => t.sens === "entree");
  if (!entrees.length) return;

  const { data: facData } = await supabase
    .from("devis_facture")
    .select("id, numero, montant_ttc, date_emission, prestation_id")
    .eq("type", "facture")
    .not("numero", "is", null)
    .or("statut_paiement.is.null,statut_paiement.eq.en_attente");
  const factures = (facData ?? []) as {
    id: string; numero: string | null; montant_ttc: number | null;
    date_emission: string | null; prestation_id: string | null;
  }[];
  if (!factures.length) return;

  const TOL = 10 * 86400000;
  const prises = new Set<string>();

  for (const t of entrees) {
    const cents = Math.round(t.montant * 100);
    const tMs = new Date(t.date).getTime();
    // Une facture n'est encaissée qu'après son émission : on écarte les antérieures.
    const candidates = factures.filter(
      (f) => !prises.has(f.id) &&
        Math.round(Number(f.montant_ttc ?? 0) * 100) === cents &&
        f.date_emission != null &&
        new Date(f.date_emission).getTime() <= tMs + 86400000 &&
        tMs - new Date(f.date_emission).getTime() <= TOL,
    );
    if (!candidates.length) continue;
    // La plus récemment émise avant l'encaissement.
    const fac = candidates.reduce((a, b) =>
      new Date(b.date_emission!).getTime() > new Date(a.date_emission!).getTime() ? b : a);
    prises.add(fac.id);

    const { data: ecr } = await supabase
      .from("ecriture_financiere")
      .select("id")
      .eq("qonto_transaction_id", t.transaction_id)
      .maybeSingle();
    if (!ecr) continue;

    await supabase.from("ecriture_financiere")
      .update({ devis_facture_id: fac.id, prestation_id: fac.prestation_id })
      .eq("id", ecr.id);
    await supabase.from("devis_facture").update({ statut_paiement: "paye" }).eq("id", fac.id);
    // La prévision d'encaissement de cette facture est désormais couverte par le réel.
    await supabase.from("ecriture_financiere")
      .delete().eq("devis_facture_id", fac.id).eq("statut", "previsionnel");
  }
}
