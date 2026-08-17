import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field, Select } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { Modal, ModalForm } from "@/components/modal";
import { AutoSelect } from "./auto-select";
import { EditableCell } from "./editable-cell";
import {
  createProjet, deleteProjet, setAvancement, saveSemaineInfo, setEvenement, archiverProjet,
} from "./actions";
import { semaineActuelle, plageSemaine, NB_SEMAINES } from "@/lib/semaines";
import { AVANCEMENT_LABELS, type AvancementProjet, type ProjetSuivi } from "@/lib/types";

const TYPES = ["Technique", "Presta", "Administratif", "DA / Comm", "Autre"];
const AV_OPTIONS = (Object.keys(AVANCEMENT_LABELS) as AvancementProjet[]).map((k) => ({ value: k, label: AVANCEMENT_LABELS[k] }));

const AV_CLS: Record<AvancementProjet, string> = {
  pas_demarre: "bg-gray-200 text-gray-700",
  bloque: "bg-red-100 text-red-700",
  en_cours: "bg-amber-100 text-amber-800",
  termine: "bg-green-100 text-green-700",
};
const AV_SELECT_CLS: Record<AvancementProjet, string> = {
  pas_demarre: "border-border bg-gray-100 text-gray-700",
  bloque: "border-red-300 bg-red-50 text-red-700",
  en_cours: "border-amber-300 bg-amber-50 text-amber-800",
  termine: "border-green-300 bg-green-50 text-green-700",
};

const TABS = [
  { id: "projets", label: "Projets" },
  { id: "dashboard", label: "Dashboard" },
] as const;

