"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabase } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createSupabase>>;

function num(v: FormDataEntryValue | null): number { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function str(v: FormDataEntryValue | null): string | null { const s = String(v ?? "").trim(); return s === "" ? null : s; }
function ymd(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

type Recurrent = { id: string; nom: string; sens: string; montant_ttc: number; frequence: string; jour: number; mois: number | null; type: string | null; specification: string | null; actif: boolean };

/** Dates des prochaines échéances d'une dépense récurrente sur l'horizon (mois). */
function prochainesDates(def: Recurrent, horizonMois = 12): string[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const jour = Math.min(Math.max(def.jour || 1, 1), 28);
  const out: string[] = [];
  if (def.frequence === "mensuel") {
    for (let i = 0; i < horizonMois; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, jour);
      if (d >= today) out.push(ymd(d));
    }
  } else {
    const mois = Math.min(Math.max(def.mois || 1, 1), 12);
    for (let y = 0; y <= 1; y++) {
      const d = new Date(today.getFullYear() + y, mois - 1, jour);
      const diffMois = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
      if (d >= today && diffMois <= horizonMois) out.push(ymd(d));
    }
  }
  return out;
}

/** Régénère les écritures prévisionnelles futures à partir des dépenses récurrentes actives. */
async function regenerer(supabase: Supa) {
  const { data } = await supabase.from("depense_recurrente").select("*");
  const defs = (data ?? []) as Recurrent[];
  const today = ymd(new Date());
  // On repart des écritures futures générées par des récurrents, SAUF celles déjà
  // validées à la main (corrections de l'utilisateur : on ne les écrase pas).
  await supabase.from("ecriture_financiere").delete()
    .not("depense_recurrente_id", "is", null).gte("date", today).eq("valide", false);
  const { data: gardees } = await supabase.from("ecriture_financiere")
    .select("depense_recurrente_id, date").not("depense_recurrente_id", "is", null).gte("date", today);
  const dejaPresent = new Set((gardees ?? []).map((g) => `${g.depense_recurrente_id}|${g.date}`));
  const rows: Record<string, unknown>[] = [];
  for (const def of defs) {
    if (!def.actif) continue;
    for (const date of prochainesDates(def)) {
      if (dejaPresent.has(`${def.id}|${date}`)) continue; // correction manuelle conservée
      rows.push({
        date, denomination: def.nom, type: def.type, specification: def.specification,
        sens: def.sens, statut: "previsionnel", montant_ttc: def.montant_ttc,
        depense_recurrente_id: def.id, valide: false,
      });
    }
  }
  if (rows.length) await supabase.from("ecriture_financiere").insert(rows);
}

function revalider() {
  revalidatePath("/finance/previsionnel");
  revalidatePath("/finance/synthese");
  revalidatePath("/finance");
}

export async function creerRecurrent(formData: FormData) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("depense_recurrente").insert({
    nom: String(formData.get("nom") ?? "").trim() || "Dépense récurrente",
    sens: str(formData.get("sens")) === "entree" ? "entree" : "sortie",
    montant_ttc: num(formData.get("montant_ttc")),
    frequence: str(formData.get("frequence")) === "annuel" ? "annuel" : "mensuel",
    jour: Math.min(Math.max(Math.round(num(formData.get("jour"))) || 1, 1), 28),
    mois: str(formData.get("frequence")) === "annuel" ? Math.round(num(formData.get("mois"))) || 1 : null,
    type: str(formData.get("type")),
    specification: str(formData.get("specification")),
    actif: true,
  });
  if (error) throw new Error(error.message);
  await regenerer(supabase);
  revalider();
}

export async function supprimerRecurrent(id: string) {
  const supabase = await createSupabase();
  const { error } = await supabase.from("depense_recurrente").delete().eq("id", id); // cascade → écritures liées
  if (error) throw new Error(error.message);
  revalider();
}

export async function toggleRecurrent(id: string, actif: boolean) {
  const supabase = await createSupabase();
  await supabase.from("depense_recurrente").update({ actif }).eq("id", id);
  await regenerer(supabase);
  revalider();
}

/** Force la régénération (bouton). */
export async function regenererRecurrents() {
  const supabase = await createSupabase();
  await regenerer(supabase);
  revalider();
}

/**
 * Crée une prévision PONCTUELLE (dépense ou entrée à venir), saisie à la main :
 * une écriture prévisionnelle non liée à un document ni à un récurrent.
 */
export async function creerPrevisionPonctuelle(formData: FormData) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const montant = num(formData.get("montant_ttc"));
  if (!montant) throw new Error("Renseigne un montant.");
  const { error } = await supabase.from("ecriture_financiere").insert({
    date: str(formData.get("date")) ?? ymd(new Date()),
    denomination: String(formData.get("denomination") ?? "").trim() || "Prévision",
    type: str(formData.get("type")),
    specification: str(formData.get("specification")),
    sens: str(formData.get("sens")) === "entree" ? "entree" : "sortie",
    statut: "previsionnel",
    montant_ttc: montant,
    valide: false,
    created_by: user?.id ?? null,
  });
  if (error) throw new Error(error.message);
  revalider();
  revalidatePath("/finance/journal");
}
