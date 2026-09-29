"use client";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export type PointCarte = { coord: [number, number]; label: string };

/**
 * Carte du trajet : les deux points choisis et, quand il est connu, le tracé routier.
 *
 * Leaflet + fonds OpenStreetMap : gratuit et sans clé. Chargé dynamiquement côté
 * navigateur — la bibliothèque touche à `window` dès l'import et casserait le rendu
 * serveur. Les marqueurs sont des `divIcon` en HTML : les icônes PNG par défaut de
 * Leaflet se résolvent par des chemins que le bundler ne sait pas réécrire.
 */
export function CarteTrajet({
  depart,
  arrivee,
  trace,
}: {
  depart: PointCarte | null;
  arrivee: PointCarte | null;
  trace: [number, number][] | null;
}) {
  const hote = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const couche = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const Lf = (await import("leaflet")).default;
      if (!vivant || !hote.current) return;

      if (!carte.current) {
        carte.current = Lf.map(hote.current, {
          attributionControl: true,
          zoomControl: true,
          // La carte vit dans une modale qui défile : la molette doit faire défiler
          // le formulaire, pas zoomer. Le zoom reste aux boutons et au double-clic.
          scrollWheelZoom: false,
        })
          .setView([43.6045, 1.4442], 11); // Toulouse par défaut
        Lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(carte.current);
        couche.current = Lf.layerGroup().addTo(carte.current);
        // La carte est créée dans une modale qui vient de s'ouvrir : sans ce
        // recalcul, Leaflet mesure un conteneur de taille nulle et n'affiche
        // qu'une bande grise.
        setTimeout(() => carte.current?.invalidateSize(), 60);
      }

      const g = couche.current!;
      g.clearLayers();

      const pastille = (txt: string, fond: string) =>
        Lf.divIcon({
          className: "",
          html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${fond};color:#fff;font:600 11px/1 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.4)">${txt}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

      const points: L.LatLng[] = [];
      if (depart) {
        const p = Lf.latLng(depart.coord[1], depart.coord[0]);
        Lf.marker(p, { icon: pastille("A", "#16a34a") }).bindTooltip(depart.label).addTo(g);
        points.push(p);
      }
      if (arrivee) {
        const p = Lf.latLng(arrivee.coord[1], arrivee.coord[0]);
        Lf.marker(p, { icon: pastille("B", "#dc2626") }).bindTooltip(arrivee.label).addTo(g);
        points.push(p);
      }

      if (trace && trace.length > 1) {
        const ligne = Lf.polyline(trace.map(([lon, lat]) => Lf.latLng(lat, lon)), {
          color: "#7c5cff",
          weight: 5,
          opacity: 0.9,
        }).addTo(g);
        carte.current.fitBounds(ligne.getBounds(), { padding: [24, 24] });
      } else if (points.length === 2) {
        carte.current.fitBounds(Lf.latLngBounds(points), { padding: [40, 40] });
      } else if (points.length === 1) {
        carte.current.setView(points[0], 13);
      }
    })();
    return () => { vivant = false; };
  }, [depart, arrivee, trace]);

  // Démontage : Leaflet garde un état sur le conteneur, qu'il faut libérer sous
  // peine d'« already initialized » à la réouverture de la modale.
  useEffect(() => () => { carte.current?.remove(); carte.current = null; }, []);

  // `isolate` : Leaflet empile ses calques jusqu'à z-index 1000 ; sans contexte
  // d'empilement propre, ils passeraient au-dessus des suggestions d'adresse.
  return (
    <div className="relative isolate h-full min-h-64 w-full overflow-hidden rounded-lg border border-border">
      <div ref={hote} className="h-full w-full" />
      {!depart && !arrivee && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/70 px-4 text-center text-sm text-muted">
          Choisis un départ et une arrivée : le trajet s&apos;affiche ici.
        </div>
      )}
    </div>
  );
}
