"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { archiverDepuisUrl, nomFichierSafe } from "@/lib/drive";
import { BUCKET_PRIVE } from "@/lib/storage";

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function revaliderFinance() {
  revalidatePath("/finance");
  revalidatePath("/finance/synthese");
  revalidatePath("/finance/journal");
}

async function uploadFactureFile(supabase: Awaited<ReturnType<typeof createSupabase>>, file: File): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = await file.arrayBuffer();
  const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, buffer, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`Upload facture: ${error.message}`);
  return data.path;
}

async function ecritureFromForm(supabase: Awaited<ReturnType<typeof createSupabase>>, formData: FormData) {
  const sens = String(formData.get("sens") ?? "sortie") === "entree" ? "entree" : "sortie";
  const statut = String(formData.get("statut") ?? "reel") === "previsionnel" ? "previsionnel" : "reel";

  // Upload PDF fournisseur si présent
  const pdfFile = formData.get("facture_pdf") as File | null;
  let facture = str(formData.get("facture"));
  if (pdfFile && pdfFile.size > 0) {
    const url = await uploadFactureFile(supabase, pdfFile);
    if (url) facture = url;
  }

  // Pré-remplit « effectué par » avec le membre connecté si le champ est vide.
  const { data: { user } } = await supabase.auth.getUser();
  let effectuePar = str(formData.get("effectue_par"));
  if (!effectuePar && user) {
    const { data: m } = await supabase.from("membre").select("nom, email").eq("id", user.id).maybeSingle();
    effectuePar = (m?.nom?.trim() || m?.email?.split("@")[0] || null) as string | null;
  }

  return {
    date: str(formData.get("date")) ?? new Date().toISOString().slice(0, 10),
    denomination: str(formData.get("denomination")),
    type: str(formData.get("type")),
    specification: str(formData.get("specification")),
    sens,
    statut,
    montant_ttc: num(formData.get("montant_ttc")),
    facture,
    effectue_par: effectuePar,
    notes: str(formData.get("notes")),
    prestation_id: str(formData.get("prestation_id")),
  };
}

// ─── Gestion des catégories / sous-catégories (nomenclature éditable) ───────
function revaliderCategories() {
  revalidatePath("/parametres");
  revalidatePath("/finance/journal");
  revalidatePath("/finance/synthese");
}

export async function createFinanceCategorie(sens: "entree" | "sortie", formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) return;
  const { error } = await supabase.from("finance_categorie").insert({ sens, nom, ordre: num(formData.get("ordre")) || 99 });
  if (error) throw new Error(error.message);
  revaliderCategories();
}

export async function renameFinanceCategorie(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) return;
  const { data: old } = await supabase.from("finance_categorie").select("nom, sens").eq("id", id).single();
  const { error } = await supabase.from("finance_categorie").update({ nom }).eq("id", id);
  if (error) throw new Error(error.message);
  // Propage aux écritures existantes qui référencent l'ancien nom.
  if (old && old.nom !== nom) await supabase.from("ecriture_financiere").update({ type: nom }).eq("sens", old.sens).eq("type", old.nom);
  revaliderCategories();
}

/**
 * Renommage groupé (un seul bouton) : lit les champs `catnom_<id>` et `subnom_<id>`
 * et propage aux écritures existantes (type / specification), comme les renommages unitaires.
 */
export async function updateFinanceNoms(formData: FormData) {
  const supabase = await createSupabase();

  const cats: { id: string; nom: string }[] = [];
  const subs: { id: string; nom: string }[] = [];
  for (const [key, value] of formData.entries()) {
    const nom = String(value).trim();
    if (!nom) continue;
    const mc = key.match(/^catnom_(.+)$/);
    const ms = key.match(/^subnom_(.+)$/);
    if (mc) cats.push({ id: mc[1], nom });
    else if (ms) subs.push({ id: ms[1], nom });
  }

  // Catégories : renomme + propage sur ecriture_financiere.type (même sens).
  for (const { id, nom } of cats) {
    const { data: old } = await supabase.from("finance_categorie").select("nom, sens").eq("id", id).single();
    if (!old || old.nom === nom) { if (old && old.nom !== nom) await supabase.from("finance_categorie").update({ nom }).eq("id", id); continue; }
    await supabase.from("finance_categorie").update({ nom }).eq("id", id);
    await supabase.from("ecriture_financiere").update({ type: nom }).eq("sens", old.sens).eq("type", old.nom);
  }

  // Sous-catégories : renomme + propage sur ecriture_financiere.specification (ciblé sens+type).
  for (const { id, nom } of subs) {
    const { data: old } = await supabase
      .from("finance_sous_categorie")
      .select("nom, categorie:categorie_id(nom, sens)")
      .eq("id", id)
      .single();
    if (!old || old.nom === nom) continue;
    await supabase.from("finance_sous_categorie").update({ nom }).eq("id", id);
    const cat = old.categorie as unknown as { nom: string; sens: string } | null;
    if (cat) {
      await supabase.from("ecriture_financiere").update({ specification: nom })
        .eq("sens", cat.sens).eq("type", cat.nom).eq("specification", old.nom);
    }
  }

  revaliderCategories();
}

export async function deleteFinanceCategorie(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("finance_categorie").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revaliderCategories();
}

export async function createFinanceSousCategorie(categorieId: string, formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) return;
  const { error } = await supabase.from("finance_sous_categorie").insert({ categorie_id: categorieId, nom, ordre: num(formData.get("ordre")) || 99 });
  if (error) throw new Error(error.message);
  revaliderCategories();
}

