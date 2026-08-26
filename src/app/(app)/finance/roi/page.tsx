import Link from "next/link";
import { IconEdit } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Modal } from "@/components/modal";
import { FinanceTabs } from "../finance-tabs";
import { deleteRoiItem, createRoiItem } from "./actions";
import { RoiForm } from "./roi-form";
import { calcROI } from "@/lib/finance";
import { euros } from "@/lib/format";
import type { RoiMateriel, MaterielReference } from "@/lib/types";

function roiBadge(pct: number) {
  const label = `${(pct * 100).toFixed(1)} %`;
  if (pct >= 0.5) return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">{label}</span>;
  if (pct >= 0.2) return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600">{label}</span>;
  if (pct >= 0) return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-700">{label}</span>;
  return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">{label}</span>;
}

function moisBadge(m: number | null) {
  if (m === null) return <span className="text-muted text-xs">—</span>;
  const label = m < 120 ? `${m.toFixed(1)} mois` : `> 10 ans`;
  if (m <= 12) return <span className="font-semibold text-green-600">{label}</span>;
  if (m <= 30) return <span className="font-semibold text-orange-500">{label}</span>;
  return <span className="font-semibold text-red-600">{label}</span>;
}

type LignePrest = {
  reference_id: string | null;
  prix_total: number | null;
  prix_unitaire: number | null;
  quantite: number;
  prestation: { statut: string; date_event_debut: string | null } | null;
};

type ItemCalc = {
  item: RoiMateriel;
  calc: ReturnType<typeof calcROI>;
  reelAnnee: number | null;
};

