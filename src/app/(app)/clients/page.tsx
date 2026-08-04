import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm-button";
import { ClientForm } from "./client-form";
import { createClientFiche, deleteClientFiche } from "./actions";
import type { Client } from "@/lib/types";

const delBtn = "shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("client").select("*").order("nom");
  const clients = (data ?? []) as Client[];

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
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-background">
              <Link href={`/clients/${c.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.nom}</div>
                  <div className="text-sm text-muted truncate">
                    {c.email ?? c.telephone ?? "—"}
                  </div>
                </div>
                {c.tarif_preferentiel_pct > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    −{c.tarif_preferentiel_pct}%
                  </span>
                )}
              </Link>
              <form action={deleteClientFiche.bind(null, c.id)}>
                <ConfirmButton confirm={`Supprimer le client « ${c.nom} » ?`} className={delBtn} title="Supprimer">✕</ConfirmButton>
              </form>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
