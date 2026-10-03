import type { SupabaseClient } from "@supabase/supabase-js";
import { urlDocument } from "@/lib/storage";
import { nomMembre } from "@/lib/membre";
import { dateFr } from "@/lib/format";
import type { AttestationArgs, SignataireAttestation } from "@/lib/pdf/attestation-montage";

type Supa = SupabaseClient;

export type AttestationRow = {
  id: string;
  prestation_id: string;
  statut: "brouillon" | "soumise" | "validee" | "refusee";
  manifestation: string | null;
  lieu_montage: string | null;
  dates_exploitation: string | null;
  organisateur: string | null;
  organisateur_adresse: string | null;
  installateur: string | null;
  responsable_montage: string | null;
  installateur_adresse: string | null;
  documents_plans: string | null;
  moyens_par: string | null;
  descriptif: string | null;
  soussigne: string | null;
  fait_a: string | null;
  fait_le: string | null;
  redacteur_id: string | null;
  redacteur_signe_le: string | null;
  valide_par: string | null;
  valide_le: string | null;
  motif_refus: string | null;
};

/** Dates d'exploitation en clair : « 17/01/2026 » ou « du 18/09 au 20/09/2026 ». */
export function periodeExploitation(debut: string | null, fin: string | null): string {
  if (!debut) return "";
  if (!fin || fin === debut) return dateFr(debut);
  return `du ${dateFr(debut)} au ${dateFr(fin)}`;
}

/**
 * Valeurs de départ de l'attestation, déduites de l'événement et de l'entreprise.
 * Tout reste modifiable : le descriptif des moyens mis en place ne se déduit de rien.
 */
export async function valeursParDefaut(
  supabase: Supa,
  prestationId: string,
  membreId: string | null,
): Promise<Partial<AttestationRow>> {
  const [{ data: p }, { data: ent }, { data: m }] = await Promise.all([
    supabase
      .from("prestation")
      .select("nom, lieu, date_event_debut, date_event_fin, client:client_id(nom, adresse)")
      .eq("id", prestationId)
      .maybeSingle(),
    supabase.from("parametres_entreprise").select("raison_sociale, adresse, code_postal, ville").limit(1).maybeSingle(),
    membreId
      ? supabase.from("membre").select("nom, prenom, fonction, email").eq("id", membreId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const prest = p as unknown as {
    nom: string | null; lieu: string | null;
    date_event_debut: string | null; date_event_fin: string | null;
    client: { nom: string | null; adresse: string | null } | null;
  } | null;
  const e = ent as { raison_sociale: string | null; adresse: string | null; code_postal: string | null; ville: string | null } | null;
  const membre = m as { nom: string | null; prenom: string | null; fonction: string | null; email: string | null } | null;

  const adresseEntreprise = [e?.adresse, [e?.code_postal, e?.ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const nomResponsable = membre ? nomMembre(membre) : null;

  return {
    manifestation: prest?.nom ?? null,
    lieu_montage: prest?.lieu ?? null,
    dates_exploitation: periodeExploitation(prest?.date_event_debut ?? null, prest?.date_event_fin ?? null),
    organisateur: prest?.client?.nom ?? null,
    organisateur_adresse: prest?.client?.adresse ?? null,
    installateur: e?.raison_sociale ?? null,
    responsable_montage: nomResponsable,
    installateur_adresse: adresseEntreprise || null,
    soussigne: nomResponsable
      ? `${nomResponsable}${membre?.fonction ? `, ${membre.fonction}` : ""}${e?.raison_sociale ? ` ${e.raison_sociale}` : ""}`
      : null,
    fait_a: e?.ville ?? null,
    fait_le: new Date().toISOString().slice(0, 10),
  };
}

async function signataire(
  supabase: Supa,
  membreId: string | null,
  signeLe: string | null,
): Promise<SignataireAttestation | null> {
  if (!membreId) return null;
  const { data } = await supabase
    .from("membre")
    .select("nom, prenom, fonction, email, signature_url")
    .eq("id", membreId)
    .maybeSingle();
  const m = data as { nom: string | null; prenom: string | null; fonction: string | null; email: string | null; signature_url: string | null } | null;
  return {
    nom: m ? nomMembre(m) : null,
    fonction: m?.fonction ?? null,
    signatureUrl: await urlDocument(supabase, m?.signature_url ?? null),
    signeLe,
  };
}

/** Rassemble ce qu'il faut pour rendre le PDF, signatures comprises. */
export async function assemblerAttestation(
  supabase: Supa,
  prestationId: string,
): Promise<AttestationArgs | null> {
  const { data } = await supabase
    .from("attestation_montage")
    .select("*")
    .eq("prestation_id", prestationId)
    .maybeSingle();
  const a = data as AttestationRow | null;
  if (!a) return null;

  const [monteur, validateur] = await Promise.all([
    signataire(supabase, a.redacteur_id, a.redacteur_signe_le),
    signataire(supabase, a.valide_par, a.valide_le),
  ]);

  return {
    manifestation: a.manifestation,
    lieuMontage: a.lieu_montage,
    datesExploitation: a.dates_exploitation,
    organisateur: a.organisateur,
    organisateurAdresse: a.organisateur_adresse,
    installateur: a.installateur,
    responsableMontage: a.responsable_montage,
    installateurAdresse: a.installateur_adresse,
    documentsPlans: a.documents_plans,
    moyensPar: a.moyens_par,
    descriptif: a.descriptif,
    soussigne: a.soussigne,
    faitA: a.fait_a,
    faitLe: a.fait_le,
    monteur: monteur ?? { nom: null, fonction: null, signatureUrl: null, signeLe: null },
    validateur,
  };
}
