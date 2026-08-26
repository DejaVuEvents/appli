// Tâche quotidienne (Vercel Cron) : entretien de la comptabilité.
//  1. Passe en « retard » les factures clients et fournisseurs dont l'échéance est dépassée.
//  2. Purge les prévisions récurrentes déjà échues (le réel est arrivé via Qonto).
//  3. Régénère l'horizon des dépenses récurrentes (12 mois glissants).
// Sécurité : Vercel envoie l'en-tête « Authorization: Bearer <CRON_SECRET> ».
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Non autorisé", { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_API_KEY;
  if (!url || !key) return Response.json({ ok: false, error: "Supabase non configuré (service role)." }, { status: 500 });
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const today = ymd(new Date());
  const rapport: Record<string, number> = {};

  // 1. Factures clients échues et non payées → « retard »
  const { data: fc } = await supabase
    .from("devis_facture")
    .update({ statut_paiement: "retard" })
    .eq("type", "facture")
    .eq("statut_paiement", "en_attente")
    .not("numero", "is", null)
    .lt("date_echeance", today)
    .select("id");
  rapport.factures_en_retard = (fc ?? []).length;

  // 2. Factures fournisseurs échues et non payées → « retard »
  const { data: ff } = await supabase
    .from("facture_fournisseur")
    .update({ statut_paiement: "retard" })
    .in("statut_paiement", ["a_payer", "planifie"])
    .lt("date_echeance", today)
    .select("id");
  rapport.fournisseurs_en_retard = (ff ?? []).length;

  // 3. Prévisions récurrentes échues → purge (le prélèvement réel est déjà importé)
  const { data: purge } = await supabase
    .from("ecriture_financiere")
    .delete()
    .not("depense_recurrente_id", "is", null)
    .eq("statut", "previsionnel")
    .lt("date", today)
    .select("id");
  rapport.previsions_echues_purgees = (purge ?? []).length;

  // 4. Régénération de l'horizon des récurrents (12 mois glissants)
  const { data: defs } = await supabase.from("depense_recurrente").select("*").eq("actif", true);
  const { data: existantes } = await supabase
    .from("ecriture_financiere")
    .select("depense_recurrente_id, date")
    .not("depense_recurrente_id", "is", null)
    .gte("date", today);
  const deja = new Set((existantes ?? []).map((e) => `${e.depense_recurrente_id}|${e.date}`));

  const rows: Record<string, unknown>[] = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (const def of (defs ?? []) as { id: string; nom: string; sens: string; montant_ttc: number; frequence: string; jour: number; mois: number | null; type: string | null; specification: string | null }[]) {
    const jour = Math.min(Math.max(def.jour || 1, 1), 28);
    const dates: string[] = [];
    if (def.frequence === "mensuel") {
      for (let i = 0; i < 12; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() + i, jour);
        if (d >= base) dates.push(ymd(d));
      }
    } else {
      const mois = Math.min(Math.max(def.mois || 1, 1), 12);
      for (let y = 0; y <= 1; y++) {
        const d = new Date(base.getFullYear() + y, mois - 1, jour);
        const diff = (d.getFullYear() - base.getFullYear()) * 12 + (d.getMonth() - base.getMonth());
        if (d >= base && diff <= 12) dates.push(ymd(d));
      }
    }
    for (const date of dates) {
      if (deja.has(`${def.id}|${date}`)) continue;
      rows.push({
        date, denomination: def.nom, type: def.type, specification: def.specification,
        sens: def.sens, statut: "previsionnel", montant_ttc: def.montant_ttc,
        depense_recurrente_id: def.id, valide: false,
      });
    }
  }
  if (rows.length) await supabase.from("ecriture_financiere").insert(rows);
  rapport.previsions_recurrentes_creees = rows.length;

  return Response.json({ ok: true, date: today, ...rapport });
}
