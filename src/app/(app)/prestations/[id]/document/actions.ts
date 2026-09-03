"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { assemblerContenuDocument } from "@/lib/document";
import { genererDevisFacturePdf } from "@/lib/pdf/devis-facture";
import { archiverSurDrive, archiverDepuisUrl, driveConfigured, nomFichierSafe } from "@/lib/drive";
import { BUCKET_PRIVE, urlDocument } from "@/lib/storage";
import { chargerNomenclature, categorieManquante, categorieDefaut } from "@/lib/finance";
import { synchroniserEcritureDevisSigne } from "@/lib/tresorerie-sync";

type Supa = Awaited<ReturnType<typeof createSupabase>>;

function revaliderFinance() {
  revalidatePath("/finance");
  revalidatePath("/finance/journal");
  revalidatePath("/finance/synthese");
  revalidatePath("/");
}

/**
 * Auto-alimentation de la trésorerie depuis une facture émise :
 * crée/maj une écriture d'entrée liée (prévisionnelle par défaut, réelle si payée,
 * supprimée si la facture est annulée). Écriture identifiée par `devis_facture_id`
 * → jamais de doublon, n'affecte pas les écritures saisies à la main.
 */
async function synchroniserEcritureFacture(supabase: Supa, devisId: string) {
  const { data: fac } = await supabase
    .from("devis_facture")
    .select("id, numero, montant_ttc, date_echeance, date_emission, statut_paiement, prestation_id")
    .eq("devis_id", devisId)
    .eq("type", "facture")
    .maybeSingle();
  if (!fac || !fac.numero) return; // pas de facture émise → rien à alimenter
  const { data: dvNom } = await supabase.from("devis").select("nom").eq("id", devisId).maybeSingle();

  const { data: existante } = await supabase
    .from("ecriture_financiere")
    .select("id, type, specification")
    .eq("devis_facture_id", fac.id)
    .maybeSingle();

  // Facture annulée → on retire l'écriture auto liée
  if (fac.statut_paiement === "annule") {
    if (existante) await supabase.from("ecriture_financiere").delete().eq("id", existante.id);
    return;
  }

  // Catégorie : on préremplit depuis la facture émise (entrée = prestation), mais on
  // préserve une catégorie déjà saisie/valide (ne pas écraser une correction manuelle).
  const nomenclature = await chargerNomenclature(supabase);
  let type = existante?.type ?? null;
  let specification = existante?.specification ?? null;
  if (categorieManquante(nomenclature, "entree", type)) {
    const defo = categorieDefaut(nomenclature, "entree", "Prestation_Tech", "Location de matériel");
    type = defo.type;
    specification = defo.specification;
  }

  // Libellé : n° de facture + nom du client
  let clientNom = "";
  if (fac.prestation_id) {
    const { data: p } = await supabase.from("prestation").select("client(nom)").eq("id", fac.prestation_id).maybeSingle();
    clientNom = (p as unknown as { client: { nom: string } | null } | null)?.client?.nom ?? "";
  }

  const paye = fac.statut_paiement === "paye";
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    date: paye ? today : (fac.date_echeance ?? fac.date_emission ?? today),
    denomination: `${dvNom?.nom ? `${dvNom.nom} — ` : ""}Facture N° ${fac.numero}${clientNom ? ` (${clientNom})` : ""}`,
    type,
    specification,
    sens: "entree",
    statut: paye ? "reel" : "previsionnel",
    montant_ttc: Number(fac.montant_ttc ?? 0),
    prestation_id: fac.prestation_id,
    devis_facture_id: fac.id,
  };

  if (existante) {
    await supabase.from("ecriture_financiere").update(payload).eq("id", existante.id);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("ecriture_financiere").insert({ ...payload, created_by: user?.id ?? null });
  }
}

/** Met à jour le statut de paiement d'une facture émise + resynchronise la trésorerie. */
export async function setStatutPaiement(devisId: string, prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const statut = String(formData.get("statut_paiement") ?? "en_attente");
  const { error } = await supabase
    .from("devis_facture")
    .update({ statut_paiement: statut })
    .eq("devis_id", devisId)
    .eq("type", "facture");
  if (error) throw new Error(error.message);
  await synchroniserEcritureFacture(supabase, devisId);
  revalidatePath(`/prestations/${prestationId}/document`);
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath("/prestations");
  revalidatePath("/clients/[id]", "page");
  revaliderFinance();
}

