import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererTresoreriePdf } from "@/lib/pdf/tresorerie";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const debut = sp.get("debut");
  const fin = sp.get("fin");

  const supabase = await createClient();
  const [{ data: entData }, { data }] = await Promise.all([
    supabase.from("parametres_entreprise").select("raison_sociale, solde_initial, solde_initial_date, format_date").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("*").order("date", { ascending: true }),
  ]);
  const ent = entData as Pick<ParametresEntreprise, "raison_sociale" | "solde_initial" | "solde_initial_date" | "format_date"> | null;
  const soldeInitial = Number(ent?.solde_initial ?? 0);
  const soldeInitialDate = ent?.solde_initial_date ?? null;
  const format = (ent?.format_date ?? "fr") as "fr" | "iso" | "long";
  const ecritures = (data ?? []) as EcritureFinanciere[];

  // Solde cumulé projeté (même logique que l'export CSV)
  let solde = soldeInitial;
  const lignes: (EcritureFinanciere & { soldeCumule: number })[] = [];
  let totalEntrees = 0;
  let totalSorties = 0;
  for (const e of ecritures) {
    const dejaDansSolde = soldeInitialDate && e.statut === "reel" && e.date < soldeInitialDate;
    if (!dejaDansSolde) {
      const signe = e.sens === "entree" ? 1 : -1;
      solde = Math.round((solde + signe * (Number(e.montant_ttc) || 0)) * 100) / 100;
    }
    if (debut && e.date < debut) continue;
    if (fin && e.date > fin) continue;
    if (e.sens === "entree") totalEntrees += Number(e.montant_ttc) || 0;
    else totalSorties += Number(e.montant_ttc) || 0;
    lignes.push({ ...e, soldeCumule: solde });
  }

  const pdf = await genererTresoreriePdf({
    raisonSociale: ent?.raison_sociale ?? null,
    debut,
    fin,
    format,
    lignes,
    totalEntrees: Math.round(totalEntrees * 100) / 100,
    totalSorties: Math.round(totalSorties * 100) / 100,
    soldeFinal: lignes.length ? lignes[lignes.length - 1].soldeCumule : soldeInitial,
  });

  const annee = (debut ?? fin ?? new Date().toISOString()).slice(0, 4);
  const nom = debut || fin ? `tresorerie_${debut || "debut"}_${fin || "fin"}.pdf` : `tresorerie_${annee}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
