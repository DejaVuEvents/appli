import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererBilanPdf } from "@/lib/pdf/bilan";
import { calculerBilanActifPassif } from "@/lib/bilan";
import { typeLabel } from "@/lib/finance";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const annee = Number(request.nextUrl.searchParams.get("annee")) || new Date().getFullYear();
  const supabase = await createClient();
  const [{ data: entData }, { data }] = await Promise.all([
    supabase.from("parametres_entreprise").select("raison_sociale, solde_initial, solde_initial_date").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("date, sens, statut, montant_ttc, type").eq("statut", "reel"),
  ]);
  const ent = entData as Pick<ParametresEntreprise, "raison_sociale" | "solde_initial" | "solde_initial_date"> | null;
  const soldeInitial = Number(ent?.solde_initial ?? 0);
  const soldeInitialDate = ent?.solde_initial_date ?? null;
  const reels = (data ?? []) as Pick<EcritureFinanciere, "date" | "sens" | "statut" | "montant_ttc" | "type">[];

  const debutAnnee = `${annee}-01-01`;
  const finAnnee = `${annee}-12-31`;

  const groupe = (sens: "entree" | "sortie") => {
    const m = new Map<string, number>();
    for (const e of reels) {
      if (e.sens !== sens) continue;
      if (e.date < debutAnnee || e.date > finAnnee) continue;
      const k = e.type ?? "Autre";
      m.set(k, (m.get(k) ?? 0) + Number(e.montant_ttc || 0));
    }
    return [...m.entries()].map(([type, total]) => ({ label: typeLabel(type), total })).sort((a, b) => b.total - a.total);
  };

  const produits = groupe("entree");
  const charges = groupe("sortie");
  const totalProduits = produits.reduce((s, p) => s + p.total, 0);
  const totalCharges = charges.reduce((s, c) => s + c.total, 0);

  // Solde de trésorerie début / fin d'exercice
  const compteJusqua = (borne: string) =>
    reels.reduce((solde, e) => {
      if (soldeInitialDate && e.date < soldeInitialDate) return solde; // déjà inclus dans le solde initial
      if (e.date >= borne) return solde;
      return solde + (e.sens === "entree" ? 1 : -1) * Number(e.montant_ttc || 0);
    }, soldeInitial);
  const soldeDebut = Math.round(compteJusqua(debutAnnee) * 100) / 100;
  const soldeFin = Math.round((soldeDebut + totalProduits - totalCharges) * 100) / 100;
  const resultat = Math.round((totalProduits - totalCharges) * 100) / 100;

  const bilan = await calculerBilanActifPassif(supabase, soldeFin, resultat);

  const pdf = await genererBilanPdf({
    raisonSociale: ent?.raison_sociale ?? null,
    annee,
    produits,
    charges,
    totalProduits: Math.round(totalProduits * 100) / 100,
    totalCharges: Math.round(totalCharges * 100) / 100,
    soldeDebut,
    soldeFin,
    bilan,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="compte_resultat_bilan_${annee}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
