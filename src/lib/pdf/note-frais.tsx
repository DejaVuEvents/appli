import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";
import { euros, dateFr } from "@/lib/format";
import type { ParametresEntreprise } from "@/lib/types";

export type NdfPersonne = {
  nom: string | null;
  prenom: string | null;
  email: string | null;
  adresse: string | null;
  telephone: string | null;
  iban: string | null;
  fonction: string | null;
  signatureUrl: string | null;
  signeLe: string | null;
};

export type NdfPdfArgs = {
  ent: ParametresEntreprise | null;
  titre: string | null;
  statutLabel: string;
  motifRefus: string | null;
  demandeur: NdfPersonne;
  responsable: NdfPersonne | null;
  lignes: { libelle: string | null; date: string | null; montant_ttc: number }[];
  total: number;
};

const GREEN = "#d9ead3";
const GREY = "#e0e0e0";
const LINE = "#bbb";

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 8.5, color: "#111", fontFamily: "Helvetica" },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 54, height: 54, objectFit: "contain" },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  soc: { textAlign: "right", fontSize: 7.5, color: "#333", lineHeight: 1.3 },
  divider: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 6 },
  divLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", marginRight: 6 },
  divLine: { flex: 1, borderBottomWidth: 1, borderBottomColor: LINE, borderBottomStyle: "dashed" },
  twoCol: { flexDirection: "row", gap: 16 },
  box: { borderWidth: 1, borderColor: LINE },
  boxHeadG: { backgroundColor: GREEN, textAlign: "center", paddingVertical: 3, fontFamily: "Helvetica-Bold" },
  boxHeadR: { backgroundColor: GREY, textAlign: "center", paddingVertical: 3, fontFamily: "Helvetica-Bold" },
  infoRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: LINE },
  infoKey: { width: 64, paddingVertical: 2.5, paddingHorizontal: 4, borderRightWidth: 1, borderRightColor: LINE, textAlign: "center" },
  infoVal: { flex: 1, paddingVertical: 2.5, paddingHorizontal: 4 },
  th: { flexDirection: "row", backgroundColor: GREEN, borderWidth: 1, borderColor: LINE, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINE },
  cDate: { width: 70, padding: 4, borderRightWidth: 1, borderRightColor: LINE },
  cObjet: { flex: 1, padding: 4, borderRightWidth: 1, borderRightColor: LINE },
  cMt: { width: 80, padding: 4, textAlign: "right" },
  totRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  remarque: { fontSize: 7.5, color: "#444", marginTop: 3, lineHeight: 1.3 },
  signBox: { borderWidth: 1, borderColor: LINE, height: 80 },
  signImg: { height: 50, objectFit: "contain", marginTop: 4, marginHorizontal: 6 },
  signCaption: { textAlign: "center", fontSize: 7, color: "#666", marginTop: 3 },
});

function eur(n: number | null | undefined) {
  // Les polices PDF standard n'ont pas l'espace fine insécable (U+202F) ni l'insécable
  // (U+00A0) utilisées par le format français → elles s'affichaient en « / ».
  return euros(Number(n ?? 0)).replace(/[\u202F\u00A0]/g, " ");
}
function nomComplet(p: NdfPersonne | null) {
  if (!p) return "—";
  return [p.prenom, p.nom].filter(Boolean).join(" ") || "—";
}

function InfoRow({ k, v }: { k: string; v: string | null }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoKey}>{k}</Text>
      <Text style={s.infoVal}>{v ?? ""}</Text>
    </View>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={s.divider}>
      <Text style={s.divLabel}>{label}</Text>
      <View style={s.divLine} />
    </View>
  );
}

