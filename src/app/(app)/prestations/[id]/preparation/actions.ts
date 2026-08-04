"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { appliquerSortie, appliquerRetour, annulerDerniereSortie, etatDepuisMouvements } from "@/lib/mouvements";
import { periodeReservation } from "@/lib/devis";

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
  id: string; numero_serie: string | null; reference_id: string;
  reference: { nom: string } | null;
};

function labelUnite(u: { numero_serie: string | null; reference: { nom: string } | null }): string {
  const nom = u.reference?.nom ?? "Matériel";
  return u.numero_serie ? `${nom} — ${u.numero_serie}` : nom;
}

/**
 * Scan d'une unité au chargement : la charge si elle est prévue, sinon avertit
 * (mauvais objet d'une référence prévue, ou objet hors prestation).
 */
export async function scannerPourCharger(prestationId: string, codeBrut: string): Promise<ResultatScan> {
  const supabase = await createSupabase();
  const code = extraireCode(codeBrut);
  if (!code) return { status: "inconnu", code: codeBrut };

  const sel = "id, numero_serie, reference_id, reference:materiel_reference(nom)";
  let unite = (await supabase.from("unite").select(sel).eq("qr_code", code).maybeSingle()).data as UniteScan | null;
  if (!unite) unite = (await supabase.from("unite").select(sel).eq("numero_serie", code).maybeSingle()).data as UniteScan | null;
  if (!unite && UUID_RE.test(code)) unite = (await supabase.from("unite").select(sel).eq("id", code).maybeSingle()).data as UniteScan | null;
  if (!unite) return { status: "inconnu", code };

  const label = labelUnite(unite);

  // Réservations de cette prestation (unités + réf.)
  const { data: resasData } = await supabase
    .from("reservation_unite")
    .select("unite_id, unite:unite(numero_serie, reference_id, reference:materiel_reference(nom))")
    .eq("prestation_id", prestationId);
  const resas = (resasData ?? []) as unknown as { unite_id: string; unite: { numero_serie: string | null; reference_id: string; reference: { nom: string } | null } | null }[];

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
    .select("id, numero_serie, compteur_sorties, compteur_heures")
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
  return { ok: true, message: `Remplacée par ${remplacant.numero_serie || "une autre unité"}.` };
}