export default async function AvancementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sem?: string; resp?: string; vue?: string }>;
}) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "projets";
  const annee = new Date().getFullYear();
  const semDefaut = semaineActuelle(annee);
  const sem = Math.min(NB_SEMAINES, Math.max(1, Number(sp.sem) || semDefaut));
  const respFiltre = sp.resp ?? "";
  const vue = sp.vue ?? "general";

  const supabase = await createClient();

  return (
    <div className="max-w-7xl">
      <PageHeader title="Avancement" subtitle="Suivi des projets, communication et statistiques" />

      {/* Onglets */}
      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-border bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/avancement?tab=${t.id}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "border border-border bg-background shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "projets" && <ProjetsTab supabase={supabase} annee={annee} sem={sem} respFiltre={respFiltre} vue={vue} />}
      {tab === "dashboard" && <DashboardTab supabase={supabase} />}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ProjetsTab({ supabase, annee, sem, respFiltre, vue }: { supabase: any; annee: number; sem: number; respFiltre: string; vue: string }) {
  const [{ data: projetsData }, { data: notesData }, { data: infoData }, { data: tachesData }] = await Promise.all([
    supabase.from("projet_suivi").select("*").order("type").order("ordre").order("nom"),
    supabase.from("projet_note").select("projet_id, semaine, note").eq("annee", annee),
    supabase.from("semaine_info").select("*").eq("annee", annee).eq("semaine", sem).maybeSingle(),
    supabase.from("tache_perso").select("id, texte, membre:membre_id(prenom, nom, email)").eq("prive", false).eq("fait", false).order("created_at", { ascending: false }),
  ]);
  const tous = (projetsData ?? []) as ProjetSuivi[];
  type TacheEquipe = { id: string; texte: string; membre: { prenom: string | null; nom: string | null; email: string | null } | null };
  const tachesEquipe = ((tachesData ?? []) as unknown as TacheEquipe[]);
  const nomCourt = (m: TacheEquipe["membre"]) => (m?.prenom ?? "").trim() || (m?.nom ?? "").trim() || m?.email?.split("@")[0] || "—";
  const notes = (notesData ?? []) as { projet_id: string; semaine: number; note: string | null }[];
  const info = infoData as { note: string | null } | null;

  // Événements distincts (parmi les projets actifs)
  const evenements = [...new Set(tous.filter((p) => !p.archive && p.evenement).map((p) => p.evenement))] as string[];

  // Filtrage par vue : general (tous actifs) | archives | <nom d'événement>
  let projets: ProjetSuivi[];
  if (vue === "archives") projets = tous.filter((p) => p.archive);
  else if (vue === "general") projets = tous.filter((p) => !p.archive);
  else projets = tous.filter((p) => !p.archive && p.evenement === vue);

  // note[projetId][semaine]
  const noteMap = new Map<string, Map<number, string>>();
  for (const n of notes) {
    if (!noteMap.has(n.projet_id)) noteMap.set(n.projet_id, new Map());
    noteMap.get(n.projet_id)!.set(n.semaine, n.note ?? "");
  }
  const noteOf = (pid: string, w: number) => noteMap.get(pid)?.get(w) ?? "";

  const responsables = [...new Set(projets.map((p) => p.responsable).filter(Boolean))] as string[];
  if (respFiltre) projets = projets.filter((p) => p.responsable === respFiltre);

  const evOptions = [{ value: "", label: "— Aucun événement —" }, ...evenements.map((e) => ({ value: e, label: e }))];
  const vueUrl = (v: string) => `/avancement?tab=projets&sem=${sem}&vue=${encodeURIComponent(v)}`;
  const semUrl = (s: number, resp: string) => `/avancement?tab=projets&vue=${encodeURIComponent(vue)}&sem=${s}${resp ? `&resp=${encodeURIComponent(resp)}` : ""}`;

  const semAct = semaineActuelle(annee); // vraie semaine en cours (surlignage fixe)

  // Fenêtre d'historique : ~11 semaines avant la semaine affichée (défilable)
  const debut = Math.max(1, sem - 11);
  const histWeeks: number[] = [];
  for (let w = debut; w < sem; w++) histWeeks.push(w);

  // Groupage par type
  const groupes = new Map<string, ProjetSuivi[]>();
  for (const p of projets) {
    const k = p.type ?? "Autre";
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k)!.push(p);
  }

  const ajouterProjet = (
    <Modal trigger={<>+ Ajouter un projet</>} title="Nouveau projet / tâche">
      <ModalForm action={createProjet} className="space-y-4">
        <Field label="Projet / Tâche" name="nom" required placeholder="Tube LEDs, Flight case…" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsable" name="responsable" placeholder="Léo" />
          <Field label="Support" name="support" placeholder="Corentin" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" name="type" options={TYPES.map((t) => ({ value: t, label: t }))} />
          <Select label="Avancement" name="avancement" defaultValue="pas_demarre" options={AV_OPTIONS} />
        </div>
        <Field label="Événement (optionnel)" name="evenement" defaultValue={vue !== "general" && vue !== "archives" ? vue : ""} placeholder="FDM 2026, After 2026…" />
        <SubmitButton>Créer le projet</SubmitButton>
      </ModalForm>
    </Modal>
  );

  // Cellule projet (figée à gauche)
  const totalCols = histWeeks.length + 1;

  const sousOnglet = (v: string, label: string) => (
    <Link
      href={vueUrl(v)}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${vue === v ? "border border-border bg-background shadow-sm" : "text-muted hover:text-foreground"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      {/* Sous-onglets : Général / par événement / Archivés */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-xl border border-border bg-surface p-1">
          {sousOnglet("general", "Général")}
          {evenements.map((e) => sousOnglet(e, e))}
          {sousOnglet("archives", "🗄️ Archivés")}
        </div>
      </div>

      {/* Barre semaine */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
          <Link href={semUrl(Math.max(1, sem - 1), respFiltre)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-background" title="Semaine précédente">‹</Link>
          <span className="px-2 text-sm font-semibold">Semaine {sem} <span className="font-normal text-muted">({plageSemaine(annee, sem).label})</span></span>
          <Link href={semUrl(Math.min(NB_SEMAINES, sem + 1), respFiltre)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-background" title="Semaine suivante">›</Link>
        </div>
        <Link href={semUrl(semaineActuelle(annee), respFiltre)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">Semaine actuelle</Link>
        <div className="ml-auto">{ajouterProjet}</div>
      </div>

      {/* Filtre responsable */}
      {responsables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs text-muted">Responsable :</span>
          <Link href={semUrl(sem, "")} className={`rounded-full border px-2.5 py-0.5 text-xs ${!respFiltre ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-background"}`}>Tous</Link>
          {responsables.map((r) => (
            <Link key={r} href={semUrl(sem, r)} className={`rounded-full border px-2.5 py-0.5 text-xs ${respFiltre === r ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-background"}`}>{r}</Link>
          ))}
        </div>
      )}

      {/* Infos / Events de la semaine */}
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Infos / Events — semaine {sem}</h2>
        <form action={saveSemaineInfo.bind(null, annee, sem)} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <textarea name="note" defaultValue={info?.note ?? ""} rows={2} placeholder="Événements, absences, jalons de la semaine…" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <SubmitButton>Enregistrer</SubmitButton>
        </form>
      </Card>

      {/* Tâches de l'équipe (tâches non privées ajoutées depuis l'accueil) */}
      {tachesEquipe.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Tâches de l&apos;équipe</h2>
          <div className="flex flex-wrap gap-2">
            {tachesEquipe.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-sm">
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{nomCourt(t.membre)}</span>
                {t.texte}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Frise hebdomadaire */}
      {projets.length === 0 ? (
        <Card className="px-4 py-8 text-center text-sm text-muted">Aucun projet. Clique « + Ajouter un projet ».</Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-20 min-w-[220px] bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Projet</th>
                {histWeeks.map((w) => (
                  <th key={w} className={`min-w-[150px] px-3 py-2 text-[11px] font-semibold ${w === semAct ? "cur-week-head text-primary" : "bg-surface text-muted"}`}>
                    S{w} <span className="font-normal">· {plageSemaine(annee, w).label}</span>{w === semAct && " · en cours"}
                  </th>
                ))}
                <th className={`sticky right-0 z-20 min-w-[240px] border-l border-primary/30 px-3 py-2 text-[11px] font-bold ${sem === semAct ? "cur-week-head text-primary" : "bg-surface text-muted"}`}>
                  S{sem}{sem === semAct ? " · en cours" : ""} <span className="font-normal">· {plageSemaine(annee, sem).label}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...groupes.entries()].map(([type, items]) => (
                <Fragment key={type}>
                  <tr className="bg-background">
                    <td colSpan={totalCols + 1} className="sticky left-0 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-foreground/70">
                      {type} · {items.length}
                    </td>
                  </tr>
                  {items.map((p) => (
                      <tr key={p.id} className="border-t border-border/60 align-top">
                        {/* Projet — figé à gauche */}
                        <td className="sticky left-0 z-10 min-w-[220px] bg-surface px-3 py-2">
                          <div className="font-medium leading-snug">{p.nom}</div>
                          <div className="mb-1.5 text-[11px] text-muted">
                            {p.responsable ?? "—"}{p.support ? ` · ${p.support}` : ""}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <AutoSelect
                              action={setAvancement.bind(null, p.id)}
                              name="avancement"
                              value={p.avancement}
                              options={AV_OPTIONS}
                              className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${AV_SELECT_CLS[p.avancement] ?? ""}`}
                            />
                            <form action={archiverProjet.bind(null, p.id, !p.archive)}>
                              <button className="text-muted hover:text-foreground" title={p.archive ? "Désarchiver" : "Archiver"}>{p.archive ? "↩" : "🗄️"}</button>
                            </form>
                            <form action={deleteProjet.bind(null, p.id)}>
                              <ConfirmButton confirm={`Supprimer « ${p.nom} » et tout son historique ?`} className="text-muted hover:text-red-600" title="Supprimer">✕</ConfirmButton>
                            </form>
                          </div>
                          <div className="mt-1">
                            <AutoSelect
                              action={setEvenement.bind(null, p.id)}
                              name="evenement"
                              value={p.evenement ?? ""}
                              options={evOptions}
                              className="w-full rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted"
                            />
                          </div>
                        </td>
                        {/* Historique — toutes les cases éditables au clic */}
                        {histWeeks.map((w) => (
                          <td key={w} className={`min-w-[150px] px-1.5 py-1 ${w === semAct ? "cur-week-bg" : ""}`}>
                            <EditableCell projetId={p.id} annee={annee} semaine={w} note={noteOf(p.id, w)} current={w === semAct} />
                          </td>
                        ))}
                        {/* Colonne de droite (semaine affichée) — figée, fond OPAQUE */}
                        <td className={`sticky right-0 z-10 min-w-[240px] border-l border-primary/30 px-1.5 py-1 ${sem === semAct ? "cur-week-bg" : "bg-surface"}`}>
                          <EditableCell
                            projetId={p.id}
                            annee={annee}
                            semaine={sem}
                            note={noteOf(p.id, sem)}
                            current={sem === semAct}
                            reporte={!noteOf(p.id, sem) && !!noteOf(p.id, sem - 1)}
                            fallback={noteOf(p.id, sem - 1)}
                          />
                        </td>
                      </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function DashboardTab({ supabase }: { supabase: any }) {
  const { data } = await supabase.from("projet_suivi").select("*").eq("archive", false);
  const projets = (data ?? []) as ProjetSuivi[];

  const compte = <T extends string>(champ: (p: ProjetSuivi) => T | null) => {
    const m = new Map<string, number>();
    for (const p of projets) {
      const v = champ(p);
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const parRespo = compte((p) => p.responsable);
  const parType = compte((p) => p.type);
  const parAvancement = (Object.keys(AVANCEMENT_LABELS) as AvancementProjet[]).map((k) => ({
    label: AVANCEMENT_LABELS[k], key: k, n: projets.filter((p) => p.avancement === k).length,
  }));

  const Bloc = ({ titre, lignes }: { titre: string; lignes: { label: string; n: number; cls?: string }[] }) => {
    const max = Math.max(1, ...lignes.map((l) => l.n));
    return (
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">{titre}</h3>
        {lignes.length === 0 ? (
          <p className="text-sm text-muted">Aucune donnée.</p>
        ) : (
          <div className="space-y-2">
            {lignes.map((l) => (
              <div key={l.label} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate">{l.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-background">
                  <div className={`h-full rounded-full ${l.cls ?? "bg-primary"}`} style={{ width: `${Math.round((l.n / max) * 100)}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right font-semibold">{l.n}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4"><div className="text-2xl font-bold">{projets.length}</div><div className="text-xs text-muted">Projets actifs</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-green-600">{projets.filter((p) => p.avancement === "termine").length}</div><div className="text-xs text-muted">Terminés</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-amber-600">{projets.filter((p) => p.avancement === "en_cours").length}</div><div className="text-xs text-muted">En cours</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-red-600">{projets.filter((p) => p.avancement === "bloque").length}</div><div className="text-xs text-muted">Bloqués</div></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Bloc titre="Par responsable" lignes={parRespo.map(([label, n]) => ({ label, n }))} />
        <Bloc titre="Par type" lignes={parType.map(([label, n]) => ({ label, n }))} />
        <Bloc titre="Par avancement" lignes={parAvancement.map((a) => ({
          label: a.label, n: a.n,
          cls: a.key === "termine" ? "bg-green-500" : a.key === "en_cours" ? "bg-amber-500" : a.key === "bloque" ? "bg-red-500" : "bg-gray-400",
        }))} />
      </div>
    </div>
  );
}
