"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { assemblerContenuDocument } from "@/lib/document";
import { genererDevisFacturePdf } from "@/lib/pdf/devis-facture";
import { archiverSurDrive, driveConfigured, nomFichierSafe } from "@/lib/drive";
import { BUCKET_PRIVE } from "@/lib/storage";
import { chargerNomenclature, categorieManquante, categorieDefaut } from "@/lib/finance";

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
    denomination: `Facture N° ${fac.numero}${clientNom ? ` — ${clientNom}` : ""}`,
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
  revaliderFinance();
}

/** Statut de signature d'un devis par le client (signé / refusé / en attente). */
export async function setStatutSignature(devisId: string, prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const raw = String(formData.get("statut_signature") ?? "");
  const statut = raw === "signe" || raw === "refuse" ? raw : null;
  const { error } = await supabase.from("devis").update({ statut_signature: statut }).eq("id", devisId);
  if (error) throw new Error(error.message);
  revalidatePath(`/prestations/${prestationId}/document`);
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath("/prestations");
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
  revalidatePath(`/prestations/${prestationId}/document`);
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath("/prestations");
}

/** Émet (ou met à jour) un devis/une facture : numéro, dates, totaux. Archive le PDF sur Drive. */
export async function emettreDocument(devisId: string, type: "devis" | "facture") {
  const supabase = await createSupabase();

  const contenu = await assemblerContenuDocument(supabase, devisId);
  if (!contenu) throw new Error("Devis introuvable.");

  const { data: devisRow } = await supabase.from("devis").select("prestation_id").eq("id", devisId).single();
  const prestationId = devisRow?.prestation_id as string;

  const { data: existant } = await supabase
    .from("devis_facture")
    .select("id, numero")
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

  const echeance = type === "devis" ? new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10) : iso;
  const payload = {
    prestation_id: prestationId,
    devis_id: devisId,
    type,
    numero,
    montant_ht: contenu.totaux.totalHT,
    taux_tva: contenu.tva.taux,
    montant_ttc: contenu.tva.totalTtc,
    date_emission: iso,
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
      const pdf = await genererDevisFacturePdf({ ...contenu, type, numero, dateEmission: iso, dateEcheance: echeance });
      const dossier = type === "devis" ? ["Devis", iso.slice(0, 4)] : ["Factures", iso.slice(0, 4)];
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
    revaliderFinance();
  }

  revalidatePath(`/prestations/${prestationId}/document`);
  redirect(`/prestations/${prestationId}/document?devis=${devisId}&type=${type}`);
}
