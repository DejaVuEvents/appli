// Archivage Google Drive via OAuth (compte Google de Déjà Vu).
//
// Pourquoi OAuth et pas un compte de service : un compte de service n'a pas de
// quota de stockage et ne peut écrire que dans un « Drive partagé » (Google Workspace,
// payant). Avec un Gmail gratuit, on passe par OAuth : l'app agit au nom du compte,
// avec le périmètre `drive.file` (non sensible → pas de validation Google, jeton durable).
//
// Sans configuration (variables d'env absentes), tout est no-op : l'app marche sans Drive.
//
// Variables d'environnement attendues (Vercel + .env.local) :
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN     (obtenu une fois via scripts/google-oauth-token.mjs)
//   GOOGLE_DRIVE_ARCHIVE_NAME      (optionnel, défaut « Déjà Vu — Archives »)
import { google } from "googleapis";
import { Readable } from "stream";

const ARCHIVE_ROOT = process.env.GOOGLE_DRIVE_ARCHIVE_NAME || "Déjà Vu — Archives";

export function driveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function getDrive() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth: oauth2 });
}

type Drive = ReturnType<typeof getDrive>;

/** Trouve (ou crée) un sous-dossier par nom sous un parent (ou la racine si parentId null). */
async function ensureFolder(drive: Drive, parentId: string | null, name: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `${parentClause} and name = '${safe}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: "files(id)", spaces: "drive" });
  const found = res.data.files?.[0]?.id;
  if (found) return found;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });
  return created.data.id as string;
}

/** Téléverse un fichier sous « Déjà Vu — Archives / <dossier...> ». Renvoie le lien (ou null). */
export async function archiverSurDrive(opts: {
  dossier: string[];
  nom: string;
  mimeType: string;
  data: Buffer;
}): Promise<string | null> {
  if (!driveConfigured()) return null;
  try {
    const drive = getDrive();
    let parent = await ensureFolder(drive, null, ARCHIVE_ROOT);
    for (const seg of opts.dossier) parent = await ensureFolder(drive, parent, seg);
    const res = await drive.files.create({
      requestBody: { name: opts.nom, parents: [parent] },
      media: { mimeType: opts.mimeType, body: Readable.from(opts.data) },
      fields: "id, webViewLink",
    });
    return res.data.webViewLink ?? res.data.id ?? null;
  } catch (e) {
    console.error("Drive — échec d'archivage:", (e as Error).message);
    return null; // best-effort : on ne bloque jamais l'action métier
  }
}

/** Récupère un fichier depuis une URL (storage Supabase) et l'archive sur Drive. */
export async function archiverDepuisUrl(url: string | null, dossier: string[], nom: string): Promise<string | null> {
  if (!driveConfigured() || !url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = Buffer.from(await resp.arrayBuffer());
    const mimeType = resp.headers.get("content-type") || "application/octet-stream";
    return archiverSurDrive({ dossier, nom, mimeType, data });
  } catch (e) {
    console.error("Drive — échec récupération fichier:", (e as Error).message);
    return null;
  }
}

/** Nettoie une chaîne pour en faire un nom de fichier/dossier Drive sûr. */
export function nomFichierSafe(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
}
