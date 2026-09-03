import { readFile } from "fs/promises";
import path from "path";

/**
 * Source d'image exploitable par le moteur PDF. Un chemin relatif (ex. « /logo.png »)
 * doit être résolu : d'abord dans public/, sinon via l'URL absolue du déploiement.
 * Partagé par tous les documents générés (devis, facture, note de frais).
 */
export async function resoudreLogo(logo: string | null | undefined): Promise<string | Buffer | null> {
  if (!logo) return null;
  if (logo.startsWith("data:") || /^https?:\/\//i.test(logo)) return logo;
  if (logo.startsWith("/")) {
    try {
      return await readFile(path.join(process.cwd(), "public", logo.replace(/^\//, "")));
    } catch {
      const base = process.env.NEXT_PUBLIC_SITE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      return base ? `${base}${logo}` : null;
    }
  }
  return logo;
}
