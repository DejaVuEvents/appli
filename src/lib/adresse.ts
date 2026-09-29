/**
 * Recherche d'adresses via l'API Adresse (Base Adresse Nationale, data.gouv.fr).
 *
 * Gratuite, sans clé, et interrogeable directement depuis le navigateur (CORS
 * ouvert) : les suggestions s'affichent pendant la frappe sans aller-retour serveur.
 * Elle remplace le géocodage d'OpenRouteService, qui répondait « Géocodage
 * indisponible » en production ; ORS ne sert plus qu'à tracer l'itinéraire entre
 * deux points déjà localisés.
 */
export type Adresse = {
  label: string;
  /** Coordonnées [longitude, latitude] — l'ordre attendu par ORS et GeoJSON. */
  coord: [number, number];
};

export async function chercherAdresses(q: string, signal?: AbortSignal): Promise<Adresse[]> {
  if (q.trim().length < 3) return [];
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6&autocomplete=1`;
  // L'API limite le débit : un 429 renvoyait une liste vide, donc « adresse
  // introuvable » pour une adresse parfaitement valide. On réessaie une fois.
  for (let essai = 0; essai < 2; essai++) {
    const r = await fetch(url, { signal });
    if (r.ok) {
      const j = (await r.json()) as {
        features?: { geometry: { coordinates: [number, number] }; properties: { label: string } }[];
      };
      return (j.features ?? []).map((f) => ({ label: f.properties.label, coord: f.geometry.coordinates }));
    }
    if (r.status !== 429 && r.status < 500) return [];
    await new Promise((ok) => setTimeout(ok, 400));
  }
  return [];
}
