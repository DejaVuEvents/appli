"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { getMembreActuel, nomMembre, champsDemandeurManquants } from "@/lib/membre";
import { envoyerMail, baseUrl } from "@/lib/mail";
import { dansUnMois } from "@/lib/format";
import { archiverDepuisUrl, archiverSurDrive, driveConfigured, nomFichierSafe } from "@/lib/drive";
import { genererNoteFraisPdf } from "@/lib/pdf/note-frais";
import { assemblerNdfPdfArgs } from "@/lib/note-frais-data";
import { calculerTrajet, itineraire, geocode } from "@/lib/routage";
import { genererTrajetPdf } from "@/lib/pdf/trajet";
import { coutTrajet, libelleTrajet, type ModeTrajet } from "@/lib/trajet";
import { BUCKET_PRIVE, urlDocument } from "@/lib/storage";
import type { ParametresEntreprise } from "@/lib/types";

type Supa = Awaited<ReturnType<typeof createSupabase>>;

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/** Numéro de note de frais (NDF0001, NDF0002…), attribué atomiquement côté base. */
async function numeroNDF(supabase: Supa): Promise<string | null> {
  const { data } = await supabase.rpc("attribuer_numero_ndf");
  return (data as string | null) ?? null;
}

async function uploadJustificatif(
  supabase: Supa,
  file: File | null,
): Promise<{ path: string; nom: string } | null> {
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
  return { path: data.path, nom: file.name };
}

