import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { FinanceTabs } from "../finance-tabs";
import { fetchQontoOrg } from "@/lib/qonto";
import { chargerNomenclature, syntheseMensuelle } from "@/lib/finance";
import { QontoSync } from "./qonto-sync";
import type { ParametresEntreprise, EcritureFinanciere } from "@/lib/types";

export default async function QontoPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const annee = Number((await searchParams)?.annee) || new Date().getFullYear();
  const supabase = await createClient();
  const [{ data: entData }, { data: ecrData }] = await Promise.all([
    supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    supabase.from("ecriture_financiere").select("*"),
  ]);
  const ent = entData as (ParametresEntreprise & {
    qonto_login?: string;
    qonto_token?: string;
    qonto_account_slug?: string;
    qonto_derniere_sync?: string | null;
  }) | null;

  // Solde « outil » (réel) pour le rapprochement avec Qonto.
  const ecritures = (ecrData ?? []) as EcritureFinanciere[];
  const { soldeActuelReel: soldeOutil } = syntheseMensuelle(
    ecritures, Number(ent?.solde_initial ?? 0), new Date().getFullYear(),
    Number(ent?.seuil_alerte ?? 0), ent?.solde_initial_date ?? null,
  );

  // Solde Qonto en direct (best-effort)
  let balanceQonto: number | null = null;
  if (ent?.qonto_login && ent?.qonto_token) {
    try {
      const org = await fetchQontoOrg(ent.qonto_login, ent.qonto_token);
      const compte = org.bank_accounts.find((a) => a.slug === ent.qonto_account_slug);
      balanceQonto = compte?.balance ?? org.bank_accounts[0]?.balance ?? null;
    } catch {
      // pas bloquant
    }
  }

  const configured = !!(ent?.qonto_login && ent?.qonto_token && ent?.qonto_account_slug);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Finance / Trésorerie" />
      <FinanceTabs annee={annee} />

      <h2 className="mb-4 text-base font-semibold">Synchronisation Qonto</h2>

      {!configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Les identifiants Qonto ne sont pas encore configurés.{" "}
          <a href="/parametres" className="underline">Aller dans Paramètres</a> pour les ajouter
          (login + token API Qonto).
        </div>
      ) : (
        <QontoSync
          derniereSync={ent?.qonto_derniere_sync ?? null}
          compteNom={ent?.qonto_account_slug ?? ""}
          balanceQonto={balanceQonto}
          soldeOutil={soldeOutil}
          nomenclature={await chargerNomenclature(supabase)}
        />
      )}
    </div>
  );
}
