import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { euros } from "@/lib/format";
import type { BilanActifPassif } from "@/lib/bilan";

const C = { border: "#222", muted: "#666", line: "#ccc", bg: "#f3f4f6", green: "#15803d", red: "#dc2626" };

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#111", fontFamily: "Helvetica" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { color: C.muted, marginTop: 2, marginBottom: 18 },
  secTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", backgroundColor: C.bg, padding: 5, marginTop: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 3 },
  sub2: { color: C.muted, paddingLeft: 12 },
  subtotal: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 4, marginTop: 3, fontFamily: "Helvetica-Bold" },
  net: { flexDirection: "row", justifyContent: "space-between", marginTop: 20, padding: 8, backgroundColor: C.bg, fontFamily: "Helvetica-Bold", fontSize: 12 },
  treso: { marginTop: 22, fontSize: 9, color: C.muted },
  foot: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 7.5, color: C.muted, textAlign: "center" },
});

export type BilanArgs = {
  raisonSociale: string | null;
  annee: number;
  produits: { label: string; total: number }[];
  charges: { label: string; total: number }[];
  totalProduits: number;
  totalCharges: number;
  soldeDebut: number;
  soldeFin: number;
  bilan?: BilanActifPassif;
};

function Bilan(a: BilanArgs) {
  const resultat = a.totalProduits - a.totalCharges;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Compte de résultat {a.annee}</Text>
        <Text style={s.sub}>{a.raisonSociale ?? "Déjà Vu"} · établi sur les écritures réelles de l&apos;exercice</Text>

        <Text style={s.secTitle}>PRODUITS (recettes)</Text>
        {a.produits.length === 0 ? <Text style={{ paddingVertical: 4, color: C.muted }}>Aucun produit.</Text> : a.produits.map((p) => (
          <View style={s.row} key={p.label}><Text>{p.label}</Text><Text style={{ color: C.green }}>{euros(p.total)}</Text></View>
        ))}
        <View style={s.subtotal}><Text>Total produits</Text><Text style={{ color: C.green }}>{euros(a.totalProduits)}</Text></View>

        <Text style={s.secTitle}>CHARGES (dépenses)</Text>
        {a.charges.length === 0 ? <Text style={{ paddingVertical: 4, color: C.muted }}>Aucune charge.</Text> : a.charges.map((c) => (
          <View style={s.row} key={c.label}><Text>{c.label}</Text><Text style={{ color: C.red }}>{euros(c.total)}</Text></View>
        ))}
        <View style={s.subtotal}><Text>Total charges</Text><Text style={{ color: C.red }}>{euros(a.totalCharges)}</Text></View>

        <View style={s.net}>
          <Text>RÉSULTAT NET {a.annee}</Text>
          <Text style={{ color: resultat >= 0 ? C.green : C.red }}>{resultat >= 0 ? "+" : ""}{euros(resultat)}</Text>
        </View>

        <View style={s.treso}>
          <Text>Trésorerie — solde début d&apos;exercice : {euros(a.soldeDebut)} · solde fin d&apos;exercice : {euros(a.soldeFin)}</Text>
          <Text style={{ marginTop: 3 }}>
            Document indicatif généré depuis Déjà Vu (association loi 1901). Ne remplace pas un bilan comptable certifié.
          </Text>
        </View>

        <Text style={s.foot} render={({ pageNumber, totalPages }) => `Compte de résultat ${a.annee} — page ${pageNumber}/${totalPages}`} fixed />
      </Page>

      {a.bilan && (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Bilan au 31/12/{a.annee}</Text>
          <Text style={s.sub}>{a.raisonSociale ?? "Déjà Vu"} · présentation simplifiée (Actif / Passif)</Text>

          <View style={{ flexDirection: "row", gap: 16 }}>
            {/* ACTIF */}
            <View style={{ flex: 1 }}>
              <Text style={s.secTitle}>ACTIF (ce que l&apos;association possède)</Text>
              <View style={s.row}><Text>Immobilisations (matériel, brut)</Text><Text>{euros(a.bilan.immobilisations)}</Text></View>
              <View style={s.row}><Text>Créances clients (factures dues)</Text><Text>{euros(a.bilan.creances)}</Text></View>
              <View style={s.row}><Text>Trésorerie (banque)</Text><Text>{euros(a.bilan.tresorerie)}</Text></View>
              <View style={s.subtotal}><Text>Total actif</Text><Text>{euros(a.bilan.totalActif)}</Text></View>
            </View>

            {/* PASSIF */}
            <View style={{ flex: 1 }}>
              <Text style={s.secTitle}>PASSIF (ressources & dettes)</Text>
              <View style={s.row}><Text>Report à nouveau</Text><Text>{euros(a.bilan.reportANouveau)}</Text></View>
              <View style={s.row}><Text>Résultat de l&apos;exercice</Text><Text style={{ color: a.bilan.resultatExercice >= 0 ? C.green : C.red }}>{a.bilan.resultatExercice >= 0 ? "+" : ""}{euros(a.bilan.resultatExercice)}</Text></View>
              <View style={{ ...s.row, borderBottomWidth: 0 }}><Text style={{ fontFamily: "Helvetica-Bold" }}>Fonds propres</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{euros(a.bilan.fondsPropres)}</Text></View>
              <View style={s.row}><Text>Dettes fournisseurs</Text><Text style={{ color: C.red }}>{euros(a.bilan.dettesFournisseurs)}</Text></View>
              <View style={s.subtotal}><Text>Total passif</Text><Text>{euros(a.bilan.totalPassif)}</Text></View>
            </View>
          </View>

          <View style={s.treso}>
            <Text>Immobilisations en valeur d&apos;achat brute (amortissements non suivis). Créances et dettes = encours à date.</Text>
            <Text style={{ marginTop: 3 }}>Le report à nouveau équilibre l&apos;actif et le passif. Document indicatif — ne remplace pas un bilan comptable certifié.</Text>
          </View>

          <Text style={s.foot} render={({ pageNumber, totalPages }) => `Bilan ${a.annee} — page ${pageNumber}/${totalPages}`} fixed />
        </Page>
      )}
    </Document>
  );
}

export async function genererBilanPdf(args: BilanArgs): Promise<Buffer> {
  return renderToBuffer(<Bilan {...args} />);
}