export async function createNoteFrais(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const raw = String(formData.get("type_ndf") ?? "depense");
  const type_ndf = raw === "km" || raw === "predepense" ? raw : "depense";
  const { data, error } = await supabase
    .from("note_frais")
    .insert({ numero: await numeroNDF(supabase), titre: str(formData.get("titre")), date: new Date().toISOString().slice(0, 10), type_ndf, demandeur_id: user?.id ?? null, statut: "brouillon" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/notes-frais");
  redirect(`/notes-frais/${data.id}`);
}

/** Renseigne les informations d'une pré-dépense (demande d'engagement > 500 €). */
export async function setPredepenseInfos(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
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

/**
 * Importe une note de frais existante (PDF ou photo) : reprise d'historique, ou note
 * établie hors de l'outil.
 *
 * Aucune écriture prévisionnelle n'est créée. Une note ancienne a déjà été remboursée et
 * son virement est au journal via la synchro bancaire : en ajouter une deuxième gonflerait
 * la trésorerie d'un montant fantôme. On cherche donc un décaissement réel du même montant,
 * non encore rattaché, et on s'y relie — la note apparaît alors « Remboursée ».
 */
export async function importerNoteFrais(formData: FormData) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);

  const titre = str(formData.get("titre"));
  const date = str(formData.get("date"));
  const montant = num(formData.get("montant_ttc"));
  const demandeurId = str(formData.get("demandeur_id")) ?? membre?.id ?? null;
  const justificatif = await uploadJustificatif(supabase, formData.get("justificatif") as File | null);
  if (!montant) throw new Error("Renseigne le montant de la note.");
  // Sans date, la note se retrouvait datée du jour de l'import et non de la dépense.
  if (!date) throw new Error("Renseigne la date de la dépense.");

  // Deux usages très différents derrière le même formulaire :
  //   « archive »   → note déjà traitée hors de l'outil, on ne fait que la consigner ;
  //   « a_valider » → note établie sur papier mais qui doit encore passer en validation.
  // Par défaut on NE court-circuite PAS le contrôle : importer ne doit jamais valider
  // à la place d'un co-président, ni priver les autres de la notification.
  const archive = str(formData.get("traitement")) === "archive";
  const maintenant = new Date().toISOString();

  const { data: note, error } = await supabase
    .from("note_frais")
    .insert({
      numero: await numeroNDF(supabase),
      titre, date, demandeur_id: demandeurId, type_ndf: "depense",
      // On NE pose PAS demandeur_signe_le : l'import n'a aucun moyen de savoir si la
      // note est signée, et le champ signifie « signée dans l'outil avec la signature
      // enregistrée ». Le poser revenait à affirmer une signature inexistante, et à
      // contourner le contrôle que soumettreNDF applique par ailleurs.
      ...(archive
        ? { statut: "validee", valide_par: membre?.id ?? null, valide_le: maintenant }
        : { statut: "soumise" }),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("ligne_note_frais").insert({
    note_frais_id: note.id,
    libelle: titre ?? "Dépense",
    date,
    montant_ttc: montant,
    justificatif_url: justificatif?.path ?? null,
    justificatif_nom: justificatif?.nom ?? null,
  });

  // Rattachement au décaissement déjà présent au journal, s'il existe.
  const ref = date ?? new Date().toISOString().slice(0, 10);
  const jour = 86400000;
  const [{ data: candidats }, { data: dejaLiees }] = await Promise.all([
    supabase
      .from("ecriture_financiere")
      .select("id, date")
      .eq("statut", "reel")
      .eq("sens", "sortie")
      .eq("montant_ttc", montant)
      .gte("date", new Date(new Date(ref).getTime() - 15 * jour).toISOString().slice(0, 10))
      .lte("date", new Date(new Date(ref).getTime() + 150 * jour).toISOString().slice(0, 10)),
    // Le lien est porté par note_frais.ecriture_id : on écarte les écritures déjà prises.
    supabase.from("note_frais").select("ecriture_id").not("ecriture_id", "is", null),
  ]);

  const prises = new Set(((dejaLiees ?? []) as { ecriture_id: string }[]).map((n) => n.ecriture_id));
  const liste = ((candidats ?? []) as { id: string; date: string }[]).filter((e) => !prises.has(e.id));
  if (liste.length > 0) {
    const ecart = (d: string) => Math.abs(new Date(d).getTime() - new Date(ref).getTime());
    const meilleure = liste.reduce((a, b) => (ecart(b.date) < ecart(a.date) ? b : a));
    await supabase.from("note_frais").update({ ecriture_id: meilleure.id }).eq("id", note.id);
  }

  if (!archive) {
    // Le demandeur peut être quelqu'un d'autre que l'importateur : c'est LUI qu'il
    // faut exclure des destinataires, pas la personne qui a déposé le document.
    const { data: dem } = demandeurId
      ? await supabase.from("membre").select("id, prenom, nom").eq("id", demandeurId).maybeSingle()
      : { data: null };
    await prevenirValideurs(supabase, note.id, dem ?? membre);
  }

  revalidatePath("/notes-frais");
  redirect(`/notes-frais/${note.id}`);
}

/** Renomme une note de frais (l'intitulé n'était modifiable nulle part après création). */
/**
 * Une note n'est modifiable qu'en BROUILLON, et par son demandeur.
 *
 * L'interface masquait déjà les commandes d'édition dès la soumission, mais aucune
 * action serveur ne le vérifiait : une requête rejouée pouvait encore modifier —
 * voire supprimer — une note soumise, validée ou déjà remboursée. Sur des pièces
 * comptables, c'est la garantie d'intégrité qui manquait.
 */
async function assertModifiable(supabase: Supa, noteId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  const { data: n } = await supabase
    .from("note_frais")
    .select("statut, demandeur_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!n) throw new Error("Note de frais introuvable.");
  if (n.demandeur_id !== user.id) throw new Error("Seul le demandeur peut modifier sa note de frais.");
  if (n.statut !== "brouillon") {
    throw new Error(
      "Cette note n'est plus modifiable : elle a été soumise. Repasse-la en brouillon pour la corriger.",
    );
  }
}

export async function renommerNDF(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
  const titre = str(formData.get("titre"));
  const date = str(formData.get("date"));
  const { error } = await supabase
    .from("note_frais")
    .update(date ? { titre, date } : { titre })
    .eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
}

export async function addLigneNDF(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
  const justificatif = await uploadJustificatif(supabase, formData.get("justificatif") as File | null);
  const { error } = await supabase.from("ligne_note_frais").insert({
    note_frais_id: noteId,
    libelle: str(formData.get("libelle")),
    date: str(formData.get("date")),
    montant_ttc: num(formData.get("montant_ttc")),
    justificatif_url: justificatif?.path ?? null,
    justificatif_nom: justificatif?.nom ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
}

export async function ajouterTrajetNDF(noteId: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
  const depart = str(formData.get("depart"));
  const arrivee = str(formData.get("arrivee"));
  if (!depart || !arrivee) throw new Error("Renseigne le départ et l'arrivée.");

  const mode: ModeTrajet = formData.get("mode") === "bareme" ? "bareme" : "reel";
  const allerRetour = formData.get("aller_retour") === "on";
  const vehiculeId = str(formData.get("vehicule_id")) || null;
  const eviterPeages = formData.get("eviter_peages") === "on";

  // Distance : celle saisie prime (relevé Mappy en main) ; sinon on la calcule.
  let km = num(formData.get("km")) ?? 0;
  let departLabel = depart;
  let arriveeLabel = arrivee;
  if (km <= 0) {
    // Dernier recours : l'utilisateur n'a pas choisi d'adresse dans les suggestions.
    // On localise et on calcule ici plutôt que de refuser l'enregistrement.
    const t = await calculerTrajet(depart, arrivee, { eviterPeages });
    km = t.km;
    departLabel = t.departLabel || depart;
    arriveeLabel = t.arriveeLabel || arrivee;
  }
  if (km <= 0) throw new Error("Distance inconnue : saisis-la dans le formulaire.");

  const entree = {
    mode,
    km,
    allerRetour,
    conso: num(formData.get("conso")) ?? 0,
    prixCarburant: num(formData.get("prix_carburant")) ?? 0,
    peages: num(formData.get("peages")) ?? 0,
    tarifKm: num(formData.get("tarif_km")) ?? 0.5,
  };
  if (mode === "reel" && (entree.conso <= 0 || entree.prixCarburant <= 0) && entree.peages <= 0) {
    throw new Error("Renseigne la consommation et le prix du carburant (ou des péages) pour chiffrer le trajet.");
  }
  const detail = coutTrajet(entree);

  const { data: veh } = vehiculeId
    ? await supabase.from("vehicule").select("nom, type_carburant").eq("id", vehiculeId).maybeSingle()
    : { data: null };

  // Justificatif : celui déposé s'il y en a un, sinon le relevé d'itinéraire que
  // l'outil produit lui-même — c'est ce qu'on imprimait sur Mappy pour l'agrafer.
  let justificatif = await uploadJustificatif(supabase, formData.get("justificatif") as File | null);
  if (!justificatif) {
    const lire = (cle: string): [number, number] | null => {
      const v = str(formData.get(cle));
      if (!v) return null;
      const [lon, lat] = v.split(",").map(Number);
      return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
    };
    justificatif = await releveItineraire(supabase, {
      depart: departLabel,
      arrivee: arriveeLabel,
      coordDepart: lire("depart_coord"),
      coordArrivee: lire("arrivee_coord"),
      date: str(formData.get("date")),
      eviterPeages,
      allerRetour,
      mode,
      conso: entree.conso,
      prixCarburant: entree.prixCarburant,
      tarifKm: entree.tarifKm,
      detail,
      vehicule: veh?.nom ?? null,
    });
  }

  const { error } = await supabase.from("ligne_note_frais").insert({
    note_frais_id: noteId,
    libelle: libelleTrajet(entree, detail, departLabel, arriveeLabel, veh?.nom ?? null),
    date: str(formData.get("date")),
    montant_ttc: detail.total,
    depart: departLabel,
    arrivee: arriveeLabel,
    distance_km: detail.km,
    aller_retour: allerRetour,
    vehicule_id: vehiculeId,
    carburant: mode === "reel" ? (veh?.type_carburant ?? null) : null,
    conso_l_100km: mode === "reel" ? entree.conso : null,
    prix_carburant: mode === "reel" ? entree.prixCarburant : null,
    peages: mode === "reel" ? detail.peages : null,
    tarif_km: mode === "bareme" ? entree.tarifKm : null,
    justificatif_url: justificatif?.path ?? null,
    justificatif_nom: justificatif?.nom ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
}

/**
 * Modifie une ligne existante (libellé, date, montant, justificatif).
 * Le justificatif n'est remplacé que si un nouveau fichier est fourni.
 */
export async function updateLigneNDF(noteId: string, ligneId: string, formData: FormData) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
  const justificatif = await uploadJustificatif(supabase, formData.get("justificatif") as File | null);
  const patch: Record<string, unknown> = {
    libelle: str(formData.get("libelle")),
    date: str(formData.get("date")),
    montant_ttc: num(formData.get("montant_ttc")),
  };
  if (justificatif) {
    patch.justificatif_url = justificatif.path;
    patch.justificatif_nom = justificatif.nom;
  }
  const { error } = await supabase.from("ligne_note_frais").update(patch).eq("id", ligneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
}

/** Retire le justificatif d'une ligne sans toucher au reste (croix ✕ à côté du nom). */
export async function retirerJustificatifNDF(noteId: string, ligneId: string) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
  const { error } = await supabase
    .from("ligne_note_frais")
    .update({ justificatif_url: null, justificatif_nom: null })
    .eq("id", ligneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/notes-frais/${noteId}`);
}

export async function deleteLigneNDF(noteId: string, ligneId: string) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
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
  // Une note sans identité complète n'est pas remboursable : on bloque à la source,
  // pas seulement dans l'interface.
  const moi = await getMembreActuel(supabase);
  const manquants = champsDemandeurManquants(moi);
  if (manquants.length) {
    throw new Error(`Complète ton profil avant de soumettre : ${manquants.join(", ")}.`);
  }
  if (nn.type_ndf !== "predepense" && (nn.lignes ?? []).length === 0) {
    throw new Error("Ajoute au moins une dépense avant de soumettre.");
  }
  // Un déplacement part en validation sans pièce : le validateur n'a rien à
  // regarder. On produit le relevé d'itinéraire si personne ne l'a fait.
  const { data: sansPiece } = await supabase
    .from("ligne_note_frais")
    .select("id")
    .eq("note_frais_id", noteId)
    .is("justificatif_url", null)
    .not("depart", "is", null)
    .not("arrivee", "is", null);
  for (const l of (sansPiece ?? []) as { id: string }[]) {
    await produireReleveTrajet(supabase, l.id);
  }

  await supabase.from("note_frais").update({ statut: "soumise", motif_refus: null }).eq("id", noteId).eq("statut", "brouillon");
  await prevenirValideurs(supabase, noteId, moi);
  revalidatePath(`/notes-frais/${noteId}`);
  revalidatePath("/notes-frais");
}

/**
 * Prévient par mail les co-présidents habilités à valider — c'est-à-dire tous sauf
 * le demandeur, qui ne peut pas valider sa propre note. La cloche de l'app ne
 * signale rien tant que personne ne l'ouvre : sans mail, une note peut dormir
 * plusieurs jours.
 */
async function prevenirValideurs(
  supabase: Supa,
  noteId: string,
  demandeur: { id: string; prenom?: string | null; nom?: string | null } | null,
) {
  const { data: note } = await supabase
    .from("note_frais")
    .select("numero, titre, lignes:ligne_note_frais(montant_ttc)")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return;

  const { data: membres } = await supabase
    .from("membre")
    .select("id, email")
    .eq("role", "co_president")
    .eq("actif", true);
  const destinataires = (membres ?? [])
    .filter((m) => m.id !== demandeur?.id && m.email)
    .map((m) => m.email as string);
  if (!destinataires.length) return;

  const n = note as unknown as { numero: string | null; titre: string | null; lignes: { montant_ttc: number }[] };
  const total = (n.lignes ?? []).reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);
  const auteur = [demandeur?.prenom, demandeur?.nom].filter(Boolean).join(" ") || "Un membre";
  const montant = total.toFixed(2).replace(".", ",");

  await envoyerMail({
    to: destinataires,
    sujet: `Note de frais à valider — ${n.numero ?? ""} ${n.titre ?? ""}`.trim(),
    corps: [
      `${auteur} a soumis une note de frais pour validation.`,
      "",
      `Note    : ${n.numero ?? "—"} — ${n.titre ?? "Sans titre"}`,
      `Montant : ${montant} €`,
      "",
      `À valider ici : ${baseUrl()}/notes-frais/${noteId}`,
      "",
      "Rappel : un co-président autre que le demandeur doit valider la note.",
      "",
      "— Déjà Vu",
    ].join("\n"),
  });
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

/**
 * Refuse d'aller plus loin si la note n'est pas RÉELLEMENT signée.
 *
 * Deux conditions, et pas une : l'horodatage de signature ET une signature
 * enregistrée chez le demandeur. Sans la seconde, le document produit ne porte
 * aucune signature — une note a été validée puis remboursée dans cet état.
 */
async function assertSignee(supabase: Supa, noteId: string, demandeurId: string | null) {
  const { data: n } = await supabase
    .from("note_frais")
    .select("type_ndf, demandeur_signe_le")
    .eq("id", noteId)
    .maybeSingle();
  if (n?.type_ndf === "predepense") return; // autorisation d'achat : pas de justificatif à signer
  if (!n?.demandeur_signe_le) {
    throw new Error("Cette note n'est pas signée par son demandeur : elle ne peut pas être validée.");
  }
  const { data: dem } = demandeurId
    ? await supabase.from("membre").select("signature_url").eq("id", demandeurId).maybeSingle()
    : { data: null };
  if (!dem?.signature_url) {
    throw new Error(
      "Le demandeur n'a aucune signature enregistrée : le document ne porterait aucune signature. "
      + "Qu'il l'ajoute dans Paramètres → Mon compte, puis signe la note.",
    );
  }
}

export async function validerNDF(noteId: string) {
  const supabase = await createSupabase();
  const membre = await getMembreActuel(supabase);
  if (!membre || membre.role !== "co_president") throw new Error("Seul un co-président peut valider une note de frais.");
  // Valider APPOSE la signature du responsable sur le document : sans image enregistrée,
  // la case « Responsable » du PDF resterait vide et la note ne vaudrait rien.
  if (!membre.signature_url) {
    throw new Error(
      "Tu n'as aucune signature enregistrée : la case « Responsable » du document resterait vide. "
      + "Ajoute-la dans Paramètres → Mon compte, puis valide.",
    );
  }

  const { data: ndf } = await supabase
    .from("note_frais")
    .select("id, statut, titre, type_ndf, demandeur_id, ecriture_id, created_at, date")
    .eq("id", noteId)
    .single();
  if (!ndf || ndf.statut !== "soumise") throw new Error("Note de frais introuvable ou non soumise.");
  if (ndf.demandeur_id === membre.id) throw new Error("Le demandeur ne peut pas valider sa propre note de frais.");
  await assertSignee(supabase, ndf.id, ndf.demandeur_id);

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

  // Nom du demandeur pour le libellé de l'écriture
  const { data: dem } = await supabase.from("membre").select("nom, email").eq("id", ndf.demandeur_id ?? "").maybeSingle();
  const demandeur = nomMembre(dem);

  // Une écriture peut déjà exister pour cette note. Deux cas :
  //  — PRÉVISIONNELLE : créée à la main depuis le prévisionnel (« document associé »).
  //    On la réutilise, sinon le remboursement serait compté deux fois.
  //  — RÉELLE : la note a déjà été remboursée, et on la revalide après coup (une
  //    signature régularisée, par exemple). Le virement est parti : il ne faut surtout
  //    pas lui ajouter une prévision, qui ferait réapparaître la dépense à venir.
  const { data: dejaLiee } = await supabase
    .from("ecriture_financiere")
    .select("id, statut")
    .eq("note_frais_id", noteId)
    .order("statut")
    .maybeSingle();
  const dejaRemboursee = dejaLiee?.statut === "reel";
  const dejaPrevue = dejaLiee?.statut === "previsionnel" ? dejaLiee : null;

  // Ligne de trésorerie prévisionnelle (sortie : remboursement de frais)
  const payloadPrev = {
    // Échéance de remboursement : un mois après l'établissement de la note, et non
    // la date de la dernière dépense — qui est souvent déjà passée, ce qui faisait
    // apparaître la prévision comme échue dès sa création.
    date: dansUnMois((ndf.date as string | null) ?? String(ndf.created_at).slice(0, 10)),
    denomination: `Remboursement NDF — ${demandeur}${ndf.titre ? ` — ${ndf.titre}` : ""}`,
    type: "Frais_Fixes",
    specification: "Remboursement frais",
    sens: "sortie",
    statut: "previsionnel",
    montant_ttc: Math.round(total * 100) / 100,
    effectue_par: demandeur,
  };

  let ecr: { id: string };
  if (dejaRemboursee && dejaLiee) {
    // Déjà décaissé : on garde l'écriture réelle telle quelle, on ne la retouche pas.
    ecr = { id: dejaLiee.id as string };
  } else if (dejaPrevue) {
    await supabase.from("ecriture_financiere").update(payloadPrev).eq("id", dejaPrevue.id);
    ecr = { id: dejaPrevue.id as string };
  } else {
    const { data: cree, error: ecrErr } = await supabase
      .from("ecriture_financiere")
      .insert({ ...payloadPrev, note_frais_id: noteId, created_by: membre.id })
      .select("id")
      .single();
    if (ecrErr) throw new Error(ecrErr.message);
    ecr = cree;
  }

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
    // Classement par année de la note, pas de son remboursement.
    const annee = ((ndf.date as string | null) ?? String(ndf.created_at)).slice(0, 4);
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
  const { data: n } = await supabase.from("note_frais").select("ecriture_id, numero").eq("id", noteId).maybeSingle();
  // Une note déjà remboursée porte un décaissement RÉEL, rapproché de la banque.
  // La supprimer effacerait ce mouvement et déséquilibrerait le solde face à Qonto.
  if (n?.ecriture_id) {
    const { data: ecr } = await supabase
      .from("ecriture_financiere").select("statut").eq("id", n.ecriture_id).maybeSingle();
    if (ecr?.statut === "reel") {
      throw new Error(
        "Cette note a déjà été remboursée : sa suppression effacerait un mouvement bancaire réel. Annule d'abord le remboursement.",
      );
    }
  }
  await supabase.from("note_frais").delete().eq("id", noteId);
  if (n?.ecriture_id) await supabase.from("ecriture_financiere").delete().eq("id", n.ecriture_id);
  // Note créée puis supprimée aussitôt : on rend son numéro s'il était le dernier
  // attribué, sinon la numérotation part en trous à chaque essai abandonné.
  if (n?.numero) await supabase.rpc("liberer_numero_ndf", { p_numero: n.numero });
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
  const { data: dm } = await supabase.from("note_frais").select("demandeur_id").eq("id", noteId).maybeSingle();
  await assertSignee(supabase, noteId, dm?.demandeur_id ?? null);
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

/**
 * Itinéraire entre deux points déjà localisés par l'autocomplétion d'adresses :
 * distance, durée, tracé et présence de péage, pour la carte du formulaire.
 * Ne lève pas — le formulaire affiche le motif et laisse saisir la distance.
 */
export async function itineraireNDF(
  a: [number, number],
  b: [number, number],
  eviterPeages = false,
): Promise<
  | { km: number; dureeMin: number; trace: [number, number][]; peage?: boolean }
  | { erreur: string }
> {
  try {
    const r = await itineraire([a, b], { eviterPeages });
    return { km: r.km, dureeMin: r.dureeMin, trace: r.trace, peage: r.peage };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Itinéraire introuvable." };
  }
}


/**
 * Produit le relevé d'itinéraire en PDF et le range dans le bucket privé.
 * Best-effort : un échec (tuiles injoignables, moteur d'itinéraire en panne) ne doit
 * pas empêcher d'enregistrer le déplacement.
 */
async function releveItineraire(
  supabase: Supa,
  a: {
    depart: string;
    arrivee: string;
    /** Coordonnées déjà connues ; sinon les adresses sont localisées. */
    coordDepart?: [number, number] | null;
    coordArrivee?: [number, number] | null;
    date: string | null;
    eviterPeages: boolean;
    allerRetour: boolean;
    mode: ModeTrajet;
    conso: number;
    prixCarburant: number;
    tarifKm: number;
    detail: { km: number; carburant: number; peages: number; total: number };
    vehicule: string | null;
  },
): Promise<{ path: string; nom: string } | null> {
  try {
    const ca = a.coordDepart ?? (await geocode(a.depart).then((g) => g.coord).catch(() => null));
    const cb = a.coordArrivee ?? (await geocode(a.arrivee).then((g) => g.coord).catch(() => null));

    let trace: [number, number][] = [];
    let dureeMin: number | null = null;
    let peage: boolean | undefined;
    if (ca && cb) {
      const r = await itineraire([ca, cb], { eviterPeages: a.eviterPeages });
      trace = r.trace;
      dureeMin = r.dureeMin * (a.allerRetour ? 2 : 1);
      peage = r.peage;
    }

    const { data: ent } = await supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle();
    const pdf = await genererTrajetPdf({
      ent: (ent ?? null) as ParametresEntreprise | null,
      depart: a.depart,
      arrivee: a.arrivee,
      date: a.date,
      allerRetour: a.allerRetour,
      eviterPeages: a.eviterPeages,
      km: a.detail.km,
      dureeMin,
      peage,
      vehicule: a.vehicule,
      mode: a.mode,
      conso: a.mode === "reel" ? a.conso : null,
      prixCarburant: a.mode === "reel" ? a.prixCarburant : null,
      peages: a.detail.peages,
      tarifKm: a.mode === "bareme" ? a.tarifKm : null,
      carburant: a.detail.carburant,
      total: a.detail.total,
      trace,
    });

    const chemin = `ndf/${Date.now()}-itineraire.pdf`;
    const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(chemin, pdf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return { path: data.path, nom: `Itineraire ${a.depart} - ${a.arrivee}.pdf`.replace(/[\\/]/g, "-") };
  } catch (e) {
    console.error("[ndf] relevé d'itinéraire non généré :", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Génère (ou remplace) le relevé d'itinéraire d'une ligne de déplacement déjà
 * enregistrée — utile pour les lignes créées avant que l'outil ne sache le produire.
 */
export async function genererReleveTrajet(noteId: string, ligneId: string) {
  const supabase = await createSupabase();
  await assertModifiable(supabase, noteId);
  const ok = await produireReleveTrajet(supabase, ligneId);
  if (!ok) throw new Error("Le relevé n'a pas pu être produit (itinéraire ou carte indisponible). Réessaie.");
  revalidatePath(`/notes-frais/${noteId}`);
}

/**
 * Produit et attache le relevé d'itinéraire d'une ligne de déplacement.
 * Renvoie false si la ligne n'est pas un trajet ou si le relevé a échoué.
 */
async function produireReleveTrajet(supabase: Supa, ligneId: string): Promise<boolean> {
  const { data: l } = await supabase
    .from("ligne_note_frais")
    .select("depart, arrivee, date, distance_km, aller_retour, conso_l_100km, prix_carburant, peages, tarif_km, vehicule_id")
    .eq("id", ligneId)
    .single();
  if (!l?.depart || !l?.arrivee) return false;

  const { data: veh } = l.vehicule_id
    ? await supabase.from("vehicule").select("nom").eq("id", l.vehicule_id).maybeSingle()
    : { data: null };

  const mode: ModeTrajet = l.tarif_km != null ? "bareme" : "reel";
  const km = Number(l.distance_km ?? 0);
  const carburant = Math.round((km * Number(l.conso_l_100km ?? 0) * Number(l.prix_carburant ?? 0)) / 100 * 100) / 100;
  const peages = Number(l.peages ?? 0);
  const detail = {
    km,
    carburant,
    peages,
    total: mode === "bareme"
      ? Math.round(km * Number(l.tarif_km ?? 0) * 100) / 100
      : Math.round((carburant + peages) * 100) / 100,
  };

  const releve = await releveItineraire(supabase, {
    depart: l.depart,
    arrivee: l.arrivee,
    date: l.date,
    // Le détail stocké ne dit pas si les péages ont été évités ; on retrace
    // l'itinéraire standard, celui qui correspond à la distance enregistrée.
    eviterPeages: false,
    allerRetour: l.aller_retour === true,
    mode,
    conso: Number(l.conso_l_100km ?? 0),
    prixCarburant: Number(l.prix_carburant ?? 0),
    tarifKm: Number(l.tarif_km ?? 0),
    detail,
    vehicule: veh?.nom ?? null,
  });
  if (!releve) return false;

  await supabase
    .from("ligne_note_frais")
    .update({ justificatif_url: releve.path, justificatif_nom: releve.nom })
    .eq("id", ligneId);
  return true;
}
