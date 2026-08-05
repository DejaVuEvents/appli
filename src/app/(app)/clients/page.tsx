import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm-button";
import { ClientForm } from "./client-form";
import { createClientFiche, deleteClientFiche } from "./actions";
import { euros } from "@/lib/format";
import type { Client } from "@/lib/types";

const delBtn = "shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30";

export default async function ClientsPage() {
  const supabase = await createClient();
  const [{ data }, { data: dfData }] = await Promise.all([
    supabase.from("client").select("*").order("nom"),
    supabase
      .from("devis_facture")
      .select("montant_ttc, statut_paiement, prestation:prestation_id(client_id)")
      .eq("type", "facture"),
  ]);
  const clients = (data ?? []) as Client[];

  // Agrégats par client : nombre de factures émises + montant total en retard.
  const stats = new Map<string, { nb: number; retard: number }>();
  for (const df of (dfData ?? []) as unknown as { montant_ttc: number | null; statut_paiement: string | null; prestation: { client_id: string | null } | null }[]) {
    const cid = df.prestation?.client_id;
    if (!cid) continue;
    const s = stats.get(cid) ?? { nb: 0, retard: 0 };
    s.nb += 1;
    if (df.statut_paiement === "retard") s.retard += Number(df.montant_ttc ?? 0);
    stats.set(cid, s);
  }

  const nouveauClient = (
    <Modal trigger="+ Nouveau client" title="Nouveau client">
      <ClientForm action={createClientFiche} inModal />
    </Modal>
  );

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} client${clients.length > 1 ? "s" : ""}`}
        action={nouveauClient}
      />

      {clients.length === 0 ? (
        <EmptyState
          title="Aucun client"
          description="Ajoute ton premier client pour préparer tes devis."
          action={nouveauClient}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {clients.map((c) => {
            const s = stats.get(c.id);
            return (
            <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-background">
              <Link href={`/clients/${c.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.nom}</div>
                  <div className="text-sm text-muted truncate">
                    {c.email ?? c.telephone ?? "—"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {/* Infos synthèse — desktop uniquement */}
                  <div className="hidden items-center gap-3 md:flex">
                    {(s?.retard ?? 0) > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        {euros(s!.retard)} en retard
                      </span>
                    ) : (s?.nb ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        À jour
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted" title={`${s?.nb ?? 0} facture${(s?.nb ?? 0) > 1 ? "s" : ""}`}>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                        <path d="M14 3v5h5M8.5 13h7M8.5 16.5h7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {s?.nb ?? 0}
                    </span>
                  </div>
                  {c.tarif_preferentiel_pct > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      −{c.tarif_preferentiel_pct}%
                    </span>
                  )}
                </div>
              </Link>
              <form action={deleteClientFiche.bind(null, c.id)}>
                <ConfirmButton confirm={`Supprimer le client « ${c.nom} » ?`} className={delBtn} title="Supprimer">✕</ConfirmButton>
              </form>
            </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
