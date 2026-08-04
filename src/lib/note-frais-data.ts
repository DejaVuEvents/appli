// Assemble les données d'une note de frais pour la génération PDF (demandeur, responsable, lignes, société).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NdfPdfArgs, NdfPersonne } from "@/lib/pdf/note-frais";
import { STATUT_NDF_LABELS, type ParametresEntreprise, type StatutNoteFrais } from "@/lib/types";
import type { Membre } from "@/lib/membre";
import { urlDocument } from "@/lib/storage";

function toPersonne(m: Membre | undefined, signeLe: string | null, signatureUrl: string | null): NdfPersonne {
  return {
    nom: m?.nom ?? null,
    prenom: m?.prenom ?? null,
    email: m?.email ?? null,
    adresse: m?.adresse ?? null,
    telephone: m?.telephone ?? null,
    iban: m?.iban ?? null,
    fonction: m?.fonction ?? null,
    signatureUrl,
    signeLe,
  };
}

export async function assemblerNdfPdfArgs(supabase: SupabaseClient, noteId: string): Promise<NdfPdfArgs | null> {
  const { data: ndf } = await supabase.from("note_frais").select("*").eq("id", noteId).maybeSingle();
  if (!ndf) return null;

  const [{ data: lignesData }, { data: entData }] = await Promise.all([
    supabase.from("ligne_note_frais").select("libelle, date, montant_ttc").eq("note_frais_id", noteId).order("date"),
    supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
  ]);

  const ids = [ndf.demandeur_id, ndf.valide_par].filter(Boolean) as string[];
  const { data: membresData } = ids.length ? await supabase.from("membre").select("*").in("id", ids) : { data: [] };
  const mMap = new Map((membresData ?? []).map((m) => [m.id, m as Membre]));

  const lignes = (lignesData ?? []).map((l) => ({ libelle: l.libelle, date: l.date, montant_ttc: Number(l.montant_ttc ?? 0) }));

  // Signatures (bucket privé) → URL signée pour l'embarquer dans le PDF.
  const demandeurM = mMap.get(ndf.demandeur_id);
  const responsableM = ndf.valide_par ? mMap.get(ndf.valide_par) : undefined;
  const [demSig, respSig] = await Promise.all([
    urlDocument(supabase, demandeurM?.signature_url),
    urlDocument(supabase, responsableM?.signature_url),
  ]);

  return {
    ent: (entData as ParametresEntreprise | null) ?? null,
    titre: ndf.titre,
    statutLabel: STATUT_NDF_LABELS[ndf.statut as StatutNoteFrais] ?? ndf.statut,
    motifRefus: ndf.motif_refus,
    demandeur: toPersonne(demandeurM, ndf.demandeur_signe_le, demSig),
    responsable: ndf.valide_par ? toPersonne(responsableM, ndf.valide_le, respSig) : null,
    lignes,
    total: lignes.reduce((s, l) => s + l.montant_ttc, 0),
  };
}
