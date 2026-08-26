"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { getMembreActuel, nomMembre } from "@/lib/membre";
import { archiverDepuisUrl, archiverSurDrive, driveConfigured, nomFichierSafe } from "@/lib/drive";
import { genererNoteFraisPdf } from "@/lib/pdf/note-frais";
import { assemblerNdfPdfArgs } from "@/lib/note-frais-data";
import { calculerTrajet } from "@/lib/ors";
import { BUCKET_PRIVE, urlDocument } from "@/lib/storage";

type Supa = Awaited<ReturnType<typeof createSupabase>>;

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

async function uploadJustificatif(supabase: Supa, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `ndf/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = await file.arrayBuffer();
  // Bucket privé : on stocke le CHEMIN (servi ensuite via URL signée), pas d'URL publique.
  const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Upload justificatif : ${error.message}`);
  return data.path;
}

export async function createNoteFrais(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const raw = String(formData.get("type_ndf") ?? "depense");
  const type_ndf = raw === "km" || raw === "predepense" ? raw : "depense";
  const { data, error } = await supabase
    .from("note_frais")
    .insert({ titre: str(formData.get("titre")), type_ndf, demandeur_id: user?.id ?? null, statut: "brouillon" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/notes-frais");
  redirect(`/notes-frais/${data.id}`);
}

/** Renseigne les informations d'une pré-dépense (demande d'engagement > 500 €). */
export async function setPredepenseInfos(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("note_frais")
    .update({
      montant_estime: num(formData.get("montant_estime")),
      fournisseur: str(formData.get("fournisseur")),
      justification: str(formData.get("justification")),
    })
    .eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
}

export async function addLigneNDF(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  const justificatif = await uploadJustificatif(supabase, formData.get("justificatif") as File | null);
  const { error } = await supabase.from("ligne_note_frais").insert({
    note_frais_id: noteId,
    libelle: str(formData.get("libelle")),
    date: str(formData.get("date")),
    montant_ttc: num(formData.get("montant_ttc")),
    justificatif_url: justificatif,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
}

export async function ajouterTrajetNDF(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  const depart = str(formData.get("depart"));
  const arrivee = str(formData.get("arrivee"));
  if (!depart || !arrivee) throw new Error("Renseigne le départ et l'arrivée.");
  const allerRetour = formData.get("aller_retour") === "on";
  const tarifKm = num(formData.get("tarif_km")) || 0.5;

  const t = await calculerTrajet(depart, arrivee);
  const km = Math.round(t.km * (allerRetour ? 2 : 1) * 10) / 10;
  const montant = Math.round(km * tarifKm * 100) / 100;
  const libelle = `Déplacement (véhicule perso) : ${t.departLabel} → ${t.arriveeLabel}${allerRetour ? " (aller-retour)" : ""} — ${km} km × ${tarifKm.toFixed(2)} €/km`;
  const justificatif = await uploadJustificatif(supabase, formData.get("justificatif") as File | null);

  const { error } = await supabase.from("ligne_note_frais").insert({
    note_frais_id: noteId,
    libelle,
    date: str(formData.get("date")),
    montant_ttc: montant,
    depart: t.departLabel || depart,
    arrivee: t.arriveeLabel || arrivee,
    distance_km: km,
    justificatif_url: justificatif,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
}

export async function deleteLigneNDF(noteId: string, ligneId: string) {
  const supabase = await createSupabase();
  await supabase.from("ligne_note_frais").delete().eq("id", ligneId);
  revalidatePath(`/notes-frais/${noteId}`);
}

/** Le demandeur signe sa note de frais (« lu et approuvé »). Requiert une signature au profil. */
export async function signerNDF(noteId: string) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre) throw new Error("Non connecté.");
  const { data: ndf } = await supabase.from("note_frais").select("demandeur_id").eq("id", noteId).single();
  if (!ndf || ndf.demandeur_id !== membre.id) throw new Error("Seul le demandeur peut signer sa note de frais.");
  if (!membre.signature_url) throw new Error("Ajoute d'abord ta signature dans Paramètres → Mon compte.");
  await supabase.from("note_frais").update({ demandeur_signe_le: new Date().toISOString() }).eq("id", noteId);
  revalidatePath(`/notes-frais/${noteId}`);
}

export async function soumettreNDF(noteId: string) {
  const supabase = await createSupabase();
  // Garde-fous : une NDF soumise doit être signée et contenir au moins une ligne
  // (sinon on valide une écriture à 0 € non signée).
  const { data: n } = await supabase
    .from("note_frais")
    .select("type_ndf, demandeur_signe_le, lignes:ligne_note_frais(id)")
    .eq("id", noteId)
    .maybeSingle();
  const nn = n as unknown as { type_ndf: string | null; demandeur_signe_le: string | null; lignes: { id: string }[] } | null;
  if (!nn) throw new Error("Note de frais introuvable.");
  if (!nn.demandeur_signe_le) throw new Error("Signe ta note de frais avant de la soumettre.");
  if (nn.type_ndf !== "predepense" && (nn.lignes ?? []).length === 0) {
    throw new Error("Ajoute au moins une dépense avant de soumettre.");
  }
  await supabase.from("note_frais").update({ statut: "soumise", motif_refus: null }).eq("id", noteId).eq("statut", "brouillon");
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
}

/** Renvoie au brouillon pour corriger. Supprime la ligne de trésorerie créée le cas échéant. */
export async function repasserBrouillonNDF(noteId: string) {
  const supabase = await createSupabase();
  const { data: ndf } = await supabase.from("note_frais").select("ecriture_id").eq("id", noteId).single();
  if (ndf?.ecriture_id) await supabase.from("ecriture_financiere").delete().eq("id", ndf.ecriture_id);
  await supabase
    .from("note_frais")
    .update({ statut: "brouillon", valide_par: null, valide_le: null, ecriture_id: null, motif_refus: null })
    .eq("id", noteId);
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
  revalidatePath("/finance");
}

export async function validerNDF(noteId: string) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre || membre.role !== "co_president") throw new Error("Seul un co-président peut valider une note de frais.");

  const { data: ndf } = await supabase
    .from("note_frais")
    .select("id, statut, titre, type_ndf, demandeur_id, ecriture_id, created_at")
    .eq("id", noteId)
    .single();
  if (!ndf || ndf.statut !== "soumise") throw new Error("Note de frais introuvable ou non soumise.");
  if (ndf.demandeur_id === membre.id) throw new Error("Le demandeur ne peut pas valider sa propre note de frais.");

  // Pré-dépense : validation = autorisation d'achat AVANT dépense (pas d'écriture de trésorerie).
  if (ndf.type_ndf === "predepense") {
    await supabase
      .from("note_frais")
      .update({ statut: "validee", valide_par: membre.id, valide_le: new Date().toISOString(), motif_refus: null })
      .eq("id", noteId);
    revalidatePath(`/notes-frais/${noteId}`);
    revalidatePath("/notes-frais");
    return;
  }

  const { data: lignes } = await supabase
    .from("ligne_note_frais")
    .select("montant_ttc, date, libelle, justificatif_url")
    .eq("note_frais_id", noteId);
  const total = (lignes ?? []).reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);
  const dates = (lignes ?? []).map((l) => l.date).filter(Boolean).sort() as string[];

  // Nom du demandeur pour le libellé de l'écriture
  const { data: dem } = await supabase.from("membre").select("nom, email").eq("id", ndf.demandeur_id ?? "").maybeSingle();
  const demandeur = nomMembre(dem);

  // Ligne de trésorerie prévisionnelle (sortie : remboursement de frais)
  const { data: ecr, error: ecrErr } = await supabase
    .from("ecriture_financiere")
    .insert({
      date: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
      denomination: `Remboursement NDF — ${demandeur}${ndf.titre ? ` — ${ndf.titre}` : ""}`,
      type: "Frais_Fixes",
      specification: "Remboursement frais",
      sens: "sortie",
      statut: "previsionnel",
      montant_ttc: Math.round(total * 100) / 100,
      effectue_par: demandeur,
      created_by: membre.id,
    })
    .select("id")
    .single();
  if (ecrErr) throw new Error(ecrErr.message);

  const { data: maj } = await supabase
    .from("note_frais")
    .update({ statut: "validee", valide_par: membre.id, valide_le: new Date().toISOString(), ecriture_id: ecr.id, motif_refus: null })
    .eq("id", noteId)
    .eq("statut", "soumise")   // anti-concurrence : si déjà validée entre-temps, on annule
    .select("id");
  if (!maj || maj.length === 0) {
    await supabase.from("ecriture_financiere").delete().eq("id", ecr.id);
    throw new Error("Cette note de frais vient d'être traitée par quelqu'un d'autre.");
  }

  // Archivage Google Drive (best-effort) sous « Notes de frais / {année} »
  if (driveConfigured()) {
    const annee = (dates[dates.length - 1] ?? new Date().toISOString()).slice(0, 4);
    const baseNom = nomFichierSafe(`NDF ${demandeur} ${ndf.titre ?? ""}`.trim());
    // 1) Les justificatifs téléversés
    for (const [i, l] of (lignes ?? []).entries()) {
      if (l.justificatif_url) {
        const url = await urlDocument(supabase, l.justificatif_url, 600);
        if (url) await archiverDepuisUrl(url, ["Notes de frais", annee], `${baseNom} - ${nomFichierSafe(l.libelle ?? `piece-${i + 1}`)}`);
      }
    }
    // 2) La note de frais validée en PDF (template complet)
    try {
      const args = await assemblerNdfPdfArgs(supabase, noteId);
      if (args) {
        const pdf = await genererNoteFraisPdf(args);
        await archiverSurDrive({ dossier: ["Notes de frais", annee], nom: `${baseNom}.pdf`, mimeType: "application/pdf", data: pdf });
      }
    } catch (e) {
      console.error("Archivage PDF NDF échec:", (e as Error).message);
    }
  }

  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
  revalidatePath("/finance");
}

export async function refuserNDF(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre || membre.role !== "co_president") throw new Error("Seul un co-président peut refuser une note de frais.");
  const { data: ndf } = await supabase.from("note_frais").select("demandeur_id, statut").eq("id", noteId).single();
  if (ndf?.demandeur_id === membre.id) throw new Error("Le demandeur ne peut pas refuser sa propre note de frais.");
  await supabase
    .from("note_frais")
    .update({ statut: "refusee", valide_par: membre.id, valide_le: new Date().toISOString(), motif_refus: str(formData.get("motif")) })
    .eq("id", noteId)
    .eq("statut", "soumise");
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
}

