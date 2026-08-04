/**
 * Liens vers un relevé d'itinéraire, servant de justificatif légal des frais
 * kilométriques (l'URSSAF accepte un relevé Mappy / ViaMichelin / Google Maps).
 */
export function mappyUrl(depart: string, arrivee: string): string {
  const from = encodeURIComponent(depart);
  const to = encodeURIComponent(arrivee);
  return `https://fr.mappy.com/itineraire#/route?from=${from}&to=${to}`;
}

export function googleMapsUrl(depart: string, arrivee: string): string {
  const params = new URLSearchParams({
    api: "1",
    origin: depart,
    destination: arrivee,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
