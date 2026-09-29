import {
  Document, Page, Text, View, StyleSheet, Image, Svg, Polyline, Circle,
  renderToBuffer,
} from "@react-pdf/renderer";
import { euros, dateFr } from "@/lib/format";
import { carteStatique } from "@/lib/carte-statique";
import { resoudreLogo } from "./logo";
import type { ParametresEntreprise } from "@/lib/types";

export type TrajetPdfArgs = {
  ent: ParametresEntreprise | null;
  depart: string;
  arrivee: string;
  date: string | null;
  allerRetour: boolean;
  eviterPeages: boolean;
  /** Distance effectivement parcourue (aller-retour compris). */
  km: number;
  dureeMin: number | null;
  peage?: boolean;
  vehicule: string | null;
  mode: "reel" | "bareme";
  conso: number | null;
  prixCarburant: number | null;
  peages: number;
  tarifKm: number | null;
  carburant: number;
  total: number;
  trace: [number, number][];
};

const C = { border: "#222", muted: "#666", line: "#ccc", route: "#5b3df5" };

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#111", fontFamily: "Helvetica" },
  logo: { height: 40, marginBottom: 6, objectFit: "contain" },
  soc: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 10 },
  muted: { color: C.muted },
  hr: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  bloc: { borderWidth: 1, borderColor: C.line, padding: 8, marginTop: 8 },
  carte: { marginTop: 10, borderWidth: 1, borderColor: C.line },
  total: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, marginTop: 6, paddingTop: 5 },
  totalTxt: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  pied: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: C.muted, textAlign: "center" },
});

/** Nombres en français : virgule décimale, comme partout ailleurs dans les documents. */
const nb = (v: number, dec = 1) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const duree = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`);

/**
 * Justificatif d'itinéraire : le relevé qu'on allait imprimer sur Mappy pour
 * l'agrafer à la note de frais — adresses, carte, distance, durée et détail du
 * calcul — produit directement par l'outil.
 */
export async function genererTrajetPdf(a: TrajetPdfArgs): Promise<Buffer> {
  const logo = await resoudreLogo(a.ent?.logo ?? null);
  const pts = a.trace.length > 1 ? a.trace : [];
  const carte = pts.length > 1 ? await carteStatique(pts) : null;

  const ligne = (l: string, v: string) => (
    <View style={s.row}><Text style={s.muted}>{l}</Text><Text>{v}</Text></View>
  );

  return renderToBuffer(
    <Document>
      <Page size="A4" style={s.page}>
        {logo ? <Image src={logo} style={s.logo} /> : null}
        <Text style={s.soc}>{a.ent?.raison_sociale ?? "Déjà Vu"}</Text>
        <Text style={s.title}>Relevé d&apos;itinéraire</Text>
        <Text style={s.muted}>
          Justificatif de frais de déplacement{a.date ? ` — ${dateFr(a.date)}` : ""}
        </Text>
        <View style={s.hr} />

        <View style={s.bloc}>
          {ligne("Départ", a.depart)}
          {ligne("Arrivée", a.arrivee)}
          {ligne("Trajet", a.allerRetour ? "Aller-retour" : "Aller simple")}
          {a.vehicule ? ligne("Véhicule", a.vehicule) : null}
          {ligne("Distance parcourue", `${nb(a.km)} km`)}
          {a.dureeMin ? ligne("Durée estimée", duree(a.dureeMin)) : null}
          {a.eviterPeages ? ligne("Option", "Itinéraire sans péage demandé") : null}
          {a.peage !== undefined
            ? ligne("Péages sur le trajet", a.peage ? "Oui" : "Non")
            : null}
        </View>

        {carte ? (
          <View style={[s.carte, { width: carte.largeur, height: carte.hauteur, position: "relative", overflow: "hidden" }]}>
            {carte.tuiles.map((t, i) => (
              <Image
                key={i}
                src={{ data: t.data, format: "png" }}
                style={{ position: "absolute", left: t.x, top: t.y, width: 256, height: 256 }}
              />
            ))}
            <Svg
              width={carte.largeur}
              height={carte.hauteur}
              viewBox={`0 0 ${carte.largeur} ${carte.hauteur}`}
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              <Polyline
                points={pts.map((c) => { const p = carte.enPixels(c); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ")}
                stroke={C.route}
                strokeWidth={3}
                fill="none"
              />
              {[pts[0], pts[pts.length - 1]].map((c, i) => {
                const p = carte.enPixels(c);
                return (
                  <Circle
                    key={i} cx={p.x} cy={p.y} r={5}
                    fill={i === 0 ? "#16a34a" : "#dc2626"} stroke="#fff" strokeWidth={2}
                  />
                );
              })}
            </Svg>
          </View>
        ) : (
          <Text style={[s.muted, { marginTop: 10 }]}>
            Carte indisponible au moment de l&apos;édition — les données du trajet ci-dessus font foi.
          </Text>
        )}
        {carte ? <Text style={[s.muted, { fontSize: 7, marginTop: 2 }]}>Fond de carte {carte.attribution}</Text> : null}

        <View style={s.bloc}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Détail du calcul</Text>
          {a.mode === "reel" ? (
            <>
              {ligne("Consommation (litres aux 100 km)", nb(a.conso ?? 0))}
              {ligne("Prix du carburant (€ par litre)", nb(a.prixCarburant ?? 0, 3))}
              {ligne("Carburant", `${nb(a.km)} km × ${nb(a.conso ?? 0)} ÷ 100 × ${nb(a.prixCarburant ?? 0, 3)}  =  ${euros(a.carburant)}`)}
              {a.peages > 0 ? ligne("Péages", euros(a.peages)) : null}
            </>
          ) : (
            ligne("Barème kilométrique", `${nb(a.km)} km × ${nb(a.tarifKm ?? 0, 2)} € par km`)
          )}
          <View style={s.total}>
            <Text style={s.totalTxt}>Total</Text>
            <Text style={s.totalTxt}>{euros(a.total)}</Text>
          </View>
        </View>

        <Text style={s.pied}>
          Document produit automatiquement par l&apos;outil de gestion {a.ent?.raison_sociale ?? "Déjà Vu"} — itinéraire
          calculé sur données OpenStreetMap. Aide au chiffrage : le montant remboursé reste soumis à validation.
        </Text>
      </Page>
    </Document>,
  );
}
