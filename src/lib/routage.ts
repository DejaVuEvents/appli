// Itinéraires routiers : distance, durée, tracé, et présence de péage.
//
// Trois moteurs, essayés dans cet ordre, tous sur données OpenStreetMap :
//   1. Valhalla (valhalla1.openstreetmap.de) — libre, sans clé, et le seul des
//      trois à savoir éviter les péages et à dire si l'itinéraire en comporte ;
//   2. OSRM (router.project-osrm.org) — libre, sans clé, en secours ;
//   3. OpenRouteService — seulement si ORS_API_KEY est présente.
// Aucune clé n'est requise : c'est son absence sur l'hébergement qui faisait
// échouer le calcul en production.
import { chercherAdresses } from "@/lib/adresse";

const BASE = "https://api.openrouteservice.org";

export function orsConfigured(): boolean {
  return !!process.env.ORS_API_KEY;
}

/**
 * Adresse → coordonnées, via la Base Adresse Nationale (gratuite, sans clé).
 * Le géocodage d'OpenRouteService répondait « Géocodage indisponible ».
 */
export async function geocode(text: string): Promise<{ coord: [number, number]; label: string }> {
  const r = await chercherAdresses(text);
  const a = r[0];
  if (!a) throw new Error(`Adresse introuvable : « ${text} ».`);
  return { coord: a.coord, label: a.label };
}

export type OptionsItineraire = {
  /** Écarte autant que possible les sections à péage. */
  eviterPeages?: boolean;
};

export type Itineraire = {
  km: number;
  dureeMin: number;
  /** Tracé en [lon, lat], pour l'afficher sur une carte. */
  trace: [number, number][];
  /** L'itinéraire emprunte au moins une section à péage (inconnu = undefined). */
  peage?: boolean;
  /** Une entrée par tronçon entre deux arrêts consécutifs. */
  segments: { km: number; min: number }[];
};

/* ------------------------------------------------------------------ Valhalla */

/**
 * Décodage du tracé de Valhalla : polyligne encodée Google, mais à 6 décimales
 * (1e-6) et non 5 — un tracé décodé avec la mauvaise précision atterrit à des
 * centaines de kilomètres de sa vraie position.
 */
function decoderPolyligne(encoded: string, precision = 6): [number, number][] {
  const facteur = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0, lat = 0, lon = 0;
  while (index < encoded.length) {
    for (const axe of [0, 1]) {
      let resultat = 0, decalage = 0, octet: number;
      do {
        octet = encoded.charCodeAt(index++) - 63;
        resultat |= (octet & 0x1f) << decalage;
        decalage += 5;
      } while (octet >= 0x20);
      const delta = resultat & 1 ? ~(resultat >> 1) : resultat >> 1;
      if (axe === 0) lat += delta; else lon += delta;
    }
    points.push([lon / facteur, lat / facteur]);
  }
  return points;
}

async function itineraireValhalla(
  coords: [number, number][],
  opts: OptionsItineraire,
): Promise<Itineraire> {
  const r = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: coords.map(([lon, lat]) => ({ lat, lon })),
      costing: "auto",
      // `use_tolls` va de 0 (les fuir) à 1 (les emprunter sans réticence). C'est
      // une pénalité, pas une interdiction : un péage inévitable reste possible,
      // d'où l'intérêt de renvoyer aussi `peage`.
      costing_options: { auto: { use_tolls: opts.eviterPeages ? 0 : 1 } },
      directions_options: { units: "kilometers" },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error("Service d'itinéraire indisponible.");
  const j = await r.json();
  const t = j.trip;
  if (!t?.summary) throw new Error("Itinéraire introuvable entre ces points.");
  const legs = (t.legs ?? []) as { shape: string; summary: { length: number; time: number } }[];
  return {
    km: Math.round(t.summary.length * 10) / 10,
    dureeMin: Math.round(t.summary.time / 60),
    trace: legs.flatMap((l) => decoderPolyligne(l.shape)),
    peage: t.summary.has_toll === true,
    segments: legs.map((l) => ({
      km: Math.round(l.summary.length * 10) / 10,
      min: Math.round(l.summary.time / 60),
    })),
  };
}

/* ---------------------------------------------------------------------- OSRM */

async function itineraireOsrm(coords: [number, number][]): Promise<Itineraire> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${coords.map((c) => `${c[0]},${c[1]}`).join(";")}`
    + `?overview=full&geometries=geojson`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
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

/* ----------------------------------------------------------------------- ORS */

async function itineraireOrs(coords: [number, number][], opts: OptionsItineraire): Promise<Itineraire> {
  if (!orsConfigured()) throw new Error("Calcul d'itinéraire non configuré.");
  const r = await fetch(`${BASE}/v2/directions/driving-car/geojson`, {
    method: "POST",
    headers: { Authorization: process.env.ORS_API_KEY as string, "Content-Type": "application/json" },
    body: JSON.stringify({
      coordinates: coords,
      ...(opts.eviterPeages ? { options: { avoid_features: ["tollways"] } } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error("Calcul d'itinéraire indisponible.");
  const j = await r.json();
  const f = j.features?.[0];
  if (!f) throw new Error("Itinéraire introuvable entre ces points.");
  const sum = f.properties?.summary ?? {};
  const segs = (f.properties?.segments ?? []) as { distance: number; duration: number }[];
  return {
    km: Math.round((sum.distance ?? 0) / 100) / 10,
    dureeMin: Math.round((sum.duration ?? 0) / 60),
    trace: (f.geometry?.coordinates ?? []) as [number, number][],
    segments: segs.map((sg) => ({ km: Math.round(sg.distance / 100) / 10, min: Math.round(sg.duration / 60) })),
  };
}

/* ------------------------------------------------------------------- Façades */

/** Itinéraire entre deux points ou plus, déjà localisés. */
export async function itineraire(
  coords: [number, number][],
  opts: OptionsItineraire = {},
): Promise<Itineraire> {
  if (coords.length < 2) return { km: 0, dureeMin: 0, trace: [], segments: [] };
  const moteurs: (() => Promise<Itineraire>)[] = [
    () => itineraireValhalla(coords, opts),
    // OSRM ne sait pas éviter les péages : on ne s'en sert alors que faute de mieux.
    () => itineraireOsrm(coords),
    () => itineraireOrs(coords, opts),
  ];
  let derniere: unknown;
  for (const moteur of moteurs) {
    try {
      return await moteur();
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere instanceof Error ? derniere : new Error("Calcul d'itinéraire indisponible.");
}

export type Trajet = { km: number; dureeMin: number; departLabel: string; arriveeLabel: string; peage?: boolean };

/** Distance/durée entre deux adresses en texte libre. */
export async function calculerTrajet(
  depart: string,
  arrivee: string,
  opts: OptionsItineraire = {},
): Promise<Trajet> {
  const [a, b] = await Promise.all([geocode(depart), geocode(arrivee)]);
  const r = await itineraire([a.coord, b.coord], opts);
  return { km: r.km, dureeMin: r.dureeMin, departLabel: a.label, arriveeLabel: b.label, peage: r.peage };
}

export type ItineraireMulti = {
  totalKm: number;
  totalMin: number;
  segments: { km: number; min: number }[];
};

/** Itinéraire passant par plusieurs arrêts : total + un segment par tronçon. */
export async function itineraireMulti(coords: [number, number][]): Promise<ItineraireMulti> {
  if (coords.length < 2) return { totalKm: 0, totalMin: 0, segments: [] };
  const r = await itineraire(coords);
  return { totalKm: r.km, totalMin: r.dureeMin, segments: r.segments };
}
