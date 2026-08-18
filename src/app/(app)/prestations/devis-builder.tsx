import Link from "next/link";
import { Card } from "@/components/ui";
import { Field, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { Modal, ModalForm } from "@/components/modal";
import { LignesEditor, type BlocData } from "./lignes-editor";
import { StatutSelect } from "./[id]/statut-select";
import {
  addTransport,
  deleteTransport,
  updateRemiseGlobale,
  duplicerDevis,
  deleteDevis,
  renameDevis,
  creerAcompteSolde,
} from "./actions";
import { euros, dateFr } from "@/lib/format";
import { montantRemise } from "@/lib/devis";
import type { LignePrestation, PrestationStatut, Devis } from "@/lib/types";

export type TransportRow = {
  id: string;
  devis_id: string | null;
  nb_vehicules: number;
  km: number;
  cout_calcule: number | null;
  vehicule: { nom: string } | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DevisBuilder(props: {
  prestationId: string;
  devis: Devis;
  lignes: LignePrestation[];
  transports: TransportRow[];
  references: { id: string; nom: string; prix_location_jour: number; cout_location_jour: number | null; categorie_id: string | null; est_consommable: boolean }[];
  categories: { id: string; nom: string; ordre: number | null }[];
  refMap: Map<string, { id: string; nom: string; prix_location_jour: number; cout_location_jour: number | null; categorie_id: string | null; est_consommable: boolean }>;
  vehicules: { id: string; nom: string }[];
  tauxTva: number;
  plusieurs: boolean;
  createur: string | null;
  modificateur: string | null;
  updatedAt: string | null;
  statut: PrestationStatut;
  statutAction: (formData: FormData) => void | Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const { prestationId, devis, lignes, transports, references, categories, refMap, vehicules, tauxTva, plusieurs, createur, modificateur, updatedAt, statut, statutAction, supabase } = props;
  const id = prestationId;

  // Accessoires optionnels disponibles par référence parente
  const parentRefIds = [...new Set(lignes.filter((l) => !l.est_accessoire_auto && l.reference_id).map((l) => l.reference_id as string))];
  const { data: optRulesData } = parentRefIds.length
    ? await supabase
        .from("kit_regle")
        .select("id, reference_parent_id, accessoire:materiel_reference!reference_accessoire_id(id, nom)")
        .eq("obligatoire", false)
        .in("reference_parent_id", parentRefIds)
    : { data: [] };
  type OptRule = { id: string; reference_parent_id: string; accessoire: { id: string; nom: string } | null };
  const optRules = (optRulesData ?? []) as unknown as OptRule[];
  const enfantsDe = (parentId: string) => lignes.filter((l) => l.ligne_parent_id === parentId);
  const optionsPourLigne = (l: LignePrestation): OptRule[] => {
    if (l.est_accessoire_auto || !l.reference_id) return [];
    const dejaAjoutes = new Set(enfantsDe(l.id).map((c) => c.reference_id));
    return optRules.filter((r) => r.reference_parent_id === l.reference_id && r.accessoire && !dejaAjoutes.has(r.accessoire.id));
  };

  // Le devis regroupe le matériel en 4 catégories de TYPE (peu importe la sous-catégorie
  // fine du catalogue) : Lumière & Effets, Son, Structure, Technique.
  const B = { LUM: "Lumière & Effets", SON: "Son", STR: "Structure", TECH: "Technique" };
  const BUCKET_PAR_NOM: Record<string, string> = {
    "Lumière & Effets": B.LUM, "Barres & Blinders": B.LUM, "Câbles": B.LUM, "Contrôle DMX": B.LUM,
    "Laser": B.LUM, "Têtes mobiles": B.LUM, "Wash & PAR LED": B.LUM, "Lyres & Robotisés": B.LUM,
    "Projecteurs": B.LUM, "Effets Scéniques": B.LUM, "Consoles Lumière": B.LUM, "Câbles Lumière": B.LUM,
    "Son": B.SON, "Amplificateurs": B.SON, "Enceintes": B.SON, "Enceintes & Caissons": B.SON,
    "Tables de mixage": B.SON, "Consoles de mixage": B.SON, "Platines & DJ": B.SON, "Micros & HF": B.SON,
    "Câbles Son": B.SON, "Traitement & Divers": B.SON,
    "Structure & Scène": B.STR, "Structure": B.STR, "Accessoires scène": B.STR, "Accrochage": B.STR,
    "Praticables": B.STR, "Levage": B.STR,
    "Technique": B.TECH, "Transport": B.TECH, "Électricité": B.TECH, "Armoires & Distribution": B.TECH,
    "Câbles & Multiprises": B.TECH, "Câbles Électricité": B.TECH, "Vidéo": B.TECH, "Câbles Vidéo": B.TECH,
    "Catalogue Externe": B.TECH,
  };
  const catNomById = new Map(categories.map((c) => [c.id, c.nom]));
  const bucketDe = (catId: string | null): string => {
    const nom = catId ? catNomById.get(catId) : null;
    return (nom && BUCKET_PAR_NOM[nom]) || B.TECH;
  };
  const bucketCatId: Record<string, string | undefined> = {
    [B.LUM]: categories.find((c) => c.nom === "Lumière & Effets")?.id,
    [B.SON]: categories.find((c) => c.nom === "Son")?.id,
    [B.STR]: categories.find((c) => c.nom === "Structure & Scène")?.id,
    [B.TECH]: categories.find((c) => c.nom === "Technique")?.id,
  };
  const lignesParBucket = new Map<string, LignePrestation[]>();
  for (const l of lignes) {
    const b = bucketDe(l.categorie_id);
    if (!lignesParBucket.has(b)) lignesParBucket.set(b, []);
    lignesParBucket.get(b)!.push(l);
  }
  const ORDRE = [B.LUM, B.SON, B.STR, B.TECH];
  const blocs: { catId: string | null; nom: string; lignes: LignePrestation[] }[] = ORDRE.map((b) => ({
    catId: bucketCatId[b] ?? null, nom: b, lignes: lignesParBucket.get(b) ?? [],
  }));
  // Catégories proposées dans le formulaire « + Ajouter » = les 4 buckets.
  const catsDevis = ORDRE.map((b) => ({ id: bucketCatId[b] ?? "", nom: b })).filter((c) => c.id) as { id: string; nom: string }[];

  // Données sérialisables pour l'éditeur client (drag-and-drop + édition inline).
  const blocsData: BlocData[] = blocs.map((b) => ({
    catId: b.catId, nom: b.nom,
    lignes: b.lignes.map((l) => ({
      id: l.id, designation: l.designation, quantite: l.quantite, unite: l.unite,
      prix_unitaire: Number(l.prix_unitaire ?? 0), prix_total: l.prix_total,
      remise_type: (l.remise_type as string) ?? "pct", remise_valeur: Number(l.remise_valeur ?? 0),
      est_accessoire_auto: l.est_accessoire_auto,
      options: optionsPourLigne(l).map((o) => ({ ruleId: o.id, nom: o.accessoire?.nom ?? "" })),
    })),
  }));

  // Marge sous-location
  const coutFournisseurTotal = lignes.reduce((s, l) => {
    if (!l.reference_id) return s;
    const r = refMap.get(l.reference_id);
    return r?.cout_location_jour != null ? s + Number(r.cout_location_jour) * l.quantite : s;
  }, 0);
  const revenusExterne = lignes.reduce((s, l) => {
    if (!l.reference_id) return s;
    const r = refMap.get(l.reference_id);
    return r?.cout_location_jour != null ? s + Number(l.prix_total ?? 0) : s;
  }, 0);
  const margeExterne = revenusExterne - coutFournisseurTotal;
  const hasMargeFournisseur = coutFournisseurTotal > 0;

  const sousTotalBrut = lignes.reduce((s, l) => s + Number(l.prix_unitaire ?? 0) * l.quantite, 0);
  const netLignes = lignes.reduce((s, l) => s + Number(l.prix_total ?? 0), 0);
  const transportTotal = transports.reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
  const baseGlobale = netLignes + transportTotal;
  const remiseGlobale = montantRemise(baseGlobale, devis.remise_globale_type, devis.remise_globale_valeur);
  const sousTotalHT = sousTotalBrut + transportTotal;
  const totalHT = baseGlobale - remiseGlobale;
  const remiseHT = sousTotalHT - totalHT;

  const totalTtc = Math.round(totalHT * (1 + tauxTva / 100) * 100) / 100;

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      {/* Colonne principale : catégories + transport + remise + marge */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Catégories pré-placées — éditeur avec drag-and-drop + édition inline */}
        <LignesEditor prestationId={id} devisId={devis.id} blocs={blocsData} references={references} categories={catsDevis} />

        {/* Transport */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Transport</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {transports.length === 0 && <p className="px-4 py-3 text-sm text-muted">Aucun transport.</p>}
            {transports.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{t.nb_vehicules} × {t.vehicule?.nom ?? "?"}{t.km ? ` · ${t.km} km` : ""}</span>
                <span className="flex items-center gap-3">
                  <strong>{euros(t.cout_calcule)}</strong>
                  <form action={deleteTransport.bind(null, id, t.id)}>
                    <ConfirmButton confirm="Supprimer ce transport ?" className="text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
                  </form>
                </span>
              </div>
            ))}
          </Card>
          {vehicules.length > 0 && (
            <Card className="mt-3 p-4">
              <form action={addTransport.bind(null, id, devis.id)} className="grid gap-3 sm:grid-cols-4 sm:items-end">
                <Select label="Véhicule" name="vehicule_id" required className="sm:col-span-2"
                  options={[{ value: "", label: "Choisir…" }, ...vehicules.map((v) => ({ value: v.id, label: v.nom }))]} />
                <Field label="Nb véhicules" name="nb_vehicules" type="number" defaultValue={1} />
                <Field label="Kilométrage" name="km" type="number" step="0.1" defaultValue={0} />
                <div className="sm:col-span-4"><SubmitButton>+ Ajouter le transport</SubmitButton></div>
              </form>
            </Card>
          )}
        </section>

        {/* Remise globale */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Remise globale</h2>
          <Card className="p-4">
            <form action={updateRemiseGlobale.bind(null, devis.id)} className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <Select label="Type" name="remise_globale_type" defaultValue={devis.remise_globale_type}
                options={[{ value: "pct", label: "%" }, { value: "montant", label: "€" }]} />
              <Field label="Valeur" name="remise_globale_valeur" type="number" step="0.01" defaultValue={devis.remise_globale_valeur} />
              <Field label="Libellé (optionnel)" name="remise_globale_libelle" defaultValue={devis.remise_globale_libelle ?? ""} placeholder="Remise fidélité…" />
              <div><SubmitButton>Appliquer</SubmitButton></div>
            </form>
          </Card>
        </section>

        {/* Marge sous-location */}
        {hasMargeFournisseur && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Marge sous-location</h2>
            <Card className="p-5">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted">Revenu client (matos externe)</span><span>{euros(revenusExterne)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Coût fournisseur</span><span className="text-red-600">− {euros(coutFournisseurTotal)}</span></div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-bold">
                  <span>Marge brute sous-location</span>
                  <span className={margeExterne >= 0 ? "text-green-700" : "text-red-600"}>
                    {margeExterne >= 0 ? "+" : ""}{euros(margeExterne)}
                    {revenusExterne > 0 && <span className="ml-2 text-xs font-normal text-muted">({Math.round((margeExterne / revenusExterne) * 100)} %)</span>}
                  </span>
                </div>
              </div>
            </Card>
          </section>
        )}
      </div>

      {/* Colonne droite : récapitulatif (statut, nom, totaux, actions) — collant */}
      <aside className="mt-4 space-y-3 lg:mt-0 lg:w-64 lg:shrink-0 lg:sticky lg:top-24">
        <Card className="p-4">
          <label className="mb-1 block text-xs font-medium text-muted">Statut de l&apos;événement</label>
          <StatutSelect action={statutAction} statut={statut} />
        </Card>

        <Card className="p-4">
          <form action={renameDevis.bind(null, devis.id)} className="space-y-1.5">
            <label className="block text-xs font-medium text-muted">Nom du document</label>
            <input name="nom" defaultValue={devis.nom ?? ""} placeholder="Devis lumière…" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <SubmitButton className="w-full">Renommer</SubmitButton>
          </form>
        </Card>

        <Card className="p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted">Sous-total HT</span><span>{euros(sousTotalHT)}</span></div>
            {remiseHT > 0 && <div className="flex justify-between text-muted"><span>Remise HT</span><span>− {euros(remiseHT)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-bold"><span>Total HT</span><span>{euros(totalHT)}</span></div>
            {tauxTva > 0 && <div className="flex justify-between text-muted"><span>TVA {tauxTva} %</span><span>{euros(Math.round(totalHT * tauxTva) / 100)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Total TTC</span><span>{euros(totalTtc)}</span></div>
          </div>
        </Card>

        <div className="space-y-2">
          <Link href={`/prestations/${id}/document?devis=${devis.id}&type=${devis.type}`} className="block w-full rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90">
            {devis.type === "facture" ? "Facture" : "Devis"} (PDF) →
          </Link>
          <form action={duplicerDevis.bind(null, devis.id)}>
            <button className="w-full rounded-lg border border-border px-3 py-2 text-sm hover:bg-background" title="Dupliquer ce devis">Dupliquer</button>
          </form>
          <Modal trigger={<>Découper (acompte + solde)</>} title="Découper en acompte + solde" triggerClassName="block w-full rounded-lg border border-border px-3 py-2 text-center text-sm hover:bg-background">
            <ModalForm action={creerAcompteSolde.bind(null, devis.id)} className="space-y-3">
              <p className="text-sm text-muted">
                Crée <span className="font-medium text-foreground">deux factures</span> à partir de ce document :
                une facture d&apos;acompte (à régler avant la presta pour bloquer le matériel) et une facture de solde.
              </p>
              <Field label="Pourcentage d'acompte (%)" name="acompte_pct" type="number" step="1" defaultValue={30} />
              <SubmitButton>Créer les 2 factures</SubmitButton>
            </ModalForm>
          </Modal>
          {plusieurs && (
            <form action={deleteDevis.bind(null, devis.id, undefined)}>
              <ConfirmButton confirm="Supprimer ce devis et ses lignes ?" className="w-full rounded-lg border border-border px-3 py-2 text-sm text-red-600 hover:bg-background">Supprimer</ConfirmButton>
            </form>
          )}
        </div>

        {(createur || modificateur) && (
          <p className="px-1 text-xs text-muted">
            {createur && <>Créé par <span className="font-medium">{createur}</span></>}
            {modificateur && updatedAt && (<>{createur ? " · " : ""}Modifié le {dateFr(updatedAt)} par <span className="font-medium">{modificateur}</span></>)}
          </p>
        )}
      </aside>
    </div>
  );
}
