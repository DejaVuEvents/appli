import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm-button";
import { VehiculeForm } from "./vehicule-form";
import { createVehicule, deleteVehicule } from "./actions";
import { euros } from "@/lib/format";
import type { Vehicule } from "@/lib/types";

const delBtn = "shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30";

export default async function VehiculesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicule").select("*").order("nom");
  const vehicules = (data ?? []) as Vehicule[];

  const nouveauVehicule = (
    <Modal trigger="+ Nouveau véhicule" title="Nouveau véhicule">
      <VehiculeForm action={createVehicule} inModal />
    </Modal>
  );

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Véhicules"
        subtitle={`${vehicules.length} véhicule${vehicules.length > 1 ? "s" : ""}`}
        action={nouveauVehicule}
      />

      {vehicules.length === 0 ? (
        <EmptyState
          title="Aucun véhicule"
          description="Enregistre tes véhicules pour calculer les coûts de transport."
          action={nouveauVehicule}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {vehicules.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-background">
              <Link href={`/vehicules/${v.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{v.nom}</div>
                  <div className="text-sm text-muted truncate">
                    {v.type ?? "—"}
                    {v.capacite_m3 ? ` · ${v.capacite_m3} m³` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div>{euros(v.cout_location_jour)}<span className="text-muted">/j</span></div>
                  <div className="text-muted">
                    {v.conso_l_100km ? `${v.conso_l_100km} L/100km` : "conso —"}
                    {v.type_carburant ? ` · ${v.type_carburant}` : ""}
                  </div>
                </div>
              </Link>
              <form action={deleteVehicule.bind(null, v.id)}>
                <ConfirmButton confirm={`Supprimer le véhicule « ${v.nom} » ?`} className={delBtn} title="Supprimer">✕</ConfirmButton>
              </form>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
