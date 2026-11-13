import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Écritures ouvertes à Claude (MCP + route /api/mcp/upload) : notes de frais en
 * brouillon, signature et soumission de ses propres notes, justificatifs.
 * Réservées aux membres de MCP_ECRITURE_MEMBRES (voir peutEcrire).
 *
 * Ces routes utilisent la clé de service, qui contourne RLS : chaque garde-fou de
 * l'application doit donc être rejoué ici, à l'identique. Jamais de validation,
 * de refus, de remboursement ni de suppression de note : ces gestes restent dans
 * l'application, à un co-président autre que le demandeur.
 *
 * Pas d'import par alias (« @/… ») dans ce fichier : il est testé directement par
 * node (scripts/tests/mcp-ecriture.test.mjs).
 */

/**
 * Taille maximale d'un justificatif. Vercel refuse tout corps de requête > 4,5 Mo
 * avant même d'appeler la route : monter plus haut demanderait un envoi direct au
 * stockage par URL signée.
 */
export const LIMITE_JUSTIFICATIF = 4 * 1024 * 1024;

/** Même règle que `assertModifiable` (notes-frais/actions.ts) : brouillon ET demandeur. */
export async function refusModificationNote(
  supabase: SupabaseClient,
  noteId: string,
  membreId: string,
): Promise<string | null> {
  const { data: n } = await supabase
    .from("note_frais")
    .select("statut, demandeur_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!n) return "Note de frais introuvable.";
  if (n.demandeur_id !== membreId) return "Seul le demandeur peut modifier sa note de frais.";
  if (n.statut !== "brouillon") {
    return "Cette note n'est plus modifiable : elle a été soumise. Repasse-la en brouillon dans l'application pour la corriger.";
  }
  return null;
}

export type TypeJustificatif = { ext: "pdf" | "jpg" | "png" | "heic"; contentType: string };

/**
 * Type réel du fichier, lu dans ses premiers octets — pas dans son nom ni dans le
 * Content-Type envoyé : curl annonce « application/octet-stream » pour un .heic.
 */
export function typeJustificatif(octets: Uint8Array): TypeJustificatif | null {
  const debut = (...b: number[]) => b.every((v, i) => octets[i] === v);
  if (debut(0x25, 0x50, 0x44, 0x46)) return { ext: "pdf", contentType: "application/pdf" }; // %PDF
  if (debut(0xff, 0xd8, 0xff)) return { ext: "jpg", contentType: "image/jpeg" };
  if (debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", contentType: "image/png" };
  // HEIC/HEIF (photos iPhone) : boîte « ftyp » à l'octet 4, puis la marque.
  const ascii = (a: number, b: number) => String.fromCharCode(...octets.slice(a, b));
  if (octets.length >= 12 && ascii(4, 8) === "ftyp") {
    const marque = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(marque)) {
      return { ext: "heic", contentType: "image/heic" };
    }
  }
  return null;
}

/** Nom d'origine, sans chemin ni caractères de contrôle ; repli sur un nom générique. */
export function nomJustificatif(nom: string | null | undefined, ext: string): string {
  const propre = String(nom ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
  return propre || `justificatif.${ext}`;
}

/** Empreinte SHA-256 du fichier, pour reconnaître un justificatif déjà joint. */
export function empreinte(octets: Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex");
}

/**
 * Chemin de stockage d'un justificatif déposé par le MCP. Les 16 premiers
 * caractères de l'empreinte y figurent : un second envoi du même fichier est
 * reconnu sans retélécharger la pièce déjà en place.
 */
export function cheminJustificatif(prefixe: "" | "ndf/", sha: string, ext: string, maintenant = Date.now()): string {
  return `${prefixe}${maintenant}-${sha.slice(0, 16)}.${ext}`;
}

/** Le chemin a-t-il été produit par cheminJustificatif pour ce même contenu ? */
export function cheminPorteEmpreinte(chemin: string | null | undefined, sha: string): boolean {
  return !!chemin && chemin.includes(`-${sha.slice(0, 16)}.`);
}

// ─── Sources des lignes du journal ─────────────────────────────────────────────

export type SourceEcriture = "qonto" | "manuel" | "ndf";
export type FiltreSource = SourceEcriture | "toutes";

/** « Remboursement NDF0027 », « NDF 0027 », « Remboursement de la note de frais … ». */
const LIBELLE_NDF = /^\s*(remboursement\s+(?:de\s+(?:la\s+)?|d['’]\s*)?)?(ndf|note\s+de\s+frais)(?![a-zà-ÿ])/i;

/**
 * Le journal mêle trois sortes de lignes. Une ligne qui rembourse une note de
 * frais est « ndf » même si elle vient de Qonto : ses pièces vivent sur la note.
 * Sinon, une transaction synchronisée est « qonto », le reste est saisi à la main.
 */
export function sourceEcriture(e: {
  qonto_transaction_id: string | null;
  note_frais_id: string | null;
  denomination: string | null;
}, notesLiees?: Set<string>, id?: string): SourceEcriture {
  if (e.note_frais_id || (id && notesLiees?.has(id)) || LIBELLE_NDF.test(e.denomination ?? "")) return "ndf";
  return e.qonto_transaction_id ? "qonto" : "manuel";
}

/** Échappe %, _ et \\ pour un motif ILIKE. */
export function motifIlike(texte: string): string {
  return `%${texte.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type DepenseJournal = {
  id: string;
  date: string;
  denomination: string | null;
  montant_ttc: number;
  source: SourceEcriture;
  /** Pièces déjà présentes (journal) ou lignes de la note avec pièce (ndf). */
  nb_pieces: number;
  /** Pour une ligne ndf liée : lignes de la note sans justificatif. */
  lignes_ndf_sans_piece?: number;
  note_frais_id?: string | null;
};

export type OptionsDepenses = {
  limite: number;
  source: FiltreSource;
  depuis?: string;
  fournisseur?: string;
  /** Inclure aussi les dépenses qui ont déjà au moins une pièce (cas partiels). */
  inclurePartiels?: boolean;
};

/**
 * Dépenses réelles du journal, avec leur source et le nombre de pièces, selon la
 * règle du journal (journal-tabs.tsx) : une pièce, c'est `facture`, une facture
 * émise liée, une ligne `ecriture_facture` ou une ligne `justificatif`. Pour une
 * ligne qui rembourse une note de frais, les pièces sont celles des lignes de la
 * note : elle « manque » d'une pièce si une ligne de la note n'en a pas.
 */
export async function depensesJournal(
  supabase: SupabaseClient,
  o: OptionsDepenses,
): Promise<DepenseJournal[]> {
  let q = supabase
    .from("ecriture_financiere")
    .select("id, date, denomination, montant_ttc, qonto_transaction_id, note_frais_id")
    .eq("sens", "sortie")
    .eq("statut", "reel")
    .is("facture", null)
    .is("devis_facture_id", null);
  if (o.depuis) q = q.gte("date", o.depuis);
  if (o.fournisseur?.trim()) q = q.ilike("denomination", motifIlike(o.fournisseur));
  const { data } = await q.order("date", { ascending: false }).limit(1000);
  const lignes = (data ?? []) as {
    id: string; date: string; denomination: string | null; montant_ttc: number;
    qonto_transaction_id: string | null; note_frais_id: string | null;
  }[];
  if (lignes.length === 0) return [];
  const ids = lignes.map((l) => l.id);

  // Le lien note ↔ écriture existe dans les deux sens selon le chemin de création.
  const [{ data: justifs }, { data: liees }, { data: notesParEcriture }] = await Promise.all([
    supabase.from("justificatif").select("ecriture_id").in("ecriture_id", ids),
    supabase.from("ecriture_facture").select("ecriture_id").in("ecriture_id", ids),
    supabase.from("note_frais").select("id, ecriture_id").in("ecriture_id", ids),
  ]);
  const pieces = new Map<string, number>();
  for (const r of [...(justifs ?? []), ...(liees ?? [])] as { ecriture_id: string }[]) {
    pieces.set(r.ecriture_id, (pieces.get(r.ecriture_id) ?? 0) + 1);
  }
  const noteDeEcriture = new Map<string, string>();
  for (const n of (notesParEcriture ?? []) as { id: string; ecriture_id: string }[]) {
    noteDeEcriture.set(n.ecriture_id, n.id);
  }

  const ecrituresDeNotes = new Set(noteDeEcriture.keys());
  const classees = lignes
    .map((l) => ({ ...l, source: sourceEcriture(l, ecrituresDeNotes, l.id) }))
    .filter((l) => o.source === "toutes" || l.source === o.source);

  // Lignes des notes de frais remboursées, pour juger leurs pièces.
  const noteIds = [...new Set(classees
    .filter((l) => l.source === "ndf")
    .map((l) => l.note_frais_id ?? noteDeEcriture.get(l.id))
    .filter((v): v is string => !!v))];
  const lignesNote = new Map<string, { avec: number; sans: number }>();
  if (noteIds.length) {
    const { data: ln } = await supabase
      .from("ligne_note_frais")
      .select("note_frais_id, justificatif_url")
      .in("note_frais_id", noteIds);
    for (const l of (ln ?? []) as { note_frais_id: string; justificatif_url: string | null }[]) {
      const c = lignesNote.get(l.note_frais_id) ?? { avec: 0, sans: 0 };
      if (l.justificatif_url) c.avec++; else c.sans++;
      lignesNote.set(l.note_frais_id, c);
    }
  }

  const sortie: DepenseJournal[] = [];
  for (const l of classees) {
    const noteId = l.note_frais_id ?? noteDeEcriture.get(l.id) ?? null;
    let nb = pieces.get(l.id) ?? 0;
    let manque = nb === 0;
    let sansPieceNdf: number | undefined;
    if (l.source === "ndf" && noteId) {
      const c = lignesNote.get(noteId) ?? { avec: 0, sans: 0 };
      nb = c.avec;
      sansPieceNdf = c.sans;
      manque = c.sans > 0;
    }
    if (!manque && !(o.inclurePartiels && nb > 0)) continue;
    sortie.push({
      id: l.id,
      date: l.date,
      denomination: l.denomination,
      montant_ttc: Number(l.montant_ttc),
      source: l.source,
      nb_pieces: nb,
      ...(sansPieceNdf !== undefined ? { lignes_ndf_sans_piece: sansPieceNdf } : {}),
      ...(noteId ? { note_frais_id: noteId } : {}),
    });
    if (sortie.length >= o.limite) break;
  }
  return sortie;
}

// ─── Rapprochement pièces ↔ transactions Qonto ─────────────────────────────────

export type PieceARapprocher = { montant: number; date: string; libelle?: string };
export type CandidatRapprochement = {
  id: string; date: string; denomination: string | null; montant_ttc: number;
  nb_pieces: number; ecart_jours: number;
};

const JOUR = 86400000;
const ecartJours = (a: string, b: string) =>
  Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / JOUR);
const memeMontant = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) < 0.005;

/**
 * Pour chaque pièce, les dépenses dont le montant est exactement le même (au
 * centime) et la date à ± `tolerance` jours. Cherche aussi les paires de pièces
 * dont la somme fait une seule dépense (deux factures payées en un virement).
 * Fonction pure : testée sans base.
 */
export function rapprocher(
  pieces: PieceARapprocher[],
  depenses: Omit<CandidatRapprochement, "ecart_jours">[],
  tolerance = 5,
): {
  par_piece: { piece: PieceARapprocher; candidats: CandidatRapprochement[] }[];
  paires: { pieces: [number, number]; depense: CandidatRapprochement }[];
} {
  const proches = (montant: number, date: string, dates: string[] = [date]) =>
    depenses
      .filter((d) => memeMontant(d.montant_ttc, montant) && dates.every((x) => ecartJours(x, d.date) <= tolerance))
      .map((d) => ({ ...d, ecart_jours: Math.max(...dates.map((x) => ecartJours(x, d.date))) }))
      .sort((a, b) => a.nb_pieces - b.nb_pieces || a.ecart_jours - b.ecart_jours);

  const par_piece = pieces.map((p) => ({ piece: p, candidats: proches(p.montant, p.date) }));
  const paires: { pieces: [number, number]; depense: CandidatRapprochement }[] = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const somme = Math.round((pieces[i].montant + pieces[j].montant) * 100) / 100;
      for (const d of proches(somme, pieces[i].date, [pieces[i].date, pieces[j].date])) {
        paires.push({ pieces: [i, j], depense: d });
      }
    }
  }
  return { par_piece, paires };
}

// ─── Journal des écritures faites par Claude ──────────────────────────────────

export type EntreeJournalMcp = {
  membre_id: string;
  action: string;
  cible_type: "note_frais" | "ligne_note_frais" | "ecriture_financiere" | "justificatif";
  cible_id: string | null;
  details?: Record<string, unknown>;
};

/**
 * Trace chaque écriture faite par le MCP : qui, quoi, quand. Toujours dans les
 * journaux Vercel ; aussi dans la table `mcp_journal` si elle existe (migration
 * proposée dans docs/mcp_journal.sql). Jamais le jeton, jamais le contenu d'un
 * fichier. Ne fait jamais échouer l'écriture qu'elle trace.
 */
export async function journaliserMcp(supabase: SupabaseClient, e: EntreeJournalMcp): Promise<void> {
  console.info("[mcp-ecriture]", JSON.stringify({ ...e, le: new Date().toISOString() }));
  try {
    await supabase.from("mcp_journal").insert({
      membre_id: e.membre_id, action: e.action, cible_type: e.cible_type,
      cible_id: e.cible_id, details: e.details ?? {},
    });
  } catch {
    // Table absente ou base indisponible : la trace Vercel suffit.
  }
}
