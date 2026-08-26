"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { montantLigne, coutTransport, periodeReservation, montantRemise, type RemiseType } from "@/lib/devis";
import { BUCKET_PRIVE } from "@/lib/storage";
import { extraireMaterielPdf } from "@/lib/gemini";
import { copierDevisDans, copieLigne } from "@/lib/devis-copie";
import { ROLES_MEMBRE } from "@/lib/roles";
import { coutKmVehicule } from "@/lib/vehicule";
import { synchroniserEcritureDevisSigne } from "@/lib/tresorerie-sync";

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function remiseType(v: FormDataEntryValue | null): RemiseType {
  return String(v ?? "") === "montant" ? "montant" : "pct";
}

type Supa = Awaited<ReturnType<typeof createSupabase>>;

function revaliderTresorerie() {
  revalidatePath("/finance");
  revalidatePath("/finance/journal");
  revalidatePath("/finance/previsionnel");
  revalidatePath("/finance/synthese");
}

/** Marque un devis comme modifié par l'utilisateur courant (updated_at via trigger). */
async function toucherDevis(supabase: Supa, devisId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? null;
  await supabase.from("devis").update({ updated_by: uid }).eq("id", devisId);

  // Historique : on regroupe les modifications d'une même personne dans une même
  // « session » (~5 min) en une seule entrée (mise à jour de l'horodatage), sinon on crée une entrée.
  const nowIso = new Date().toISOString();
  const { data: last } = await supabase
    .from("devis_historique")
    .select("id, membre_id, created_at")
    .eq("devis_id", devisId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const memeSession =
    last && last.membre_id === uid && Date.now() - new Date(last.created_at).getTime() < 5 * 60 * 1000;
  if (memeSession) {
    await supabase.from("devis_historique").update({ created_at: nowIso }).eq("id", last!.id);
  } else {
    await supabase.from("devis_historique").insert({ devis_id: devisId, membre_id: uid, action: "Modification" });
  }

  // Un devis signé alimente le prévisionnel : on resynchronise son montant à chaque
  // modification (lignes, remise, coefficient) pour qu'il ne reste pas figé.
  await synchroniserEcritureDevisSigne(supabase, devisId);
  revalidatePath("/finance");
  revalidatePath("/finance/previsionnel");
}

/**
 * Découpe un devis/une facture en deux factures : Acompte X% + Solde.
 * Chacune = une facture (type facture) avec une ligne unique, liée au document source.
 */
export async function creerAcompteSolde(devisId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const pct = Math.min(99, Math.max(1, num(formData.get("acompte_pct")) ?? 30));

  const { data: base } = await supabase
    .from("devis")
    .select("id, nom, prestation_id, remise_globale_type, remise_globale_valeur, coefficient_duree")
    .eq("id", devisId)
    .single();
  if (!base) throw new Error("Document introuvable.");

  const [{ data: ls }, { data: trs }] = await Promise.all([
    supabase.from("ligne_prestation").select("prix_total").eq("devis_id", devisId),
    supabase.from("transport").select("cout_calcule").eq("devis_id", devisId),
  ]);
  const net = (ls ?? []).reduce((s, l) => s + Number(l.prix_total ?? 0), 0) + (trs ?? []).reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
  const remise = montantRemise(net, base.remise_globale_type as RemiseType, Number(base.remise_globale_valeur ?? 0));
  // Le coefficient multi-jours multiplie le total final : acompte + solde doivent le refléter.
  const coeff = Number(base.coefficient_duree ?? 0) > 0 ? Number(base.coefficient_duree) : 1;
  const totalHT = Math.round((net - remise) * coeff * 100) / 100;
  const montantAcompte = Math.round(totalHT * pct) / 100;
  const montantSolde = Math.round((totalHT - montantAcompte) * 100) / 100;
  const baseNom = base.nom || "devis";

  const mkFacture = async (nom: string, libelle: string, montant: number): Promise<string | null> => {
    const { data: d } = await supabase
      .from("devis")
      .insert({ prestation_id: base.prestation_id, nom, type: "facture", source_devis_id: base.id, created_by: user?.id ?? null })
      .select("id")
      .single();
    if (d) {
      await supabase.from("ligne_prestation").insert({
        prestation_id: base.prestation_id, devis_id: d.id, designation: libelle,
        quantite: 1, unite: null, prix_unitaire: montant, remise_type: "pct", remise_valeur: 0,
        prix_total: montant, est_accessoire_auto: false,
      });
    }
    return d?.id ?? null;
  };

  const acompteId = await mkFacture(`Acompte ${pct}%`, `Acompte ${pct}% — ${baseNom}`, montantAcompte);
  await mkFacture("Solde", `Solde — ${baseNom}`, montantSolde);

  // Les 2 factures filles portent désormais la recette : on retire la prévision du
  // devis source signé (sinon la recette serait comptée deux fois).
  await synchroniserEcritureDevisSigne(supabase, devisId);
  revaliderTresorerie();
  revalidatePath(`/prestations/${base.prestation_id}`);
  redirect(`/prestations/devis/${acompteId ?? base.id}`);
}

/** Importe un devis / facture PDF (document existant, ex. ancien Tiime) en tant que document autonome. */
export async function importerDocumentPdf(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const type = str(formData.get("type")) === "facture" ? "facture" : "devis";
  const nom = str(formData.get("nom")) ?? (type === "facture" ? "Facture importée" : "Devis importé");
  const clientId = str(formData.get("client_id"));
  const date = str(formData.get("date"));
  const montant = num(formData.get("montant"));
  const numero = str(formData.get("numero"));
  const file = formData.get("pdf") as File | null;
  if (!file || file.size === 0) throw new Error("Sélectionne un fichier PDF.");

  // 1) Upload du PDF dans le bucket privé.
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `imports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET_PRIVE).upload(path, await file.arrayBuffer(), {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (upErr) throw new Error(`Upload : ${upErr.message}`);

  // 2) Conteneur (non-événement) + document.
  const { data: prest, error: pErr } = await supabase
    .from("prestation")
    .insert({ nom, client_id: clientId, statut: "devis", est_evenement: false, date_event_debut: date, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (pErr) throw new Error(pErr.message);
  const { data: devis } = await supabase
    .from("devis")
    .insert({ prestation_id: prest.id, nom, type, pdf_import: path, created_by: user?.id ?? null })
    .select("id")
    .single();

  // 3) Montant → ligne libre (pour afficher le total dans les listes).
  if (montant && devis) {
    await supabase.from("ligne_prestation").insert({
      prestation_id: prest.id, devis_id: devis.id, designation: nom,
      quantite: 1, unite: null, prix_unitaire: montant, remise_type: "pct", remise_valeur: 0,
      prix_total: montant, est_accessoire_auto: false,
    });
  }
  // 4) Facture → émission (apparaît dans la liste Factures avec un statut).
  if (type === "facture" && devis) {
    const { data: df } = await supabase.from("devis_facture").insert({
      prestation_id: prest.id, devis_id: devis.id, type: "facture", numero,
      montant_ht: montant ?? 0, taux_tva: 0, montant_ttc: montant ?? 0,
      date_emission: date, statut_paiement: "en_attente",
    }).select("id").single();
    // Une facture importée alimente la trésorerie comme une facture émise (entrée
    // prévisionnelle, à valider), dès lors qu'elle a un numéro et un montant.
    if (df && numero && montant) {
      const { data: { user: u2 } } = await supabase.auth.getUser();
      await supabase.from("ecriture_financiere").insert({
        date: date ?? new Date().toISOString().slice(0, 10),
        denomination: `Facture N° ${numero}`,
        type: "Prestation_Tech", specification: "Location de matériel",
        sens: "entree", statut: "previsionnel", montant_ttc: montant,
        prestation_id: prest.id, devis_facture_id: df.id, valide: false,
        created_by: u2?.id ?? null,
      });
      revaliderTresorerie();
    }
  }

  revalidatePath("/prestations");
  redirect(`/prestations?tab=${type === "facture" ? "factures" : "devis"}`);
}

/**
 * Extrait le matériel d'un devis/facture importé (PDF) via l'IA et crée les lignes
 * correspondantes (rattachées au catalogue si le nom correspond), pour pouvoir planifier.
 */
export async function extraireMaterielDevis(devisId: string) {
  const supabase = await createSupabase();
  // Petit helper : renvoie l'utilisateur sur la fiche avec un message plutôt que
  // d'afficher la page « server error » du navigateur en cas de souci IA.
  const echec = (msg: string): never => redirect(`/prestations/devis/${devisId}?msg=${encodeURIComponent(msg)}`);

  const { data: devis } = await supabase.from("devis").select("pdf_import, prestation_id").eq("id", devisId).maybeSingle();
  if (!devis?.pdf_import) echec("Ce document n'a pas de PDF importé.");

  // Télécharge le PDF depuis le bucket privé.
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_PRIVE).download(devis!.pdf_import!);
  if (dlErr || !blob) echec("Impossible de lire le PDF importé.");
  const mime = blob!.type || (devis!.pdf_import!.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  const base64 = Buffer.from(await blob!.arrayBuffer()).toString("base64");

  const lignes = await extraireMaterielPdf(base64, mime);
  if (!lignes) echec("Extraction IA momentanément indisponible (service Gemini). Réessaie dans un instant.");
  if (lignes!.length === 0) echec("Aucune ligne de matériel détectée dans le PDF.");
  const items = lignes!;

  // Catalogue pour rattacher chaque ligne à une référence si le nom correspond.
  const { data: refs } = await supabase.from("materiel_reference").select("id, nom, categorie_id");
  const references = (refs ?? []) as { id: string; nom: string; categorie_id: string | null }[];
  const trouverRef = (designation: string) => {
    const d = designation.toLowerCase();
    return references.find((r) => r.nom && (d.includes(r.nom.toLowerCase()) || r.nom.toLowerCase().includes(d))) ?? null;
  };

  const rows = items.map((l) => {
    const ref = trouverRef(l.designation);
    return {
      prestation_id: devis!.prestation_id, devis_id: devisId,
      reference_id: ref?.id ?? null, categorie_id: ref?.categorie_id ?? null,
      designation: l.designation, unite: null,
      quantite: l.quantite, prix_unitaire: l.prix_unitaire, remise_type: "pct", remise_valeur: 0,
      prix_total: Math.round(l.quantite * l.prix_unitaire * 100) / 100, est_accessoire_auto: false,
    };
  });
  const { error } = await supabase.from("ligne_prestation").insert(rows);
  if (error) throw new Error(error.message);

  await toucherDevis(supabase, devisId);
  revalidatePath(`/prestations/devis/${devisId}`);
  redirect(`/prestations/devis/${devisId}?edit=1`);
}

// ---------- Prestation (événement) ----------

function prestationFromForm(formData: FormData) {
  return {
    client_id: str(formData.get("client_id")),
    nom: String(formData.get("nom") ?? "").trim(),
    lieu: str(formData.get("lieu")),
    date_prepa: str(formData.get("date_prepa")),
    date_event_debut: str(formData.get("date_event_debut")),
    date_event_fin: str(formData.get("date_event_fin")),
    date_retour: str(formData.get("date_retour")),
    statut: str(formData.get("statut")) ?? "devis",
  };
}

/** Crée un événement + un premier devis, puis ouvre le constructeur de ce devis. */
export async function createPrestation(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("prestation")
    .insert({ ...prestationFromForm(formData), created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const type = str(formData.get("devis_type")) === "facture" ? "facture" : "devis";
  const source = str(formData.get("source_devis_id"));

  let devisId: string | null = null;
  if (source) {
    // Devis « à partir d'un devis existant » : on copie le modèle dans le nouvel événement.
    devisId = await copierDevisDans(supabase, source, data.id, user?.id ?? null, type);
  }
  if (!devisId) {
    const { data: devis } = await supabase
      .from("devis")
      .insert({ prestation_id: data.id, nom: type === "facture" ? "Facture" : "Devis", type, created_by: user?.id ?? null })
      .select("id")
      .single();
    devisId = devis?.id ?? null;
  }

  revalidatePath("/prestations");
  redirect(devisId ? `/prestations/devis/${devisId}?edit=1` : `/prestations/${data.id}`);
}

/** Copie un devis (lignes + transport) dans un événement cible. Renvoie l'id du nouveau devis. */
/** Crée un événement seul (sans devis) depuis la planification → ouvre le hub de planification. */
export async function createEvenement(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("prestation")
    .insert({ ...prestationFromForm(formData), est_evenement: true, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/planification");
  redirect(`/prestations/${data.id}`);
}

/** Associe (copie) un devis existant à un événement, puis l'ouvre. */
export async function associerDevisExistant(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const source = str(formData.get("source_devis_id"));
  if (!source) return;
  const { data: { user } } = await supabase.auth.getUser();
  await copierDevisDans(supabase, source, prestationId, user?.id ?? null);
  revalidatePath(`/prestations/${prestationId}`);
  // On reste sur la liste des documents de l'événement (on n'ouvre pas le doc attaché).
  redirect(`/prestations/${prestationId}?tab=devis`);
}

/**
 * Rattache un devis (et ses lignes / transport / facture) à un VRAI événement.
 * Supprime l'ancien conteneur s'il n'était qu'un porte-devis (pas un événement) devenu vide.
 */
export async function associerDevisAEvenement(devisId: string, formData: FormData) {
  const supabase = await createSupabase();
  const eventId = str(formData.get("prestation_id"));
  if (!eventId) return;

  const { data: d } = await supabase.from("devis").select("prestation_id").eq("id", devisId).maybeSingle();
  const ancien = (d?.prestation_id as string | null) ?? null;
  if (ancien === eventId) redirect(`/prestations/devis/${devisId}`);

  await supabase.from("devis").update({ prestation_id: eventId }).eq("id", devisId);
  await supabase.from("ligne_prestation").update({ prestation_id: eventId }).eq("devis_id", devisId);
  await supabase.from("transport").update({ prestation_id: eventId }).eq("devis_id", devisId);
  await supabase.from("devis_facture").update({ prestation_id: eventId }).eq("devis_id", devisId);

  if (ancien) {
    const { data: anc } = await supabase.from("prestation").select("est_evenement").eq("id", ancien).maybeSingle();
    const { count } = await supabase.from("devis").select("id", { count: "exact", head: true }).eq("prestation_id", ancien);
    if (anc && !anc.est_evenement && (count ?? 0) === 0) {
      await supabase.from("prestation").delete().eq("id", ancien);
    }
  }

  revalidatePath("/prestations");
  revalidatePath(`/prestations/${eventId}`);
  redirect(`/prestations/devis/${devisId}`);
}

export async function updatePrestation(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("prestation").update(prestationFromForm(formData)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/prestations/${id}`);
  redirect(`/prestations/${id}`);
}