function NdfPDF({ a }: { a: NdfPdfArgs }) {
  const villeLigne = [a.ent?.code_postal, a.ent?.ville].filter(Boolean).join(", ");
  const d = a.demandeur;
  const r = a.responsable;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.headRow}>
          {a.ent?.logo ? <Image style={s.logo} src={a.ent.logo} /> : <View style={{ width: 54 }} />}
          <Text style={s.title}>Note de frais</Text>
          <View style={s.soc}>
            <Text>{a.ent?.raison_sociale ?? "DEJA VU"} (Association Loi 1901)</Text>
            {a.ent?.adresse ? <Text>{a.ent.adresse}</Text> : null}
            {villeLigne ? <Text>{villeLigne}</Text> : null}
            {a.ent?.siren ? <Text>SIREN : {a.ent.siren}</Text> : null}
          </View>
        </View>

        {/* Informations légales */}
        <Divider label="INFORMATIONS LÉGALES" />
        <View style={s.twoCol}>
          <View style={[s.box, { flex: 1.3 }]}>
            <Text style={s.boxHeadG}>DEMANDEUR</Text>
            <InfoRow k="Nom" v={d.nom} />
            <InfoRow k="Prénom" v={d.prenom} />
            <InfoRow k="Adresse" v={d.adresse} />
            <InfoRow k="Tel" v={d.telephone} />
            <InfoRow k="Mail" v={d.email} />
            <InfoRow k="IBAN" v={d.iban} />
          </View>
          <View style={[s.box, { flex: 1, alignSelf: "flex-start" }]}>
            <Text style={s.boxHeadR}>RESPONSABLE</Text>
            <InfoRow k="Nom" v={r?.nom ?? ""} />
            <InfoRow k="Prénom" v={r?.prenom ?? ""} />
            <InfoRow k="Fonction" v={r?.fonction ?? ""} />
          </View>
        </View>

        {/* Dépenses */}
        <Divider label="DÉPENSES" />
        <View style={s.th}>
          <Text style={s.cDate}>Date</Text>
          <Text style={s.cObjet}>Objet</Text>
          <Text style={s.cMt}>Montant (TTC)</Text>
        </View>
        {a.lignes.map((l, i) => (
          <View key={i} style={s.tr}>
            <Text style={s.cDate}>{l.date ? dateFr(l.date) : ""}</Text>
            <Text style={s.cObjet}>{l.libelle ?? ""}</Text>
            <Text style={s.cMt}>{eur(l.montant_ttc)}</Text>
          </View>
        ))}
        <View style={s.totRow}>
          <View style={{ flexDirection: "row", borderWidth: 1, borderColor: LINE, backgroundColor: GREEN }}>
            <Text style={{ padding: 4, fontFamily: "Helvetica-Bold" }}>Total : </Text>
            <Text style={{ width: 80, padding: 4, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{eur(a.total)}</Text>
          </View>
        </View>

        {/* Remarques */}
        <Divider label="REMARQUES" />
        <Text style={s.remarque}>Les notes de frais doivent être soumises dans un délai d&apos;un mois maximum et doivent être associées à une dépense validée par le bureau.</Text>
        <Text style={s.remarque}>Tous les frais engagés, pour être acceptés, doivent être réalisés dans l&apos;intérêt de l&apos;association et accompagnés par un justificatif valide faisant apparaître la TVA si celle-ci est applicable, le nom du membre ainsi que de l&apos;association {a.ent?.raison_sociale ?? "DEJA VU"} (facture ou ticket de caisse).</Text>
        <Text style={s.remarque}>Le bureau se réserve le droit de refuser le remboursement d&apos;une note de frais suivant les mentions précédentes.</Text>

        {/* Validation et signatures */}
        <Divider label="VALIDATION ET SIGNATURES" />
        <Text style={s.remarque}>Je certifie que les informations fournies dans cette demande sont exactes et que cette dépense est nécessaire au bon fonctionnement ou au développement des activités de l&apos;association.</Text>
        <View style={[s.twoCol, { marginTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.boxHeadG}>DEMANDEUR</Text>
            <View style={s.signBox}>
              {d.signeLe && d.signatureUrl ? <Image style={s.signImg} src={d.signatureUrl} /> : null}
            </View>
            <Text style={s.signCaption}>
              {d.signeLe ? `${nomComplet(d)} — ${dateFr(d.signeLe)}` : "Date et signature"} — « lu et approuvé »
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.boxHeadR}>RESPONSABLE</Text>
            <View style={s.signBox}>
              {r?.signeLe && r?.signatureUrl ? <Image style={s.signImg} src={r.signatureUrl} /> : null}
            </View>
            <Text style={s.signCaption}>
              {r?.signeLe ? `${nomComplet(r)} — ${dateFr(r.signeLe)}` : "Date et signature"} — « lu et approuvé »
            </Text>
          </View>
        </View>

        {a.motifRefus ? <Text style={[s.remarque, { marginTop: 8, color: "#b00" }]}>Refusée — motif : {a.motifRefus}</Text> : null}
      </Page>
    </Document>
  );
}

export async function genererNoteFraisPdf(a: NdfPdfArgs): Promise<Buffer> {
  return renderToBuffer(<NdfPDF a={a} />);
}
