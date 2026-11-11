import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { membreDuJeton, peutEcrire } from "@/lib/mcp-auth";
import { BUCKET_PRIVE } from "@/lib/storage";
import {
  LIMITE_JUSTIFICATIF, nomJustificatif, refusModificationNote, typeJustificatif,
} from "@/lib/mcp-ecriture";

/**
 * Dépôt d'un justificatif depuis le Mac, sans ouvrir le site : le fichier part
 * directement par curl, il ne transite pas par Claude.
 *
 *   curl -H "Authorization: Bearer $MCP_TOKEN" \
 *        -F ligne_id=<id de ligne> -F file=@facture.pdf \
 *        https://appli-pi.vercel.app/api/mcp/upload
 *
 * Cibles (une seule par envoi) :
 *   ligne_id    → ligne d'une note de frais en brouillon dont on est le demandeur.
 *                 Remplace la pièce existante seulement avec -F remplacer=oui.
 *   ecriture_id → écriture du journal (dépense, transaction Qonto) : ajoute une pièce
 *                 dans la table `justificatif`, comme le panneau de l'écriture.
 *
 * Même jeton que le MCP, réservé aux membres de MCP_ECRITURE_MEMBRES. Le proxy laisse passer
 * /api/mcp/* : c'est cette route qui authentifie. Voir docs/MCP_justificatifs.md.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const json = (status: number, corps: Record<string, unknown>) => Response.json(corps, { status });
const champ = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const alea = () => Math.random().toString(36).slice(2);

export async function POST(req: Request) {
  const db = createServiceClient();
  if (!db) return json(503, { erreur: "Base non configurée côté serveur." });

  // Aucun indice en cas d'échec : un jeton invalide ne doit pas dire s'il a existé.
  const auth = req.headers.get("authorization") ?? "";
  const jeton = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const moi = await membreDuJeton(db, jeton);
  if (!moi) return json(401, { erreur: "Non autorisé." });
  if (!peutEcrire(moi)) return json(403, { erreur: "Non autorisé à écrire par Claude." });

  const annonce = Number(req.headers.get("content-length") ?? 0);
  if (annonce > LIMITE_JUSTIFICATIF + 64 * 1024) {
    return json(413, { erreur: `Fichier trop lourd : ${LIMITE_JUSTIFICATIF / 1024 / 1024} Mo maximum.` });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { erreur: "Envoi attendu en multipart (curl -F file=@…)." });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json(400, { erreur: "Champ « file » manquant ou vide." });
  if (file.size > LIMITE_JUSTIFICATIF) {
    return json(413, { erreur: `Fichier trop lourd : ${LIMITE_JUSTIFICATIF / 1024 / 1024} Mo maximum.` });
  }

  const ligneId = champ(form.get("ligne_id"));
  const ecritureId = champ(form.get("ecriture_id"));
  if (!!ligneId === !!ecritureId) {
    return json(400, { erreur: "Indique une seule cible : ligne_id (note de frais) ou ecriture_id (journal)." });
  }
  const cible = (ligneId ?? ecritureId)!;
  if (!UUID.test(cible)) return json(400, { erreur: "Identifiant de cible invalide." });

  const octets = new Uint8Array(await file.arrayBuffer());
  const type = typeJustificatif(octets);
  if (!type) return json(415, { erreur: "Type refusé : PDF, JPEG, PNG ou HEIC uniquement." });
  const nom = nomJustificatif(file.name, type.ext);

  const deposer = async (chemin: string) => {
    const { data, error } = await db.storage
      .from(BUCKET_PRIVE)
      .upload(chemin, octets, { contentType: type.contentType, upsert: false });
    return error || !data ? null : data.path;
  };

  // ─── Ligne de note de frais ───────────────────────────────────────────────
  if (ligneId) {
    const { data: ligne } = await db
      .from("ligne_note_frais")
      .select("id, note_frais_id, justificatif_url")
      .eq("id", ligneId)
      .maybeSingle();
    if (!ligne) return json(404, { erreur: "Ligne de note de frais introuvable." });
    const refus = await refusModificationNote(db, ligne.note_frais_id as string, moi.id);
    if (refus) return json(409, { erreur: refus });
    if (ligne.justificatif_url && champ(form.get("remplacer")) !== "oui") {
      return json(409, { erreur: "Cette ligne a déjà un justificatif. Ajoute -F remplacer=oui pour le remplacer." });
    }

    // Même rangement que l'application (uploadJustificatif) : ndf/<horodatage>-<aléa>.<ext>
    const chemin = await deposer(`ndf/${Date.now()}-${alea()}.${type.ext}`);
    if (!chemin) return json(502, { erreur: "Dépôt du fichier impossible." });

    const { error } = await db
      .from("ligne_note_frais")
      .update({ justificatif_url: chemin, justificatif_nom: nom })
      .eq("id", ligneId);
    if (error) {
      await db.storage.from(BUCKET_PRIVE).remove([chemin]);
      return json(500, { erreur: `Rattachement impossible : ${error.message}` });
    }
    revalidatePath(`/notes-frais/${ligne.note_frais_id}`);
    return json(200, { ok: true, cible: "ligne_note_frais", ligne_id: ligneId, note_id: ligne.note_frais_id, nom });
  }

  // ─── Écriture du journal (dépense, transaction Qonto) ─────────────────────
  const { data: ecr } = await db
    .from("ecriture_financiere")
    .select("id, note_frais_id")
    .eq("id", ecritureId!)
    .maybeSingle();
  if (!ecr) return json(404, { erreur: "Écriture introuvable." });
  // Comme dans le panneau de l'écriture : les pièces d'un remboursement de note de
  // frais vivent sur la note, pas sur l'écriture.
  if (ecr.note_frais_id) {
    return json(409, { erreur: "Cette écriture rembourse une note de frais : joins la pièce à la ligne de la note." });
  }

  // Même rangement que l'application (uploadFactureFile) : <horodatage>-<aléa>.<ext>
  const chemin = await deposer(`${Date.now()}-${alea()}.${type.ext}`);
  if (!chemin) return json(502, { erreur: "Dépôt du fichier impossible." });

  const { data: justif, error } = await db
    .from("justificatif")
    .insert({ ecriture_id: ecr.id, url: chemin, nom })
    .select("id")
    .single();
  if (error || !justif) {
    await db.storage.from(BUCKET_PRIVE).remove([chemin]);
    return json(500, { erreur: `Rattachement impossible : ${error?.message ?? "erreur inconnue"}` });
  }
  revalidatePath("/finance");
  revalidatePath("/finance/journal");
  revalidatePath(`/finance/${ecr.id}`);
  return json(200, { ok: true, cible: "ecriture", ecriture_id: ecr.id, justificatif_id: justif.id, nom });
}
