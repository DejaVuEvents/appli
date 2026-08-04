import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { euros, dateFr } from "@/lib/format";
import { typeLabel } from "@/lib/finance";
import type { EcritureFinanciere } from "@/lib/types";

const C = { border: "#222", muted: "#666", line: "#ccc", bg: "#f3f4f6", green: "#15803d", red: "#dc2626" };

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 8, color: "#111", fontFamily: "Helvetica" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  sub: { color: C.muted, marginTop: 2, fontSize: 9 },
  th: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: C.border, paddingBottom: 3, fontFamily: "Helvetica-Bold", marginTop: 14 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 2.5 },
  cDate: { width: "12%" },
  cSens: { width: "9%" },
  cCat: { width: "22%" },
  cDen: { width: "27%" },
  cMt: { width: "15%", textAlign: "right" },
  cSolde: { width: "15%", textAlign: "right" },
  totBox: { marginTop: 16, marginLeft: "auto", width: 260 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  totStrong: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 3, marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 10 },
  foot: { marginTop: 20, fontSize: 7, color: C.muted, textAlign: "center" },
});

export type TresoPdfArgs = {
  raisonSociale: string | null;
  debut: string | null;
  fin: string | null;
  format: "fr" | "iso" | "long";
  lignes: (EcritureFinanciere & { soldeCumule: number })[];
  totalEntrees: number;
  totalSorties: number;
  soldeFinal: number;
};

function TresoPDF(a: TresoPdfArgs) {
  const periode = a.debut || a.fin
    ? `${a.debut ? dateFr(a.debut, a.format) : "…"} → ${a.fin ? dateFr(a.fin, a.format) : "…"}`
    : "Toutes les écritures";
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>Journal de trésorerie{a.raisonSociale ? ` — ${a.raisonSociale}` : ""}</Text>
        <Text style={s.sub}>Période : {periode}</Text>

        <View style={s.th}>
          <Text style={s.cDate}>Date</Text>
          <Text style={s.cSens}>Sens</Text>
          <Text style={s.cCat}>Catégorie</Text>
          <Text style={s.cDen}>Dénomination</Text>
          <Text style={s.cMt}>Montant TTC</Text>
          <Text style={s.cSolde}>Solde projeté</Text>
        </View>

        {a.lignes.map((e) => (
          <View style={s.tr} key={e.id} wrap={false}>
            <Text style={s.cDate}>{dateFr(e.date, a.format)}</Text>
            <Text style={[s.cSens, { color: e.sens === "entree" ? C.green : C.red }]}>
              {e.sens === "entree" ? "Entrée" : "Sortie"}
            </Text>
            <Text style={s.cCat}>{[typeLabel(e.type), e.specification].filter(Boolean).join(" / ") || "—"}</Text>
            <Text style={s.cDen}>{e.denomination ?? "—"}{e.statut === "previsionnel" ? " (prév.)" : ""}</Text>
            <Text style={[s.cMt, { color: e.sens === "entree" ? C.green : C.red }]}>
              {e.sens === "entree" ? "+" : "−"} {euros(e.montant_ttc)}
            </Text>
            <Text style={s.cSolde}>{euros(e.soldeCumule)}</Text>
          </View>
        ))}

        <View style={s.totBox}>
          <View style={s.totRow}><Text style={{ color: C.muted }}>Total entrées</Text><Text style={{ color: C.green }}>+ {euros(a.totalEntrees)}</Text></View>
          <View style={s.totRow}><Text style={{ color: C.muted }}>Total sorties</Text><Text style={{ color: C.red }}>− {euros(a.totalSorties)}</Text></View>
          <View style={s.totStrong}><Text>Solde projeté final</Text><Text>{euros(a.soldeFinal)}</Text></View>
        </View>

        <Text style={s.foot}>Document généré depuis Déjà Vu — {a.lignes.length} écriture(s).</Text>
      </Page>
    </Document>
  );
}

export async function genererTresoreriePdf(args: TresoPdfArgs): Promise<Buffer> {
  return renderToBuffer(<TresoPDF {...args} />);
}
