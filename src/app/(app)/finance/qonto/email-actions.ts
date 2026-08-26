"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { gmailConfigured, rechercherEmails, telechargerPieceJointe, type GmailMessage } from "@/lib/gmail";
import { BUCKET_PRIVE } from "@/lib/storage";

export type FactureEmailCandidat = {
  ecritureId: string;
  denomination: string;
  montant: number;
  dateEcriture: string;
  messageId: string;
  attachmentId: string;
  filename: string;
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
};

// Mots à ignorer pour deviner le fournisseur depuis un libellé bancaire.
const BRUIT = new Set(["carte", "paiement", "cb", "sarl", "sas", "eurl", "www", "sav", "the", "sp", "de", "du", "des", "la", "le", "les"]);

/** Devine un mot-clé « fournisseur » à partir du libellé d'une écriture. */
function motVendeur(denomination: string | null): string | null {
  const tokens = (denomination ?? "")
    .toLowerCase()
    .replace(/[*].*$/, " ") // « FACEBK *RFFB… » → « facebk »
    .replace(/[^a-zàâäéèêëîïôöùûüç ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !BRUIT.has(t));
  return tokens[0] ?? null;
}

const RE_FACTURE = /facture|invoice|re[çc]u|receipt|\bre_|rechnung|quittance/i;
const RE_PASFACTURE = /devis|quote|cgv|conditions|expédition|shipping|newsletter|confirmation de commande/i;

/** Choisit la meilleure pièce jointe PDF « facture » d'un ensemble d'emails, proche d'une date. */
function meilleurCandidat(emails: GmailMessage[], dateEcr: string): { m: GmailMessage; att: GmailMessage["attachments"][0] } | null {
  const tEcr = new Date(dateEcr).getTime();
  let best: { m: GmailMessage; att: GmailMessage["attachments"][0]; dist: number } | null = null;
  for (const m of emails) {
    const looksFacture = RE_FACTURE.test(m.subject) || RE_FACTURE.test(m.snippet);
    const looksNot = RE_PASFACTURE.test(m.subject);
    for (const att of m.attachments) {
      const isPdf = att.mimeType === "application/pdf" || /\.pdf$/i.test(att.filename);
      if (!isPdf) continue;
      const attFacture = RE_FACTURE.test(att.filename);
      const attNot = RE_PASFACTURE.test(att.filename);
      // Garde si l'email OU la pièce jointe ressemble à une facture, et pas clairement un devis.
      if ((!looksFacture && !attFacture) || attNot || (looksNot && !attFacture)) continue;
      const dist = Math.abs(new Date(m.date || dateEcr).getTime() - tEcr);
      if (!best || dist < best.dist) best = { m, att, dist };
    }
  }
  return best ? { m: best.m, att: best.att } : null;
}

/**
 * Propose des factures reçues (PDF joints dans les emails) à rattacher aux écritures
 * de sortie sans justificatif. Lecture seule : ne modifie rien.
 */
export async function previewFacturesEmail(): Promise<
  { ok: true; candidats: FactureEmailCandidat[]; scannees: number; sansMatch: number } | { ok: false; error: string }
> {
  try {
    if (!gmailConfigured()) return { ok: false, error: "Accès Gmail non configuré (voir Paramètres / token Google)." };
    const supabase = await createClient();
    const { data } = await supabase
      .from("ecriture_financiere")
      .select("id, denomination, montant_ttc, date")
      .eq("sens", "sortie")
      .eq("statut", "reel")
      .is("facture", null)
      .order("date", { ascending: false })
      .limit(50);
    const sorties = (data ?? []) as { id: string; denomination: string | null; montant_ttc: number; date: string }[];
    // Exclut celles ayant déjà un justificatif (table justificatif)
    const ids = sorties.map((s) => s.id);
    const { data: jData } = ids.length
      ? await supabase.from("justificatif").select("ecriture_id").in("ecriture_id", ids)
      : { data: [] };
    const avecJustif = new Set((jData ?? []).map((j) => j.ecriture_id as string));

    const candidats: FactureEmailCandidat[] = [];
    let sansMatch = 0;
    let scannees = 0;
    const cache = new Map<string, GmailMessage[]>();
    for (const e of sorties) {
      if (avecJustif.has(e.id)) continue;
      const vendor = motVendeur(e.denomination);
      if (!vendor) { sansMatch++; continue; }
      scannees++;
      let emails = cache.get(vendor);
      if (!emails) {
        emails = await rechercherEmails(`${vendor} has:attachment newer_than:1y`, 5);
        cache.set(vendor, emails);
      }
      const best = meilleurCandidat(emails, e.date);
      if (!best) { sansMatch++; continue; }
      candidats.push({
        ecritureId: e.id, denomination: e.denomination ?? "—", montant: Number(e.montant_ttc), dateEcriture: e.date,
        messageId: best.m.id, attachmentId: best.att.attachmentId, filename: best.att.filename,
        emailFrom: best.m.from, emailSubject: best.m.subject, emailDate: best.m.date,
      });
    }
    return { ok: true, candidats, scannees, sansMatch };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Rattache les factures email sélectionnées aux écritures (n'écrase jamais un document existant). */
export async function attacherFacturesEmail(
  sel: { ecritureId: string; messageId: string; attachmentId: string; filename: string }[],
): Promise<{ ok: true; rattachees: number } | { ok: false; error: string }> {
  try {
    if (!gmailConfigured()) return { ok: false, error: "Accès Gmail non configuré." };
    const supabase = await createClient();
    let rattachees = 0;
    for (const s of sel) {
      // Ne pas écraser un document déjà présent.
      const { data: ecr } = await supabase.from("ecriture_financiere").select("id, facture").eq("id", s.ecritureId).maybeSingle();
      if (!ecr || ecr.facture) continue;
      const buf = await telechargerPieceJointe(s.messageId, s.attachmentId);
      if (!buf) continue;
      const ext = (s.filename.split(".").pop() || "pdf").toLowerCase();
      const path = `email-${s.messageId}-${s.attachmentId}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, "");
      const { data: up, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, buf, {
        contentType: ext === "pdf" ? "application/pdf" : "application/octet-stream",
        upsert: true,
      });
      if (error || !up) continue;
      await supabase.from("ecriture_financiere").update({ facture: up.path }).eq("id", s.ecritureId).is("facture", null);
      rattachees++;
    }
    revalidatePath("/finance/journal");
    revalidatePath("/finance/qonto");
    return { ok: true, rattachees };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
