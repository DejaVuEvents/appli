// Lecture Gmail via OAuth (même compte Google que Drive/Agenda).
// Réutilise GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN.
// ⚠️ Le refresh token doit inclure le scope « gmail.readonly » :
//    https://www.googleapis.com/auth/gmail.readonly
// S'il a été généré avant l'ajout de ce scope, relancer scripts/google-oauth-token.mjs.
// Sans ça (ou sans config), tout est no-op (aucune lecture d'email).
import { google } from "googleapis";

export function gmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

function gmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export type GmailMessage = {
  id: string;
  threadId: string;
  date: string; // YYYY-MM-DD
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[];
};

/** En-tête d'un message (insensible à la casse). */
function header(headers: { name?: string | null; value?: string | null }[] | undefined, nom: string): string {
  const h = (headers ?? []).find((x) => (x.name ?? "").toLowerCase() === nom.toLowerCase());
  return h?.value ?? "";
}

/** Décode un corps base64url en texte. */
function decodeBody(data?: string | null): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extraireCorpsEtPJ(payload: any): { text: string; attachments: GmailMessage["attachments"] } {
  let text = "";
  const attachments: GmailMessage["attachments"] = [];
  const walk = (part: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!part) return;
    const mime = part.mimeType ?? "";
    const filename = part.filename ?? "";
    if (filename && part.body?.attachmentId) {
      attachments.push({ attachmentId: part.body.attachmentId, filename, mimeType: mime, size: part.body.size ?? 0 });
    } else if (mime === "text/plain" && part.body?.data) {
      text += decodeBody(part.body.data) + "\n";
    } else if (mime === "text/html" && !text && part.body?.data) {
      text += decodeBody(part.body.data).replace(/<[^>]+>/g, " ") + "\n";
    }
    for (const p of part.parts ?? []) walk(p);
  };
  walk(payload);
  return { text, attachments };
}

/**
 * Recherche des messages Gmail (syntaxe de recherche Gmail, ex.
 * `from:qonto newer_than:1y has:attachment facture`). Renvoie jusqu'à `max` messages
 * complets (en-têtes + corps texte + liste des pièces jointes).
 */
export async function rechercherEmails(query: string, max = 25): Promise<GmailMessage[]> {
  if (!gmailConfigured()) return [];
  const gmail = gmailClient();
  const liste = await gmail.users.messages.list({ userId: "me", q: query, maxResults: max });
  const ids = (liste.data.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
  const out: GmailMessage[] = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const headers = msg.data.payload?.headers ?? undefined;
    const { text, attachments } = extraireCorpsEtPJ(msg.data.payload);
    const dateMs = Number(msg.data.internalDate ?? 0);
    out.push({
      id,
      threadId: msg.data.threadId ?? "",
      date: dateMs ? new Date(dateMs).toISOString().slice(0, 10) : "",
      from: header(headers, "From"),
      subject: header(headers, "Subject"),
      snippet: msg.data.snippet ?? "",
      bodyText: text || (msg.data.snippet ?? ""),
      attachments,
    });
  }
  return out;
}

/** Télécharge une pièce jointe (bytes) d'un message. */
export async function telechargerPieceJointe(messageId: string, attachmentId: string): Promise<Buffer | null> {
  if (!gmailConfigured()) return null;
  const gmail = gmailClient();
  const att = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
  const data = att.data.data;
  if (!data) return null;
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