export async function updateStatut(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const statut = str(formData.get("statut")) ?? "devis";
  const { error } = await supabase.from("prestation").update({ statut }).eq("id", id);
  if (error) throw new Error(error.message);

  // Effet de bord : un événement ANNULÉ libère le matériel réservé (il redevient
  // disponible pour d'autres dates) et sort du prévisionnel de trésorerie.
  if (statut === "annule") {
    await supabase.from("reservation_unite").delete().eq("prestation_id", id);
    const { data: devisIds } = await supabase.from("devis").select("id").eq("prestation_id", id);
    for (const d of devisIds ?? []) {
      await supabase.from("ecriture_financiere").delete().eq("devis_id", d.id).eq("statut", "previsionnel");
    }
    revaliderTresorerie();
  }
  revalidatePath(`/prestations/${id}`);
  revalidatePath(`/prestations/${id}/preparation`);
  revalidatePath("/planification");
}

export async function deletePrestation(id: string, retour?: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("prestation").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/prestations");
  revalidatePath("/planification");
  redirect(retour ?? "/planification");
}

// ---------- Personnes attachées à l'événement ----------

function rolesFromForm(formData: FormData): string[] {
  return formData.getAll("role").map((v) => String(v)).filter((r) => (ROLES_MEMBRE as readonly string[]).includes(r));
}