/**
 * Supprime l'ÉMISSION de facture d'un devis (le devis lui-même est conservé).
 * L'entrée de trésorerie liée est retirée automatiquement (cascade FK).
 */
export async function supprimerFacture(devisId: string, prestationId: string, retour?: string) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("devis_facture")
    .delete()
    .eq("devis_id", devisId)
    .eq("type", "facture");
  if (error) throw new Error(error.message);
  // La facture n'existe plus → si le devis est signé, on rétablit l'entrée prévisionnelle,
  // et le devis source (en cas de découpage) reprend ce montant dans son reste à facturer.
  const { data: dv0 } = await supabase.from("devis").select("source_devis_id").eq("id", devisId).maybeSingle();
  await synchroniserEcritureDevisSigne(supabase, devisId);
  if (dv0?.source_devis_id) await synchroniserEcritureDevisSigne(supabase, dv0.source_devis_id as string);
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath(`/prestations/${prestationId}/document`);
  revalidatePath("/prestations");
  revaliderFinance();
  redirect(retour ?? `/prestations/devis/${devisId}`);
}

/** Statut de signature d'un devis par le client (signé / refusé / en attente). */
export async function setStatutSignature(devisId: string, prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const raw = String(formData.get("statut_signature") ?? "");
  const statut = raw === "signe" || raw === "refuse" || raw === "valide" ? raw : null;
  const { error } = await supabase.from("devis").update({ statut_signature: statut }).eq("id", devisId);
  if (error) throw new Error(error.message);
  await synchroniserEcritureDevisSigne(supabase, devisId);
  revalidatePath(`/prestations/${prestationId}/document`);
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath("/prestations");
  revalidatePath("/clients/[id]", "page");
  revaliderFinance();
}

