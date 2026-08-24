"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchQontoTransactions, fetchQontoAttachment, fetchQontoOrg, mapQontoCategorie } from "@/lib/qonto";
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

    // 2. Écritures manuelles/Excel → détection de doublon TOLÉRANTE AUX DATES.
    // Le règlement Qonto tombe souvent 1-2 jours après la saisie manuelle : on flague
    // comme doublon toute transaction de même montant+sens à ±5 jours d'une écriture existante.
    const { data: manualEntries } = await supabase
      .from("ecriture_financiere")
      .select("date, montant_ttc, sens")
      .is("qonto_transaction_id", null)
      .eq("statut", "reel");

    // Index : "montantCents|sens" -> liste des dates (ms)
    const manualIdx = new Map<string, number[]>();
    for (const e of manualEntries ?? []) {
      const k = `${Math.round(Number(e.montant_ttc) * 100)}|${e.sens}`;
      if (!manualIdx.has(k)) manualIdx.set(k, []);
      manualIdx.get(k)!.push(new Date(e.date).getTime());
    }
    const TOLERANCE_MS = 5 * 24 * 60 * 60 * 1000;
    const estDoublon = (date: string, amount: number, sens: string): boolean => {
      const dates = manualIdx.get(`${Math.round(amount * 100)}|${sens}`);
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
        const date = (t.settled_at ?? t.emitted_at ?? "").slice(0, 10);
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
    const compte = org.bank_accounts.find((a) => a.slug === ent.qonto_account_slug);
    const balanceQonto = compte?.balance ?? org.bank_accounts[0]?.balance ?? 0;

    // Transactions Qonto depuis la date du solde initial
    const txs = (await fetchQontoTransactions(ent.qonto_login, ent.qonto_token, ent.qonto_account_slug, `${baseline}T00:00:00.000Z`))
      .filter((t) => (t.settled_at ?? "").slice(0, 10) >= baseline);

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
      const date = (tx.settled_at ?? tx.emitted_at ?? "").slice(0, 10);
      const cents = Math.round(tx.amount * 100);
      const t = new Date(date).getTime();
      const jumeau = manuels.find((m) => !m.used && m.sens === sens && m.cents === cents && Math.abs(m.t - t) <= TOL);
      if (jumeau) { jumeau.used = true; continue; } // correspond à une saisie manuelle
      const cat = mapQontoCategorie(tx.side, tx.cashflow_category?.name ?? null, tx.cashflow_subcategory?.name ?? null, tx.label);
      manquantes.push({
        transaction_id: tx.transaction_id, date, label: tx.label, montant: tx.amount, sens,
        type: cat.type, specification: cat.specification, reference: tx.reference,
        cashflow_cat: tx.cashflow_category?.name ?? null, cashflow_sub: tx.cashflow_subcategory?.name ?? null,
        doublon: false, pending: false, attachment_ids: tx.attachment_ids ?? [],
      });
    }
    const enTrop = manuels
      .filter((m) => !m.used)
      .map((m) => ({ id: m.id, date: m.date, denomination: m.denomination ?? "—", montant: Number(m.montant_ttc), sens: m.sens }));

    const netManquantes = r2(manquantes.reduce((s, m) => s + (m.sens === "entree" ? m.montant : -m.montant), 0));
    const netEnTrop = r2(enTrop.reduce((s, m) => s + (m.sens === "entree" ? m.montant : -m.montant), 0));
    // Après import des manquantes et retrait des « en trop », l'écart résiduel = solde initial mal calé.
    const ajustementBaseline = r2(ecart - (netManquantes - netEnTrop));

    return {
      ok: true, balanceQonto, soldeOutil, ecart, manquantes, enTrop,
      netManquantes, netEnTrop, ajustementBaseline, soldeInitial, soldeInitialDate: ent.solde_initial_date ?? null,
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