export async function deleteNoteFrais(noteId: string) {
  const supabase = await createSupabase();
  // L'écriture de remboursement liée doit disparaître avec la note (la FK est en
  // SET NULL dans l'autre sens : sans ça elle resterait orpheline et invisible).
  const { data: n } = await supabase.from("note_frais").select("ecriture_id").eq("id", noteId).maybeSingle();
  await supabase.from("note_frais").delete().eq("id", noteId);
  if (n?.ecriture_id) await supabase.from("ecriture_financiere").delete().eq("id", n.ecriture_id);
  revalidatePath("/notes-frais");
  revalidatePath("/finance");
  revalidatePath("/finance/journal");
  revalidatePath("/finance/previsionnel");
  redirect("/notes-frais");
}

/**
 * Marque une NDF validée comme REMBOURSÉE : son écriture de trésorerie passe de
 * prévisionnelle à réelle, à la date du virement. C'est ce qui la sort de « On doit ».
 */
export async function marquerNDFRemboursee(noteId: string, formData?: FormData) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre || membre.role !== "co_president") throw new Error("Seul un co-président peut marquer un remboursement.");
  const { data: n } = await supabase.from("note_frais").select("ecriture_id, statut").eq("id", noteId).maybeSingle();
  if (!n?.ecriture_id) throw new Error("Aucune écriture de trésorerie liée à cette note.");
  if (n.statut !== "validee") throw new Error("La note doit être validée avant d'être remboursée.");
  const dateVirement = str(formData?.get("date_virement") ?? null) ?? new Date().toISOString().slice(0, 10);
  await supabase
    .from("ecriture_financiere")
    .update({ statut: "reel", date: dateVirement, valide: true })
    .eq("id", n.ecriture_id);
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
  revalidatePath("/finance");
  revalidatePath("/finance/journal");
  revalidatePath("/finance/previsionnel");
}