function TableSection({
  title,
  items,
  annee,
  showReel,
}: {
  title: string;
  items: ItemCalc[];
  annee: number;
  showReel: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-8">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <span>{title}</span>
        <span className="rounded-full bg-surface border border-border px-2 py-0.5 text-xs text-muted">{items.length}</span>
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Équipement</th>
              <th className="px-3 py-2 text-center font-medium">Usages prévus/an</th>
              <th className="px-3 py-2 text-right font-medium">Gains attendus/an</th>
              <th className="px-3 py-2 text-right font-medium">Coût annuel</th>
              <th className="px-3 py-2 text-center font-medium">ROI</th>
              <th className="px-3 py-2 text-center font-medium">Rentabilité</th>
              {showReel && <th className="px-3 py-2 text-right font-medium">Réel {annee}</th>}
              {showReel && <th className="px-3 py-2 text-right font-medium">Écart</th>}
              <th className="px-3 py-2 text-center font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map(({ item, calc, reelAnnee }) => {
              const ecart = reelAnnee !== null ? reelAnnee - calc.gainsAnnuels : null;
              return (
                <tr key={item.id} className="hover:bg-surface/50">
                  <td className="px-3 py-3">
                    <div className="font-medium">{item.nom}</div>
                    {item.notes && <div className="mt-0.5 text-[11px] italic text-muted">{item.notes}</div>}
                    {!item.reference_id && showReel && (
                      <div className="mt-0.5 text-[11px] text-orange-500">Non lié au catalogue → réel indisponible</div>
                    )}
                  </td>

                  {/* Usages */}
                  <td className="px-3 py-3 text-center">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {item.volume_prevu_par_an > 0 && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                          {item.volume_prevu_par_an}× prestation
                        </span>
                      )}
                      {item.volume_interne_par_an > 0 && (
                        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">
                          {item.volume_interne_par_an}× interne
                        </span>
                      )}
                      {item.volume_prevu_par_an === 0 && item.volume_interne_par_an === 0 && (
                        <span className="text-muted">—</span>
                      )}
                    </div>
                  </td>

                  {/* Gains attendus */}
                  <td className="px-3 py-3 text-right">
                    <div className="font-medium text-green-600 tabular-nums">{euros(calc.gainsAnnuels)}</div>
                    {item.volume_prevu_par_an > 0 && item.volume_interne_par_an > 0 && (
                      <div className="text-[10px] text-muted">
                        {euros(item.prix_location_ttc * item.volume_prevu_par_an)} presta
                        {" + "}
                        {euros(item.cout_location_externe * item.volume_interne_par_an)} interne
                      </div>
                    )}
                  </td>

                  {/* Coût annuel */}
                  <td className="px-3 py-3 text-right text-red-600 tabular-nums">{euros(calc.coutAnnuel)}</td>

                  {/* ROI */}
                  <td className="px-3 py-3 text-center">{roiBadge(calc.roiPct)}</td>

                  {/* Rentabilité */}
                  <td className="px-3 py-3 text-center">{moisBadge(calc.moisRentabilite)}</td>

                  {/* Réel */}
                  {showReel && (
                    <td className="px-3 py-3 text-right tabular-nums">
                      {reelAnnee !== null ? (
                        <span className="font-medium">{euros(reelAnnee)}</span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  )}

                  {/* Écart */}
                  {showReel && (
                    <td className="px-3 py-3 text-right tabular-nums">
                      {ecart !== null ? (
                        <div>
                          <span className={ecart >= 0 ? "font-semibold text-green-600" : "font-semibold text-red-600"}>
                            {ecart >= 0 ? "+" : ""}{euros(ecart)}
                          </span>
                          {calc.gainsAnnuels > 0 && (
                            <div className="text-[10px] text-muted">
                              {ecart >= 0 ? "+" : ""}{((ecart / calc.gainsAnnuels) * 100).toFixed(0)} %
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  )}

                  {/* Actions */}
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link href={`/finance/roi/${item.id}`} className="text-primary hover:underline"><IconEdit className="h-4 w-4" /></Link>
                      <form action={deleteRoiItem.bind(null, item.id)}>
                        <button className="text-muted hover:text-red-600" title="Supprimer">✕</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function RoiPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const sp = await searchParams;
  const annee = Number(sp.annee) || new Date().getFullYear();

  const supabase = await createClient();
  const [{ data: roiData }, { data: refData }, { data: prestData }] = await Promise.all([
    supabase.from("roi_materiel").select("*").order("nom"),
    supabase.from("materiel_reference").select("id, nom").order("nom"),
    supabase
      .from("ligne_prestation")
      .select("reference_id, prix_total, prix_unitaire, quantite, prestation:prestation_id(statut, date_event_debut)")
      .not("reference_id", "is", null),
  ]);

  const items = (roiData ?? []) as RoiMateriel[];
  const references = (refData ?? []) as MaterielReference[];
  const lignes = (prestData ?? []) as unknown as LignePrest[];

  // Revenus réels par reference_id pour l'année
  const revenuReel = new Map<string, number>();
  for (const l of lignes) {
    if (!l.reference_id || !l.prestation) continue;
    if (!["confirme", "realise"].includes(l.prestation.statut)) continue;
    const dateStr = l.prestation.date_event_debut;
    if (!dateStr || new Date(dateStr).getFullYear() !== annee) continue;
    const montant = l.prix_total ?? (l.prix_unitaire ?? 0) * l.quantite;
    revenuReel.set(l.reference_id, (revenuReel.get(l.reference_id) ?? 0) + montant);
  }

  // Calcul ROI pour chaque item
  const calculs: ItemCalc[] = items.map((item) => ({
    item,
    calc: calcROI({
      cout_initial: Number(item.cout_initial),
      maintenance_annuelle: Number(item.maintenance_annuelle),
      duree_investissement_ans: Number(item.duree_investissement_ans),
      prix_location_ttc: Number(item.prix_location_ttc),
      volume_prevu_par_an: Number(item.volume_prevu_par_an),
      volume_interne_par_an: Number(item.volume_interne_par_an ?? 0),
      prix_revente: Number(item.prix_revente),
      cout_location_externe: Number(item.cout_location_externe),
    }),
    reelAnnee: item.reference_id ? (revenuReel.get(item.reference_id) ?? null) : null,
  }));

  const achetes = calculs.filter((c) => c.item.est_achete);
  const projets = calculs.filter((c) => !c.item.est_achete);

  // Stats globales
  const totalInvesti = achetes.reduce((s, c) => s + Number(c.item.cout_initial), 0);
  const totalProjets = projets.reduce((s, c) => s + Number(c.item.cout_initial), 0);
  const roiMoyenAchetes = achetes.length > 0 ? achetes.reduce((s, c) => s + c.calc.roiPct, 0) / achetes.length : null;
  const reelTotal = achetes.reduce((s, c) => s + (c.reelAnnee ?? 0), 0);
  const attenduTotal = achetes.reduce((s, c) => s + c.calc.gainsAnnuels, 0);

  return (
    <div className="max-w-7xl">
      <PageHeader title="Comptabilité" />
      <FinanceTabs annee={annee} />

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">ROI matériel</h2>
        <Modal trigger={<>+ Ajouter</>} title="Nouvel équipement" panelClassName="max-w-2xl">
          <RoiForm action={createRoiItem} references={references} inModal />
        </Modal>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted">Investi (acheté)</p>
          <p className="mt-1 text-lg font-bold">{euros(totalInvesti)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted">ROI moyen (acheté)</p>
          <p className="mt-1 text-lg font-bold">
            {roiMoyenAchetes !== null ? `${(roiMoyenAchetes * 100).toFixed(1)} %` : "—"}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted">Réel {annee} vs attendu</p>
          {attenduTotal > 0 ? (
            <p className={`mt-1 text-lg font-bold ${reelTotal >= attenduTotal ? "text-green-600" : "text-orange-500"}`}>
              {euros(reelTotal)} / {euros(attenduTotal)}
            </p>
          ) : (
            <p className="mt-1 text-lg font-bold text-muted">—</p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted">Budget projets à venir</p>
          <p className="mt-1 text-lg font-bold text-orange-500">{euros(totalProjets)}</p>
        </Card>
      </div>

      {/* Légende */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>ROI ≥ 50 %</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1"></span>ROI 20–50 %</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1"></span>ROI 0–20 %</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span>ROI négatif</span>
        <span className="ml-4 text-muted">Rentabilité = vert ≤ 12 mois · orange ≤ 30 mois · rouge au-delà</span>
      </div>

      {/* Section acheté */}
      <TableSection
        title="Matériel acheté"
        items={achetes}
        annee={annee}
        showReel={true}
      />

      {/* Section projets */}
      <TableSection
        title="Projets d'achat"
        items={projets}
        annee={annee}
        showReel={false}
      />

      {items.length === 0 && (
        <Card className="py-10 text-center text-sm text-muted">
          Aucun équipement. Cliquez sur &quot;+ Ajouter&quot; pour commencer.
        </Card>
      )}

      {/* Note calcul */}
      <details className="mt-6">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Détail des formules</summary>
        <div className="mt-2 rounded-lg border border-border p-3 text-xs text-muted space-y-1">
          <p><strong>TVA non applicable</strong> — le prix facturé TTC est encaissé en totalité.</p>
          <p><strong>Gains attendus/an</strong> = (prix client × nb prestations) + (coût location externe × nb utilisations internes)</p>
          <p><strong>Coût annuel</strong> = (achat − revente) ÷ durée + maintenance</p>
          <p><strong>ROI</strong> = (gains − coût annuel) ÷ gains</p>
          <p><strong>Rentabilité</strong> = (achat − revente) ÷ ((gains − maintenance) ÷ 12)</p>
          <p><strong>Réel {annee}</strong> = revenus issus des prestations facturées dans l'app pour les références liées au catalogue.</p>
          <p><strong>4 situations modélisées</strong> : prestation + matériel propre / prestation + location externe / interne + matériel propre / interne + location externe.</p>
        </div>
      </details>
    </div>
  );
}
