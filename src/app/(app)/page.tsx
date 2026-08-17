import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { getMembreActuel } from "@/lib/membre";
import { syntheseMensuelle } from "@/lib/finance";
import { euros, dateFr } from "@/lib/format";
import { MesTaches, type TachePerso } from "./mes-taches";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type PlanItem = { date: string; label: string; sub: string; href: string; dot: string };

export default async function Dashboard() {
  const supabase = await createClient();
  const membre = await getMembreActuel(supabase);
  const annee = new Date().getFullYear();
  const today = ymd(new Date());
  const in7 = ymd(new Date(Date.now() + 7 * 864e5));

  const [{ data: entData }, { data: ecrData }, { data: prestData }, { data: reunionsData }, { data: ndfData }, { data: tachesData }] =
    await Promise.all([
      supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle(),
      supabase.from("ecriture_financiere").select("*"),
      supabase.from("prestation").select("id, nom, date_prepa, date_event_debut, date_event_fin, date_retour, client(nom)").eq("est_evenement", true).neq("statut", "annule"),
      supabase.from("reunion").select("id, titre, date, heure_debut, participants:reunion_participant(membre_id)").gte("date", today).order("date"),
      supabase.from("note_frais").select("id, titre, statut, demandeur_id, type_ndf").in("statut", ["soumise", "refusee"]),
      membre ? supabase.from("tache_perso").select("id, texte, fait, source_type").eq("membre_id", membre.id).order("fait").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
  const taches = (tachesData ?? []) as TachePerso[];

  const ent = entData as ParametresEntreprise | null;
  const ecritures = (ecrData ?? []) as EcritureFinanciere[];
  const seuil = Number(ent?.seuil_alerte ?? 0);
  const { soldeActuelReel, soldeProjete } = syntheseMensuelle(
    ecritures, Number(ent?.solde_initial ?? 0), annee, seuil, ent?.solde_initial_date ?? null,
  );

  // Prochaine entrée / sortie prévisionnelle à venir
  const prochainesEcheances = ecritures
    .filter((e) => e.statut === "previsionnel" && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  // Planning des 7 prochains jours
  const prestations = (prestData ?? []) as unknown as {
    id: string; nom: string; date_prepa: string | null; date_event_debut: string | null;
    date_event_fin: string | null; date_retour: string | null; client: { nom: string } | null;
  }[];
  const plan: PlanItem[] = [];
  const inRange = (d: string | null) => d && d >= today && d <= in7;
  for (const p of prestations) {
    const sub = p.client?.nom ?? "";
    if (inRange(p.date_prepa)) plan.push({ date: p.date_prepa!, label: `Prépa · ${p.nom}`, sub, href: `/prestations/${p.id}/preparation`, dot: "bg-blue-400" });
    if (inRange(p.date_event_debut)) plan.push({ date: p.date_event_debut!, label: p.nom, sub, href: `/prestations/${p.id}`, dot: "bg-primary" });
    if (inRange(p.date_retour)) plan.push({ date: p.date_retour!, label: `Retour · ${p.nom}`, sub, href: `/prestations/${p.id}/preparation`, dot: "bg-gray-400" });
  }
  const reunions = (reunionsData ?? []) as unknown as { id: string; titre: string; date: string; heure_debut: string | null; participants: { membre_id: string }[] }[];
  for (const r of reunions) {
    if (r.date <= in7) plan.push({ date: r.date, label: `Réunion · ${r.titre}`, sub: r.heure_debut ?? "", href: "/calendrier", dot: "bg-indigo-500" });
  }
  plan.sort((a, b) => a.date.localeCompare(b.date));

  // Notifications
  const ndf = (ndfData ?? []) as { id: string; titre: string | null; statut: string; demandeur_id: string | null; type_ndf: string }[];
  const isCoPres = membre?.role === "co_president";
  const notifs: { icon: string; text: string; href: string; cls: string }[] = [];
  const ndfAValider = isCoPres ? ndf.filter((n) => n.statut === "soumise" && n.demandeur_id !== membre?.id) : [];
  if (ndfAValider.length > 0) {
    notifs.push({ icon: "🧾", text: `${ndfAValider.length} note${ndfAValider.length > 1 ? "s" : ""} de frais en attente de ta validation`, href: "/notes-frais", cls: "border-amber-200 bg-amber-50 text-amber-900" });
  }
  const mesRefusees = ndf.filter((n) => n.statut === "refusee" && n.demandeur_id === membre?.id);
  for (const n of mesRefusees) {
    notifs.push({ icon: "❌", text: `Ta note de frais « ${n.titre || "Note"} » a été refusée`, href: `/notes-frais/${n.id}`, cls: "border-red-200 bg-red-50 text-red-800" });
  }
  const mesReunions = reunions.filter((r) => r.participants.some((p) => p.membre_id === membre?.id));
  for (const r of mesReunions.slice(0, 3)) {
    notifs.push({ icon: "📅", text: `Réunion « ${r.titre} » le ${dateFr(r.date)}${r.heure_debut ? ` à ${r.heure_debut}` : ""}`, href: "/calendrier", cls: "border-indigo-200 bg-indigo-50 text-indigo-900" });
  }

  const prenom = membre?.prenom?.trim() || membre?.nom?.trim() || "";

  return (
    <div className="max-w-7xl space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Bonjour{prenom ? ` ${prenom}` : ""} 👋</h1>
        <p className="mt-0.5 text-sm text-muted">Voici l&apos;essentiel du moment.</p>
      </div>

      {/* Notifications */}
      {notifs.length > 0 && (
        <section className="space-y-2">
          {notifs.map((n, i) => (
            <Link key={i} href={n.href} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm hover:opacity-90 ${n.cls}`}>
              <span>{n.icon} {n.text}</span>
              <span className="font-semibold">→</span>
            </Link>
          ))}
        </section>
      )}

      {/* Brief comptable */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Brief comptable</h2>
          <Link href="/finance" className="text-sm text-primary hover:underline">Trésorerie →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className={`text-xl font-bold ${soldeActuelReel < 0 ? "text-red-600" : ""}`}>{euros(soldeActuelReel)}</div>
            <div className="mt-0.5 text-xs text-muted">Solde actuel (réel)</div>
          </Card>
          <Card className="p-4">
            <div className={`text-xl font-bold ${soldeProjete < 0 ? "text-red-600" : "text-green-600"}`}>{euros(soldeProjete)}</div>
            <div className="mt-0.5 text-xs text-muted">Solde projeté (fin {annee})</div>
          </Card>
        </div>

        {/* Prochaines échéances */}
        {prochainesEcheances.length > 0 && (
          <>
          <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted">Prochaines échéances</h3>
          <Card className="divide-y divide-border overflow-hidden">
            {prochainesEcheances.map((e) => (
              <Link key={e.id} href={`/finance/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-background">
                <span className="min-w-0 truncate">
                  <span className="text-muted">{dateFr(e.date)}</span> · {e.denomination ?? "—"}
                </span>
                <span className={`shrink-0 font-medium ${e.sens === "entree" ? "text-green-600" : "text-red-600"}`}>
                  {e.sens === "entree" ? "+" : "−"} {euros(e.montant_ttc)}
                </span>
              </Link>
            ))}
          </Card>
          </>
        )}
      </section>

      {/* Mes tâches personnelles */}
      <MesTaches taches={taches} />

      {/* Planning de la semaine */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Cette semaine (7 jours)</h2>
          <Link href="/calendrier" className="text-sm text-primary hover:underline">Calendrier →</Link>
        </div>
        {plan.length === 0 ? (
          <Card className="px-4 py-6 text-sm text-muted">Rien de prévu dans les 7 prochains jours.</Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {plan.map((it, i) => (
              <Link key={i} href={it.href} className="flex items-center gap-3 px-4 py-3 hover:bg-background">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${it.dot}`} />
                <span className="w-20 shrink-0 text-xs text-muted">{dateFr(it.date)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.label}</span>
                {it.sub && <span className="shrink-0 text-xs text-muted">{it.sub}</span>}
              </Link>
            ))}
          </Card>
        )}
      </section>

    </div>
  );
}
