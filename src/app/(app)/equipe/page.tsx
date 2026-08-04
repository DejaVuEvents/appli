import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { dateFr } from "@/lib/format";
import { nomMembre } from "@/lib/membre";

type MembreRow = { id: string; prenom: string | null; nom: string | null; email: string | null; competences: string[] | null };
type AffectationRow = {
  role: string | null;
  membre_id: string;
  prestation: { id: string; nom: string; date_event_debut: string | null; date_event_fin: string | null; date_prepa: string | null; statut: string | null } | null;
};

export default async function EquipePage() {
  const supabase = await createClient();
  const [{ data: membresData }, { data: affData }] = await Promise.all([
    supabase.from("membre").select("id, prenom, nom, email, competences").eq("actif", true).order("prenom"),
    supabase
      .from("prestation_membre")
      .select("role, membre_id, prestation:prestation_id(id, nom, date_event_debut, date_event_fin, date_prepa, statut)"),
  ]);
  const membres = (membresData ?? []) as MembreRow[];
  const affectations = (affData ?? []) as unknown as AffectationRow[];

  const today = new Date().toISOString().slice(0, 10);
  const refDate = (p: NonNullable<AffectationRow["prestation"]>) => p.date_event_debut ?? p.date_prepa ?? "";

  // Regroupe les affectations par membre
  const parMembre = new Map<string, AffectationRow[]>();
  for (const a of affectations) {
    if (!a.prestation) continue;
    if (!parMembre.has(a.membre_id)) parMembre.set(a.membre_id, []);
    parMembre.get(a.membre_id)!.push(a);
  }

  return (
    <div className="max-w-6xl">
      <PageHeader title="Équipe" subtitle="Compétences et affectations de chaque personne" />

      <div className="space-y-4">
        {membres.length === 0 && <Card className="px-4 py-6 text-sm text-muted">Aucun membre actif.</Card>}
        {membres.map((m) => {
          const affs = (parMembre.get(m.id) ?? [])
            .filter((a) => a.prestation)
            .sort((a, b) => refDate(b.prestation!).localeCompare(refDate(a.prestation!)));
          const aVenir = affs.filter((a) => (a.prestation!.date_event_fin ?? refDate(a.prestation!)) >= today);
          const passees = affs.filter((a) => !aVenir.includes(a));
          return (
            <Card key={m.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{nomMembre(m)}</span>
                <span className="text-xs text-muted">{affs.length} événement{affs.length > 1 ? "s" : ""}</span>
              </div>
              {(m.competences ?? []).length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(m.competences ?? []).map((c) => (
                    <span key={c} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{c}</span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted">Aucune compétence renseignée (Paramètres → Équipe).</p>
              )}

              {aVenir.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">À venir</p>
                  <div className="space-y-1">
                    {aVenir.map((a) => (
                      <Link key={a.prestation!.id} href={`/prestations/${a.prestation!.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">
                        <span className="min-w-0 truncate">{a.prestation!.nom}{a.role ? <span className="text-muted"> · {a.role}</span> : ""}</span>
                        <span className="shrink-0 text-xs text-muted">{dateFr(refDate(a.prestation!))}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {passees.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted hover:text-foreground">{passees.length} événement(s) passé(s)</summary>
                  <div className="mt-1 space-y-1">
                    {passees.map((a) => (
                      <Link key={a.prestation!.id} href={`/prestations/${a.prestation!.id}`} className="flex items-center justify-between gap-3 px-3 py-1 text-sm text-muted hover:text-foreground">
                        <span className="min-w-0 truncate">{a.prestation!.nom}{a.role ? ` · ${a.role}` : ""}</span>
                        <span className="shrink-0 text-xs">{dateFr(refDate(a.prestation!))}</span>
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
