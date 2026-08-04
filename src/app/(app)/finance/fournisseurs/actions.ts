"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { archiverDepuisUrl, nomFichierSafe } from "@/lib/drive";
import { BUCKET_PRIVE } from "@/lib/storage";
import { chargerNomenclature, categorieManquante, categorieDefaut } from "@/lib/finance";

type Supa = Awaited<ReturnType<typeof createSupabase>>;

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function revalider() {
  revalidatePath("/finance/fournisseurs");
  revalidatePath("/finance");
  revalidatePath("/finance/journal");
  revalidatePath("/finance/synthese");
  revalidatePath("/");
}

async function uploadFichier(supabase: Supa, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "pdf";
  const path = `fournisseurs/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET_PRIVE).upload(path, await file.arrayBuffer(), {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`Upload facture fournisseur: ${error.message}`);
  return data.path;
}

/**
 * Auto-alimentation trésorerie : une facture fournisseur crée/maj une SORTIE liée
 * (prévisionnelle par défaut, réelle si payée). Identifiée par facture_fournisseur_id
 * → pas de doublon. L'écriture auto naît « non validée » (à confirmer par un humain).
 */
async function synchroniserEcritureFournisseur(supabase: Supa, ffId: string) {
  const { data: ff } = await supabase
    .from("facture_fournisseur")
    .select("id, fournisseur, numero, montant_ttc, date_facture, date_echeance, statut_paiement, prestation_id")
    .eq("id", ffId)
    .maybeSingle();
  if (!ff) return;

  const { data: existante } = await supabase
    .from("ecriture_financiere")
    .select("id, type, specification")
    .eq("facture_fournisseur_id", ff.id)
    .maybeSingle();

  // Catégorie : préremplie depuis la facture fournisseur (sortie = matériel), en
  // préservant une catégorie déjà valide (pas d'écrasement d'une correction manuelle).
  const nomenclature = await chargerNomenclature(supabase);
  let type = existante?.type ?? null;
  let specification = existante?.specification ?? null;
  if (categorieManquante(nomenclature, "sortie", type)) {
    const defo = categorieDefaut(nomenclature, "sortie", "Matériel", "Location de matériel");
    type = defo.type;
    specification = defo.specification;
  }

  const paye = ff.statut_paiement === "paye";
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    date: paye ? today : (ff.date_echeance ?? ff.date_facture ?? today),
    denomination: `Fournisseur ${ff.fournisseur ?? ""}${ff.numero ? ` · N° ${ff.numero}` : ""}`.trim(),
    type,
    specification,
    sens: "sortie",
    statut: paye ? "reel" : "previsionnel",
    montant_ttc: Number(ff.montant_ttc ?? 0),
    prestation_id: ff.prestation_id,
    facture_fournisseur_id: ff.id,
  };

  if (existante) {
    await supabase.from("ecriture_financiere").update(payload).eq("id", existante.id);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("ecriture_financiere").insert({ ...payload, valide: false, created_by: user?.id ?? null });
  }
}

function ffFromForm(formData: FormData) {
  return {
    fournisseur: str(formData.get("fournisseur")) ?? "Fournisseur",
    numero: str(formData.get("numero")),
    montant_ttc: num(formData.get("montant_ttc")),
    date_facture: str(formData.get("date_facture")),
    date_echeance: str(formData.get("date_echeance")),
    statut_paiement: str(formData.get("statut_paiement")) ?? "a_payer",
    prestation_id: str(formData.get("prestation_id")),
    notes: str(formData.get("notes")),
  };
}

export async function createFactureFournisseur(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const fichierUrl = await uploadFichier(supabase, formData.get("fichier") as File | null);

  const { data, error } = await supabase
    .from("facture_fournisseur")
    .insert({ ...ffFromForm(formData), fichier_url: fichierUrl, created_by: user?.id ?? null })
    .select("id, date_facture, fournisseur")
    .single();
  if (error) throw new Error(error.message);

  await synchroniserEcritureFournisseur(supabase, data.id);

  // Archivage Drive best-effort du justificatif fournisseur
  if (fichierUrl) {
    const annee = (data.date_facture ?? new Date().toISOString()).slice(0, 4);
    await archiverDepuisUrl(fichierUrl, ["Factures fournisseurs", annee], nomFichierSafe(`${data.date_facture ?? ""} ${data.fournisseur}`));
  }
  revalider();
}

export async function updateFactureFournisseur(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const fichierUrl = await uploadFichier(supabase, formData.get("fichier") as File | null);
  const patch: Record<string, unknown> = ffFromForm(formData);
  if (fichierUrl) patch.fichier_url = fichierUrl;
  const { error } = await supabase.from("facture_fournisseur").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await synchroniserEcritureFournisseur(supabase, id);
  revalider();
}

export async function setStatutFournisseur(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("facture_fournisseur")
    .update({ statut_paiement: str(formData.get("statut_paiement")) ?? "a_payer" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await synchroniserEcritureFournisseur(supabase, id);
  revalider();
}

export async function deleteFactureFournisseur(id: string) {
  const supabase = await createSupabase();
  // Supprime l'écriture auto liée puis la facture
  await supabase.from("ecriture_financiere").delete().eq("facture_fournisseur_id", id);
  const { error } = await supabase.from("facture_fournisseur").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalider();
}
