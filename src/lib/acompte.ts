// Découpage acompte / solde : calcul du solde ATTENDU d'une facture de solde,
// c'est-à-dire « total actuel du devis source − somme des autres factures filles ».
// Sert à détecter qu'un devis a été modifié après le découpage (matériel ajouté).
import type { SupabaseClient } from "@supabase/supabase-js";
import { montantRemise, totalApresCoeffEtRemise, type RemiseType } from "@/lib/devis";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Total actuel d'un devis : (lignes + transport) × coefficient, puis remise globale. */
export async function totalDevis(supabase: SupabaseClient, devisId: string): Promise<number> {
  const { data: d } = await supabase
    .from("devis")
    .select("remise_globale_type, remise_globale_valeur, coefficient_duree")
    .eq("id", devisId)
    .maybeSingle();
  if (!d) return 0;
  const [{ data: ls }, { data: trs }] = await Promise.all([
    supabase.from("ligne_prestation").select("prix_total").eq("devis_id", devisId),
    supabase.from("transport").select("cout_calcule").eq("devis_id", devisId),
  ]);
  const net =
    (ls ?? []).reduce((s, l) => s + Number(l.prix_total ?? 0), 0) +
    (trs ?? []).reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
  const remise = montantRemise(net, d.remise_globale_type as RemiseType, Number(d.remise_globale_valeur ?? 0));
  const coeff = Number(d.coefficient_duree ?? 0) > 0 ? Number(d.coefficient_duree) : 1;
  return totalApresCoeffEtRemise(net, d.remise_globale_type as RemiseType, Number(d.remise_globale_valeur ?? 0), coeff);
}

export type EcartSolde = {
  estSolde: boolean;
  montantActuel: number;
  soldeAttendu: number;
  totalSource: number;
  autresFactures: number;
  ecart: number;
};

/**
 * Pour une facture issue d'un découpage : compare son montant au solde attendu.
 * `ecart > 0` = du matériel a été ajouté au devis depuis le découpage.
 */
export async function ecartSolde(supabase: SupabaseClient, devisId: string): Promise<EcartSolde | null> {
  const { data: d } = await supabase
    .from("devis")
    .select("id, source_devis_id, type")
    .eq("id", devisId)
    .maybeSingle();
  if (!d?.source_devis_id || d.type !== "facture") return null;

  const totalSource = await totalDevis(supabase, d.source_devis_id);

  // Les autres factures filles du même devis source (acompte(s), autres tranches).
  const { data: soeurs } = await supabase
    .from("devis")
    .select("id")
    .eq("source_devis_id", d.source_devis_id)
    .eq("type", "facture")
    .neq("id", devisId);
  let autresFactures = 0;
  for (const s of soeurs ?? []) autresFactures += await totalDevis(supabase, s.id as string);

  const montantActuel = await totalDevis(supabase, devisId);
  const soldeAttendu = r2(totalSource - autresFactures);
  return {
    estSolde: true,
    montantActuel,
    soldeAttendu,
    totalSource: r2(totalSource),
    autresFactures: r2(autresFactures),
    ecart: r2(soldeAttendu - montantActuel),
  };
}
