"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { appliquerSortie, appliquerRetour, annulerDerniereSortie, etatDepuisMouvements } from "@/lib/mouvements";
import { periodeReservation } from "@/lib/devis";
import { nomUnite, type UniteNommable } from "@/lib/unite";

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extrait le code d'un QR : accepte un code brut ou une URL .../u/<code>. */
function extraireCode(brut: string): string {
  const s = brut.trim();
  try {
    const u = new URL(s);
    const m = u.pathname.match(/\/u\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* pas une URL */
  }
  return s;
}

async function userId(supabase: Awaited<ReturnType<typeof createSupabase>>) {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function revalider(prestationId: string) {
  revalidatePath(`/prestations/${prestationId}/preparation`);
  revalidatePath(`/prestations/${prestationId}`);
}

export async function chargerUnite(prestationId: string, uniteId: string) {
  const supabase = await createSupabase();
  await appliquerSortie(supabase, uniteId, prestationId, await userId(supabase));
  revalider(prestationId);
}

export async function rentrerUnite(prestationId: string, uniteId: string, formData: FormData) {
  const supabase = await createSupabase();
  await appliquerRetour(supabase, uniteId, prestationId, await userId(supabase), num(formData.get("heures")));
  revalider(prestationId);
}

export async function annulerSortieUnite(prestationId: string, uniteId: string) {
  const supabase = await createSupabase();
  await annulerDerniereSortie(supabase, uniteId, prestationId);
  revalider(prestationId);
}

export async function basculerCharge(prestationId: string, ligneId: string) {
  const supabase = await createSupabase();
  const { data: l } = await supabase.from("ligne_prestation").select("charge").eq("id", ligneId).single();
  await supabase.from("ligne_prestation").update({ charge: !l?.charge }).eq("id", ligneId);
  revalider(prestationId);
}

export type ResultatScan =
  | { status: "ok"; label: string }
  | { status: "deja"; label: string }
  | { status: "mauvais_objet"; label: string; refNom: string; attendus: string[] }
  | { status: "hors_presta"; label: string }
  | { status: "inconnu"; code: string };

type UniteScan = {
  id: string; numero_serie: string | null; numero_interne: number | null; reference_id: string;
  reference: { nom: string; prefixe_unite: string | null } | null;
};

/** « Laser 3 » quand la référence est numérotée, sinon le nom du matériel. */
function labelUnite(u: UniteNommable & { reference: { nom: string; prefixe_unite: string | null } | null }): string {
  return nomUnite(u);
}

/**
 * Scan d'une unité au chargement : la charge si elle est prévue, sinon avertit
 * (mauvais objet d'une référence prévue, ou objet hors prestation).
 */
export async function scannerPourCharger(prestationId: string, codeBrut: string): Promise<ResultatScan> {
  const supabase = await createSupabase();
  const code = extraireCode(codeBrut);
  if (!code) return { status: "inconnu", code: codeBrut };

  const sel = "id, numero_serie, numero_interne, reference_id, reference:materiel_reference(nom, prefixe_unite)";
  let unite = (await supabase.from("unite").select(sel).eq("qr_code", code).maybeSingle()).data as UniteScan | null;
  if (!unite) unite = (await supabase.from("unite").select(sel).eq("numero_serie", code).maybeSingle()).data as UniteScan | null;
  if (!unite && UUID_RE.test(code)) unite = (await supabase.from("unite").select(sel).eq("id", code).maybeSingle()).data as UniteScan | null;
  if (!unite) return { status: "inconnu", code };

  const label = labelUnite(unite);

  // Réservations de cette prestation (unités + réf.)
  const { data: resasData } = await supabase
    .from("reservation_unite")
    .select("unite_id, unite:unite(numero_serie, numero_interne, reference_id, reference:materiel_reference(nom, prefixe_unite))")
    .eq("prestation_id", prestationId);
  const resas = (resasData ?? []) as unknown as { unite_id: string; unite: { numero_serie: string | null; numero_interne: number | null; reference_id: string; reference: { nom: string; prefixe_unite: string | null } | null } | null }[];

  const estReservee = resas.some((r) => r.unite_id === unite!.id);

  if (estReservee) {
    const { data: mvts } = await supabase.from("mouvement").select("type").eq("prestation_id", prestationId).eq("unite_id", unite.id);
    const etat = etatDepuisMouvements((mvts ?? []) as { type: string }[]);
    if (etat !== "a_charger") return { status: "deja", label };
    await appliquerSortie(supabase, unite.id, prestationId, await userId(supabase));
    revalider(prestationId);
    return { status: "ok", label };
  }

  // Pas réservée : une autre unité d'une référence pourtant prévue ?
  const memeRef = resas.filter((r) => r.unite?.reference_id === unite!.reference_id);
  if (memeRef.length > 0) {
    // Unités attendues de cette réf. pas encore chargées
    const { data: mvts } = await supabase.from("mouvement").select("unite_id, type").eq("prestation_id", prestationId);
    const parUnite = new Map<string, { type: string }[]>();
    for (const m of (mvts ?? []) as { unite_id: string; type: string }[]) {
      if (!parUnite.has(m.unite_id)) parUnite.set(m.unite_id, []);
      parUnite.get(m.unite_id)!.push({ type: m.type });
    }
    const attendus = memeRef
      .filter((r) => etatDepuisMouvements(parUnite.get(r.unite_id) ?? []) === "a_charger")
      .map((r) => (r.unite ? labelUnite(r.unite) : "Unité"));
    return { status: "mauvais_objet", label, refNom: unite.reference?.nom ?? "Matériel", attendus };
  }

  return { status: "hors_presta", label };
}

export type ResultatRemplacement = { ok: boolean; message: string };

/**
 * Remplace une unité réservée (cassée / inaccessible) par une autre unité disponible
 * de la même référence sur les dates de la prestation.
 */
export async function remplacerUnite(prestationId: string, ancienneUniteId: string): Promise<ResultatRemplacement> {
  const supabase = await createSupabase();

  const { data: p } = await supabase
    .from("prestation")
    .select("date_prepa, date_event_debut, date_event_fin, date_retour")
    .eq("id", prestationId)
    .single();
  const periode = p ? periodeReservation(p) : null;
  if (!periode) return { ok: false, message: "Dates de prestation incomplètes." };

  const ancienne = (await supabase
    .from("unite")
    .select("id, reference_id, reference:materiel_reference(nom)")
    .eq("id", ancienneUniteId)
    .single()).data as { id: string; reference_id: string; reference: { nom: string } | null } | null;
  if (!ancienne) return { ok: false, message: "Unité introuvable." };

  // Candidats : même réf., état ok, non déjà réservés pour cette presta
  const dejaResa = new Set(
    ((await supabase.from("reservation_unite").select("unite_id").eq("prestation_id", prestationId)).data ?? []).map((r) => r.unite_id),
  );
  const { data: candidats } = await supabase
    .from("unite")
    .select("id, numero_serie, numero_interne, compteur_sorties, compteur_heures, reference:materiel_reference(prefixe_unite, nom)")
    .eq("reference_id", ancienne.reference_id)
    .eq("etat", "ok")
    .order("compteur_sorties", { ascending: true })
    .order("compteur_heures", { ascending: true });

  // Unités indisponibles (réservées sur la période, hors celles de cette presta)
  const { data: prises } = await supabase
    .from("reservation_unite")
    .select("unite_id")
    .lte("date_debut", periode.fin)
    .gte("date_fin", periode.debut);
  const indispo = new Set((prises ?? []).map((r) => r.unite_id));

  const remplacant = (candidats ?? []).find((u) => u.id !== ancienneUniteId && !dejaResa.has(u.id) && !indispo.has(u.id));
  if (!remplacant) {
    return { ok: false, message: `Aucune autre unité « ${ancienne.reference?.nom ?? "matériel"} » disponible sur ces dates.` };
  }

  // Bascule la réservation : supprime l'ancienne, insère la nouvelle
  await supabase.from("reservation_unite").delete().eq("prestation_id", prestationId).eq("unite_id", ancienneUniteId);
  const { error } = await supabase.from("reservation_unite").insert({
    unite_id: remplacant.id, prestation_id: prestationId, date_debut: periode.debut, date_fin: periode.fin,
  });
  if (error) return { ok: false, message: error.message };

  revalider(prestationId);
  return { ok: true, message: `Remplacée par ${nomUnite(remplacant as unknown as UniteNommable)}.` };
}

/* ---------------------------------------------- Matériel réellement utilisé ---- */

function rafraichirMateriel(prestationId: string) {
  revalidatePath(`/prestations/${prestationId}/preparation`);
  revalidatePath(`/prestations/${prestationId}`);
  revalidatePath("/finance/roi");
}

/**
 * Coche ou décoche un matériel de la liste de l'événement.
 * Décoché = il n'est pas parti : il sort du ROI et de l'historique d'usage.
 */
export async function basculerMaterielUtilise(
  prestationId: string,
  materielId: string,
  utilise: boolean,
) {
  const supabase = await createSupabase();
  await supabase.from("prestation_materiel").update({ utilise }).eq("id", materielId);
  rafraichirMateriel(prestationId);
}

/**
 * Ajoute du matériel embarqué au dernier moment, absent des documents.
 * Son montant est nul : il use du matériel sans rien rapporter. Pour le facturer,
 * il faut créer un document — ses lignes rejoindront alors cette liste d'elles-mêmes.
 */
export async function ajouterMaterielEvenement(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const referenceId = String(formData.get("reference_id") ?? "").trim();
  if (!referenceId) throw new Error("Choisis une référence du catalogue.");
  const quantite = Math.max(1, Math.round(num(formData.get("quantite")) || 1));
  const note = String(formData.get("note") ?? "").trim() || null;

  const { data: ref } = await supabase
    .from("materiel_reference")
    .select("nom")
    .eq("id", referenceId)
    .maybeSingle();

  const { error } = await supabase.from("prestation_materiel").insert({
    prestation_id: prestationId,
    reference_id: referenceId,
    designation: ref?.nom ?? null,
    quantite,
    montant: 0,
    origine: "ajout",
    note,
  });
  if (error) throw new Error(error.message);
  rafraichirMateriel(prestationId);
}

/** Retire un ajout manuel. Le matériel issu d'un document se décoche, il ne se supprime pas. */
export async function supprimerMaterielEvenement(prestationId: string, materielId: string) {
  const supabase = await createSupabase();
  const { data: m } = await supabase
    .from("prestation_materiel")
    .select("origine")
    .eq("id", materielId)
    .maybeSingle();
  if (m?.origine !== "ajout") {
    throw new Error(
      "Ce matériel vient d'un devis : décoche-le « non utilisé » plutôt que de le supprimer, sinon il reviendrait à la prochaine synchronisation.",
    );
  }
  await supabase.from("prestation_materiel").delete().eq("id", materielId);
  rafraichirMateriel(prestationId);
}
