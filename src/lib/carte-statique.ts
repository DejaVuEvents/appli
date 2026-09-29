/**
 * Fabrication d'une carte « figée » à partir des tuiles OpenStreetMap, pour le
 * justificatif d'itinéraire en PDF : on ne peut pas y embarquer une carte
 * interactive, et aucun service gratuit de carte statique n'est fiable. On
 * télécharge donc les tuiles utiles et on les assemble à la mise en page.
 */
const TUILE = 256;

export type CarteStatique = {
  largeur: number;
  hauteur: number;
  /** Tuiles à poser, avec leur position en pixels dans l'image finale. */
  tuiles: { data: Buffer; x: number; y: number }[];
  /** Projette une coordonnée [lon, lat] en pixels de l'image. */
  enPixels: (c: [number, number]) => { x: number; y: number };
  attribution: string;
};

const projX = (lon: number, monde: number) => ((lon + 180) / 360) * monde;
const projY = (lat: number, monde: number) => {
  const phi = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * monde;
};

/**
 * Télécharge et positionne les tuiles couvrant `points`.
 * Renvoie null si les tuiles ne sont pas accessibles : le justificatif doit rester
 * produisible sans carte plutôt que d'échouer.
 */
export async function carteStatique(
  points: [number, number][],
  largeur = 520,
  hauteur = 300,
): Promise<CarteStatique | null> {
  if (points.length === 0) return null;

  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const bbox = {
    ouest: Math.min(...lons), est: Math.max(...lons),
    sud: Math.min(...lats), nord: Math.max(...lats),
  };

  // Plus grand zoom pour lequel la course tient dans l'image, marge comprise.
  let zoom = 18;
  for (; zoom > 1; zoom--) {
    const monde = TUILE * 2 ** zoom;
    const dx = projX(bbox.est, monde) - projX(bbox.ouest, monde);
    const dy = projY(bbox.sud, monde) - projY(bbox.nord, monde);
    if (dx <= largeur - 40 && dy <= hauteur - 40) break;
  }

  const monde = TUILE * 2 ** zoom;
  const centreX = (projX(bbox.ouest, monde) + projX(bbox.est, monde)) / 2;
  const centreY = (projY(bbox.nord, monde) + projY(bbox.sud, monde)) / 2;
  const gauche = centreX - largeur / 2;
  const haut = centreY - hauteur / 2;

  const tx0 = Math.floor(gauche / TUILE);
  const tx1 = Math.floor((gauche + largeur) / TUILE);
  const ty0 = Math.floor(haut / TUILE);
  const ty1 = Math.floor((haut + hauteur) / TUILE);
  const max = 2 ** zoom;

  const aTelecharger: { tx: number; ty: number }[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= max) continue;
      aTelecharger.push({ tx, ty });
    }
  }
  // Garde-fou : une poignée de tuiles par justificatif, pas un aspirateur.
  if (aTelecharger.length > 24) return null;

  const tuiles = await Promise.all(
    aTelecharger.map(async ({ tx, ty }) => {
      const txMod = ((tx % max) + max) % max;
      const r = await fetch(`https://tile.openstreetmap.org/${zoom}/${txMod}/${ty}.png`, {
        // Politique d'usage d'OSM : une application identifiable, pas de scraping.
        headers: { "User-Agent": "DejaVu-Gestion/1.0 (justificatif de trajet)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`tuile ${zoom}/${txMod}/${ty}`);
      return {
        data: Buffer.from(await r.arrayBuffer()),
        x: tx * TUILE - gauche,
        y: ty * TUILE - haut,
      };
    }),
  ).catch(() => null);
  if (!tuiles) return null;

  return {
    largeur,
    hauteur,
    tuiles,
    enPixels: (c) => ({ x: projX(c[0], monde) - gauche, y: projY(c[1], monde) - haut }),
    attribution: "© OpenStreetMap",
  };
}
