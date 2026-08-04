"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

type Supa = Awaited<ReturnType<typeof createSupabase>>;

/** Récupère le plan technique de la prestation, le crée s'il n'existe pas. */
async function ensurePlan(supabase: Supa, prestationId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("plan_technique")
    .select("id")
    .eq("prestation_id", prestationId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("plan_technique")
    .insert({ prestation_id: prestationId, nom: "Plan technique" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

function revalider(prestationId: string) {
  revalidatePath(`/prestations/${prestationId}/technique`);
}

// ---------- Ponts (levage) ----------

export async function addPont(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const planId = await ensurePlan(supabase, prestationId);
  const { error } = await supabase.from("pont").insert({
    plan_id: planId,
    nom: String(formData.get("nom") ?? "").trim() || "Pont",
    capacite_kg: num(formData.get("capacite_kg")),
  });
  if (error) throw new Error(error.message);
  revalider(prestationId);
}

export async function deletePont(prestationId: string, pontId: string) {
  const supabase = await createSupabase();
  await supabase.from("affectation").delete().eq("pont_id", pontId);
  const { error } = await supabase.from("pont").delete().eq("id", pontId);
  if (error) throw new Error(error.message);
  revalider(prestationId);
}

// ---------- Circuits (électricité) ----------

export async function addNoeud(prestationId: string, formData: FormData) {
  const supabase = await createSupabase();
  const planId = await ensurePlan(supabase, prestationId);
  const phase = str(formData.get("phase"));
  const { error } = await supabase.from("circuit_elec").insert({
    plan_id: planId,
    parent_id: str(formData.get("parent_id")),
    type: str(formData.get("type")),
    nom: String(formData.get("nom") ?? "").trim() || "Circuit",
    intensite_max_a: num(formData.get("intensite_max_a")),
    phase: phase === "mono" || phase === "tri" ? phase : null,
  });
  if (error) throw new Error(error.message);
  revalider(prestationId);
}

/** Déplace un nœud (le rattache à un nouveau parent, ou à la racine si null).
 *  Empêche de le déplacer dans lui-même ou l'un de ses descendants (pas de cycle). */
export async function deplacerNoeud(prestationId: string, nodeId: string, newParentId: string | null) {
  const supabase = await createSupabase();
  if (nodeId === newParentId) return;

  // Récupère tous les circuits du plan pour vérifier la descendance
  const { data: node } = await supabase.from("circuit_elec").select("plan_id").eq("id", nodeId).maybeSingle();
  if (!node) return;
  const { data: tous } = await supabase.from("circuit_elec").select("id, parent_id").eq("plan_id", node.plan_id);
  const enfants = new Map<string, string[]>();
  for (const c of tous ?? []) {
    const p = (c.parent_id ?? "") as string;
    if (!enfants.has(p)) enfants.set(p, []);
    enfants.get(p)!.push(c.id as string);
  }
  // Descendants de nodeId
  const descendants = new Set<string>();
  const pile = [nodeId];
  while (pile.length) {
    const cur = pile.pop()!;
    for (const child of enfants.get(cur) ?? []) {
      if (!descendants.has(child)) { descendants.add(child); pile.push(child); }
    }
  }
  if (newParentId && descendants.has(newParentId)) return; // interdit : cycle

  const { error } = await supabase.from("circuit_elec").update({ parent_id: newParentId }).eq("id", nodeId);
  if (error) throw new Error(error.message);
  revalider(prestationId);
}

export async function deleteNoeud(prestationId: string, circuitId: string) {
  const supabase = await createSupabase();
  // parent_id ON DELETE CASCADE supprime les sous-nœuds ; les affectations
  // (circuit_id) sont aussi en cascade. Une simple suppression suffit.
  const { error } = await supabase.from("circuit_elec").delete().eq("id", circuitId);
  if (error) throw new Error(error.message);
  revalider(prestationId);
}

// ---------- Affectations ----------

export async function affecterPont(prestationId: string, ligneId: string, formData: FormData) {
  const supabase = await createSupabase();
  const pontId = str(formData.get("pont_id"));
  await supabase.from("affectation").delete().eq("ligne_prestation_id", ligneId).not("pont_id", "is", null);
  if (pontId) {
    const { error } = await supabase.from("affectation").insert({ ligne_prestation_id: ligneId, pont_id: pontId });
    if (error) throw new Error(error.message);
  }
  revalider(prestationId);
}

export async function affecterCircuit(prestationId: string, ligneId: string, formData: FormData) {
  const supabase = await createSupabase();
  const circuitId = str(formData.get("circuit_id"));
  await supabase.from("affectation").delete().eq("ligne_prestation_id", ligneId).not("circuit_id", "is", null);
  if (circuitId) {
    const { error } = await supabase.from("affectation").insert({ ligne_prestation_id: ligneId, circuit_id: circuitId });
    if (error) throw new Error(error.message);
  }
  revalider(prestationId);
}
