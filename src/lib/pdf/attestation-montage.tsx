import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";
import { dateFr } from "@/lib/format";

export type SignataireAttestation = {
  nom: string | null;
  fonction: string | null;
  signatureUrl: string | null;
  signeLe: string | null;
};

export type AttestationArgs = {
  manifestation: string | null;
  lieuMontage: string | null;
  datesExploitation: string | null;
  organisateur: string | null;
  organisateurAdresse: string | null;
  installateur: string | null;
  responsableMontage: string | null;
  installateurAdresse: string | null;
  documentsPlans: string | null;
  moyensPar: string | null;
  descriptif: string | null;
  soussigne: string | null;
  faitA: string | null;
  faitLe: string | null;
  /** Celui qui a monté : il signe en premier. */
  monteur: SignataireAttestation;
  /** Le co-président qui valide ; sa case reste vide tant qu'il n'a pas signé. */
  validateur: SignataireAttestation | null;
};

const s = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 56, fontSize: 10.5, color: "#111", fontFamily: "Helvetica", lineHeight: 1.5 },
  titre: { fontSize: 13, textAlign: "center", marginBottom: 22 },
  ligne: { flexDirection: "row", marginBottom: 7 },
  etiquette: { fontSize: 10.5 },
  // Le trait de conduite du formulaire officiel : la valeur s'inscrit dessus.
  valeur: { flex: 1, borderBottomWidth: 0.7, borderBottomColor: "#444", borderBottomStyle: "dotted", paddingLeft: 4, paddingBottom: 1 },
  bloc: { marginBottom: 7 },
  // Même trait, mais sans `flex: 1` : hors d'une ligne, il faisait se superposer
  // l'étiquette et le texte.
  valeurBloc: { borderBottomWidth: 0.7, borderBottomColor: "#444", borderBottomStyle: "dotted", paddingLeft: 4, paddingBottom: 2, marginTop: 4, minHeight: 34 },
  sousTitre: { fontSize: 11.5, marginTop: 16, marginBottom: 10 },
  engagement: { marginTop: 14 },
  puce: { marginTop: 8, marginLeft: 10, fontFamily: "Helvetica-Bold", color: "#1d4ed8" },
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 26 },
  caseSig: { width: 210 },
  sigImage: { height: 52, marginTop: 6, objectFit: "contain" },
  sigVide: { height: 52, marginTop: 6, borderBottomWidth: 0.7, borderBottomColor: "#999" },
  sigNom: { fontSize: 8.5, color: "#555", marginTop: 3 },
});

/** Une ligne « Étiquette : valeur » posée sur un trait pointillé. */
function Champ({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  return (
    <View style={s.ligne} wrap={false}>
      <Text style={s.etiquette}>{label} : </Text>
      <Text style={s.valeur}>{valeur ?? ""}</Text>
    </View>
  );
}

function Case({ titre, p }: { titre: string; p: SignataireAttestation | null }) {
  return (
    <View style={s.caseSig}>
      <Text>{titre}</Text>
      {p?.signatureUrl && p.signeLe ? (
        <Image src={p.signatureUrl} style={s.sigImage} />
      ) : (
        <View style={s.sigVide} />
      )}
      <Text style={s.sigNom}>
        {p?.nom ?? ""}
        {p?.fonction ? ` — ${p.fonction}` : ""}
        {p?.signeLe ? ` · ${dateFr(p.signeLe)}` : ""}
      </Text>
    </View>
  );
}

/**
 * Attestation de bon montage, au format du formulaire officiel.
 *
 * Les deux signatures ne valent que si leur image existe ET que la date est
 * posée : une case signée d'avance ferait du document un faux.
 */
export async function genererAttestationPdf(a: AttestationArgs): Promise<Buffer> {
  return renderToBuffer(
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.titre}>ATTESTATION DE BON MONTAGE</Text>

        <Champ label="Manifestation" valeur={a.manifestation} />
        <Champ label="Adresse du lieu de montage" valeur={a.lieuMontage} />
        <Champ label="Dates d'exploitation de la manifestation" valeur={a.datesExploitation} />
        <Champ label="Organisateur" valeur={a.organisateur} />
        <Champ label="Adresse de l'organisateur" valeur={a.organisateurAdresse} />
        <Champ label="Installateur" valeur={a.installateur} />
        <Champ label="Nom et prénom du responsable du montage" valeur={a.responsableMontage} />
        <Champ label="Adresse de l'entreprise « installateur »" valeur={a.installateurAdresse} />
        <Champ label="Documents et plans utilisés pour l'installation : références, dates, indices, etc." valeur={a.documentsPlans} />

        <Text style={s.sousTitre}>CARACTÉRISTIQUES DES MOYENS MIS EN PLACE</Text>
        <Champ label="par" valeur={a.moyensPar} />
        <View style={s.bloc}>
          <Text style={s.etiquette}>Descriptif sommaire :</Text>
          <Text style={s.valeurBloc}>{a.descriptif ?? ""}</Text>
        </View>

        <View style={s.engagement}>
          <Champ label="Je, soussigné, (Nom, prénom et fonction) M." valeur={a.soussigne} />
          <Text>certifie avoir monté ou fait monter ces matériels et ensembles démontables conformément :</Text>
          <Text style={s.puce}>• à la notice technique d&apos;installation et d&apos;utilisation et aux plans du fabricant</Text>
        </View>

        <View style={{ marginTop: 16 }}>
          <Champ label="Fait à" valeur={a.faitA} />
          <Champ label="Le" valeur={a.faitLe ? dateFr(a.faitLe) : null} />
          <Text>En deux exemplaires originaux</Text>
        </View>

        <View style={s.signatures}>
          <Case titre="Signature du monteur" p={a.monteur} />
          <Case titre="Signature de l'organisateur" p={a.validateur} />
        </View>
      </Page>
    </Document>,
  );
}
