"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { geocode, itineraireMulti } from "@/lib/ors";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function num(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const TYPES = ["chargement", "dechargement", "montage", "demontage", "route", "autre"] as const;

// ---------- Locations de matériel (onglet Location) ----------
function locationFromForm(formData: FormData) {
  return {
    titre: String(formData.get("titre") ?? "").trim(),
    sens: String(formData.get("sens") ?? "sortie") === "entree" ? "entree" : "sortie",
    client_id: str(formData.get("client_id")),
    tiers: str(formData.get("tiers")),
    lieu: str(formData.get("lieu")),
    date_debut: str(formData.get("date_debut")),
    date_fin: str(formData.get("date_fin")) ?? str(formData.get("date_debut")),
    montant: num(formData.get("montant")),
    statut: String(formData.get("statut") ?? "prevu"),
    notes: str(formData.get("notes")),
  };
}

export async function createLocation(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const v = locationFromForm(formData);
  if (!v.titre || !v.date_debut) return;
  const { error } = await supabase.from("location").insert({ ...v, created_by: user?.id ?? null });
  if (error) throw new Error(error.message);
  revalidatePath("/planification");
  revalidatePath("/calendrier");
}

export async function updateLocation(id: string, formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("location").update(locationFromForm(formData)).eq("id", id);
  if (error) throw new Error(error.message);
  // Répercute nom/client/dates sur la prestation support éventuelle.
  const { data: loc } = await supabase.from("location").select("prestation_id, titre, client_id, date_debut, date_fin").eq("id", id).maybeSingle();
  if (loc?.prestation_id) {
    await supabase.from("prestation").update({
      nom: loc.titre, client_id: loc.client_id, date_event_debut: loc.date_debut, date_event_fin: loc.date_fin,
    }).eq("id", loc.prestation_id);
  }
  revalidatePath("/planification");
  revalidatePath(`/planification/location/${id}`);
  revalidatePath("/calendrier");
}

export async function deleteLocation(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("location").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/planification");
  revalidatePath("/calendrier");
  redirect("/planification?vue=location");
}

/**
 * Prestation « support » d'une location : créée à la demande pour porter les
 * devis/factures et la check-list de préparation. Non affichée dans les Événements.
 */
async function assurerPrestationLocation(
  supabase: Awaited<ReturnType<typeof createSupabase>>,
  locationId: string,
  userId: string | null,
): Promise<string | null> {
  const { data: loc } = await supabase
    .from("location")
    .select("prestation_id, titre, client_id, date_debut, date_fin")
    .eq("id", locationId)
    .maybeSingle();
  if (!loc) return null;
  if (loc.prestation_id) return loc.prestation_id as string;

  const { data: p, error } = await supabase
    .from("prestation")
    .insert({
      nom: loc.titre, client_id: loc.client_id, statut: "devis", est_evenement: false,
      date_event_debut: loc.date_debut, date_event_fin: loc.date_fin, created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("location").update({ prestation_id: p.id }).eq("id", locationId);
  return p.id;
}

/** Crée un devis (ou facture) rattaché à la prestation support d'une location, puis l'ouvre. */
export async function creerDevisLocation(locationId: string, type: "devis" | "facture") {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const prestationId = await assurerPrestationLocation(supabase, locationId, user?.id ?? null);
  if (!prestationId) return;
  const { data: devis } = await supabase
    .from("devis")
    .insert({ prestation_id: prestationId, nom: type === "facture" ? "Facture" : "Devis", type, created_by: user?.id ?? null })
    .select("id")
    .single();
  revalidatePath(`/planification/location/${locationId}`);
  if (devis) redirect(`/prestations/devis/${devis.id}?edit=1`);
}

/** Associe (ou retire) un véhicule à la tournée logistique d'un événement. */
export async function setVehiculeTournee(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  await supabase.from("prestation").update({ vehicule_id: str(formData.get("vehicule_id")) }).eq("id", prestationId);
  revalidatePath(`/planification/${prestationId}`);
}

export async function addEtape(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const { data: last } = await supabase
    .from("etape_logistique")
    .select("ordre")
    .eq("prestation_id", prestationId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();
  const typeRaw = String(formData.get("type") ?? "autre");
  const type = (TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "autre";
  const { error } = await supabase.from("etape_logistique").insert({
    prestation_id: prestationId,
    ordre: Number(last?.ordre ?? 0) + 1,
    type,
    lieu: str(formData.get("lieu")),
    adresse: str(formData.get("adresse")),
    materiel: str(formData.get("materiel")),
    heure: str(formData.get("heure")),
    notes: str(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/planification/${prestationId}`);
}

export async function deleteEtape(prestationId: string, etapeId: string) {
  const supabase = await createSupabase();
  await supabase.from("etape_logistique").delete().eq("id", etapeId);
  revalidatePath(`/planification/${prestationId}`);
}

export async function toggleEtapeFait(prestationId: string, etapeId: string, fait: boolean) {
  const supabase = await createSupabase();
  await supabase.from("etape_logistique").update({ fait: !fait }).eq("id", etapeId);
  revalidatePath(`/planification/${prestationId}`);
}

/** Calcule l'itinéraire de la tournée : géocode chaque arrêt (adresse ou lieu) puis
 *  les distances/durées entre arrêts consécutifs (OpenRouteService). */
export async function calculerItineraire(prestationId: string) {
  const supabase = await createSupabase();
  const { data: etapes } = await supabase
    .from("etape_logistique")
    .select("id, ordre, lieu, adresse")
    .eq("prestation_id", prestationId)
    .order("ordre", { ascending: true });

  // Réinitialise les distances
  await supabase.from("etape_logistique").update({ distance_km: null, duree_min: null }).eq("prestation_id", prestationId);

  // Géocode les arrêts qui ont une adresse (ou un lieu)
  const points: { id: string; coord: [number, number] }[] = [];
  for (const e of etapes ?? []) {
    const adr = e.adresse || e.lieu;
    if (!adr) continue;
    try {
      const g = await geocode(adr);
      points.push({ id: e.id, coord: g.coord });
    } catch {
      /* arrêt non géocodable : ignoré de l'itinéraire */
    }
  }

  if (points.length >= 2) {
    const itin = await itineraireMulti(points.map((p) => p.coord));
    // Le segment i relie points[i] → points[i+1] : on stocke sur l'arrêt d'arrivée.
    for (let i = 0; i < itin.segments.length && i + 1 < points.length; i++) {
      await supabase
        .from("etape_logistique")
        .update({ distance_km: itin.segments[i].km, duree_min: itin.segments[i].min })
        .eq("id", points[i + 1].id);
    }
  }
  revalidatePath(`/planification/${prestationId}`);
}

/** Échange l'ordre d'une étape avec sa voisine (sens -1 = monter, +1 = descendre). */
export async function deplacerEtape(prestationId: string, etapeId: string, sens: number) {
  const supabase = await createSupabase();
  const { data: etapes } = await supabase
    .from("etape_logistique")
    .select("id, ordre")
    .eq("prestation_id", prestationId)
    .order("ordre", { ascending: true });
  const list = etapes ?? [];
  const i = list.findIndex((e) => e.id === etapeId);
  const j = i + (sens < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return;
  // Échange des ordres
  await supabase.from("etape_logistique").update({ ordre: list[j].ordre }).eq("id", list[i].id);
  await supabase.from("etape_logistique").update({ ordre: list[i].ordre }).eq("id", list[j].id);
  revalidatePath(`/planification/${prestationId}`);
}
