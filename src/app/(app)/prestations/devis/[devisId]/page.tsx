import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembreActuel } from "@/lib/membre";
import { PageHeader, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { DevisBuilder, type TransportRow } from "../../devis-builder";
import { DisponibiliteSection } from "../../[id]/disponibilite";
import { updateStatut, associerDevisAEvenement } from "../../actions";
import { IconEdit, IconReceipt, IconRefresh, IconFile, IconFolder, IconUpload, IconCheck } from "@/components/icons";
import { emettreDocument, setStatutPaiement, setStatutSignature, uploaderDevisSigne, supprimerFacture } from "../../[id]/document/actions";
import { EnvoyerClientButton } from "../../[id]/document/envoyer-client";
import { AssocierEvenement } from "../../associer-evenement";
import { assemblerContenuDocument } from "@/lib/document";
import { urlDocument } from "@/lib/storage";
import { statutFactureAffichage, STATUT_PAIEMENT_LABELS, type StatutPaiement } from "@/lib/facture-statut";
import { JustificatifPreview } from "@/components/justificatif-preview";
import { periodeReservation } from "@/lib/devis";
import { euros, dateFr } from "@/lib/format";
import type { LignePrestation, Prestation, PrestationStatut, Devis } from "@/lib/types";

export default async function DevisEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ devisId: string }>;
  searchParams: Promise<{ edit?: string; msg?: string }>;
}) {
  const { devisId } = await params;
  const sp = await searchParams;
  const editMode = sp?.edit === "1";
  const flash = sp?.msg ? decodeURIComponent(sp.msg) : null;
  const supabase = await createClient();

  // RBAC : seuls les co-présidents accèdent aux devis / factures.
  const moi = await getMembreActuel(supabase);
  if (moi?.role !== "co_president") redirect("/prestations");

  const { data: devisRow } = await supabase.from("devis").select("*").eq("id", devisId).maybeSingle();
  if (!devisRow) notFound();
  const devis = devisRow as Devis & { pdf_import?: string | null; pdf_signe?: string | null; statut_signature?: string | null; created_at?: string | null; created_by?: string | null };
  const prestationId = devis.prestation_id as string;

  const { data: prest } = await supabase
    .from("prestation")
    .select("nom, statut, est_evenement, date_event_debut, date_event_fin, client(nom, adresse, email, tarif_preferentiel_pct)")
    .eq("id", prestationId)
    .maybeSingle();
  const prestation = prest as unknown as (Prestation & { est_evenement: boolean; client: { nom: string; adresse: string | null; email: string | null; tarif_preferentiel_pct: number } | null }) | null;

  // Liste des vrais événements (pour « Associer à un événement »)
  const { data: evData } = await supabase
    .from("prestation")
    .select("id, nom, date_event_debut, client(nom)")
    .eq("est_evenement", true)
    .order("date_event_debut", { ascending: false });
  const events = ((evData ?? []) as unknown as { id: string; nom: string; date_event_debut: string | null; client: { nom: string } | null }[])
    .map((e) => ({ id: e.id, nom: e.nom, date_event_debut: e.date_event_debut, client: e.client?.nom ?? null }));

  const estFacture = devis.type === "facture";
  const titre = estFacture ? "Facture" : "Devis";
  const titreDoc = devis.nom || titre;
  const backHref = `/prestations?tab=${estFacture ? "factures" : "devis"}`;
  const pdfUrl = `/prestations/${prestationId}/document/pdf?devis=${devisId}&type=${devis.type}`;

  // Émission (n° + montants figés) pour le type de ce document
  const { data: doc } = await supabase
    .from("devis_facture")
    .select("numero, statut_paiement, date_emission, date_echeance")
    .eq("devis_id", devisId)
    .eq("type", devis.type)
    .maybeSingle();
  const emis = !!doc?.numero;
  const badge = estFacture ? statutFactureAffichage(emis, doc?.statut_paiement) : null;
  // Un devis peut avoir été transformé en facture (émission de type « facture » sur le même devis).
  const { data: facEmise } = !estFacture
    ? await supabase.from("devis_facture").select("numero").eq("devis_id", devisId).eq("type", "facture").maybeSingle()
    : { data: null };
  const factureEmise = !!facEmise?.numero;
  const pdfSigneUrl = devis.pdf_signe ? await urlDocument(supabase, devis.pdf_signe) : null;

  // Message e-mail pré-rempli : modèle paramétrable (Paramètres) sinon message par défaut.
  const { data: entParams } = await supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle();
  const emailModele = (entParams as { email_message?: string | null } | null)?.email_message?.trim() || null;
  const mailto = prestation?.client?.email
    ? (() => {
        const sujet = `${titre}${doc?.numero ? ` N° ${doc.numero}` : ""} — ${prestation!.nom}`;
        let corps = emailModele
          ? emailModele.replace(/\{document\}/g, titre.toLowerCase()).replace(/\{evenement\}/g, prestation!.nom)
          : `Bonjour,\n\nVeuillez trouver ci-joint notre ${titre.toLowerCase()} pour « ${prestation!.nom} ».\n\nBien cordialement,`;
        if (estFacture) corps += `\n\nLes informations de paiement (IBAN) figurent sur la facture.`;
        return `mailto:${prestation!.client!.email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      })()
    : null;

  // ─────────────────────────── VUE LECTURE (par défaut) ───────────────────────────
  if (!editMode) {
    const pdfImportUrl = devis.pdf_import ? await urlDocument(supabase, devis.pdf_import) : null;
    const contenu = pdfImportUrl ? null : await assemblerContenuDocument(supabase, devisId);

    // Création + historique des modifications (qui / quand)
    const { data: histData } = await supabase
      .from("devis_historique")
      .select("membre_id, action, created_at")
      .eq("devis_id", devisId)
      .order("created_at", { ascending: false })
      .limit(15);
    const hist = (histData ?? []) as { membre_id: string | null; action: string | null; created_at: string }[];
    const membreIds = [...new Set([devis.created_by, ...hist.map((h) => h.membre_id)].filter(Boolean) as string[])];
    const { data: membs } = membreIds.length
      ? await supabase.from("membre").select("id, prenom, nom, email").in("id", membreIds)
      : { data: [] };
    const nomMembre = (mid: string | null | undefined): string => {
      if (!mid) return "—";
      const m = (membs ?? []).find((x) => x.id === mid);
      return m ? ((m.prenom ?? "").trim() || (m.nom ?? "").trim() || m.email?.split("@")[0] || "—") : "—";
    };
    const dt = (iso: string | null | undefined): string => (iso ? `${dateFr(iso.slice(0, 10))} à ${iso.slice(11, 16)}` : "—");
    const createur = nomMembre(devis.created_by);

    // Statut du devis (signature) : En attente / Validé / Signé / Refusé.
    const STATUT_DEVIS: Record<string, { label: string; cls: string }> = {
      "": { label: "En attente", cls: "bg-surface text-muted" },
      valide: { label: "Validé", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
      signe: { label: "Signé", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
      refuse: { label: "Refusé", cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
    };
    const sigStatut = devis.statut_signature ?? "";
    const devisBadge = STATUT_DEVIS[sigStatut] ?? STATUT_DEVIS[""];

    const fullBtn = "flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium";
    const halfBtn = "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface";
    const halfBtnPrimary = "flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90";

    const recap = (
      <aside className="space-y-3 lg:sticky lg:top-24 lg:w-64 lg:shrink-0">
        {flash && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
            {flash}
          </div>
        )}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{titre}{emis && doc?.numero ? ` n° ${doc.numero}` : ""}</span>
            {estFacture
              ? badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
              : <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${devisBadge.cls}`}>{devisBadge.label}</span>}
          </div>
          <div className="mt-1.5 text-xs text-muted">
            Créé le {dateFr(devis.created_at?.slice(0, 10) ?? null)}{createur !== "—" ? ` · ${createur}` : ""}
          </div>
          {(prestation?.date_event_debut || prestation?.date_event_fin) && (
            <div className="mt-0.5 text-xs text-muted">Événement : {dateFr(prestation?.date_event_debut ?? null)}{prestation?.date_event_fin ? ` → ${dateFr(prestation.date_event_fin)}` : ""}</div>
          )}
        </Card>

        {contenu && (
          <Card className="p-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted">Sous-total HT</span><span>{euros(contenu.totaux.sousTotalHT)}</span></div>
              {contenu.totaux.remiseHT > 0 && <div className="flex justify-between text-muted"><span>Remise HT</span><span>− {euros(contenu.totaux.remiseHT)}</span></div>}
              <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-bold"><span>Total HT</span><span>{euros(contenu.totaux.totalHT)}</span></div>
              {contenu.tva.taux > 0 && <div className="flex justify-between text-muted"><span>TVA {contenu.tva.taux} %</span><span>{euros(contenu.tva.montant)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Total TTC</span><span>{euros(contenu.tva.totalTtc)}</span></div>
            </div>
          </Card>
        )}

        {/* Actions principales */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Link href={`/prestations/devis/${devisId}?edit=1`} className={halfBtnPrimary}><IconEdit /> Éditer</Link>
            <JustificatifPreview
              url={`/apercu/${devisId}?type=${devis.type}`}
              libelle={`${titreDoc} — aperçu du document`}
              label="Aperçu"
              className={halfBtn}
            />
          </div>
          <div className="flex gap-2">
            <a href={pdfUrl} download className={halfBtn} title="Télécharger le PDF">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
              PDF
            </a>
            {mailto && <EnvoyerClientButton mailto={mailto} pdfUrl={pdfUrl} className={halfBtn} />}
          </div>
        </div>

        {/* Émission */}
        <div className="space-y-2">
          <form action={emettreDocument.bind(null, devisId, devis.type)}>
            <button className={`${fullBtn} border border-border hover:bg-surface`}>
              {emis ? <><IconRefresh /> Mettre à jour les montants</> : <><IconFile /> Émettre le {titre.toLowerCase()}</>}
            </button>
          </form>
          {!estFacture && (
            factureEmise ? (
              <>
                <Link href={`/prestations/${prestationId}/document?devis=${devisId}&type=facture`} className={`${fullBtn} border border-border hover:bg-surface`}>
                  <IconReceipt /> Voir la facture{facEmise?.numero ? ` n° ${facEmise.numero}` : ""}
                </Link>
                <form action={supprimerFacture.bind(null, devisId, prestationId, `/prestations/devis/${devisId}`)}>
                  <ConfirmButton confirm="Supprimer la facture ? Le devis est conservé ; seule l'émission de facture (et son entrée de trésorerie) est supprimée." className={`${fullBtn} border border-border text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30`}>
                    ✕ Supprimer la facture
                  </ConfirmButton>
                </form>
              </>
            ) : (
              <form action={emettreDocument.bind(null, devisId, "facture")}>
                <ConfirmButton confirm="Transformer ce devis en facture ? Une facture sera émise (n° définitif)." confirmLabel="Transformer" danger={false} className={`${fullBtn} border border-border hover:bg-surface`}>
                  <IconReceipt /> Transformer en facture
                </ConfirmButton>
              </form>
            )
          )}
        </div>

        {/* Statut de paiement (facture émise) */}
        {estFacture && emis && (
          <Card className="p-3">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">Statut de paiement</span>
            <form action={setStatutPaiement.bind(null, devisId, prestationId)} className="flex items-center gap-2">
              <select name="statut_paiement" defaultValue={doc?.statut_paiement ?? "en_attente"} className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                {(Object.keys(STATUT_PAIEMENT_LABELS) as StatutPaiement[]).map((s) => (
                  <option key={s} value={s}>{STATUT_PAIEMENT_LABELS[s]}</option>
                ))}
              </select>
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">OK</button>
            </form>
          </Card>
        )}

        {/* Statut du devis + signature */}
        {!estFacture && (
          <Card className="p-3 text-sm">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">Statut du devis</span>
            <form action={setStatutSignature.bind(null, devisId, prestationId)} className="flex items-center gap-2">
              <select name="statut_signature" defaultValue={sigStatut} className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                <option value="">En attente</option>
                <option value="valide">Validé</option>
                <option value="refuse">Refusé</option>
                {sigStatut === "signe" && <option value="signe">Signé</option>}
              </select>
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">OK</button>
            </form>

            {/* Signé : lien vers la version signée */}
            {sigStatut === "signe" && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950/50 dark:text-green-300"><IconCheck className="h-3.5 w-3.5" /> Signé</span>
                {pdfSigneUrl && <a href={pdfSigneUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><IconFile className="h-3.5 w-3.5" /> Voir la version signée</a>}
              </div>
            )}

            {/* Validé : bouton de dépôt de la signature */}
            {sigStatut === "valide" && (
              <form action={uploaderDevisSigne.bind(null, devisId, prestationId)} className="mt-2 space-y-1.5">
                <span className="block text-xs font-medium">Déposer la signature du client</span>
                <input type="file" name="pdf_signe" accept="application/pdf,image/*" className="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground" />
                <SubmitButton className="w-full gap-1 !py-1.5 !text-xs"><IconUpload className="h-3.5 w-3.5" /> Déposer la signature</SubmitButton>
              </form>
            )}
          </Card>
        )}

        {/* Rattachement événement */}
        <div>
          {prestation?.est_evenement ? (
            <Link href={`/prestations/${prestationId}`} className={`${fullBtn} border border-border hover:bg-surface`}><IconFolder /> Fiche de l&apos;événement</Link>
          ) : (
            <AssocierEvenement devisId={devisId} events={events} action={associerDevisAEvenement} triggerClassName={`${fullBtn} border border-border hover:bg-surface`} />
          )}
        </div>

        {/* Historique des modifications */}
        {hist.length > 0 && (
          <Card className="p-3">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">Historique</span>
            <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
              {hist.map((h, i) => (
                <li key={i}>
                  <span className="block text-muted">{dt(h.created_at)}</span>
                  <span>{h.action ?? "Modification"} — <span className="font-medium">{nomMembre(h.membre_id)}</span></span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    );

    const contenuLecture = pdfImportUrl ? (
      <Card className="overflow-hidden p-0">
        <iframe src={pdfImportUrl} title={titreDoc} className="h-[80vh] w-full bg-white" />
      </Card>
    ) : contenu ? (
      <div className="space-y-4">
        {contenu.groupes.map((g) => (
          <Card key={g.nom} className="overflow-hidden">
            <div className="border-b border-border bg-surface px-4 py-2 text-sm font-semibold">{g.nom}</div>
            <div className="divide-y divide-border">
              {g.items.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.designation}</div>
                    <div className="text-xs text-muted">{l.quantite}{l.unite ? ` ${l.unite}` : ""} × {euros(l.prix_unitaire)}</div>
                  </div>
                  <span className="shrink-0 font-medium">{euros(l.prix_total)}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {contenu.transportTotal > 0 && (
          <Card className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-medium">Transport</span>
            <span className="font-medium">{euros(contenu.transportTotal)}</span>
          </Card>
        )}
      </div>
    ) : (
      <Card className="px-4 py-6 text-sm text-muted">Devis vide. Clique « Éditer » pour ajouter des éléments.</Card>
    );

    return (
      <div className="max-w-6xl space-y-5">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Devis &amp; Factures</Link>

        <PageHeader title={titreDoc} subtitle={prestation?.client?.nom ?? "Sans client"} />

        <div className="lg:flex lg:items-start lg:gap-6">
          <div className="min-w-0 flex-1">{contenuLecture}</div>
          <div className="mt-4 lg:mt-0">{recap}</div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────── VUE ÉDITION (?edit=1) ───────────────────────────────
  if (!prestation) notFound();

  const [{ data: lignesDevis }, { data: lignesEvent }, { data: cats }, { data: refs }, { data: transportsData }, { data: vehs }, { data: entData }, { count: nbDevis }] =
    await Promise.all([
      supabase.from("ligne_prestation").select("*").eq("devis_id", devisId).order("ordre", { nullsFirst: false }).order("created_at"),
      supabase.from("ligne_prestation").select("*").eq("prestation_id", prestationId),
      supabase.from("categorie").select("id, nom, ordre").order("ordre", { ascending: true }).order("nom"),
      supabase.from("materiel_reference").select("id, nom, designation, prix_location_jour, cout_location_jour, categorie_id, est_consommable").order("nom"),
      supabase.from("transport").select("id, devis_id, nb_vehicules, km, cout_calcule, vehicule(nom)").eq("devis_id", devisId),
      supabase.from("vehicule").select("id, nom").order("nom"),
      supabase.from("parametres_entreprise").select("taux_tva").limit(1).maybeSingle(),
      supabase.from("devis").select("id", { count: "exact", head: true }).eq("prestation_id", prestationId),
    ]);

  const tauxTva = Number((entData as { taux_tva?: number } | null)?.taux_tva ?? 0);
  const lignes = (lignesDevis ?? []) as LignePrestation[];
  const allLignes = (lignesEvent ?? []) as LignePrestation[];
  const categories = (cats ?? []) as { id: string; nom: string; ordre: number | null }[];
  const references = (refs ?? []) as {
    id: string; nom: string; prix_location_jour: number; cout_location_jour: number | null; categorie_id: string | null; est_consommable: boolean;
  }[];
  const transports = (transportsData ?? []) as unknown as TransportRow[];
  const vehicules = (vehs ?? []) as { id: string; nom: string }[];
  const refMap = new Map(references.map((r) => [r.id, r]));

  const memberIds = [...new Set([devis.created_by, devis.updated_by].filter(Boolean) as string[])];
  const { data: membresData } = memberIds.length
    ? await supabase.from("membre").select("id, prenom, nom, email").in("id", memberIds)
    : { data: [] };
  const nomMembreById = (mid: string | null | undefined): string | null => {
    if (!mid) return null;
    const m = (membresData ?? []).find((x) => x.id === mid);
    if (!m) return null;
    return (m.prenom ?? "").trim() || (m.nom ?? "").trim() || m.email?.split("@")[0] || null;
  };

  const periode = periodeReservation(prestation);
  const besoinMap = new Map<string, number>();
  for (const l of allLignes) {
    const r = l.reference_id ? refMap.get(l.reference_id) : undefined;
    if (r && !r.est_consommable && r.cout_location_jour == null) {
      besoinMap.set(r.id, (besoinMap.get(r.id) ?? 0) + l.quantite);
    }
  }
  const besoin = [...besoinMap].map(([referenceId, qty]) => ({ referenceId, qty, nom: refMap.get(referenceId)?.nom ?? "—" }));

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader title={titreDoc} subtitle={`${prestation.nom}${prestation.client?.nom ? ` · ${prestation.client.nom}` : ""}`} />

      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <Link href={backHref} className="inline-flex items-center gap-1 text-muted hover:text-foreground">← Devis &amp; Factures</Link>
        <Link
          href={`/prestations/devis/${devisId}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          ✓ Enregistrer et fermer
        </Link>
      </div>
      <p className="-mt-3 text-xs text-muted">Les modifications sont enregistrées automatiquement à chaque changement. « Enregistrer et fermer » revient à l&apos;aperçu.</p>

      <DevisBuilder
        prestationId={prestationId}
        devis={devis}
        lignes={lignes}
        transports={transports}
        references={references}
        categories={categories}
        refMap={refMap}
        vehicules={vehicules}
        tauxTva={tauxTva}
        plusieurs={(nbDevis ?? 1) > 1}
        createur={nomMembreById(devis.created_by)}
        modificateur={nomMembreById(devis.updated_by)}
        updatedAt={devis.updated_at ?? null}
        statut={prestation.statut as PrestationStatut}
        statutAction={updateStatut.bind(null, prestationId)}
        supabase={supabase}
      />

      <DisponibiliteSection prestationId={prestationId} periode={periode} besoin={besoin} />
    </div>
  );
}
