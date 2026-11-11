import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { membreDuJeton, peutEcrire, peutVoirFinance, peutVoirMateriel, type AppelantMcp } from "@/lib/mcp-auth";
import { depensesSansJustificatif, refusModificationNote } from "@/lib/mcp-ecriture";
import { syntheseMensuelle } from "@/lib/finance";
import { periodeReservation } from "@/lib/devis";
import { dateFr, euros } from "@/lib/format";
import type { EcritureFinanciere, ParametresEntreprise } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Réponse texte : c'est lu à voix haute, donc des phrases, pas du JSON. */
const texte = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
/** Refus ou échec : signalé comme erreur pour que Claude ne le prenne pas pour un succès. */
const echec = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format AAAA-MM-JJ.");
const MONTANT = z.number().positive().max(100000).describe("Montant TTC en euros, par exemple 42.5.");
const arrondi = (n: number) => Math.round(n * 100) / 100;
/** Annotations des outils qui écrivent : rien n'est détruit, mais ce n'est plus de la lecture. */
const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/**
 * Serveur MCP de l'outil Déjà Vu.
 *
 * Ouvert à Claude pour consulter l'activité à la voix, et pour préparer des notes
 * de frais en brouillon. Jamais de SQL libre : la clé de service contourne les
 * règles de la base, c'est donc cette route qui porte le contrôle d'accès, en
 * rejouant les mêmes rôles et garde-fous que l'application. Signer, soumettre et
 * valider restent dans l'application. Les fichiers passent par /api/mcp/upload.
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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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

  // ─── Écriture : notes de frais en brouillon ────────────────────────────────

  server.registerTool(
    "creer_note_frais",
    {
      description:
        "Crée une note de frais en BROUILLON au nom de l'appelant, avec ses dépenses. "
        + "Ne signe ni ne soumet : c'est fait ensuite dans l'application. "
        + "Renvoie l'id de la note et l'id de chaque ligne, pour y joindre un justificatif via /api/mcp/upload.",
      annotations: ECRITURE,
      inputSchema: z.object({
        titre: z.string().trim().min(2).max(200).describe("Intitulé de la note, par exemple « Courses soirée Supaero »."),
        date: DATE.describe("Date de la note, format AAAA-MM-JJ."),
        lignes: z.array(z.object({
          libelle: z.string().trim().min(1).max(200),
          date: DATE.describe("Date de la dépense, format AAAA-MM-JJ."),
          montant_ttc: MONTANT,
        })).min(1).max(50),
      }),
    },
    async ({ titre, date, lignes }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutEcrire(moi)) return echec("Tu n'es pas autorisé à écrire par Claude.");
      const db = sb();

      const { data: numero, error: errNum } = await db.rpc("attribuer_numero_ndf");
      if (errNum) return echec(`Numérotation impossible : ${errNum.message}`);
      const libererNumero = async () => {
        if (numero) await db.rpc("liberer_numero_ndf", { p_numero: numero as string });
      };

      const { data: note, error } = await db
        .from("note_frais")
        .insert({ numero, titre, date, type_ndf: "depense", demandeur_id: moi.id, statut: "brouillon" })
        .select("id, numero")
        .single();
      if (error || !note) {
        await libererNumero();
        return echec(`Création impossible : ${error?.message ?? "erreur inconnue"}`);
      }

      const { data: crees, error: errLignes } = await db
        .from("ligne_note_frais")
        .insert(lignes.map((l) => ({
          note_frais_id: note.id, libelle: l.libelle, date: l.date, montant_ttc: arrondi(l.montant_ttc),
        })))
        .select("id, libelle, montant_ttc");
      if (errLignes) {
        // Pas de note à moitié créée : on retire la note (les lignes suivent en cascade)
        // puis on rend le numéro, qui n'est libérable qu'une fois la note supprimée.
        await db.from("note_frais").delete().eq("id", note.id);
        await libererNumero();
        return echec(`Lignes refusées, rien n'a été créé : ${errLignes.message}`);
      }

      revalidatePath("/notes-frais");
      const rows = (crees ?? []) as { id: string; libelle: string | null; montant_ttc: number }[];
      const total = rows.reduce((s, l) => s + Number(l.montant_ttc), 0);
      return texte(
        [
          `Note ${note.numero ?? ""} créée en brouillon (id ${note.id}), total ${euros(total)}.`,
          ...rows.map((l) => `- ligne ${l.id} : ${l.libelle ?? "—"}, ${euros(Number(l.montant_ttc))}`),
          "À signer et soumettre dans l'application.",
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "ajouter_ligne_note_frais",
    {
      description:
        "Ajoute une dépense à une note de frais en brouillon dont l'appelant est le demandeur. "
        + "Renvoie l'id de la ligne, pour y joindre un justificatif via /api/mcp/upload.",
      annotations: ECRITURE,
      inputSchema: z.object({
        note_id: z.string().uuid().describe("Id de la note (voir lister_notes_frais_brouillon)."),
        libelle: z.string().trim().min(1).max(200),
        date: DATE.describe("Date de la dépense, format AAAA-MM-JJ."),
        montant_ttc: MONTANT,
      }),
    },
    async ({ note_id, libelle, date, montant_ttc }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutEcrire(moi)) return echec("Tu n'es pas autorisé à écrire par Claude.");
      const db = sb();
      const refus = await refusModificationNote(db, note_id, moi.id);
      if (refus) return echec(refus);

      const { data, error } = await db
        .from("ligne_note_frais")
        .insert({ note_frais_id: note_id, libelle, date, montant_ttc: arrondi(montant_ttc) })
        .select("id")
        .single();
      if (error || !data) return echec(`Ajout impossible : ${error?.message ?? "erreur inconnue"}`);

      revalidatePath(`/notes-frais/${note_id}`);
      return texte(`Ligne ${data.id} ajoutée : ${libelle}, ${euros(arrondi(montant_ttc))}.`);
    },
  );

  server.registerTool(
    "lister_notes_frais_brouillon",
    {
      description:
        "Les notes de frais en brouillon de l'appelant, avec l'id de chaque ligne et la présence "
        + "ou non d'un justificatif. Répond à « où en sont mes notes de frais ».",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirFinance(moi)) return echec("Les notes de frais sont réservées aux co-présidents.");

      const { data } = await sb()
        .from("note_frais")
        .select("id, numero, titre, date, lignes:ligne_note_frais(id, libelle, date, montant_ttc, justificatif_url)")
        .eq("demandeur_id", moi.id)
        .eq("statut", "brouillon")
        .order("created_at", { ascending: false });
      const notes = (data ?? []) as unknown as {
        id: string; numero: string | null; titre: string | null; date: string | null;
        lignes: { id: string; libelle: string | null; date: string | null; montant_ttc: number; justificatif_url: string | null }[];
      }[];
      if (notes.length === 0) return texte("Aucune note de frais en brouillon.");

      return texte(
        notes
          .map((n) => {
            const lignes = n.lignes ?? [];
            const total = lignes.reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);
            const sansPiece = lignes.filter((l) => !l.justificatif_url).length;
            return [
              `${n.numero ?? "NDF"} — ${n.titre ?? "sans titre"} — ${euros(total)} (id ${n.id})`
                + (sansPiece ? `, ${sansPiece} ligne${sansPiece > 1 ? "s" : ""} sans justificatif` : ""),
              ...lignes.map((l) =>
                `- ligne ${l.id} : ${l.libelle ?? "—"}${l.date ? `, ${dateFr(l.date)}` : ""}, ${euros(Number(l.montant_ttc))}`
                + (l.justificatif_url ? "" : " — sans justificatif")),
            ].join("\n");
          })
          .join("\n\n"),
      );
    },
  );

  server.registerTool(
    "lister_depenses_sans_justificatif",
    {
      description:
        "Les dépenses réelles du journal (dont les transactions Qonto) qui n'ont aucun justificatif, "
        + "les plus récentes d'abord, avec leur id pour y joindre une pièce via /api/mcp/upload (champ ecriture_id).",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      inputSchema: z.object({
        limite: z.number().int().min(1).max(100).default(20).describe("Nombre maximal de dépenses à lister."),
      }),
    },
    async ({ limite }, ctx) => {
      const moi = await appelantDe(ctx);
      if (!peutVoirFinance(moi)) return echec("Le journal est réservé aux co-présidents.");

      const liste = await depensesSansJustificatif(sb(), limite);
      if (liste.length === 0) return texte("Toutes les dépenses ont un justificatif.");
      return texte(
        liste
          .map((d) => `- ${dateFr(d.date)} — ${d.denomination ?? "sans libellé"} — ${euros(d.montant_ttc)}`
            + `${d.qonto ? " (Qonto)" : ""} — id ${d.id}`)
          .join("\n"),
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