/** Upload de la version du devis signée par le client (PDF/image) → marque le devis « signé ». */
export async function uploaderDevisSigne(devisId: string, prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const file = formData.get("pdf_signe") as File | null;
  if (!file || file.size === 0) throw new Error("Sélectionne le fichier signé.");
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `devis-signes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, await file.arrayBuffer(), {
    contentType: file.type || "application/pdf", upsert: false,
  });
  if (error) throw new Error(`Upload : ${error.message}`);
  const { error: e2 } = await supabase.from("devis").update({ pdf_signe: data.path, statut_signature: "signe" }).eq("id", devisId);
  if (e2) throw new Error(e2.message);

  // Archivage Drive du devis SIGNÉ par le client (best-effort) sous « Devis signés / année ».
  if (driveConfigured()) {
    try {
      const { data: dv } = await supabase.from("devis").select("nom").eq("id", devisId).maybeSingle();
      const url = await urlDocument(supabase, data.path, 600);
      const annee = new Date().toISOString().slice(0, 4);
      if (url) await archiverDepuisUrl(url, ["Devis signés", annee], nomFichierSafe(`Devis signe ${dv?.nom ?? devisId}`));
    } catch (e) {
      console.error("Archivage devis signé échec:", (e as Error).message);
    }
  }

  await synchroniserEcritureDevisSigne(supabase, devisId);
  revalidatePath(`/prestations/${prestationId}/document`);
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath("/prestations");
  revalidatePath("/clients/[id]", "page");
  revaliderFinance();
}

/** Émet (ou met à jour) un devis/une facture : numéro, dates, totaux. Archive le PDF sur Drive. */
export async function emettreDocument(devisId: string, type: "devis" | "facture") {
  const supabase = await createSupabase();

  const contenu = await assemblerContenuDocument(supabase, devisId);
  if (!contenu) throw new Error("Devis introuvable.");

  const { data: devisRow } = await supabase.from("devis").select("prestation_id, source_devis_id").eq("id", devisId).single();
  const prestationId = devisRow?.prestation_id as string;

  const { data: existant } = await supabase
    .from("devis_facture")
    .select("id, numero, date_emission")
    .eq("devis_id", devisId)
    .eq("type", type)
    .maybeSingle();

  const today = new Date();
  const iso = today.toISOString().slice(0, 10);

  // Numéro : attribution ATOMIQUE côté base (un seul UPDATE ... RETURNING) → pas de doublon.
  let numero = existant?.numero ?? null;
  if (!numero) {
    const { data: num } = await supabase.rpc("attribuer_numero_document", { p_type: type });
    numero = (num as string | null) ?? null;
  }

  // Une facture déjà numérotée conserve sa DATE D'ÉMISSION d'origine (valeur comptable).
  const emission = existant?.numero && existant?.date_emission ? existant.date_emission : iso;
  const echeance = type === "devis"
    ? new Date(new Date(emission).getTime() + 30 * 86400000).toISOString().slice(0, 10)
    : emission;
  const payload = {
    prestation_id: prestationId,
    devis_id: devisId,
    type,
    numero,
    montant_ht: contenu.totaux.totalHT,
    taux_tva: contenu.tva.taux,
    montant_ttc: contenu.tva.totalTtc,
    date_emission: emission,
    date_echeance: echeance,
  };

  if (existant) {
    await supabase.from("devis_facture").update(payload).eq("id", existant.id);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("devis_facture").insert({ ...payload, created_by: user?.id ?? null });
  }

  // Archivage PDF sur Google Drive (best-effort, seulement si Drive configuré).
  if (driveConfigured()) {
    try {
      const pdf = await genererDevisFacturePdf({ ...contenu, type, numero, dateEmission: emission, dateEcheance: echeance });
      const dossier = type === "devis" ? ["Devis", emission.slice(0, 4)] : ["Factures", emission.slice(0, 4)];
      const nom = nomFichierSafe(`${type === "devis" ? "Devis" : "Facture"} ${numero ?? contenu.prestationNom}`) + ".pdf";
      await archiverSurDrive({ dossier, nom, mimeType: "application/pdf", data: pdf });
    } catch (e) {
      console.error("Archivage PDF échec:", (e as Error).message);
    }
  }

  // Historique
  {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("devis_historique").insert({
      devis_id: devisId,
      membre_id: user?.id ?? null,
      action: `${type === "facture" ? "Facture émise" : "Devis émis"}${numero ? ` (n° ${numero})` : ""}`,
    });
  }

  // Auto-alimentation trésorerie : une facture émise crée/maj une entrée prévisionnelle liée.
  if (type === "facture") {
    await synchroniserEcritureFacture(supabase, devisId);
    // La facture prend le relais → on retire l'éventuelle entrée « devis signé ».
    await synchroniserEcritureDevisSigne(supabase, devisId);
    // Tranche d'un découpage : le devis source ne doit plus prévoir que le RESTE à facturer.
    if (devisRow?.source_devis_id) await synchroniserEcritureDevisSigne(supabase, devisRow.source_devis_id as string);
    revaliderFinance();
  }

  revalidatePath(`/prestations/${prestationId}/document`);
  redirect(`/prestations/${prestationId}/document?devis=${devisId}&type=${type}`);
}

/**
 * Redate un devis : nouvelle date d'émission + validité recalculée (30 jours).
 * Le numéro est conservé. Réservé aux DEVIS : une facture émise garde sa date
 * d'origine (valeur comptable, numérotation chronologique).
 */
export async function redaterDevis(devisId: string, formData: FormData) {
  const supabase = await createSupabase();

  const { data: doc } = await supabase
    .from("devis_facture")
    .select("id, type, prestation_id")
    .eq("devis_id", devisId)
    .eq("type", "devis")
    .maybeSingle();
  if (!doc) throw new Error("Ce devis n'a pas encore été émis.");

  const saisie = String(formData.get("date") ?? "").trim();
  const emission = /^\d{4}-\d{2}-\d{2}$/.test(saisie) ? saisie : new Date().toISOString().slice(0, 10);
  const echeance = new Date(new Date(emission).getTime() + 30 * 86400000).toISOString().slice(0, 10);

  await supabase.from("devis_facture").update({ date_emission: emission, date_echeance: echeance }).eq("id", doc.id);

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("devis_historique").insert({
    devis_id: devisId,
    membre_id: user?.id ?? null,
    action: `Devis redaté au ${emission.slice(8, 10)}/${emission.slice(5, 7)}/${emission.slice(0, 4)} (validité ${echeance.slice(8, 10)}/${echeance.slice(5, 7)}/${echeance.slice(0, 4)})`,
  });

  revalidatePath(`/prestations/${doc.prestation_id}/document`);
  revalidatePath(`/prestations/devis/${devisId}`);
}
