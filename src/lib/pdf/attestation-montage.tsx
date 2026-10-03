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
  /** Fabricant de la structure — « Fabriqué par » du modèle officiel. */
  fabriquePar: string | null;
  descriptif: string | null;
  soussigne: string | null;
  faitA: string | null;
  faitLe: string | null;
  /** Le responsable du montage : le modèle officiel ne prévoit que sa signature. */
  monteur: SignataireAttestation;
};

const s = StyleSheet.create({
  page: { paddingVertical: 52, paddingHorizontal: 56, fontSize: 10.5, color: "#111", fontFamily: "Helvetica", lineHeight: 1.45 },
  titre: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 0.6, marginBottom: 30 },

  // Étiquette à largeur fixe : elle tient sur une ligne, et toutes les valeurs
  // s'alignent sur la même colonne.
  ligne: { flexDirection: "row", marginBottom: 8 },
  etiquette: { width: 222, fontSize: 9.5, color: "#555" },
  valeur: { flex: 1 },

  // Étiquette trop longue pour la colonne : elle prend sa propre ligne.
  bloc: { marginBottom: 8 },
  etiquetteBloc: { fontSize: 9.5, color: "#555", marginBottom: 2 },

  sousTitre: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 10 },
  engagement: { marginTop: 16 },
  puce: { marginTop: 8, marginLeft: 10, fontFamily: "Helvetica-Bold", color: "#1d4ed8" },

  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  caseSig: { width: 230 },
  sigImage: { height: 54, marginTop: 8, objectFit: "contain" },
  sigVide: { height: 54, marginTop: 8 },
  sigNom: { fontSize: 8.5, color: "#555", marginTop: 4 },
});

/** « Étiquette : valeur » sur une ligne, l'étiquette dans une colonne fixe. */
function Champ({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  return (
    <View style={s.ligne}>
      <Text style={s.etiquette}>{label} :</Text>
      <Text style={s.valeur}>{valeur ?? ""}</Text>
    </View>
  );
}

/** Même chose pour une étiquette trop longue pour tenir dans la colonne. */
function ChampLong({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  return (
    <View style={s.bloc}>
      <Text style={s.etiquetteBloc}>{label} :</Text>
      <Text>{valeur ?? ""}</Text>
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
        <ChampLong label="Documents et plans utilisés pour l'installation (références, dates, indices…)" valeur={a.documentsPlans} />

        <Text style={s.sousTitre}>CARACTÉRISTIQUES DES MATÉRIELS ET ENSEMBLES DÉMONTABLES</Text>
        <Champ label="Fabriqué par" valeur={a.fabriquePar} />
        <ChampLong label="Description des moyens mis en place" valeur={a.descriptif} />

        <View style={s.engagement}>
          <ChampLong label="Je, soussigné, (Nom, prénom et fonction) M." valeur={a.soussigne} />
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
        </View>
      </Page>
    </Document>,
  );
}
