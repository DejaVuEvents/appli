import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";
import { euros, dateFr } from "@/lib/format";
import type { ParametresEntreprise } from "@/lib/types";
import { resoudreLogo } from "./logo";

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

// Mêmes conventions que le devis / la facture : filets fins, aucun aplat de couleur,
// une seule police, la hiérarchie portée par la graisse et les règles horizontales.
const C = { border: "#222", muted: "#666", line: "#ccc", bg: "#f3f4f6" };

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#111", fontFamily: "Helvetica" },
  logo: { height: 48, marginBottom: 6, objectFit: "contain" },
  soc: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: C.muted },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  metaRow: { flexDirection: "row", gap: 24, marginTop: 4, fontSize: 8 },

  section: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.muted, letterSpacing: 0.6, marginTop: 18, marginBottom: 5 },

  twoCol: { flexDirection: "row", gap: 24 },
  infoRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 2.5 },
  infoKey: { width: 62, color: C.muted },
  infoVal: { flex: 1 },

  th: { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: C.border, paddingBottom: 3, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 3 },
  cDate: { width: "18%" },
  cObjet: { flex: 1 },
  cMt: { width: "22%", textAlign: "right" },

  totBox: { width: 230, marginLeft: "auto", marginTop: 14 },
  totStrong: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 2, marginTop: 2, fontFamily: "Helvetica-Bold" },

  mentions: { fontSize: 8, color: C.muted, marginTop: 3, lineHeight: 1.35 },
  signBox: { width: 170, height: 64, borderWidth: 1, borderColor: C.line, marginTop: 4 },
  signImg: { height: 52, objectFit: "contain", margin: 5 },
  signCaption: { fontSize: 7.5, color: C.muted, marginTop: 3 },
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

function NdfPDF({ a, logo }: { a: NdfPdfArgs; logo: string | Buffer | null }) {
  const villeLigne = [a.ent?.code_postal, a.ent?.ville].filter(Boolean).join(" ");
  const d = a.demandeur;
  const r = a.responsable;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête société — identique au devis */}
        <View>
          {logo ? <Image style={s.logo} src={logo as string} /> : null}
          <Text style={s.soc}>{a.ent?.raison_sociale ?? "DEJA VU"}</Text>
          <Text style={s.muted}>Association loi 1901</Text>
          {a.ent?.adresse ? <Text>{a.ent.adresse}</Text> : null}
          {villeLigne ? <Text>{villeLigne}{a.ent?.pays ? `, ${a.ent.pays}` : ""}</Text> : null}
          {a.ent?.siren ? <Text style={[s.muted, { marginTop: 4, fontSize: 8 }]}>SIREN : {a.ent.siren}</Text> : null}
        </View>

        {/* Titre */}
        <View style={{ marginTop: 22 }}>
          <Text style={s.title}>Note de frais</Text>
          {a.titre ? <Text style={s.muted}>{a.titre}</Text> : null}
          <View style={s.metaRow}>
            <Text>Demandeur : {nomComplet(d)}</Text>
            <Text>Statut : {a.statutLabel}</Text>
            {d.signeLe ? <Text>Signée le {dateFr(d.signeLe)}</Text> : null}
          </View>
        </View>

        {/* Demandeur / responsable */}
        <Text style={s.section}>INFORMATIONS LÉGALES</Text>
        <View style={s.twoCol}>
          <View style={{ flex: 1.3 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Demandeur</Text>
            <InfoRow k="Nom" v={nomComplet(d)} />
            <InfoRow k="Adresse" v={d.adresse} />
            <InfoRow k="Tél." v={d.telephone} />
            <InfoRow k="Mail" v={d.email} />
            <InfoRow k="IBAN" v={d.iban} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Responsable</Text>
            <InfoRow k="Nom" v={nomComplet(r)} />
            <InfoRow k="Fonction" v={r?.fonction ?? ""} />
          </View>
        </View>

        {/* Dépenses — tableau au gabarit du devis */}
        <Text style={s.section}>DÉPENSES</Text>
        <View style={s.th}>
          <Text style={s.cDate}>Date</Text>
          <Text style={s.cObjet}>Objet</Text>
          <Text style={s.cMt}>Montant TTC</Text>
        </View>
        {a.lignes.map((l, i) => (
          <View key={i} style={s.tr}>
            <Text style={s.cDate}>{l.date ? dateFr(l.date) : ""}</Text>
            <Text style={s.cObjet}>{l.libelle ?? ""}</Text>
            <Text style={s.cMt}>{eur(l.montant_ttc)}</Text>
          </View>
        ))}
        <View style={s.totBox}>
          <View style={s.totStrong}>
            <Text>Total TTC</Text>
            <Text>{eur(a.total)}</Text>
          </View>
        </View>

        {/* Remarques */}
        <Text style={s.section}>REMARQUES</Text>
        <Text style={s.mentions}>Les notes de frais doivent être soumises dans un délai d&apos;un mois maximum et doivent être associées à une dépense validée par le bureau.</Text>
        <Text style={s.mentions}>Tous les frais engagés, pour être acceptés, doivent être réalisés dans l&apos;intérêt de l&apos;association et accompagnés d&apos;un justificatif valide faisant apparaître la TVA si celle-ci est applicable, le nom du membre ainsi que celui de l&apos;association {a.ent?.raison_sociale ?? "DEJA VU"} (facture ou ticket de caisse).</Text>
        <Text style={s.mentions}>Le bureau se réserve le droit de refuser le remboursement d&apos;une note de frais suivant les mentions précédentes.</Text>

        {/* Signatures */}
        <Text style={s.section}>VALIDATION ET SIGNATURES</Text>
        <Text style={s.mentions}>Je certifie que les informations fournies dans cette demande sont exactes et que cette dépense est nécessaire au bon fonctionnement ou au développement des activités de l&apos;association.</Text>
        <View style={[s.twoCol, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Demandeur</Text>
            <View style={s.signBox}>
              {d.signeLe && d.signatureUrl ? <Image style={s.signImg} src={d.signatureUrl} /> : null}
            </View>
            <Text style={s.signCaption}>
              {d.signeLe ? `${nomComplet(d)} — ${dateFr(d.signeLe)}` : "Date et signature"} — « lu et approuvé »
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Responsable</Text>
            <View style={s.signBox}>
              {r?.signeLe && r?.signatureUrl ? <Image style={s.signImg} src={r.signatureUrl} /> : null}
            </View>
            <Text style={s.signCaption}>
              {r?.signeLe ? `${nomComplet(r)} — ${dateFr(r.signeLe)}` : "Date et signature"} — « lu et approuvé »
            </Text>
          </View>
        </View>

        {a.motifRefus ? (
          <Text style={[s.mentions, { marginTop: 10, color: "#b00" }]}>Refusée — motif : {a.motifRefus}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

export async function genererNoteFraisPdf(a: NdfPdfArgs): Promise<Buffer> {
  // Le logo était passé tel quel : un chemin relatif (« /logo.png ») n'était pas résolu
  // par le moteur PDF, la note sortait donc sans logo.
  const logo = await resoudreLogo(a.ent?.logo);
  return renderToBuffer(<NdfPDF a={a} logo={logo} />);
}
