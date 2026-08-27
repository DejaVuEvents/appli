import { dispositionFichier } from "@/lib/storage";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { typeLabel } from "@/lib/finance";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

const COLS = [
  "Date", "Sens", "Statut", "Catégorie", "Sous-catégorie", "Dénomination",
  "Montant TTC", "Solde cumulé (projeté)", "Effectué par", "Facture", "Notes",
];

function cell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const debut = sp.get("debut");
  const fin = sp.get("fin");

  const supabase = await createClient();
  // On récupère TOUTES les écritures (triées) pour calculer un solde cumulé exact,
  // puis on n'exporte que celles de la plage demandée.
  const [{ data: entData }, { data }] = await Promise.all([
    supabase.from("parametres_entreprise").select("solde_initial, solde_initial_date").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("*").order("date", { ascending: true }),
  ]);
  const ent = entData as Pick<ParametresEntreprise, "solde_initial" | "solde_initial_date"> | null;
  const soldeInitial = Number(ent?.solde_initial ?? 0);
  const soldeInitialDate = ent?.solde_initial_date ?? null;
  const ecritures = (data ?? []) as EcritureFinanciere[];

  const lines = [COLS.join(";")];
  let solde = soldeInitial;
  for (const e of ecritures) {
    // Les écritures réelles antérieures à la date du solde initial y sont déjà incluses.
    const dejaDansSolde = soldeInitialDate && e.statut === "reel" && e.date < soldeInitialDate;
    if (!dejaDansSolde) {
      const signe = e.sens === "entree" ? 1 : -1;
      solde = Math.round((solde + signe * (Number(e.montant_ttc) || 0)) * 100) / 100;
    }
    if (debut && e.date < debut) continue;
    if (fin && e.date > fin) continue;
    lines.push(
      [
        e.date,
        e.sens === "entree" ? "Entrée" : "Sortie",
        e.statut === "reel" ? "Réel" : "Prévisionnel",
        typeLabel(e.type),
        e.specification ?? "",
        e.denomination ?? "",
        Number(e.montant_ttc ?? 0).toFixed(2),
        solde.toFixed(2),
        e.effectue_par ?? "",
        e.facture ?? "",
        e.notes ?? "",
      ].map(cell).join(";"),
    );
  }
  // BOM UTF-8 pour l'ouverture correcte des accents dans Excel
  const csv = "﻿" + lines.join("\r\n");
  const annee = (debut ?? fin ?? new Date().toISOString()).slice(0, 4);
  const nom = debut || fin ? `tresorerie_${debut || "debut"}_${fin || "fin"}.csv` : `tresorerie_${annee}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": dispositionFichier(nom),
      "Cache-Control": "no-store",
    },
  });
}