export async function renameFinanceSousCategorie(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const nom = str(formData.get("nom"));
  if (!nom) return;
  const { data: old } = await supabase
    .from("finance_sous_categorie")
    .select("nom, categorie:categorie_id(nom, sens)")
    .eq("id", id)
    .single();
  const { error } = await supabase.from("finance_sous_categorie").update({ nom }).eq("id", id);
  if (error) throw new Error(error.message);
  // Propage aux écritures (spécification), en ciblant la bonne catégorie/sens.
  const cat = old?.categorie as unknown as { nom: string; sens: string } | null;
  if (old && cat && old.nom !== nom) {
    await supabase.from("ecriture_financiere").update({ specification: nom })
      .eq("sens", cat.sens).eq("type", cat.nom).eq("specification", old.nom);
  }
  revaliderCategories();
}

export async function deleteFinanceSousCategorie(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("finance_sous_categorie").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revaliderCategories();
}

export async function createEcriture(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const ecriture = await ecritureFromForm(supabase, formData);
  const { error } = await supabase
    .from("ecriture_financiere")
    .insert({ ...ecriture, created_by: user?.id ?? null });
  if (error) throw new Error(error.message);

  // Archivage Drive (best-effort) : facture reçue (fichier téléversé sur une sortie)
  if (ecriture.sens === "sortie" && ecriture.facture && /^https?:\/\//.test(ecriture.facture)) {
    const annee = (ecriture.date ?? new Date().toISOString()).slice(0, 4);
    await archiverDepuisUrl(
      ecriture.facture,
      ["Factures reçues", annee],
      nomFichierSafe(`${ecriture.date ?? ""} ${ecriture.denomination ?? "facture"}`),
    );
  }
  revaliderFinance();
}

export async function updateEcriture(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("ecriture_financiere").update(await ecritureFromForm(supabase, formData)).eq("id", id);
  if (error) throw new Error(error.message);
  revaliderFinance();
  // Retour d'où l'on vient (champ caché « retour »), sinon le journal.
  const retour = String(formData.get("retour") ?? "").trim();
  redirect(retour.startsWith("/") ? retour : "/finance/journal");
}

export async function deleteEcriture(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("ecriture_financiere").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revaliderFinance();
}

/** Ajoute un ou plusieurs justificatifs (fichiers) à une écriture financière. */
export async function ajouterJustificatifs(ecritureId: string, formData: FormData) {
  const supabase = await createSupabase();
  const files = formData.getAll("justificatifs").filter((f): f is File => f instanceof File && f.size > 0);
  const refTexte = str(formData.get("justificatif_ref"));

  const rows: { ecriture_id: string; url: string; nom: string | null }[] = [];
  for (const file of files) {
    const url = await uploadFactureFile(supabase, file);
    if (url) rows.push({ ecriture_id: ecritureId, url, nom: file.name });
  }
  // Référence textuelle (numéro/lien) éventuelle
  if (refTexte) rows.push({ ecriture_id: ecritureId, url: refTexte, nom: refTexte });

  if (rows.length > 0) {
    const { error } = await supabase.from("justificatif").insert(rows);
    if (error) throw new Error(error.message);

    // Archivage Drive best-effort des fichiers uploadés
    const { data: ecr } = await supabase.from("ecriture_financiere").select("date, denomination").eq("id", ecritureId).maybeSingle();
    const annee = (ecr?.date ?? new Date().toISOString()).slice(0, 4);
    for (const r of rows) {
      if (/^https?:\/\//.test(r.url) && r.url.includes("/storage/")) {
        await archiverDepuisUrl(r.url, ["Justificatifs", annee], nomFichierSafe(`${ecr?.date ?? ""} ${r.nom ?? "justificatif"}`));
      }
    }
  }
  revaliderFinance();
  revalidatePath(`/finance/${ecritureId}`);
}

export async function supprimerJustificatif(justificatifId: string, ecritureId: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("justificatif").delete().eq("id", justificatifId);
  if (error) throw new Error(error.message);
  revaliderFinance();
  revalidatePath(`/finance/${ecritureId}`);
}

/** Valide (ou dévalide) une écriture financière — confirmation humaine des écritures auto. */
export async function setValideEcriture(id: string, valide: boolean) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("ecriture_financiere").update({ valide }).eq("id", id);
  if (error) throw new Error(error.message);
  revaliderFinance();
}

/** Rattache (ou détache si vide) une écriture financière à un événement. */
export async function attacherEcritureAPrestation(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const prestationId = str(formData.get("prestation_id"));
  const { error } = await supabase
    .from("ecriture_financiere")
    .update({ prestation_id: prestationId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revaliderFinance();
  revalidatePath("/prestations");
}

export async function updateTresorerieReglages(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("parametres_entreprise")
    .update({
      solde_initial: num(formData.get("solde_initial")),
      solde_initial_date: str(formData.get("solde_initial_date")),
      seuil_alerte: num(formData.get("seuil_alerte")),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
  revaliderFinance();
}

/** Tarifs du carburant (€/L) — utilisés pour estimer les coûts de trajet. */
export async function updatePrixCarburant(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("parametres_entreprise")
    .update({
      prix_essence: num(formData.get("prix_essence")),
      prix_diesel: num(formData.get("prix_diesel")),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/parametres");
  revalidatePath("/planification");
}
