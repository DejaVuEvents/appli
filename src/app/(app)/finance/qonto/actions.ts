"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchQontoTransactions, fetchQontoAttachment, mapQontoCategorie } from "@/lib/qonto";
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

    // 3. Fetch Qonto
    const txs: QontoTransaction[] = await fetchQontoTransactions(
      ent.qonto_login,
      ent.qonto_token,
      ent.qonto_account_slug,
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
        const date = t.settled_at.slice(0, 10);
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
          attachment_ids: t.attachment_ids ?? [],
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return { ok: true, items, compte: ent.qonto_account_slug };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
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
