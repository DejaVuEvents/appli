import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";
import { euros, dateFr, adresseMultiligne } from "@/lib/format";
import type { DocContenu } from "@/lib/document";

export type DocPdfArgs = DocContenu & {
  type: "devis" | "facture";
  numero: string | null;
  dateEmission: string | null;
  dateEcheance: string | null;
};

const C = { border: "#222", muted: "#666", line: "#ccc", bg: "#f3f4f6" };

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#111", fontFamily: "Helvetica" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  logo: { height: 48, marginBottom: 6, objectFit: "contain" },
  soc: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: C.muted },
  right: { textAlign: "right" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  metaRow: { flexDirection: "row", gap: 24, marginTop: 4, fontSize: 8 },
  th: { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: C.border, paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 3 },
  grp: { backgroundColor: C.bg, paddingVertical: 2, paddingHorizontal: 2, fontFamily: "Helvetica-Bold", marginTop: 4 },
  cDes: { width: "46%" },
  cQte: { width: "10%", textAlign: "right" },
  cUni: { width: "14%", paddingLeft: 6 },
  cPu: { width: "15%", textAlign: "right" },
  cMt: { width: "15%", textAlign: "right" },
  totBox: { width: 230, marginLeft: "auto", marginTop: 14 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  totStrong: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 2, marginTop: 2, fontFamily: "Helvetica-Bold" },
  mentions: { marginTop: 22, fontSize: 8, color: C.muted },
  sign: { marginTop: 18, alignItems: "flex-end" },
  signBox: { width: 170, height: 64, borderWidth: 1, borderColor: C.line },
});

function eur(n: number | null | undefined) {
  return euros(Number(n ?? 0));
}

function DocPDF({ contenu, doc }: { contenu: DocContenu; doc: { type: "devis" | "facture"; numero: string | null; dateEmission: string | null; dateEcheance: string | null } }) {
  const { ent, client, prestationNom, groupes, transportTotal, totaux, tva } = contenu;
  const titre = doc.type === "devis" ? "Devis" : "Facture";
  const villeLigne = [ent?.code_postal, ent?.ville].filter(Boolean).join(" ");

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête société */}
        <View>
          {ent?.logo ? <Image style={s.logo} src={ent.logo} /> : null}
          <Text style={s.soc}>{ent?.raison_sociale ?? "—"}</Text>
          {ent?.adresse ? <Text>{ent.adresse}</Text> : null}
          {villeLigne ? <Text>{villeLigne}{ent?.pays ? `, ${ent.pays}` : ""}</Text> : null}
          {ent?.iban ? <Text style={[s.muted, { marginTop: 4, fontSize: 8 }]}>IBAN : {ent.iban}</Text> : null}
        </View>

        {/* Client — aligné à droite, sous la société et au-dessus du numéro */}
        {client ? (
          <View style={{ marginTop: 18 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", textAlign: "right" }}>{client.nom}</Text>
            {client.adresse ? <Text style={{ textAlign: "right" }}>{adresseMultiligne(client.adresse)}</Text> : null}
          </View>
        ) : null}

        {/* Titre */}
        <View style={{ marginTop: 22 }}>
          <Text style={s.title}>{titre} {doc.numero ? `N° ${doc.numero}` : "(brouillon)"}</Text>
          <Text style={s.muted}>{prestationNom}</Text>
          <View style={s.metaRow}>
            <Text>Date d&apos;émission : {doc.dateEmission ? dateFr(doc.dateEmission) : "—"}</Text>
            <Text>{doc.type === "devis" ? "Validité : " : "Échéance : "}{doc.dateEcheance ? dateFr(doc.dateEcheance) : "—"}</Text>
          </View>
        </View>

        {/* Tableau */}
        <View style={{ marginTop: 16 }}>
          <View style={s.th}>
            <Text style={s.cDes}>Désignation</Text>
            <Text style={s.cQte}>Qté</Text>
            <Text style={s.cUni}>Unité</Text>
            <Text style={s.cPu}>P.U. HT</Text>
            <Text style={s.cMt}>Montant HT</Text>
          </View>

          {groupes.map((g) => (
            <View key={g.nom} wrap={false}>
              <Text style={s.grp}>{g.nom}</Text>
              {g.items.map((l) => {
                const brut = Number(l.prix_unitaire ?? 0) * l.quantite;
                const remise = brut - Number(l.prix_total ?? 0);
                return (
                  <View key={l.id} style={s.tr}>
                    <View style={s.cDes}>
                      <Text>{l.designation}</Text>
                      {remise > 0 ? (
                        <Text style={[s.muted, { fontSize: 7 }]}>Remise {l.remise_type === "montant" ? eur(l.remise_valeur) : `${l.remise_valeur}%`}</Text>
                      ) : null}
                    </View>
                    <Text style={s.cQte}>{l.quantite}</Text>
                    <Text style={s.cUni}>{l.unite ?? ""}</Text>
                    <Text style={s.cPu}>{eur(l.prix_unitaire)}</Text>
                    <Text style={s.cMt}>{eur(brut)}</Text>
                  </View>
                );
              })}
            </View>
          ))}

          {transportTotal > 0 ? (
            <View style={s.tr}>
              <Text style={s.cDes}>Transport / logistique</Text>
              <Text style={s.cQte}>1</Text>
              <Text style={s.cUni}>forfait</Text>
              <Text style={s.cPu}>{eur(transportTotal)}</Text>
              <Text style={s.cMt}>{eur(transportTotal)}</Text>
            </View>
          ) : null}
        </View>

        {/* Totaux */}
        <View style={s.totBox}>
          <View style={s.totRow}><Text style={s.muted}>Sous-total HT</Text><Text>{eur(totaux.sousTotalHT)}</Text></View>
          {totaux.remiseHT > 0 ? <View style={s.totRow}><Text style={s.muted}>Remise HT</Text><Text>− {eur(totaux.remiseHT)}</Text></View> : null}
          <View style={s.totStrong}><Text>Total HT</Text><Text>{eur(totaux.totalHT)}</Text></View>
          {tva.taux > 0 ? <View style={s.totRow}><Text style={s.muted}>TVA {tva.taux} %</Text><Text>{eur(tva.montant)}</Text></View> : null}
          <View style={s.totStrong}><Text>Total TTC</Text><Text>{eur(tva.totalTtc)}</Text></View>
        </View>

        {/* Mentions */}
        <View style={s.mentions}>
          {ent?.mention_tva ? <Text>{ent.mention_tva}</Text> : null}
          {doc.type === "devis" ? (
            <>
              {ent?.conditions_devis ? <Text style={{ marginTop: 4 }}>{ent.conditions_devis}</Text> : null}
              <View style={s.sign}>
                <View>
                  <View style={s.signBox} />
                  <Text style={{ textAlign: "center", marginTop: 2 }}>Signature</Text>
                </View>
              </View>
            </>
          ) : (
            ent?.conditions_facture ? <Text style={{ marginTop: 4 }}>{ent.conditions_facture}</Text> : null
          )}
          {ent?.siren ? <Text style={{ marginTop: 10, textAlign: "center" }}>SIREN {ent.siren}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}

export async function genererDevisFacturePdf(args: DocPdfArgs): Promise<Buffer> {
  const { type, numero, dateEmission, dateEcheance, ...contenu } = args;
  return renderToBuffer(<DocPDF contenu={contenu} doc={{ type, numero, dateEmission, dateEcheance }} />);
}
