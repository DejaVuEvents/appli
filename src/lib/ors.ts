// Calcul d'itinéraire via OpenRouteService (géocodage + distance routière).
// Sert à estimer le coût de déplacement (véhicule perso) pour les notes de frais.
// Nécessite ORS_API_KEY (clé gratuite openrouteservice.org). No-op si absente.

const BASE = "https://api.openrouteservice.org";

export function orsConfigured(): boolean {
  return !!process.env.ORS_API_KEY;
}

export async function geocode(text: string): Promise<{ coord: [number, number]; label: string }> {
  const key = process.env.ORS_API_KEY as string;
  const url = `${BASE}/geocode/search?api_key=${key}&text=${encodeURIComponent(text)}&size=1&boundary.country=FR`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Géocodage indisponible.");
  const j = await r.json();
  const f = j.features?.[0];
  if (!f) throw new Error(`Adresse introuvable : « ${text} ».`);
  return { coord: f.geometry.coordinates as [number, number], label: f.properties.label as string };
}

export type Trajet = { km: number; dureeMin: number; departLabel: string; arriveeLabel: string };

/** Distance/durée routière entre deux adresses (texte libre). */
export async function calculerTrajet(depart: string, arrivee: string): Promise<Trajet> {
  if (!orsConfigured()) throw new Error("Calcul d'itinéraire non configuré (clé OpenRouteService manquante).");
  const [a, b] = await Promise.all([geocode(depart), geocode(arrivee)]);
  const r = await fetch(`${BASE}/v2/directions/driving-car`, {
    method: "POST",
    headers: { Authorization: process.env.ORS_API_KEY as string, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: [a.coord, b.coord] }),
  });
  if (!r.ok) throw new Error("Calcul d'itinéraire indisponible.");
  const j = await r.json();
  const sum = j.routes?.[0]?.summary;
  if (!sum) throw new Error("Itinéraire introuvable entre ces deux adresses.");
  return {
    km: Math.round((sum.distance / 1000) * 10) / 10,
    dureeMin: Math.round(sum.duration / 60),
    departLabel: a.label,
    arriveeLabel: b.label,
  };
}

export type ItineraireMulti = {
  totalKm: number;
  totalMin: number;
  segments: { km: number; min: number }[]; // un segment par trajet entre 2 arrêts consécutifs
};

/** Itinéraire passant par plusieurs points (>=2) en une seule requête : total + segments. */
export async function itineraireMulti(coords: [number, number][]): Promise<ItineraireMulti> {
  if (!orsConfigured()) throw new Error("Itinéraire non configuré (clé OpenRouteService manquante).");
  if (coords.length < 2) return { totalKm: 0, totalMin: 0, segments: [] };
  const r = await fetch(`${BASE}/v2/directions/driving-car`, {
    method: "POST",
    headers: { Authorization: process.env.ORS_API_KEY as string, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: coords }),
  });
  if (!r.ok) throw new Error("Calcul d'itinéraire indisponible.");
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) throw new Error("Itinéraire introuvable.");
  const segments = (route.segments ?? []).map((s: { distance: number; duration: number }) => ({
    km: Math.round((s.distance / 1000) * 10) / 10,
    min: Math.round(s.duration / 60),
  }));
  return {
    totalKm: Math.round((route.summary.distance / 1000) * 10) / 10,
    totalMin: Math.round(route.summary.duration / 60),
    segments,
  };
}
