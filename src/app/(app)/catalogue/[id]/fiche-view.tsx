import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { euros, dateFr } from "@/lib/format";
import {
  ETAT_LABELS,
  PHASE_LABELS,
  type MaterielReference,
  type Unite,
  type EtatUnite,
} from "@/lib/types";
import type { KitRow } from "./fiche-types";

function Ligne({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function listeOuTiret(v: string[] | null | undefined) {
  return v && v.length ? v.join(", ") : "—";
}

export function FicheView({
  reference,
  categorieNom,
  listeUnites,
  accessoiresObligatoires,
  accessoiresOptionnels,
}: {
  reference: MaterielReference;
  categorieNom: string | null;
  listeUnites: Unite[];
  accessoiresObligatoires: KitRow[];
  accessoiresOptionnels: KitRow[];
}) {
  const r = reference;

  return (
    <div className="space-y-8">
      {/* Fiche / specs (lecture seule) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Fiche</h2>
        <Card className="p-5">
          {/* Photo */}
          {r.photo_url && (
            <div className="mb-4 overflow-hidden rounded-lg">
              <img src={r.photo_url} alt={r.designation ?? r.nom} className="max-h-48 w-full object-contain bg-surface" />
            </div>
          )}
          {r.description && <p className="mb-4 text-sm whitespace-pre-line">{r.description}</p>}
          {r.designation && <Ligne label="Désignation (devis)" value={r.designation} />}
          <Ligne label="Catégorie" value={categorieNom ?? "—"} />
          <Ligne label="Prix de location / jour" value={euros(r.prix_location_jour)} />
          {r.cout_location_jour != null && (() => {
            // Tarif public HT du loueur → notre prix après remise négociée → TTC réellement payé.
            const remise = Number(r.remise_fournisseur_pct ?? 0);
            const tva = Number(r.tva_fournisseur_pct ?? 20);
            const notreHT = Math.round(Number(r.cout_location_jour) * (1 - remise / 100) * 100) / 100;
            const notreTTC = Math.round(notreHT * (1 + tva / 100) * 100) / 100;
            return (
              <>
                {r.fournisseur && <Ligne label="Fournisseur" value={r.fournisseur} />}
                <Ligne label="Tarif public / jour (HT)" value={euros(r.cout_location_jour)} />
                <Ligne
                  label="Notre tarif / jour"
                  value={
                    <span>
                      <strong>{euros(notreHT)} HT</strong>
                      <span className="ml-2 text-xs font-normal text-muted">
                        soit {euros(notreTTC)} TTC{remise > 0 ? ` · remise ${remise} %` : ""}
                      </span>
                    </span>
                  }
                />
                <Ligne
                  label="Marge / jour"
                  value={
                    <span className={r.prix_location_jour - notreTTC >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600"}>
                      {euros(r.prix_location_jour - notreTTC)}
                      <span className="ml-2 text-xs font-normal text-muted">(prix client − coût TTC)</span>
                    </span>
                  }
                />
              </>
            );
          })()}
          <Ligne label="Consommation" value={r.puissance_w != null ? `${r.puissance_w} W` : "—"} />
          <Ligne label="Intensité" value={r.intensite_a != null ? `${r.intensite_a} A` : "—"} />
          <Ligne label="Phase" value={r.phase ? PHASE_LABELS[r.phase] : "—"} />
          <Ligne label="Connecteurs (alimentation)" value={listeOuTiret(r.connecteurs_puissance)} />
          <Ligne label="Connecteurs (données / contrôle)" value={listeOuTiret(r.connecteurs_data)} />
          <Ligne label="Poids" value={r.poids_kg != null ? `${r.poids_kg} kg` : "—"} />
          <Ligne label="Charge admissible (CMU)" value={r.charge_max_kg != null ? `${r.charge_max_kg} kg` : "—"} />
          <Ligne label="Dimensions" value={r.dimensions ?? "—"} />
          <Ligne label="Type" value={r.est_consommable ? "Consommable (non sérialisé)" : "Sérialisé (suivi par unité)"} />
        </Card>
      </section>

      {/* Unités (lecture seule) */}
      {!r.est_consommable && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Unités ({listeUnites.length})
            </h2>
            {(["ok", "maintenance", "hs", "reforme"] as EtatUnite[]).map((etat) => {
              const n = listeUnites.filter((u) => u.etat === etat).length;
              if (n === 0) return null;
              return (
                <Badge key={etat} tone={etat}>
                  {n} {ETAT_LABELS[etat]}
                </Badge>
              );
            })}
          </div>

          {listeUnites.length === 0 ? (
            <Card className="px-4 py-4 text-sm text-muted">Aucune unité enregistrée.</Card>
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {listeUnites.map((u, i) => {
                const connP = u.connecteurs_puissance ?? r.connecteurs_puissance;
                const connD = u.connecteurs_data ?? r.connecteurs_data;
                return (
                  <div key={u.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">
                        Unité #{i + 1}
                        {u.numero_serie ? ` · S/N ${u.numero_serie}` : ""}
                      </span>
                      <Badge tone={u.etat as EtatUnite}>{ETAT_LABELS[u.etat as EtatUnite]}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {u.compteur_heures} h · {u.compteur_sorties} sorties
                      {u.date_achat ? ` · acheté le ${dateFr(u.date_achat)}` : ""}
                      {u.prix_achat != null ? ` · ${euros(u.prix_achat)}` : ""}
                    </div>
                    {(connP.length > 0 || connD.length > 0) && (
                      <div className="mt-1 text-xs text-muted">
                        Connecteurs : {listeOuTiret([...connP, ...connD])}
                      </div>
                    )}
                    {u.qr_code && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <a
                          href={`/api/unite/${u.id}/qrcode`}
                          download
                          className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-background"
                        >
                          Télécharger le QR
                        </a>
                        <Link href={`/u/${u.qr_code}`} className="text-primary hover:underline">
                          Ouvrir la fiche
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </section>
      )}

      {/* Accessoires (lecture seule) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Accessoires</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Obligatoires (auto)</h3>
            <Card className="divide-y divide-border overflow-hidden">
              {accessoiresObligatoires.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucun.</p>}
              {accessoiresObligatoires.map((k) => (
                <div key={k.id} className="px-4 py-3 text-sm">
                  <strong>{k.quantite_par_unite}</strong> × {k.accessoire?.nom ?? "?"}
                </div>
              ))}
            </Card>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Optionnels</h3>
            <Card className="divide-y divide-border overflow-hidden">
              {accessoiresOptionnels.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucun.</p>}
              {accessoiresOptionnels.map((k) => (
                <div key={k.id} className="px-4 py-3 text-sm">
                  <strong>{k.quantite_par_unite}</strong> × {k.accessoire?.nom ?? "?"}
                </div>
              ))}
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
