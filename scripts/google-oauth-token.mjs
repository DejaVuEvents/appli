// Obtention (une seule fois) du refresh token Google pour l'archivage Drive
// ET la synchronisation Google Agenda / Meet des réunions.
//
// Prérequis Google Cloud (projet deja-vu-500820) :
//   1. APIs & Services → activer « Google Drive API », « Google Calendar API »
//      ET « Gmail API » (pour lire les factures reçues + emails Qonto).
//   2. OAuth consent screen (= « Data Access » dans la nouvelle UI) → ajouter les scopes
//      drive.file, calendar.events et gmail.readonly ; Audience = External → « Publish app ».
//   3. Credentials → Create OAuth client ID → type « Desktop app ».
//
// ⚠️ Après ajout de gmail.readonly : RE-LANCER ce script pour régénérer le refresh token
//    (l'ancien n'a pas le scope Gmail), puis mettre à jour GOOGLE_OAUTH_REFRESH_TOKEN
//    en local ET sur Vercel (Environment Variables), et redéployer.
//
// Les identifiants (CLIENT_ID / CLIENT_SECRET) sont lus depuis .env.local
// (ou depuis les variables d'environnement). Lancement simple :
//   node scripts/google-oauth-token.mjs
//
// Un navigateur s'ouvre → connecte-toi avec vudeja.events → Autoriser.
// Le script écrit alors GOOGLE_OAUTH_REFRESH_TOKEN dans .env.local et l'affiche.
import http from "http";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { exec } from "child_process";

const ENV_PATH = path.join(process.cwd(), ".env.local");

function readEnvLocal() {
  const out = {};
  try {
    for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* pas de .env.local : pas grave */
  }
  return out;
}

const env = readEnvLocal();
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Manque GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (dans .env.local ou en variables d'env).");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/drive.file",        // archivage Drive
    "https://www.googleapis.com/auth/calendar.events",   // réunions Google Agenda + Meet
    "https://www.googleapis.com/auth/gmail.readonly",    // lecture factures reçues + emails Qonto (prévisions)
  ],
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Pas de code.");
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    const refresh = tokens.refresh_token;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>✅ C'est bon, tu peux fermer cet onglet et revenir au terminal.</h2>");

    if (refresh) {
      // Écrit / met à jour les 3 variables dans .env.local
      let content = "";
      try { content = fs.readFileSync(ENV_PATH, "utf8"); } catch {}
      const set = (c, k, v) => {
        const re = new RegExp(`^${k}=.*$`, "m");
        return re.test(c) ? c.replace(re, `${k}=${v}`) : c.replace(/\n*$/, "\n") + `${k}=${v}\n`;
      };
      content = set(content, "GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID);
      content = set(content, "GOOGLE_OAUTH_CLIENT_SECRET", CLIENT_SECRET);
      content = set(content, "GOOGLE_OAUTH_REFRESH_TOKEN", refresh);
      fs.writeFileSync(ENV_PATH, content);
      console.log("\n✅ .env.local mis à jour (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN).");
    }

    console.log("\n=== À copier dans Vercel (Settings → Environment Variables) ===");
    console.log("GOOGLE_OAUTH_CLIENT_ID=" + CLIENT_ID);
    console.log("GOOGLE_OAUTH_CLIENT_SECRET=" + CLIENT_SECRET);
    console.log("GOOGLE_OAUTH_REFRESH_TOKEN=" + (refresh || "(non reçu — relance avec prompt consent)"));
    console.log("==============================================================\n");
  } catch (e) {
    res.writeHead(500).end("Erreur: " + e.message);
    console.error(e.message);
  } finally {
    setTimeout(() => server.close(), 500);
  }
});

server.listen(PORT, () => {
  console.log("Ouvre cette URL si le navigateur ne s'ouvre pas seul :\n" + url + "\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${url}"`);
});
