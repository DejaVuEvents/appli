import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field, TextArea, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { InfoTip } from "@/components/info-tip";
import { ThemeToggle } from "@/components/theme-toggle";
import { addTarifDegressifGlobal, deleteTarifDegressifGlobal, updateEntreprise, updateEmailModele, updateMembre, updateMonCompte } from "./actions";
import { updateTresorerieReglages } from "../finance/actions";
import { Modal, ModalForm } from "@/components/modal";
import { getMembreActuel, COMPETENCES, ROLE_LABELS, nomMembre, type RoleMembre } from "@/lib/membre";
import { urlDocument } from "@/lib/storage";
import { FinanceCategories, type FinanceCat } from "./finance-categories";
import { MaterielCategories, type MaterielCat } from "./materiel-categories";
import type { TarifDegressifGlobal, ParametresEntreprise } from "@/lib/types";
import type { Membre } from "@/lib/membre";

const TABS = [
  { id: "moncompte", label: "Mon compte" },
  { id: "entreprise", label: "Entreprise & documents" },
  { id: "finance", label: "Trésorerie & tarifs" },
  { id: "categories", label: "Catégories" },
  { id: "equipe", label: "Équipe" },
] as const;

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tabRaw = (await searchParams)?.tab ?? "moncompte";
  const supabase = await createClient();
  const [{ data }, { data: entrepriseData }, { data: membresData }, { data: catData }, moi] = await Promise.all([
    supabase.from("tarif_degressif_global").select("*").order("jour_min"),
    supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
    supabase.from("membre").select("*").order("role").order("nom"),
    supabase.from("categorie").select("id, nom, ordre, parent_id").order("ordre", { ascending: true }).order("nom"),
    getMembreActuel(supabase),
  ]);
  const paliers = (data ?? []) as TarifDegressifGlobal[];
  const ent = entrepriseData as ParametresEntreprise | null;
  const membres = (membresData ?? []) as Membre[];
  const categories = (catData ?? []) as MaterielCat[];

  // Catégories / sous-catégories finance (nomenclature éditable)
  const [{ data: finCatData }, { data: finSubData }] = await Promise.all([
    supabase.from("finance_categorie").select("id, sens, nom, ordre").order("ordre").order("nom"),
    supabase.from("finance_sous_categorie").select("id, categorie_id, nom, ordre").order("ordre").order("nom"),
  ]);
  const financeCats: FinanceCat[] = ((finCatData ?? []) as { id: string; sens: string; nom: string }[]).map((c) => ({
    id: c.id, sens: c.sens, nom: c.nom,
    sous: ((finSubData ?? []) as { id: string; categorie_id: string; nom: string }[]).filter((s) => s.categorie_id === c.id).map((s) => ({ id: s.id, nom: s.nom })),
  }));

  // Avatar/signature = bucket privé → URLs signées pour l'affichage.
  const moiPhoto = await urlDocument(supabase, moi?.photo_url);
  const moiSignature = await urlDocument(supabase, moi?.signature_url);
  const avatarUrls = new Map<string, string | null>();
  await Promise.all(
    membres.filter((m) => m.photo_url).map(async (m) => avatarUrls.set(m.id, await urlDocument(supabase, m.photo_url))),
  );

  // RBAC : seuls les co-présidents voient les réglages sensibles (entreprise, tarifs, équipe…).
  const estCoPres = moi?.role === "co_president";
  const tab = estCoPres ? tabRaw : "moncompte";
  const visibleTabs = estCoPres ? TABS : TABS.filter((t) => t.id === "moncompte");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Paramètres" />

      {/* Sous-onglets */}
      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-xl border border-border bg-surface p-1 sm:w-auto">
          {visibleTabs.map((t) => (
            <Link
              key={t.id}
              href={`/parametres?tab=${t.id}`}
              className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? "border border-border bg-background shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Mon compte ── */}
      {tab === "moncompte" && moi && (
        <section>
          <Card className="mb-4 flex items-center justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-medium">Apparence</div>
              <div className="text-xs text-muted">Basculer entre le thème clair et sombre.</div>
            </div>
            <ThemeToggle />
          </Card>
          <p className="mb-4 text-sm text-muted">
            Tes informations personnelles (utilisées pour pré-remplir tes notes de frais et y apposer ta signature).
          </p>
          <Card className="p-5">
            <form action={updateMonCompte} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom" name="nom" defaultValue={moi.nom} />
                <Field label="Prénom" name="prenom" defaultValue={moi.prenom} />
              </div>
              <div>
                <span className="block text-sm font-medium mb-1">Email (compte)</span>
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted">{moi.email ?? "—"}</div>
              </div>
              <Field label="Adresse" name="adresse" defaultValue={moi.adresse} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Téléphone" name="telephone" defaultValue={moi.telephone} />
                <Field label="Fonction (ex. Président, Trésorier)" name="fonction" defaultValue={moi.fonction} />
              </div>
              <Field label="IBAN (pour remboursement)" name="iban" defaultValue={moi.iban} />

              {/* Photo de profil */}
              <div>
                <span className="mb-1 block text-sm font-medium">Photo de profil</span>
                <div className="flex items-center gap-4">
                  {moiPhoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={moiPhoto} alt="Photo" className="h-16 w-16 rounded-full border border-border object-cover" />
                  )}
                  <div className="flex-1">
                    <input type="file" name="photo" accept="image/*"
                      className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground" />
                    {moi.photo_url && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" name="supprimer_photo" className="h-4 w-4 rounded border-border" /> Supprimer la photo
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Signature */}
              <div>
                <span className="mb-1 block text-sm font-medium">Signature</span>
                <p className="mb-1 text-xs text-muted">Image de ta signature (PNG transparent idéalement). Utilisée pour signer les notes de frais.</p>
                <div className="flex items-center gap-4">
                  {moiSignature && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={moiSignature} alt="Signature" className="h-14 w-32 rounded border border-border object-contain bg-white" />
                  )}
                  <div className="flex-1">
                    <input type="file" name="signature" accept="image/*"
                      className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground" />
                    {moi.signature_url && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" name="supprimer_signature" className="h-4 w-4 rounded border-border" /> Supprimer la signature
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <SubmitButton>Enregistrer mon profil</SubmitButton>
            </form>
          </Card>
        </section>
      )}

      {/* ── Entreprise & documents ── */}
      {tab === "entreprise" && ent && (
        <section>
          <p className="mb-4 text-sm text-muted">Ces informations apparaissent sur les devis / factures PDF.</p>
          <Card className="p-5">
            <form action={updateEntreprise.bind(null, ent.id)} className="space-y-4">
              <div>
                <span className="mb-1 block text-sm font-medium">Logo</span>
                <div className="flex items-center gap-4">
                  {ent.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ent.logo} alt="Logo" className="h-16 w-16 rounded border border-border object-contain bg-white" />
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      name="logo_file"
                      accept="image/*"
                      className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
                    />
                    {ent.logo && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" name="supprimer_logo" className="h-4 w-4 rounded border-border" />
                        Supprimer le logo actuel
                      </label>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted">PNG ou JPG, max 1 Mo. Apparaît en haut des devis/factures.</p>
              </div>

              <Field label="Raison sociale" name="raison_sociale" defaultValue={ent.raison_sociale} />
              <Field label="Adresse" name="adresse" defaultValue={ent.adresse} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Code postal" name="code_postal" defaultValue={ent.code_postal} />
                <Field label="Ville" name="ville" defaultValue={ent.ville} />
                <Field label="Pays" name="pays" defaultValue={ent.pays} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="IBAN" name="iban" defaultValue={ent.iban} />
                <Field label="SIREN" name="siren" defaultValue={ent.siren} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Mention TVA" name="mention_tva" defaultValue={ent.mention_tva} className="sm:col-span-2" />
                <Field label="Taux de TVA (%)" name="taux_tva" type="number" step="0.1" defaultValue={ent.taux_tva} placeholder="0 = franchise" />
              </div>
              <TextArea label="Conditions — devis" name="conditions_devis" defaultValue={ent.conditions_devis} rows={2} />
              <TextArea label="Conditions — facture" name="conditions_facture" defaultValue={ent.conditions_facture} rows={2} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prochain n° de devis" name="prochain_num_devis" type="number" defaultValue={ent.prochain_num_devis} />
                <Field label="Prochain n° de facture" name="prochain_num_facture" type="number" defaultValue={ent.prochain_num_facture} />
              </div>
              <Select
                label="Format d'affichage des dates (documents)"
                name="format_date"
                defaultValue={ent.format_date ?? "fr"}
                options={[
                  { value: "fr", label: "JJ/MM/AAAA (25/06/2026)" },
                  { value: "long", label: "JJ mois AAAA (25 juin 2026)" },
                  { value: "iso", label: "AAAA-MM-JJ (2026-06-25)" },
                ]}
              />

              {/* Connexion bancaire Qonto (pour Finance → Sync Qonto) */}
              <div className="border-t border-border pt-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  🏦 Connexion Qonto (banque)
                  <InfoTip>
                    Identifiants API Qonto pour importer les transactions dans la trésorerie.
                    À générer dans Qonto : <span className="font-medium">Paramètres → Intégrations / API</span> (login d&apos;organisation + clé secrète).
                  </InfoTip>
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Login (identifiant organisation)" name="qonto_login" defaultValue={ent.qonto_login} placeholder="deja-vu-1234" />
                  <Field label="Clé secrète (token API)" name="qonto_token" defaultValue={ent.qonto_token} placeholder="•••• secret ••••" />
                </div>
                <Field label="Compte (slug)" name="qonto_account_slug" defaultValue={ent.qonto_account_slug} placeholder="deja-vu-1234-bank-account-1" className="mt-4" />
                <p className="mt-1 text-xs text-muted">Le « slug » du compte apparaît dans l&apos;URL/API Qonto (souvent <code>…-bank-account-1</code>). Laisse vide si un seul compte.</p>
              </div>

              <SubmitButton>Enregistrer</SubmitButton>
            </form>
          </Card>

          {/* Message e-mail pré-rempli pour l'envoi des devis/factures */}
          <Card className="mt-6 p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
              Message e-mail (devis / factures)
              <InfoTip>
                Corps du message pré-rempli quand tu cliques « Envoyer au client ». Variables disponibles :
                <code> {"{document}"} </code> (« devis » ou « facture ») et <code> {"{evenement}"} </code> (nom de l&apos;événement).
                Pour une <strong>facture</strong>, une ligne indiquant que les informations de paiement figurent sur la facture est ajoutée automatiquement.
              </InfoTip>
            </h2>
            <form action={updateEmailModele.bind(null, ent.id)} className="space-y-2">
              <TextArea
                label="Corps du message"
                name="email_message"
                rows={5}
                defaultValue={(ent as unknown as { email_message?: string | null }).email_message ?? ""}
              />
              <p className="text-xs text-muted">Laisse vide pour le message par défaut : «&nbsp;Bonjour, Veuillez trouver ci-joint notre {"{document}"} pour «&nbsp;{"{evenement}"}&nbsp;». Bien cordialement,&nbsp;».</p>
              <SubmitButton>Enregistrer le message</SubmitButton>
            </form>
          </Card>
        </section>
      )}

      {/* ── Trésorerie & tarifs ── */}
      {tab === "finance" && (
        <div className="space-y-8">
          {ent && (
            <section>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
                Trésorerie
                <InfoTip>Solde de départ et seuil d&apos;alerte du tableau de bord Finance.</InfoTip>
              </h2>
              <Card className="p-5">
                <form action={updateTresorerieReglages.bind(null, ent.id)} className="grid gap-4 sm:grid-cols-3 sm:items-end">
                  <Field label="Solde initial (€)" name="solde_initial" type="number" step="0.01" defaultValue={ent.solde_initial} />
                  <Field label="Date du solde initial" name="solde_initial_date" type="date" defaultValue={ent.solde_initial_date} />
                  <Field label="Seuil d'alerte (€)" name="seuil_alerte" type="number" step="0.01" defaultValue={ent.seuil_alerte} />
                  <div className="sm:col-span-3"><SubmitButton>Enregistrer</SubmitButton></div>
                </form>
              </Card>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
              Tarif dégressif multi-jours
              <InfoTip>
                Règle <strong>générale</strong> appliquée à tous les devis : à partir d&apos;un certain nombre de jours,
                on applique un coefficient sur le prix journalier. Ex. : « à partir du jour 2, coefficient 0,5 » = −50 %.
              </InfoTip>
            </h2>
            <Card className="divide-y divide-border overflow-hidden">
              {paliers.length === 0 && (
                <p className="px-4 py-4 text-sm text-muted">Aucun palier défini. Par défaut, chaque jour est au plein tarif.</p>
              )}
              {paliers.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    À partir du jour <strong>{t.jour_min}</strong> : coefficient <strong>{t.coefficient}</strong>{" "}
                    <span className="text-muted">({Math.round((1 - t.coefficient) * 100)} % de remise)</span>
                  </span>
                  <form action={deleteTarifDegressifGlobal.bind(null, t.id)}>
                    <button className="rounded-md px-2 py-1 text-muted hover:text-red-600" title="Supprimer">✕</button>
                  </form>
                </div>
              ))}
            </Card>
            <Card className="mt-3 p-4">
              <form action={addTarifDegressifGlobal} className="grid gap-3 sm:grid-cols-3 sm:items-end">
                <Field label="À partir du jour n°" name="jour_min" type="number" defaultValue={2} />
                <Field label="Coefficient (ex. 0.5 = −50%)" name="coefficient" type="number" step="0.001" defaultValue={0.5} />
                <SubmitButton>+ Ajouter un palier</SubmitButton>
              </form>
            </Card>
          </section>

          <section className="md:relative md:left-1/2 md:w-[calc(100vw-17rem)] md:max-w-6xl md:-translate-x-1/2">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
              Catégories d&apos;entrées / sorties
              <InfoTip>
                Catégories et sous-catégories utilisées pour classer les entrées / sorties d&apos;argent (formulaire
                d&apos;écriture, synthèse, Qonto). Renommer une catégorie met aussi à jour les écritures existantes.
              </InfoTip>
            </h2>
            <FinanceCategories cats={financeCats} />
          </section>
        </div>
      )}

      {/* ── Catégories ── */}
      {tab === "categories" && (
        <section className="md:relative md:left-1/2 md:w-[calc(100vw-17rem)] md:max-w-6xl md:-translate-x-1/2">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
            Catégories de matériel
            <InfoTip>
              Organise les catégories de matériel en arborescence (catégorie principale → sous-catégories). L&apos;ordre
              (plus petit = affiché en premier) définit l&apos;affichage sur les devis et documents. « Divers » (lignes
              sans catégorie) reste toujours en dernier.
            </InfoTip>
          </h2>
          <MaterielCategories cats={categories} />
        </section>
      )}

      {/* ── Équipe ── */}
      {tab === "equipe" && (
        <section>
          <p className="mb-4 text-sm text-muted">
            Membres triés par rôle. Clique sur une personne pour voir ses infos et gérer son rôle / ses compétences.
            Le nom et le prénom se modifient par chacun dans <strong>Mon compte</strong>. Pour ajouter un membre :
            créer son compte dans Supabase (Authentication) — il apparaît ici automatiquement.
          </p>

          {([
            { role: "co_president" as RoleMembre, cls: "bg-primary/10 text-primary" },
            { role: "technique" as RoleMembre, cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
            { role: "membre" as RoleMembre, cls: "bg-surface text-muted" },
          ]).map(({ role, cls }) => {
            const group = membres.filter((m) => m.role === role);
            if (group.length === 0) return null;
            return (
              <div key={role} className="mb-5">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{ROLE_LABELS[role]}</span>
                  <span className="text-xs font-normal text-muted">{group.length}</span>
                </h3>
                <Card className="divide-y divide-border overflow-hidden">
                  {group.map((m) => (
                    <Modal
                      key={m.id}
                      title={nomMembre(m)}
                      triggerClassName="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-background"
                      trigger={
                        <>
                          <span className="flex min-w-0 items-center gap-3">
                            {m.photo_url && avatarUrls.get(m.id) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatarUrls.get(m.id)!} alt="" className="h-8 w-8 shrink-0 rounded-full border border-border object-cover" />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xs text-muted">{(m.prenom?.[0] ?? m.nom?.[0] ?? "?").toUpperCase()}</span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{nomMembre(m)}</span>
                              <span className="block truncate text-xs text-muted">{m.email ?? "—"}{m.fonction ? ` · ${m.fonction}` : ""}</span>
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs">
                            {!m.actif && <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-600 dark:bg-red-500/15 dark:text-red-300">Inactif</span>}
                            <span className="text-muted">›</span>
                          </span>
                        </>
                      }
                    >
                      {/* Infos (lecture seule) */}
                      <div className="mb-4 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                        <div><span className="text-muted">Prénom : </span>{m.prenom || "—"}</div>
                        <div><span className="text-muted">Nom : </span>{m.nom || "—"}</div>
                        <div><span className="text-muted">Email : </span>{m.email ?? "—"}</div>
                        <div><span className="text-muted">Téléphone : </span>{m.telephone ?? "—"}</div>
                        <div className="sm:col-span-2"><span className="text-muted">Fonction : </span>{m.fonction ?? "—"}</div>
                      </div>
                      {(m.competences ?? []).length > 0 && (
                        <div className="mb-4">
                          <span className="mb-1 block text-xs font-medium text-muted">Compétences</span>
                          <div className="flex flex-wrap gap-1.5">
                            {(m.competences ?? []).map((c) => (
                              <span key={c} className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Réglages admin (co-présidents) */}
                      <ModalForm action={updateMembre.bind(null, m.id)} className="space-y-3 border-t border-border pt-4">
                        <p className="text-xs text-muted">Réglages administrateur (le nom/prénom se modifie dans « Mon compte »).</p>
                        <div className="grid items-end gap-3 sm:grid-cols-[1fr,auto]">
                          <Select
                            label="Rôle"
                            name="role"
                            defaultValue={m.role}
                            options={[
                              { value: "membre", label: "Membre (accès de base)" },
                              { value: "technique", label: "Technique (terrain, matériel)" },
                              { value: "co_president", label: "Co-président (admin)" },
                            ]}
                          />
                          <label className="flex items-center gap-2 pb-2 text-sm">
                            <input type="checkbox" name="actif" defaultChecked={m.actif} className="h-4 w-4 rounded border-border" />
                            Actif
                          </label>
                        </div>
                        <div>
                          <span className="mb-1 block text-xs font-medium text-muted">Compétences (pour organiser les installations)</span>
                          <div className="flex flex-wrap gap-1.5">
                            {COMPETENCES.map((c) => {
                              const on = (m.competences ?? []).includes(c);
                              return (
                                <label key={c} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-background has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary">
                                  <input type="checkbox" name="competences" value={c} defaultChecked={on} className="h-3.5 w-3.5 rounded border-border" />
                                  {c}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <SubmitButton>Enregistrer</SubmitButton>
                      </ModalForm>
                    </Modal>
                  ))}
                </Card>
              </div>
            );
          })}
          <p className="mt-2 text-xs text-muted">
            {membres.length} membre{membres.length !== 1 ? "s" : ""} · {membres.filter((m) => m.role === "co_president").length} co-président(s)
          </p>
        </section>
      )}
    </div>
  );
}
