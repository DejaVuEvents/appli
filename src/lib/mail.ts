// Envoi d'e-mails depuis l'adresse de l'association, via l'API Gmail.
//
// Réutilise l'OAuth Google déjà en place pour Drive / Agenda
// (GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN) : pas de service tiers,
// pas de domaine à faire vérifier, et les messages atterrissent dans les
// « Envoyés » du compte — donc traçables.
//
// ⚠️ Le refresh token doit inclure le scope « gmail.send » :
//    https://www.googleapis.com/auth/gmail.send
// Celui généré pour Drive/Agenda/gmail.readonly ne l'a pas : relancer
// scripts/google-oauth-token.mjs, puis mettre à jour GOOGLE_OAUTH_REFRESH_TOKEN
// en local ET sur Vercel. Sans ça, l'envoi est un no-op silencieux : l'action
// métier (soumettre une note, par exemple) ne doit jamais échouer à cause du mail.
import { google } from "googleapis";

export function mailConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

/** Base publique du site, pour les liens cliquables dans les mails. */
export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/** En-tête non-ASCII : encodage RFC 2047, sinon les accents arrivent en mojibake. */
function encoderEntete(v: string): string {
  return /^[\x20-\x7e]*$/.test(v)
    ? v
    : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

/**
 * Envoie un e-mail texte. Renvoie le nombre de destinataires servis (0 si l'envoi
 * est impossible), sans jamais lever : un mail raté ne doit pas annuler l'action
 * qui l'a déclenché.
 */
export async function envoyerMail({
  to,
  sujet,
  corps,
}: {
  to: string[];
  sujet: string;
  corps: string;
}): Promise<number> {
  const destinataires = [...new Set(to.map((e) => e.trim()).filter(Boolean))];
  if (!destinataires.length || !mailConfigured()) return 0;

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    const message = [
      `To: ${destinataires.join(", ")}`,
      `Subject: ${encoderEntete(sujet)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(corps, "utf8").toString("base64"),
    ].join("\r\n");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: Buffer.from(message, "utf8").toString("base64url"),
      },
    });
    return destinataires.length;
  } catch (e) {
    // Scope manquant, quota, réseau : on trace et on continue.
    console.error("[mail] envoi impossible :", e instanceof Error ? e.message : e);
    return 0;
  }
}