export async function attacherMembre(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const membreId = str(formData.get("membre_id"));
  if (!membreId) return;
  const { error } = await supabase
    .from("prestation_membre")
    .upsert({ prestation_id: prestationId, membre_id: membreId, role: rolesFromForm(formData) }, { onConflict: "prestation_id,membre_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/prestations/${prestationId}`);
}

/** Change les rôles d'une personne affectée à l'événement. */
export async function setRoleMembre(prestationId: string, membreId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("prestation_membre")
    .update({ role: rolesFromForm(formData) })
    .eq("prestation_id", prestationId)
    .eq("membre_id", membreId);
  if (error) throw new Error(error.message);
  revalidatePath(`/prestations/${prestationId}`);
}

export async function detacherMembre(prestationId: string, membreId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("prestation_membre")
    .delete()
    .eq("prestation_id", prestationId)
    .eq("membre_id", membreId);
  if (error) throw new Error(error.message);
  revalidatePath(`/prestations/${prestationId}`);
}

// ---------- Devis (documents de l'événement) ----------

/** Crée un nouveau devis vierge dans un événement et l'ouvre. */
export async function createDevis(prestationId: string, formData?: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const type = formData && str(formData.get("type")) === "facture" ? "facture" : "devis";
  const nom = (formData && str(formData.get("nom"))) ?? (type === "facture" ? "Facture" : "Devis");
  const { data, error } = await supabase
    .from("devis")
    .insert({ prestation_id: prestationId, nom, type, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/prestations/${prestationId}`);
  redirect(`/prestations/devis/${data.id}?edit=1`);
}

/** Duplique un devis (ses lignes + son transport) dans le MÊME événement. */
export async function duplicerDevis(devisId: string) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: src } = await supabase.from("devis").select("*").eq("id", devisId).single();
  if (!src) throw new Error("Devis introuvable.");

  const { data: nouveau, error } = await supabase
    .from("devis")
    .insert({
      prestation_id: src.prestation_id,
      nom: `${src.nom ?? "Devis"} (copie)`,
      type: src.type,
      remise_globale_type: src.remise_globale_type,
      remise_globale_valeur: src.remise_globale_valeur,
      remise_globale_libelle: src.remise_globale_libelle,
      source_devis_id: src.id,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Copie des lignes en conservant la hiérarchie parent -> accessoires.
  const { data: lignes } = await supabase
    .from("ligne_prestation")
    .select("*")
    .eq("devis_id", devisId)
    .order("created_at");
  const idMap = new Map<string, string>();
  const toInsert = (lignes ?? []).filter((l) => !l.ligne_parent_id);
  for (const l of toInsert) {
    const { data: ins } = await supabase
      .from("ligne_prestation")
      .insert(copieLigne(l, src.prestation_id, nouveau.id, null))
      .select("id")
      .single();
    if (ins) idMap.set(l.id, ins.id);
  }
  for (const l of (lignes ?? []).filter((x) => x.ligne_parent_id)) {
    const newParent = idMap.get(l.ligne_parent_id as string) ?? null;
    await supabase.from("ligne_prestation").insert(copieLigne(l, src.prestation_id, nouveau.id, newParent));
  }

  // Copie du transport
  const { data: transports } = await supabase.from("transport").select("*").eq("devis_id", devisId);
  for (const t of transports ?? []) {
    await supabase.from("transport").insert({
      prestation_id: src.prestation_id,
      devis_id: nouveau.id,
      vehicule_id: t.vehicule_id,
      nb_vehicules: t.nb_vehicules,
      km: t.km,
      cout_calcule: t.cout_calcule,
    });
  }

  revalidatePath(`/prestations/${src.prestation_id}`);
  redirect(`/prestations/devis/${nouveau.id}`);
}

/** Supprime un devis/facture. `retour` fixe la redirection (ex. rester sur la liste globale). */
export async function deleteDevis(devisId: string, retour?: string) {
  const supabase = await createSupabase();
  const { data: d } = await supabase.from("devis").select("prestation_id").eq("id", devisId).single();
  const prestId = (d?.prestation_id as string | null) ?? null;
  const { error } = await supabase.from("devis").delete().eq("id", devisId);
  if (error) throw new Error(error.message);

  let estEvt = false;
  let contenantSupprime = false;
  if (prestId) {
    const { data: p } = await supabase.from("prestation").select("est_evenement").eq("id", prestId).maybeSingle();
    estEvt = !!p?.est_evenement;
    // Conteneur « porte-devis » (pas un vrai événement) devenu vide → on le supprime aussi.
    if (!estEvt) {
      const { count } = await supabase.from("devis").select("id", { count: "exact", head: true }).eq("prestation_id", prestId);
      if ((count ?? 0) === 0) { await supabase.from("prestation").delete().eq("id", prestId); contenantSupprime = true; }
    }
    revalidatePath(`/prestations/${prestId}`);
  }
  revalidatePath("/prestations");
  revalidatePath("/planification");
  // Redirection explicite si fournie (suppression depuis une liste), sinon retour contextuel :
  // événement → sa fiche, location encore existante → sa fiche, sinon la liste.
  if (retour) redirect(retour);
  if (prestId && estEvt) redirect(`/prestations/${prestId}?tab=devis`);
  if (prestId && !contenantSupprime) redirect(`/planification/location/${prestId}?tab=devis`);
  redirect("/prestations");
}

export async function renameDevis(devisId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: d } = await supabase.from("devis").select("prestation_id").eq("id", devisId).single();
  const { error } = await supabase
    .from("devis")
    .update({ nom: str(formData.get("nom")) ?? "Devis", updated_by: user?.id ?? null })
    .eq("id", devisId);
  if (error) throw new Error(error.message);
  if (d) revalidatePath(`/prestations/${d.prestation_id}`);
}

export async function updateRemiseGlobale(devisId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: d } = await supabase.from("devis").select("prestation_id").eq("id", devisId).single();
  const { error } = await supabase
    .from("devis")
    .update({
      remise_globale_type: remiseType(formData.get("remise_globale_type")),
      remise_globale_valeur: num(formData.get("remise_globale_valeur")) ?? 0,
      remise_globale_libelle: str(formData.get("remise_globale_libelle")),
      updated_by: user?.id ?? null,
    })
    .eq("id", devisId);
  if (error) throw new Error(error.message);
  if (d) revalidatePath(`/prestations/${d.prestation_id}`);
}

/** Coefficient multi-jours appliqué au total matériel (null/1 = tarif 1 jour). */
export async function updateCoefficientDuree(devisId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: d } = await supabase.from("devis").select("prestation_id").eq("id", devisId).single();
  const c = num(formData.get("coefficient_duree"));
  const { error } = await supabase
    .from("devis")
    .update({ coefficient_duree: c && c > 0 ? c : null, updated_by: user?.id ?? null })
    .eq("id", devisId);
  if (error) throw new Error(error.message);
  if (d) revalidatePath(`/prestations/${d.prestation_id}`);
}

// ---------- Lignes ----------

/** Résout les champs d'une ligne (avec valeurs par défaut depuis le catalogue). */
async function resoudreLigne(supabase: Supa, formData: FormData) {
  const referenceId = str(formData.get("reference_id"));
  let designation = str(formData.get("designation"));
  let prixUnitaire = num(formData.get("prix_unitaire"));
  let categorieId = str(formData.get("categorie_id"));

  if (referenceId) {
    const { data: ref } = await supabase
      .from("materiel_reference")
      .select("nom, designation, prix_location_jour, categorie_id")
      .eq("id", referenceId)
      .single();
    if (ref) {
      if (!designation) designation = (ref as unknown as { designation: string | null }).designation ?? ref.nom;
      if (prixUnitaire === null) prixUnitaire = Number(ref.prix_location_jour ?? 0);
      if (!categorieId) categorieId = ref.categorie_id;
    }
  }

  const quantite = Math.max(1, num(formData.get("quantite")) ?? 1);
  const type = remiseType(formData.get("remise_type"));
  const remiseValeur = num(formData.get("remise_valeur")) ?? 0;
  const { net } = montantLigne({ prixUnitaire: prixUnitaire ?? 0, quantite, remiseType: type, remiseValeur });

  return {
    reference_id: referenceId,
    designation,
    unite: str(formData.get("unite")),
    categorie_id: categorieId,
    quantite,
    prix_unitaire: prixUnitaire ?? 0,
    remise_type: type,
    remise_valeur: remiseValeur,
    prix_total: net,
  };
}

/** (Ré)génère les accessoires obligatoires d'une ligne parente (prix à plat catalogue). */
async function genererAccessoiresAuto(
  supabase: Supa,
  args: { prestationId: string; devisId: string; parentId: string; referenceId: string; quantiteParent: number },
) {
  await supabase.from("ligne_prestation").delete().eq("ligne_parent_id", args.parentId);

  const { data: regles } = await supabase
    .from("kit_regle")
    .select("reference_accessoire_id, quantite_par_unite, accessoire:materiel_reference!reference_accessoire_id(nom, designation, prix_location_jour, categorie_id)")
    .eq("reference_parent_id", args.referenceId)
    .eq("obligatoire", true);

  for (const r of regles ?? []) {
    const acc = r.accessoire as unknown as
      | { nom: string; designation: string | null; prix_location_jour: number; categorie_id: string | null }
      | null;
    const quantite = args.quantiteParent * Number(r.quantite_par_unite);
    const prixUnitaire = Number(acc?.prix_location_jour ?? 0);
    await supabase.from("ligne_prestation").insert({
      prestation_id: args.prestationId,
      devis_id: args.devisId,
      reference_id: r.reference_accessoire_id,
      designation: acc?.designation ?? acc?.nom ?? null,
      categorie_id: acc?.categorie_id ?? null,
      quantite,
      prix_unitaire: prixUnitaire,
      remise_type: "pct",
      remise_valeur: 0,
      prix_total: Math.round(prixUnitaire * quantite * 100) / 100,
      est_accessoire_auto: true,
      ligne_parent_id: args.parentId,
    });
  }
}

export async function addLigne(prestationId: string, devisId: string, formData: FormData) {
  const supabase = await createSupabase();
  const L = await resoudreLigne(supabase, formData);
  if (!L.designation) throw new Error("Désignation requise");

  const { data: ligne, error } = await supabase
    .from("ligne_prestation")
    .insert({ prestation_id: prestationId, devis_id: devisId, est_accessoire_auto: false, ...L })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (L.reference_id) {
    await genererAccessoiresAuto(supabase, {
      prestationId,
      devisId,
      parentId: ligne.id,
      referenceId: L.reference_id,
      quantiteParent: L.quantite,
    });
  }
  await toucherDevis(supabase, devisId);
  revalidatePath(`/prestations/${prestationId}`);
}

export async function updateLigne(prestationId: string, ligneId: string, formData: FormData) {
  const supabase = await createSupabase();
  const L = await resoudreLigne(supabase, formData);
  if (!L.designation) throw new Error("Désignation requise");

  const { data: updated, error } = await supabase
    .from("ligne_prestation")
    .update(L)
    .eq("id", ligneId)
    .select("devis_id")
    .single();
  if (error) throw new Error(error.message);
  if (updated?.devis_id) await toucherDevis(supabase, updated.devis_id);

  revalidatePath(`/prestations/${prestationId}`);
  redirect(updated?.devis_id ? `/prestations/devis/${updated.devis_id}?edit=1` : `/prestations/${prestationId}`);
}

/** Édition inline d'une ligne (prix, quantité, remise) depuis le constructeur — sans quitter la page. */
export async function setLigneInline(prestationId: string, ligneId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { data: l } = await supabase
    .from("ligne_prestation")
    .select("prix_unitaire, quantite, remise_type, remise_valeur, devis_id")
    .eq("id", ligneId)
    .maybeSingle();
  if (!l) return;
  const champ = str(formData.get("champ"));
  const valeur = num(formData.get("valeur")) ?? 0;
  const patch: Record<string, number | string> = {
    prix_unitaire: Number(l.prix_unitaire ?? 0),
    quantite: Number(l.quantite ?? 1),
    remise_type: (l.remise_type as string) ?? "pct",
    remise_valeur: Number(l.remise_valeur ?? 0),
  };
  if (champ === "prix_unitaire") patch.prix_unitaire = valeur;
  else if (champ === "quantite") patch.quantite = Math.max(0, valeur);
  else if (champ === "remise_valeur") patch.remise_valeur = Math.max(0, valeur);
  else if (champ === "remise_type") patch.remise_type = remiseType(formData.get("valeur"));
  else return;

  const { net } = montantLigne({
    prixUnitaire: Number(patch.prix_unitaire), quantite: Number(patch.quantite),
    remiseType: patch.remise_type as RemiseType, remiseValeur: Number(patch.remise_valeur),
  });
  const { error } = await supabase.from("ligne_prestation").update({ ...patch, prix_total: net }).eq("id", ligneId);
  if (error) throw new Error(error.message);
  if (l.devis_id) await toucherDevis(supabase, l.devis_id);
  revalidatePath(`/prestations/${prestationId}`);
}

/** Réordonne les lignes d'une catégorie (nouvel ordre = position dans la liste). Peut aussi
 *  déplacer une ligne vers une autre catégorie (categorieId fourni pour la ligne déplacée). */
export async function reordonnerLignes(prestationId: string, ligneIds: string[], categorieId?: string | null, ligneDeplacee?: string) {
  const supabase = await createSupabase();
  let devisId: string | null = null;
  for (let i = 0; i < ligneIds.length; i++) {
    const patch: Record<string, number | string | null> = { ordre: i + 1 };
    if (categorieId !== undefined && ligneIds[i] === ligneDeplacee) patch.categorie_id = categorieId;
    const { data: l } = await supabase.from("ligne_prestation").update(patch).eq("id", ligneIds[i]).select("devis_id").maybeSingle();
    if (l?.devis_id) devisId = l.devis_id;
  }
  if (devisId) await toucherDevis(supabase, devisId);
  revalidatePath(`/prestations/${prestationId}`);
}

export async function deleteLigne(prestationId: string, ligneId: string) {
  const supabase = await createSupabase();
  const { data: ligne } = await supabase.from("ligne_prestation").select("devis_id").eq("id", ligneId).maybeSingle();
  const { error } = await supabase.from("ligne_prestation").delete().eq("id", ligneId);
  if (error) throw new Error(error.message);
  if (ligne?.devis_id) await toucherDevis(supabase, ligne.devis_id);
  revalidatePath(`/prestations/${prestationId}`);
}

// ---------- Transport ----------

export async function addTransport(prestationId: string, devisId: string, formData: FormData) {
  const supabase = await createSupabase();
  const vehiculeId = str(formData.get("vehicule_id"));
  if (!vehiculeId) throw new Error("Véhicule requis");
  const nbVehicules = Math.max(1, num(formData.get("nb_vehicules")) ?? 1);
  const km = num(formData.get("km")) ?? 0;

  const [{ data: v }, { data: p }] = await Promise.all([
    supabase.from("vehicule").select("cout_location_jour, cout_km, conso_l_100km, type_carburant").eq("id", vehiculeId).single(),
    supabase.from("parametres_entreprise").select("prix_essence, prix_diesel").limit(1).maybeSingle(),
  ]);

  const cout = coutTransport({
    nbVehicules,
    coutJour: Number(v?.cout_location_jour ?? 0),
    km,
    coutKm: coutKmVehicule(v ?? {}, { essence: Number(p?.prix_essence ?? 0), diesel: Number(p?.prix_diesel ?? 0) }),
  });

  const { error } = await supabase.from("transport").insert({
    prestation_id: prestationId,
    devis_id: devisId,
    vehicule_id: vehiculeId,
    nb_vehicules: nbVehicules,
    km,
    cout_calcule: cout,
  });
  if (error) throw new Error(error.message);
  await toucherDevis(supabase, devisId);
  revalidatePath(`/prestations/${prestationId}`);
}

export async function deleteTransport(prestationId: string, transportId: string) {
  const supabase = await createSupabase();
  const { data: t } = await supabase.from("transport").select("devis_id").eq("id", transportId).maybeSingle();
  const { error } = await supabase.from("transport").delete().eq("id", transportId);
  if (error) throw new Error(error.message);
  if (t?.devis_id) await toucherDevis(supabase, t.devis_id);
  revalidatePath(`/prestations/${prestationId}`);
}

// ---------- Réservation des unités (disponibilité) — niveau ÉVÉNEMENT ----------

/**
 * Réserve automatiquement les unités les moins utilisées et disponibles pour
 * chaque matériel sérialisé de l'ÉVÉNEMENT (agrégé sur tous ses devis), sur la
 * période prépa -> retour. Remplace les réservations existantes de l'événement.
 */
export async function reserverUnites(prestationId: string) {
  const supabase = await createSupabase();

  const { data: p } = await supabase
    .from("prestation")
    .select("date_prepa, date_event_debut, date_event_fin, date_retour")
    .eq("id", prestationId)
    .single();
  const periode = p ? periodeReservation(p) : null;
  if (!periode) throw new Error("Dates de prestation incomplètes (préparation et retour requis).");

  // On repart de zéro pour cet événement (évite les auto-conflits).
  await supabase.from("reservation_unite").delete().eq("prestation_id", prestationId);

  // Besoin par référence sérialisée (toutes lignes de l'événement)
  const { data: lignes } = await supabase
    .from("ligne_prestation")
    .select("reference_id, quantite")
    .eq("prestation_id", prestationId)
    .not("reference_id", "is", null);

  const refIds = [...new Set((lignes ?? []).map((l) => l.reference_id as string))];
  if (refIds.length === 0) {
    revalidatePath(`/prestations/${prestationId}`);
    return;
  }

  const { data: refs } = await supabase
    .from("materiel_reference")
    .select("id, est_consommable, cout_location_jour")
    .in("id", refIds);
  const serialise = new Set(
    (refs ?? []).filter((r) => !r.est_consommable && r.cout_location_jour == null).map((r) => r.id),
  );

  const besoin = new Map<string, number>();
  for (const l of lignes ?? []) {
    if (serialise.has(l.reference_id as string)) {
      besoin.set(l.reference_id as string, (besoin.get(l.reference_id as string) ?? 0) + l.quantite);
    }
  }
  if (besoin.size === 0) {
    revalidatePath(`/prestations/${prestationId}`);
    return;
  }

  const { data: unites } = await supabase
    .from("unite")
    .select("id, reference_id, compteur_sorties, compteur_heures")
    .in("reference_id", [...besoin.keys()])
    .eq("etat", "ok")
    .order("compteur_sorties", { ascending: true })
    .order("compteur_heures", { ascending: true });

  const { data: prises } = await supabase
    .from("reservation_unite")
    .select("unite_id")
    .lte("date_debut", periode.fin)
    .gte("date_fin", periode.debut);
  const indispo = new Set((prises ?? []).map((r) => r.unite_id));

  const inserts: { unite_id: string; prestation_id: string; date_debut: string; date_fin: string }[] = [];
  for (const [refId, qty] of besoin) {
    const dispo = (unites ?? []).filter((u) => u.reference_id === refId && !indispo.has(u.id));
    for (const u of dispo.slice(0, qty)) {
      inserts.push({ unite_id: u.id, prestation_id: prestationId, date_debut: periode.debut, date_fin: periode.fin });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("reservation_unite").insert(inserts);
    if (error) throw new Error(error.message);
  }
  // Stock insuffisant : on réserve ce qui est possible mais on le signale (sinon la
  // sous-réservation passe totalement inaperçue).
  const demande = [...besoin.values()].reduce((s2, q) => s2 + q, 0);
  const manquant = demande - inserts.length;
  revalidatePath(`/prestations/${prestationId}`);
  if (manquant > 0) {
    redirect(`/prestations/${prestationId}?msg=${encodeURIComponent(
      `${inserts.length} unité(s) réservée(s) — ${manquant} manquante(s) : stock insuffisant sur ces dates.`)}`);
  }
}

export async function libererReservations(prestationId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("reservation_unite").delete().eq("prestation_id", prestationId);
  if (error) throw new Error(error.message);
  revalidatePath(`/prestations/${prestationId}`);
}

// ---------- Accessoires optionnels ----------

/** Ajoute un accessoire optionnel (règle de kit non obligatoire) en ligne du devis. */
export async function ajouterAccessoireOptionnel(
  prestationId: string,
  devisId: string,
  parentLigneId: string,
  regleId: string,
) {
  const supabase = await createSupabase();

  const [{ data: regle }, { data: parent }] = await Promise.all([
    supabase
      .from("kit_regle")
      .select("quantite_par_unite, accessoire:materiel_reference!reference_accessoire_id(id, nom, prix_location_jour, categorie_id)")
      .eq("id", regleId)
      .single(),
    supabase.from("ligne_prestation").select("quantite").eq("id", parentLigneId).single(),
  ]);

  const acc = regle?.accessoire as unknown as
    | { id: string; nom: string; prix_location_jour: number; categorie_id: string | null }
    | null;
  if (!acc) throw new Error("Accessoire introuvable");

  const quantite = (parent?.quantite ?? 1) * Number(regle?.quantite_par_unite ?? 1);
  const prixUnitaire = Number(acc.prix_location_jour ?? 0);

  const { error } = await supabase.from("ligne_prestation").insert({
    prestation_id: prestationId,
    devis_id: devisId,
    reference_id: acc.id,
    designation: acc.nom,
    categorie_id: acc.categorie_id,
    quantite,
    prix_unitaire: prixUnitaire,
    remise_type: "pct",
    remise_valeur: 0,
    prix_total: Math.round(prixUnitaire * quantite * 100) / 100,
    est_accessoire_auto: true,
    ligne_parent_id: parentLigneId,
  });
  if (error) throw new Error(error.message);
  await toucherDevis(supabase, devisId);
  revalidatePath(`/prestations/${prestationId}`);
}
