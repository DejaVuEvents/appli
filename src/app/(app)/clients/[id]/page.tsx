import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field, TextArea } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { Modal, ModalForm } from "@/components/modal";
import { ClientForm } from "../client-form";
import { updateClientFiche, deleteClientFiche, updateClientNotes, addContact, deleteContact } from "../actions";
import { ClientDocs, type DocRow } from "./client-docs";
import { type RemiseType } from "@/lib/devis";
import { statutFactureAffichage } from "@/lib/facture-statut";
import { euros } from "@/lib/format";
import type { Client, ClientContact } from "@/lib/types";

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export default async function ClientFichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("client").select("*").eq("id", id).single();
  if (!data) notFound();
  const client = data as Client;

  // Prestations du client → devis / lignes / transport / factures
  const { data: prestData } = await supabase.from("prestation").select("id, nom").eq("client_id", id);
  const prestations = (prestData ?? []) as { id: string; nom: string }[];
  const prestIds = prestations.map((p) => p.id);
  const prestNom = new Map(prestations.map((p) => [p.id, p.nom]));

  const [{ data: devisData }, { data: lignesData }, { data: transportData }, { data: dfData }, { data: contactsData }] = prestIds.length
    ? await Promise.all([
        supabase.from("devis").select("id, nom, type, prestation_id, remise_globale_type, remise_globale_valeur, statut_signature").in("prestation_id", prestIds),
        supabase.from("ligne_prestation").select("devis_id, prix_total").in("prestation_id", prestIds),
        supabase.from("transport").select("devis_id, cout_calcule").in("prestation_id", prestIds),
        supabase.from("devis_facture").select("devis_id, type, numero, montant_ttc, date_emission, date_echeance, statut_paiement").in("prestation_id", prestIds),
        supabase.from("client_contact").select("*").eq("client_id", id).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const devis = (devisData ?? []) as { id: string; nom: string | null; type: "devis" | "facture"; prestation_id: string; remise_globale_type: RemiseType; remise_globale_valeur: number; statut_signature: string | null }[];
  const lignes = (lignesData ?? []) as { devis_id: string | null; prix_total: number | null }[];
  const transports = (transportData ?? []) as { devis_id: string | null; cout_calcule: number | null }[];
  const dfs = (dfData ?? []) as { devis_id: string; type: string; numero: string | null; montant_ttc: number | null; date_emission: string | null; date_echeance: string | null; statut_paiement: string | null }[];
  const contacts = (contactsData ?? []) as ClientContact[];
  const dfByDevis = new Map(dfs.filter((d) => d.type !== "annule").map((d) => [`${d.devis_id}-${d.type}`, d]));

  const today = ymd(new Date());

  // Totaux par devis (montant figé si facture émise, sinon calcul depuis lignes)
  const totalDevis = (devisId: string, rt: RemiseType, rv: number) => {
    const ls = lignes.filter((l) => l.devis_id === devisId).map((l) => ({ prix_total: Number(l.prix_total ?? 0) })) as { prix_total: number }[];
    const tr = transports.filter((t) => t.devis_id === devisId).reduce((s, t) => s + Number(t.cout_calcule ?? 0), 0);
    // calculerTotaux attend des lignes complètes ; on approxime le total HT par la somme des prix_total + transport − remise globale.
    const net = ls.reduce((s, l) => s + l.prix_total, 0) + tr;
    const remise = rt === "montant" ? Math.min(rv, net) : (net * rv) / 100;
    return Math.round((net - remise) * 100) / 100;
  };

  const docs: DocRow[] = devis.map((d) => {
    const df = dfByDevis.get(`${d.id}-${d.type}`);
    const emis = !!df?.numero;
    const montant = df?.montant_ttc != null ? Number(df.montant_ttc) : totalDevis(d.id, d.remise_globale_type, Number(d.remise_globale_valeur ?? 0));
    let statutLabel = "Brouillon", statutCls = "bg-gray-200 text-gray-600";
    if (d.type === "facture") {
      const s = statutFactureAffichage(emis, df?.statut_paiement);
      statutLabel = s.label; statutCls = s.cls;
    } else if (d.statut_signature === "signe") {
      statutLabel = "Signé"; statutCls = "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300";
    } else if (d.statut_signature === "refuse") {
      statutLabel = "Refusé"; statutCls = "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
    } else {
      statutLabel = emis ? "Envoyé" : "Brouillon";
      statutCls = emis ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "bg-gray-200 text-gray-600";
    }
    return {
      id: d.id, type: d.type,
      intitule: d.nom || prestNom.get(d.prestation_id) || (d.type === "facture" ? "Facture" : "Devis"),
      numero: df?.numero ?? null,
      date: df?.date_emission ?? null,
      montant,
      statutLabel, statutCls,
      href: `/prestations/${d.prestation_id}/document?devis=${d.id}&type=${d.type}`,
    };
  });

  // Montant dû + retard (factures émises non payées)
  const facturesDues = dfs.filter((d) => d.type === "facture" && d.numero && d.statut_paiement !== "paye" && d.statut_paiement !== "annule");
  const totalDu = facturesDues.reduce((s, d) => s + Number(d.montant_ttc ?? 0), 0);
  const enRetard = facturesDues.some((d) => d.statut_paiement === "retard" || (d.date_echeance && d.date_echeance < today));
  // Total rapporté = factures encaissées (payées)
  const totalRapporte = dfs
    .filter((d) => d.type === "facture" && d.numero && d.statut_paiement === "paye")
    .reduce((s, d) => s + Number(d.montant_ttc ?? 0), 0);

  const villeLigne = client.adresse ?? "—";

  return (
    <div className="max-w-7xl space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Clients</Link>

      {/* En-tête : encadré dû + infos + actions */}
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr_auto]">
        {/* Encadré : total rapporté + à encaisser / retard */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Total rapporté</div>
          <div className="mt-1 text-3xl font-bold text-green-700 dark:text-green-400">{euros(totalRapporte)}</div>
          <div className="mt-3 border-t border-border pt-3">
            {totalDu > 0 ? (
              <>
                <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${enRetard ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                  {enRetard ? "⚠ En retard" : "À encaisser"}
                </div>
                <div className={`mt-1.5 text-xl font-bold ${enRetard ? "text-red-600" : "text-amber-700 dark:text-amber-400"}`}>{euros(totalDu)}</div>
                <div className="text-xs text-muted">{facturesDues.length} facture{facturesDues.length > 1 ? "s" : ""} en attente</div>
              </>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-950/50 dark:text-green-300">✓ À jour — rien à encaisser</div>
            )}
          </div>
        </div>

        {/* Infos client */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold">{client.nom}</h1>
          </div>
          <div className="mt-3 grid gap-x-10 gap-y-1.5 text-sm sm:grid-cols-2">
            <div><span className="text-muted">@ </span>{client.email ?? "—"}</div>
            <div><span className="text-muted">SIRET : </span>{client.siret ?? "—"}</div>
            <div><span className="text-muted">☎ </span>{client.telephone ?? "—"}</div>
            <div><span className="text-muted">TVA : </span>{client.tva_intra ?? "—"}</div>
            <div className="sm:col-span-1"><span className="text-muted">📍 </span>{villeLigne}</div>
            <div><span className="text-muted">IBAN : </span>{client.iban ?? "—"}</div>
            {client.tarif_preferentiel_pct > 0 && <div className="text-muted text-xs">Tarif préférentiel : −{client.tarif_preferentiel_pct}%</div>}
            <div><span className="text-muted">BIC : </span>{client.bic ?? "—"}</div>
          </div>
        </Card>

        {/* Actions : Modifier / Notes / Contacts */}
        <div className="flex flex-row gap-3 lg:flex-col">
          <Modal trigger={<>✎ Modifier</>} title="Modifier le client" triggerClassName="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-medium hover:bg-background">
            <ClientForm action={updateClientFiche.bind(null, id)} client={client} inModal />
          </Modal>

          <Modal trigger={<>💬 Notes</>} title="Notes client" triggerClassName="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-medium hover:bg-background">
            <ModalForm action={updateClientNotes.bind(null, id)} className="space-y-3">
              <TextArea label="Notes" name="notes" rows={6} defaultValue={client.notes} />
              <SubmitButton>Enregistrer</SubmitButton>
            </ModalForm>
          </Modal>

          <Modal trigger={<>👤 Contacts{contacts.length > 0 ? ` (${contacts.length})` : ""}</>} title="Contacts du client" triggerClassName="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-medium hover:bg-background">
            <div className="space-y-3">
              {contacts.length === 0 ? (
                <p className="text-sm text-muted">Aucun contact enregistré.</p>
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {contacts.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{c.nom}{c.role ? <span className="text-muted"> · {c.role}</span> : ""}</div>
                        <div className="text-xs text-muted">{[c.email, c.telephone].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <form action={deleteContact.bind(null, id, c.id)}>
                        <ConfirmButton confirm="Supprimer ce contact ?" className="shrink-0 text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
                      </form>
                    </div>
                  ))}
                </div>
              )}
              <form action={addContact.bind(null, id)} className="space-y-2 border-t border-border pt-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Nom" name="nom" required />
                  <Field label="Rôle" name="role" placeholder="Régisseur, Compta…" />
                  <Field label="Email" name="email" type="email" />
                  <Field label="Téléphone" name="telephone" />
                </div>
                <SubmitButton>+ Ajouter le contact</SubmitButton>
              </form>
            </div>
          </Modal>
        </div>
      </div>

      {/* Documents (factures / devis) */}
      <ClientDocs docs={docs} />

      {/* Suppression */}
      <form action={deleteClientFiche.bind(null, id)}>
        <ConfirmButton confirm="Supprimer définitivement ce client ?" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/20">
          Supprimer ce client
        </ConfirmButton>
      </form>
    </div>
  );
}
