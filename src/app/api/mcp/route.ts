import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { membreDuJeton, peutVoirFinance, peutVoirMateriel, type AppelantMcp } from "@/lib/mcp-auth";
import { syntheseMensuelle } from "@/lib/finance";
import { periodeReservation } from "@/lib/devis";
import { dateFr, euros } from "@/lib/format";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Réponse texte : c'est lu à voix haute, donc des phrases, pas du JSON. */
const texte = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

/**
 * Serveur MCP de l'outil Déjà Vu.
 *
 * Ouvert à Claude pour consulter l'activité à la voix. Il n'expose que des
 * lectures ciblées, jamais de SQL libre : la clé de service contourne les règles
 * de la base, c'est donc cette route qui porte le contrôle d'accès, en
 * rejouant les mêmes rôles que l'application.
 */
const handler = createMcpHandler((server) => {
  const sb = () => {
    const c = createServiceClient();
    if (!c) throw new Error("Base non configurée côté serveur.");
    return c;
  };
  // `withMcpAuth` a déjà validé le jeton ; on le relit pour connaître l'appelant.
  const appelantDe = async (ctx: { http?: { authInfo?: AuthInfo } }): Promise<AppelantMcp> => {
    const m = await membreDuJeton(sb(), ctx.http?.authInfo?.token);
    if (!m) throw new Error("Jeton inconnu.");
    return m;
  };

  server.registerTool(
    "prochains_evenements",
    {
      description:
        "Les prochains événements de l'association : nom, dates, lieu, client et équipe affectée. "
        + "Répond à « qu'est-ce qu'on a ce week-end », « c'est quoi la prochaine presta ».",
      inputSchema: z.object({
        jours: z.number().int().min(1).max(365).default(30)
          .describe("Fenêtre à regarder, en jours à partir d'aujourd'hui."),
      }),
    },
    async ({ jours }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirMateriel(moi)) return texte("Tu n'as pas accès aux événements.");

      const debut = new Date().toISOString().slice(0, 10);
      const fin = new Date(Date.now() + jours * 86400000).toISOString().slice(0, 10);
      const { data } = await sb()
        .from("prestation")
        .select("id, nom, lieu, date_prepa, date_event_debut, date_event_fin, statut, client(nom)")
        .eq("est_evenement", true)
        .neq("statut", "annule")
        .gte("date_event_debut", debut)
        .lte("date_event_debut", fin)
        .order("date_event_debut");
      const evts = (data ?? []) as unknown as {
        id: string; nom: string; lieu: string | null;
        date_prepa: string | null; date_event_debut: string | null; date_event_fin: string | null;
        statut: string; client: { nom: string } | null;
      }[];
      if (evts.length === 0) {
        // Un état dit toujours la suite : on va chercher le prochain, même hors fenêtre.
        const { data: suivant } = await sb()
          .from("prestation")
          .select("nom, lieu, date_event_debut")
          .eq("est_evenement", true)
          .neq("statut", "annule")
          .gt("date_event_debut", fin)
          .order("date_event_debut")
          .limit(1)
          .maybeSingle();
        const s = suivant as { nom: string; lieu: string | null; date_event_debut: string | null } | null;
        if (!s?.date_event_debut) return texte(`Rien de prévu dans les ${jours} prochains jours, et rien après non plus.`);
        return texte(
          `Rien dans les ${jours} prochains jours. Le prochain est ${s.nom}, le ${dateFr(s.date_event_debut)}`
          + `${s.lieu ? ` à ${s.lieu}` : ""}.`,
        );
      }

      const { data: equipeData } = await sb()
        .from("prestation_membre")
        .select("prestation_id, membre(prenom, nom)")
        .in("prestation_id", evts.map((e) => e.id));
      const equipe = new Map<string, string[]>();
      for (const a of (equipeData ?? []) as unknown as {
        prestation_id: string; membre: { prenom: string | null; nom: string | null } | null;
      }[]) {
        const nom = [a.membre?.prenom, a.membre?.nom].filter(Boolean).join(" ");
        if (!nom) continue;
        equipe.set(a.prestation_id, [...(equipe.get(a.prestation_id) ?? []), nom]);
      }

      return texte(
        evts
          .map((e) => {
            const dates = e.date_event_fin && e.date_event_fin !== e.date_event_debut
              ? `du ${dateFr(e.date_event_debut)} au ${dateFr(e.date_event_fin)}`
              : dateFr(e.date_event_debut);
            const gens = equipe.get(e.id) ?? [];
            return [
              `${e.nom} — ${dates}`,
              e.lieu ? `lieu : ${e.lieu}` : null,
              e.client?.nom ? `client : ${e.client.nom}` : null,
              gens.length ? `équipe : ${gens.join(", ")}` : "personne d'affecté",
              e.date_prepa ? `préparation le ${dateFr(e.date_prepa)}` : null,
            ].filter(Boolean).join(" · ");
          })
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "disponibilite_materiel",
    {
      description:
        "Combien d'exemplaires d'un matériel sont libres sur une période. "
        + "Répond à « est-ce que les lasers sont libres le 3 octobre ».",
      inputSchema: z.object({
        materiel: z.string().min(2).describe("Nom ou début du nom, par exemple « laser », « wash »."),
        debut: z.string().describe("Date de début, format AAAA-MM-JJ."),
        fin: z.string().optional().describe("Date de fin, format AAAA-MM-JJ. Par défaut, la date de début."),
      }),
    },
    async ({ materiel, debut, fin }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirMateriel(moi)) return texte("Tu n'as pas accès à l'inventaire.");
      const dFin = fin || debut;

      const { data: refs } = await sb()
        .from("materiel_reference")
        .select("id, nom, prefixe_unite")
        .or(`nom.ilike.%${materiel}%,prefixe_unite.ilike.%${materiel}%`)
        .limit(5);
      const references = (refs ?? []) as { id: string; nom: string; prefixe_unite: string | null }[];
      if (references.length === 0) return texte(`Aucun matériel ne correspond à « ${materiel} ».`);

      const lignes: string[] = [];
      for (const r of references) {
        const { data: unites } = await sb()
          .from("unite")
          .select("id, numero_interne, date_achat")
          .eq("reference_id", r.id)
          .eq("etat", "ok")
          .order("numero_interne");
        const parc = ((unites ?? []) as { id: string; numero_interne: number | null; date_achat: string | null }[])
          .filter((u) => !u.date_achat || u.date_achat <= debut);
        if (parc.length === 0) { lignes.push(`${r.nom} : aucune unité suivie.`); continue; }

        const { data: prises } = await sb()
          .from("reservation_unite")
          .select("unite_id")
          .in("unite_id", parc.map((u) => u.id))
          .lte("date_debut", dFin)
          .gte("date_fin", debut);
        const occupees = new Set(((prises ?? []) as { unite_id: string }[]).map((p) => p.unite_id));
        const libres = parc.filter((u) => !occupees.has(u.id));
        const nomUnite = (n: number | null) => `${r.prefixe_unite ?? r.nom} ${n ?? "?"}`;
        lignes.push(
          `${r.nom} : ${libres.length} libre${libres.length > 1 ? "s" : ""} sur ${parc.length}`
          + (libres.length ? ` (${libres.map((u) => nomUnite(u.numero_interne)).join(", ")})` : ""),
        );
      }
      return texte(`Du ${dateFr(debut)} au ${dateFr(dFin)} :\n${lignes.join("\n")}`);
    },
  );

  server.registerTool(
    "etat_tresorerie",
    {
      description:
        "Solde réel, solde projeté de fin d'année et mois à découvert. "
        + "Répond à « où en est la trésorerie », « est-ce qu'on passe dans le rouge ».",
      inputSchema: z.object({
        annee: z.number().int().min(2020).max(2100).optional().describe("Année à regarder, par défaut l'année en cours."),
      }),
    },
    async ({ annee }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirFinance(moi)) return texte("La trésorerie est réservée aux co-présidents.");
      const an = annee ?? new Date().getFullYear();

      const [{ data: ecrData }, { data: entData }] = await Promise.all([
        sb().from("ecriture_financiere").select("*"),
        sb().from("parametres_entreprise").select("*").limit(1).maybeSingle(),
      ]);
      const ent = entData as ParametresEntreprise | null;
      const { months, soldeActuelReel, soldeProjete } = syntheseMensuelle(
        (ecrData ?? []) as EcritureFinanciere[],
        Number(ent?.solde_initial ?? 0),
        an,
        Number(ent?.seuil_alerte ?? 0),
        ent?.solde_initial_date ?? null,
      );
      const rouges = months.filter((m) => m.soldeProjCum < 0).map((m) => m.mois);
      return texte(
        [
          `Solde réel : ${euros(soldeActuelReel)}.`,
          `Projeté fin ${an} : ${euros(soldeProjete)}.`,
          rouges.length ? `Mois dans le rouge : ${rouges.join(", ")}.` : "Aucun mois dans le rouge.",
        ].join(" "),
      );
    },
  );

  server.registerTool(
    "notes_frais_a_valider",
    {
      description:
        "Les notes de frais en attente de validation, avec leur auteur et leur montant. "
        + "Répond à « il y a des notes de frais à valider ».",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirFinance(moi)) return texte("Les notes de frais sont réservées aux co-présidents.");

      const { data } = await sb()
        .from("note_frais")
        .select("numero, titre, demandeur_id, date, lignes:ligne_note_frais(montant_ttc)")
        .eq("statut", "soumise");
      const ndf = (data ?? []) as unknown as {
        numero: string | null; titre: string | null; demandeur_id: string | null;
        date: string | null; lignes: { montant_ttc: number }[];
      }[];
      if (ndf.length === 0) return texte("Aucune note de frais en attente.");

      const { data: membres } = await sb().from("membre").select("id, prenom, nom");
      const nomDe = new Map(
        ((membres ?? []) as { id: string; prenom: string | null; nom: string | null }[])
          .map((m) => [m.id, [m.prenom, m.nom].filter(Boolean).join(" ")]),
      );
      return texte(
        ndf
          .map((n) => {
            const total = (n.lignes ?? []).reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);
            const auteur = nomDe.get(n.demandeur_id ?? "") ?? "—";
            const sienne = n.demandeur_id === moi.id ? " (la tienne, tu ne peux pas la valider)" : "";
            return `${n.numero ?? "NDF"} — ${n.titre ?? "sans titre"} — ${auteur} — ${euros(total)}${sienne}`;
          })
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "fiche_unite",
    {
      description:
        "L'état d'un exemplaire précis : compteurs, maintenance, remarques. "
        + "Répond à « c'est quoi l'état du Beam 11 ».",
      inputSchema: z.object({
        unite: z.string().min(2).describe("Nom d'usage de l'unité, par exemple « Beam 11 » ou « Laser 3 »."),
      }),
    },
    async ({ unite }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirMateriel(moi)) return texte("Tu n'as pas accès à l'inventaire.");

      const m = unite.trim().match(/^(.*?)\s*(\d+)$/);
      if (!m) return texte(`Donne un nom d'unité avec son numéro, par exemple « Beam 11 ».`);
      const [, prefixe, numero] = m;

      const { data } = await sb()
        .from("unite")
        .select("numero_interne, numero_serie, etat, compteur_heures, compteur_sorties, remarques, date_derniere_maintenance, reference:materiel_reference!inner(nom, prefixe_unite)")
        .eq("numero_interne", Number(numero))
        .ilike("reference.prefixe_unite", prefixe.trim())
        .maybeSingle();
      const u = data as unknown as {
        numero_interne: number | null; numero_serie: string | null; etat: string;
        compteur_heures: number; compteur_sorties: number; remarques: string | null;
        date_derniere_maintenance: string | null;
        reference: { nom: string; prefixe_unite: string | null } | null;
      } | null;
      if (!u) return texte(`Aucune unité nommée « ${unite} ».`);

      return texte(
        [
          `${prefixe.trim()} ${numero} (${u.reference?.nom ?? "matériel"})`,
          `état : ${u.etat}`,
          `${u.compteur_sorties} sortie${u.compteur_sorties > 1 ? "s" : ""}, ${u.compteur_heures} h`,
          u.date_derniere_maintenance ? `dernière maintenance le ${dateFr(u.date_derniere_maintenance)}` : "jamais entretenue",
          u.remarques ? `remarque : ${u.remarques}` : null,
        ].filter(Boolean).join(" · "),
      );
    },
  );

  server.registerTool(
    "bilan_evenement",
    {
      description:
        "Ce qu'un événement a rapporté et ce qu'il a mobilisé. "
        + "Répond à « combien le Big Bazar a rapporté ».",
      inputSchema: z.object({
        evenement: z.string().min(2).describe("Nom ou début du nom de l'événement."),
      }),
    },
    async ({ evenement }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirFinance(moi)) return texte("Les montants sont réservés aux co-présidents.");

      const { data } = await sb()
        .from("prestation")
        .select("id, nom, statut, date_event_debut")
        .ilike("nom", `%${evenement}%`)
        .order("date_event_debut", { ascending: false })
        .limit(1)
        .maybeSingle();
      const p = data as { id: string; nom: string; statut: string; date_event_debut: string | null } | null;
      if (!p) return texte(`Aucun événement ne correspond à « ${evenement} ».`);

      const [{ data: mat }, { data: resa }] = await Promise.all([
        sb().from("prestation_materiel").select("montant, utilise").eq("prestation_id", p.id),
        sb().from("reservation_unite").select("unite_id").eq("prestation_id", p.id),
      ]);
      const lignes = (mat ?? []) as { montant: number; utilise: boolean }[];
      const total = lignes.filter((l) => l.utilise).reduce((s, l) => s + Number(l.montant ?? 0), 0);

      return texte(
        [
          `${p.nom} (${p.statut}${p.date_event_debut ? `, ${dateFr(p.date_event_debut)}` : ""})`,
          `matériel facturé : ${euros(total)}`,
          `${lignes.length} ligne${lignes.length > 1 ? "s" : ""} de matériel, ${(resa ?? []).length} unité${(resa ?? []).length > 1 ? "s" : ""} affectée${(resa ?? []).length > 1 ? "s" : ""}`,
        ].join(" · "),
      );
    },
  );
}, {
  serverInfo: { name: "Déjà Vu", version: "1.0.0" },
});

/**
 * Le jeton doit correspondre à un membre actif. On ne renvoie aucun indice en
 * cas d'échec : un jeton invalide ne doit pas dire s'il a existé.
 */
const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  const supabase = createServiceClient();
  if (!supabase || !bearerToken) return undefined;
  const membre = await membreDuJeton(supabase, bearerToken);
  if (!membre) return undefined;
  return { token: bearerToken, scopes: [membre.role], clientId: membre.id };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST };
