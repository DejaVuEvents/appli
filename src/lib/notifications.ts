import type { SupabaseClient } from "@supabase/supabase-js";
import { dateFr } from "@/lib/format";
import { maintenanceStatut } from "@/lib/types";
import type { Membre } from "@/lib/membre";

export type Notif = {
  id: string;
  icon: string;
  text: string;
  href: string;
  cls: string;
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Notifications de l'utilisateur courant (NDF à valider, refus, réunions à venir). */
export async function chargerNotifications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  membre: Membre | null,
): Promise<Notif[]> {
  if (!membre) return [];
  const today = ymd(new Date());

  const in7 = ymd(new Date(Date.now() + 7 * 864e5));
  const [{ data: ndfData }, { data: reunionsData }, { data: ffData }, { data: unitesData }] = await Promise.all([
    supabase.from("note_frais").select("id, titre, statut, demandeur_id").in("statut", ["soumise", "refusee"]),
    supabase.from("reunion").select("id, titre, date, heure_debut, participants:reunion_participant(membre_id)").gte("date", today).order("date"),
    supabase.from("facture_fournisseur").select("id, fournisseur, montant_ttc, date_echeance, statut_paiement").neq("statut_paiement", "paye"),
    supabase.from("unite").select("id, date_derniere_maintenance, maintenance_intervalle_jours, maintenance_intervalle_heures, compteur_heures").or("maintenance_intervalle_jours.not.is.null,maintenance_intervalle_heures.not.is.null"),
  ]);

  const ndf = (ndfData ?? []) as { id: string; titre: string | null; statut: string; demandeur_id: string | null }[];
  const reunions = (reunionsData ?? []) as unknown as { id: string; titre: string; date: string; heure_debut: string | null; participants: { membre_id: string }[] }[];
  const fournisseurs = (ffData ?? []) as { id: string; fournisseur: string; montant_ttc: number; date_echeance: string | null; statut_paiement: string }[];

  const notifs: Notif[] = [];
  const isCoPres = membre.role === "co_president";

  // Factures fournisseurs en retard / à échéance proche
  const ffRetard = fournisseurs.filter((f) => f.date_echeance && f.date_echeance < today);
  const ffProche = fournisseurs.filter((f) => f.date_echeance && f.date_echeance >= today && f.date_echeance <= in7);
  if (ffRetard.length > 0) {
    notifs.push({
      id: `ff-retard-${ffRetard.map((f) => f.id).sort().join("_")}`,
      icon: "⚠️",
      text: `${ffRetard.length} facture${ffRetard.length > 1 ? "s" : ""} fournisseur en retard de paiement`,
      href: "/finance/fournisseurs",
      cls: "border-red-200 bg-red-50 text-red-800",
    });
  }
  if (ffProche.length > 0) {
    notifs.push({
      id: `ff-proche-${ffProche.map((f) => f.id).sort().join("_")}`,
      icon: "🧾",
      text: `${ffProche.length} facture${ffProche.length > 1 ? "s" : ""} fournisseur à payer sous 7 jours`,
      href: "/finance/fournisseurs",
      cls: "border-amber-200 bg-amber-50 text-amber-900",
    });
  }

  // Maintenance préventive due / en retard
  const unites = (unitesData ?? []) as { id: string; date_derniere_maintenance: string | null; maintenance_intervalle_jours: number | null; maintenance_intervalle_heures: number | null; compteur_heures: number }[];
  const aReviser = unites.filter((u) => { const m = maintenanceStatut(u); return m.enRetard || m.dueHeures; });
  if (aReviser.length > 0) {
    notifs.push({
      id: `maint-${aReviser.map((u) => u.id).sort().join("_")}`,
      icon: "🔧",
      text: `${aReviser.length} unité${aReviser.length > 1 ? "s" : ""} à réviser (maintenance préventive)`,
      href: "/inventaire",
      cls: "border-orange-200 bg-orange-50 text-orange-900",
    });
  }

  if (isCoPres) {
    const aValider = ndf.filter((n) => n.statut === "soumise" && n.demandeur_id !== membre.id);
    if (aValider.length > 0) {
      notifs.push({
        id: `ndf-valider-${aValider.map((n) => n.id).sort().join("_")}`,
        icon: "🧾",
        text: `${aValider.length} note${aValider.length > 1 ? "s" : ""} de frais à valider`,
        href: "/notes-frais",
        cls: "border-amber-200 bg-amber-50 text-amber-900",
      });
    }
  }

  for (const n of ndf.filter((n) => n.statut === "refusee" && n.demandeur_id === membre.id)) {
    notifs.push({
      id: `ndf-refus-${n.id}`,
      icon: "❌",
      text: `Note de frais « ${n.titre || "Note"} » refusée`,
      href: `/notes-frais/${n.id}`,
      cls: "border-red-200 bg-red-50 text-red-800",
    });
  }

  for (const r of reunions.filter((r) => r.participants.some((p) => p.membre_id === membre.id)).slice(0, 5)) {
    notifs.push({
      id: `reunion-${r.id}`,
      icon: "📅",
      text: `Réunion « ${r.titre} » le ${dateFr(r.date)}${r.heure_debut ? ` à ${r.heure_debut}` : ""}`,
      href: "/calendrier",
      cls: "border-indigo-200 bg-indigo-50 text-indigo-900",
    });
  }

  return notifs;
}
