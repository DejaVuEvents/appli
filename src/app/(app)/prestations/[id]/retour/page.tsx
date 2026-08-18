import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { EventTabBar } from "@/components/event-tab-bar";
import { saveControleRetour } from "./actions";
import { urlDocument } from "@/lib/storage";

type ResaRow = {
  unite_id: string;
  unite: { numero_serie: string | null; qr_code: string | null; reference: { nom: string } | null } | null;
};
type ControleRow = { unite_id: string | null; etat: string; remarque: string | null; photo_url: string | null; controle: boolean };

const ETAT_OPTIONS = [
  { value: "ok", label: "OK" },
  { value: "a_verifier", label: "À vérifier" },
  { value: "casse", label: "Cassé / à réparer" },
  { value: "manquant", label: "Manquant" },
  { value: "hs", label: "Hors service" },
];
const ETAT_CLS: Record<string, string> = {
  ok: "text-green-600", a_verifier: "text-amber-600", casse: "text-red-600", manquant: "text-red-600", hs: "text-red-600",
};

export default async function RetourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: prest }, { data: resaData }, { data: ctrlData }] = await Promise.all([
    supabase.from("prestation").select("nom").eq("id", id).single(),
    supabase
      .from("reservation_unite")
      .select("unite_id, unite:unite(numero_serie, qr_code, reference:materiel_reference(nom))")
      .eq("prestation_id", id),
    supabase.from("controle_retour").select("unite_id, etat, remarque, photo_url, controle").eq("prestation_id", id),
  ]);
  if (!prest) notFound();
  const reservations = (resaData ?? []) as unknown as ResaRow[];
  const controles = (ctrlData ?? []) as ControleRow[];
  const ctrlMap = new Map(controles.filter((c) => c.unite_id).map((c) => [c.unite_id as string, c]));

  // Photos de constat : URL signée (bucket privé) ou publique (legacy), par unité.
  const photoUrl = new Map<string, string | null>();
  await Promise.all(
    controles.filter((c) => c.unite_id && c.photo_url).map(async (c) => {
      photoUrl.set(c.unite_id as string, await urlDocument(supabase, c.photo_url));
    }),
  );

  // Regroupement par référence
  const groupes = new Map<string, ResaRow[]>();
  for (const r of reservations) {
    const nom = r.unite?.reference?.nom ?? "Matériel";
    if (!groupes.has(nom)) groupes.set(nom, []);
    groupes.get(nom)!.push(r);
  }

  const total = reservations.length;
  const controles_ok = reservations.filter((r) => ctrlMap.get(r.unite_id)?.controle).length;
  const problemes = controles.filter((c) => c.controle && c.etat !== "ok");
  const pct = total > 0 ? Math.round((controles_ok / total) * 100) : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/prestations/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Événement</Link>
      <PageHeader title="Contrôle de retour / état des lieux" subtitle={(prest as { nom: string }).nom} />
      <EventTabBar eventId={id} active="preparation" />

      {/* Progression */}
      <Card className="p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{controles_ok} / {total} contrôlés</span>
          <span className="text-muted">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {problemes.length > 0 && (
          <p className="mt-2 text-sm text-red-600">⚠ {problemes.length} unité(s) avec un problème constaté (cassé / manquant / HS).</p>
        )}
      </Card>

      {total === 0 && (
        <Card className="px-4 py-4 text-sm text-muted">
          Aucune unité réservée pour cet événement. Le contrôle de retour porte sur le matériel sérialisé réservé.
        </Card>
      )}

      {[...groupes.entries()].map(([nom, unites]) => (
        <section key={nom}>
          <h2 className="mb-2 text-sm font-semibold">{nom}</h2>
          <div className="space-y-2">
            {unites.map((r) => {
              const c = ctrlMap.get(r.unite_id);
              return (
                <Card key={r.unite_id} className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Link href={`/u/${r.unite?.qr_code || r.unite_id}`} className="font-medium hover:underline">
                      {r.unite?.numero_serie || "Unité"}
                    </Link>
                    {c?.controle ? (
                      <span className={`text-xs font-semibold ${ETAT_CLS[c.etat] ?? ""}`}>
                        {ETAT_OPTIONS.find((o) => o.value === c.etat)?.label ?? c.etat}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">à contrôler</span>
                    )}
                  </div>
                  <form action={saveControleRetour.bind(null, id, r.unite_id)} className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select name="etat" defaultValue={c?.etat ?? "ok"} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                        {ETAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input name="remarque" defaultValue={c?.remarque ?? ""} placeholder="Remarque (constat de casse…)" className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input name="photo" type="file" accept="image/*" capture="environment" className="block w-full text-xs text-muted file:mr-2 file:rounded-lg file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-xs hover:file:bg-background" />
                      <SubmitButton pendingLabel="…">Enregistrer</SubmitButton>
                    </div>
                    {c?.photo_url && photoUrl.get(r.unite_id) && (
                      <a href={photoUrl.get(r.unite_id)!} target="_blank" rel="noopener noreferrer" className="inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl.get(r.unite_id)!} alt="Constat" className="h-16 w-16 rounded border border-border object-cover" />
                      </a>
                    )}
                  </form>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
