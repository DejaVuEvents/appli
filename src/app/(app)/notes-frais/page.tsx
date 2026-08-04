import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Field } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Modal, ModalForm } from "@/components/modal";
import { euros, dateFr } from "@/lib/format";
import { getMembreActuel, nomMembre } from "@/lib/membre";
import { createNoteFrais } from "./actions";
import { NotesFraisListe, type NoteLite } from "./notes-liste";
import { STATUT_NDF_LABELS, TYPE_NDF_LABELS, type NoteFrais } from "@/lib/types";

const STATUT_CLS: Record<string, string> = {
  brouillon: "bg-surface text-muted",
  soumise: "bg-amber-100 text-amber-800",
  validee: "bg-green-100 text-green-700",
  refusee: "bg-red-100 text-red-700",
};

type NdfRow = NoteFrais & { lignes: { montant_ttc: number }[] };

export default async function NotesFraisPage() {
  const supabase = await createClient();
  const membre = await getMembreActuel(supabase);
  const [{ data }, { data: membresData }] = await Promise.all([
    supabase.from("note_frais").select("*, lignes:ligne_note_frais(montant_ttc)").order("created_at", { ascending: false }),
    supabase.from("membre").select("id, nom, prenom, email").order("prenom"),
  ]);
  const notes = (data ?? []) as NdfRow[];
  const mMap = new Map((membresData ?? []).map((m) => [m.id, nomMembre(m)]));
  const total = (n: NdfRow) => (n.lignes ?? []).reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);
  const isCoPres = membre?.role === "co_president";

  // Détection « payée » : l'écriture liée (remboursement) est passée en réel.
  const ecrIds = notes.map((n) => (n as { ecriture_id?: string | null }).ecriture_id).filter(Boolean) as string[];
  const { data: ecrPayees } = ecrIds.length
    ? await supabase.from("ecriture_financiere").select("id").in("id", ecrIds).eq("statut", "reel")
    : { data: [] };
  const payeSet = new Set((ecrPayees ?? []).map((e) => e.id as string));
  const estPayee = (n: NdfRow) => {
    const eid = (n as { ecriture_id?: string | null }).ecriture_id;
    return !!eid && payeSet.has(eid);
  };

  const aValider = isCoPres ? notes.filter((n) => n.statut === "soumise" && n.demandeur_id !== membre?.id) : [];
  const aValiderIds = new Set(aValider.map((n) => n.id));

  // Toutes les notes (hors file de validation) → liste filtrable groupée par mois
  const notesListe: NoteLite[] = notes
    .filter((n) => !aValiderIds.has(n.id))
    .map((n) => ({
      id: n.id,
      titre: n.titre,
      type_ndf: n.type_ndf,
      statut: n.statut,
      demandeur_id: n.demandeur_id,
      demandeur_nom: mMap.get(n.demandeur_id ?? "") ?? "—",
      created_at: n.created_at,
      total: total(n),
      paye: estPayee(n),
    }));
  const membresListe = (membresData ?? []).map((m) => ({ id: m.id, nom: nomMembre(m) }));

  const nouvelleNote = (
    <Modal trigger={<>+ Nouvelle note de frais</>} title="Nouvelle note de frais">
      <ModalForm action={createNoteFrais} className="space-y-3">
        <div>
          <span className="mb-1.5 block text-sm font-medium">Type de note</span>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="type_ndf" value="depense" defaultChecked className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">🧾 Dépenses (justificatifs)</span>
                <span className="block text-xs text-muted">Achats matériel, repas… avec photo/PDF du justificatif.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="type_ndf" value="km" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">🚗 Frais kilométriques</span>
                <span className="block text-xs text-muted">Déplacements en véhicule perso (distance calculée automatiquement).</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3 hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="type_ndf" value="predepense" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">📋 Pré-dépense</span>
                <span className="block text-xs text-muted">Dépense &gt; 500 € : demande d&apos;autorisation <strong>avant</strong> l&apos;achat.</span>
              </span>
            </label>
          </div>
        </div>
        <Field label="Intitulé" name="titre" placeholder="Frais festival X, déplacement Toulouse…" />
        <p className="text-xs text-muted">Tu seras enregistré comme demandeur. Selon le type, tu ajouteras des justificatifs ou des trajets, puis tu soumets pour validation.</p>
        <SubmitButton>+ Créer la note</SubmitButton>
      </ModalForm>
    </Modal>
  );

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Notes de frais"
        subtitle={membre ? `Connecté : ${nomMembre(membre)}${isCoPres ? " (co-président)" : ""}` : undefined}
        action={nouvelleNote}
      />

      {/* À valider (co-présidents) */}
      {isCoPres && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-700">
            À valider {aValider.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs">{aValider.length}</span>}
          </h2>
          {aValider.length === 0 ? (
            <Card className="px-4 py-3 text-sm text-muted">Aucune note de frais en attente de ta validation.</Card>
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {aValider.map((n) => (
                <Link key={n.id} href={`/notes-frais/${n.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{n.titre || "Note de frais"}</div>
                    <div className="text-xs text-muted">{TYPE_NDF_LABELS[n.type_ndf]} · {mMap.get(n.demandeur_id ?? "") ?? "—"} · {dateFr(n.created_at)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold">{euros(total(n))}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUT_CLS[n.statut]}`}>{STATUT_NDF_LABELS[n.statut]}</span>
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </section>
      )}

      {/* Toutes les notes — triées par mois + filtres */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Notes de frais</h2>
        <NotesFraisListe notes={notesListe} membres={membresListe} />
      </section>
    </div>
  );
}
