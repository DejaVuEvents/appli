// Itinéraires routiers via OpenRouteService (distance, durée, tracé).
// Le géocodage passe par la Base Adresse Nationale (voir `geocode` plus bas).
// Nécessite ORS_API_KEY (clé gratuite openrouteservice.org).

import { chercherAdresses } from "@/lib/adresse";

const BASE = "https://api.openrouteservice.org";

export function orsConfigured(): boolean {
  return !!process.env.ORS_API_KEY;
}

/**
 * Adresse → coordonnées.
 *
 * Passe par la Base Adresse Nationale (api-adresse.data.gouv.fr) : gratuite, sans
 * clé, et surtout disponible — le géocodage d'OpenRouteService répondait « Géocodage
 * indisponible » en production. ORS reste utilisé pour le calcul d'itinéraire, qui
 * n'a besoin que de coordonnées.
 */
export async function geocode(text: string): Promise<{ coord: [number, number]; label: string }> {
  const r = await chercherAdresses(text);
  const a = r[0];
  if (!a) throw new Error(`Adresse introuvable : « ${text} ».`);
  return { coord: a.coord, label: a.label };
}

export type Trajet = { km: number; dureeMin: number; departLabel: string; arriveeLabel: string };

/** Distance/durée routière entre deux adresses (texte libre). */
export async function calculerTrajet(depart: string, arrivee: string): Promise<Trajet> {
  const [a, b] = await Promise.all([geocode(depart), geocode(arrivee)]);
  const r = await itineraireTrace(a.coord, b.coord);
  return { km: r.km, dureeMin: r.dureeMin, departLabel: a.label, arriveeLabel: b.label };
}

export type ItineraireMulti = {
  totalKm: number;
  totalMin: number;
  segments: { km: number; min: number }[]; // un segment par trajet entre 2 arrêts consécutifs
};

/** Itinéraire passant par plusieurs points (>=2) en une seule requête : total + segments. */
export async function itineraireMulti(coords: [number, number][]): Promise<ItineraireMulti> {
  if (coords.length < 2) return { totalKm: 0, totalMin: 0, segments: [] };
  // Même logique que pour un trajet simple : OSRM sans clé d'abord.
  const r = await itineraireOsrm(coords);
  return { totalKm: r.km, totalMin: r.dureeMin, segments: r.segments };
}

export type ItineraireTrace = {
  km: number;
  dureeMin: number;
  /** Tracé de la route en [lon, lat], pour l'afficher sur une carte. */
  trace: [number, number][];
};

const pt = (c: [number, number]) => `${c[0]},${c[1]}`;

/**
 * Itinéraire routier via OSRM (router.project-osrm.org) : libre, sans clé, donc
 * disponible en production sans variable d'environnement à configurer — c'est
 * l'absence de ORS_API_KEY sur l'hébergement qui faisait échouer le calcul.
 */
async function itineraireOsrm(coords: [number, number][]): Promise<ItineraireTrace & { segments: { km: number; min: number }[] }> {
  const url = `https://router.project-osrm.org/route/v1/driving/${coords.map(pt).join(";")}`
    + `?overview=full&geometries=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Service d'itinéraire indisponible.");
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) throw new Error("Itinéraire introuvable entre ces points.");
  return {
    km: Math.round(route.distance / 100) / 10,
    dureeMin: Math.round(route.duration / 60),
    trace: (route.geometry?.coordinates ?? []) as [number, number][],
    segments: (route.legs ?? []).map((l: { distance: number; duration: number }) => ({
      km: Math.round(l.distance / 100) / 10,
      min: Math.round(l.duration / 60),
    })),
  };
}

/** Même calcul via OpenRouteService — utilisé en secours si une clé est présente. */
async function itineraireOrs(coords: [number, number][]): Promise<ItineraireTrace> {
  if (!orsConfigured()) throw new Error("Calcul d'itinéraire non configuré.");
  const r = await fetch(`${BASE}/v2/directions/driving-car/geojson`, {
    method: "POST",
    headers: { Authorization: process.env.ORS_API_KEY as string, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: coords }),
  });
  if (!r.ok) throw new Error("Calcul d'itinéraire indisponible.");
  const j = await r.json();
  const f = j.features?.[0];
  if (!f) throw new Error("Itinéraire introuvable entre ces deux points.");
  const sum = f.properties?.summary ?? {};
  return {
    km: Math.round((sum.distance ?? 0) / 100) / 10,
    dureeMin: Math.round((sum.duration ?? 0) / 60),
    trace: (f.geometry?.coordinates ?? []) as [number, number][],
  };
}

/**
 * Itinéraire routier entre deux points déjà localisés, avec son tracé.
 * OSRM en premier (sans clé), ORS en secours : une panne de l'un ne doit pas
 * renvoyer l'utilisateur vers une saisie manuelle de la distance.
 */
export async function itineraireTrace(
  a: [number, number],
  b: [number, number],
): Promise<ItineraireTrace> {
  try {
    return await itineraireOsrm([a, b]);
  } catch (e) {
    try {
      return await itineraireOrs([a, b]);
    } catch {
      throw e;
    }
  }
}
