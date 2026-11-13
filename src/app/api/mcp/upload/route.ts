import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { membreDuJeton, peutEcrire } from "@/lib/mcp-auth";
import { BUCKET_PRIVE } from "@/lib/storage";
import {
  LIMITE_JUSTIFICATIF, cheminJustificatif, cheminPorteEmpreinte, empreinte, journaliserMcp,
  nomJustificatif, refusModificationNote, typeJustificatif,
} from "@/lib/mcp-ecriture";

/**
 * Dépôt d'un justificatif sans ouvrir le site : le fichier part directement (curl,
 * ou l'assistant du NAS pour une pièce jointe d'e-mail), il ne transite pas par Claude.
 *
 *   curl -H "Authorization: Bearer $MCP_TOKEN" \
 *        -F ligne_id=<id de ligne> -F file=@facture.pdf \
 *        https://appli-pi.vercel.app/api/mcp/upload
 *
 * Cibles (une seule par envoi) :
 *   ligne_id    → ligne d'une note de frais en brouillon dont on est le demandeur.
 *                 Une pièce par ligne : remplacée seulement avec -F remplacer=oui.
 *   ecriture_id → écriture du journal (dépense, transaction Qonto) : AJOUTE une pièce
 *                 dans la table `justificatif` (plusieurs possibles, jamais d'écrasement)
 *                 et repasse l'écriture « à valider » (valide = false).
 *
 * Le même fichier envoyé deux fois sur la même cible est reconnu (empreinte SHA-256)
 * et n'est pas ajouté une seconde fois.
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
const MO = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
/** Au-delà, on ne retélécharge pas les anciennes pièces pour comparer : peu probable, et lent. */
const MAX_COMPARAISONS = 10;

/** Le fichier stocké à `chemin` a-t-il cette empreinte ? Chemin MCP : lu dans le nom ; sinon retéléchargé. */
async function memeFichier(db: SupabaseClient, chemin: string, sha: string): Promise<boolean> {
  if (cheminPorteEmpreinte(chemin, sha)) return true;
  const { data } = await db.storage.from(BUCKET_PRIVE).download(chemin);
  if (!data) return false;
  return empreinte(new Uint8Array(await data.arrayBuffer())) === sha;
}

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
    return json(413, {
      erreur: `Fichier trop lourd (${MO(annonce)}) : ${MO(LIMITE_JUSTIFICATIF)} maximum.`,
      taille: annonce, limite: LIMITE_JUSTIFICATIF,
    });
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
    return json(413, {
      erreur: `Fichier trop lourd (${MO(file.size)}) : ${MO(LIMITE_JUSTIFICATIF)} maximum.`,
      taille: file.size, limite: LIMITE_JUSTIFICATIF,
    });
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
  const sha = empreinte(octets);

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
      .select("id, note_frais_id, justificatif_url, justificatif_nom")
      .eq("id", ligneId)
      .maybeSingle();
    if (!ligne) return json(404, { erreur: "Ligne de note de frais introuvable." });
    const refus = await refusModificationNote(db, ligne.note_frais_id as string, moi.id);
    if (refus) return json(409, { erreur: refus });
    if (ligne.justificatif_url) {
      if (await memeFichier(db, ligne.justificatif_url as string, sha)) {
        return json(200, {
          ok: true, doublon: true, cible: "ligne_note_frais", ligne_id: ligneId,
          note_id: ligne.note_frais_id, nom: ligne.justificatif_nom,
          message: "Ce fichier est déjà le justificatif de cette ligne : rien n'a changé.",
        });
      }
      if (champ(form.get("remplacer")) !== "oui") {
        return json(409, { erreur: "Cette ligne a déjà un autre justificatif. Ajoute -F remplacer=oui pour le remplacer." });
      }
    }

    // Même rangement que l'application (uploadJustificatif) : ndf/<horodatage>-<empreinte>.<ext>
    const chemin = await deposer(cheminJustificatif("ndf/", sha, type.ext));
    if (!chemin) return json(502, { erreur: "Dépôt du fichier impossible." });

    const { error } = await db
      .from("ligne_note_frais")
      .update({ justificatif_url: chemin, justificatif_nom: nom })
      .eq("id", ligneId);
    if (error) {
      await db.storage.from(BUCKET_PRIVE).remove([chemin]);
      return json(500, { erreur: `Rattachement impossible : ${error.message}` });
    }
    await journaliserMcp(db, {
      membre_id: moi.id, action: ligne.justificatif_url ? "remplacer_justificatif_ligne" : "joindre_justificatif_ligne",
      cible_type: "ligne_note_frais", cible_id: ligneId,
      details: { note_id: ligne.note_frais_id, nom, sha256: sha, octets: octets.length, ancien: ligne.justificatif_url ?? null },
    });
    revalidatePath(`/notes-frais/${ligne.note_frais_id}`);
    return json(200, {
      ok: true, cible: "ligne_note_frais", ligne_id: ligneId, note_id: ligne.note_frais_id, nom,
      remplace: !!ligne.justificatif_url,
    });
  }

  // ─── Écriture du journal (dépense, transaction Qonto) ─────────────────────
  const { data: ecr } = await db
    .from("ecriture_financiere")
    .select("id, note_frais_id, valide")
    .eq("id", ecritureId!)
    .maybeSingle();
  if (!ecr) return json(404, { erreur: "Écriture introuvable." });
  // Comme dans le panneau de l'écriture : les pièces d'un remboursement de note de
  // frais vivent sur la note, pas sur l'écriture.
  if (ecr.note_frais_id) {
    return json(409, { erreur: "Cette écriture rembourse une note de frais : joins la pièce à la ligne de la note." });
  }

  // Plusieurs pièces par écriture (deux factures payées en un virement) : on ajoute,
  // on n'écrase jamais. Seul le même fichier déjà présent est refusé.
  const { data: existants } = await db
    .from("justificatif")
    .select("id, url, nom")
    .eq("ecriture_id", ecr.id)
    .order("created_at");
  const deja = (existants ?? []) as { id: string; url: string; nom: string | null }[];
  for (const j of deja.slice(0, MAX_COMPARAISONS)) {
    if (await memeFichier(db, j.url, sha)) {
      return json(200, {
        ok: true, doublon: true, cible: "ecriture", ecriture_id: ecr.id, justificatif_id: j.id, nom: j.nom,
        nb_pieces: deja.length, valide_avant: ecr.valide, valide_apres: ecr.valide,
        message: "Ce fichier est déjà joint à cette écriture : rien n'a changé.",
      });
    }
  }

  // Même rangement que l'application (uploadFactureFile) : <horodatage>-<empreinte>.<ext>
  const chemin = await deposer(cheminJustificatif("", sha, type.ext));
  if (!chemin) return json(502, { erreur: "Dépôt du fichier impossible." });

  const annuler = async (justifId?: string) => {
    if (justifId) await db.from("justificatif").delete().eq("id", justifId);
    await db.storage.from(BUCKET_PRIVE).remove([chemin]);
  };

  const { data: justif, error } = await db
    .from("justificatif")
    .insert({ ecriture_id: ecr.id, url: chemin, nom })
    .select("id")
    .single();
  if (error || !justif) {
    await annuler();
    return json(500, { erreur: `Rattachement impossible : ${error?.message ?? "erreur inconnue"}` });
  }

  // Une pièce ajoutée change ce qui avait été validé : l'écriture repasse « à valider »
  // pour être relue. Le statut (réel / prévisionnel) ne bouge pas.
  const valideAvant = ecr.valide as boolean;
  if (valideAvant) {
    const { error: errValide } = await db.from("ecriture_financiere").update({ valide: false }).eq("id", ecr.id);
    if (errValide) {
      await annuler(justif.id);
      return json(500, { erreur: `Repassage « à valider » impossible, rien n'a été joint : ${errValide.message}` });
    }
  }

  await journaliserMcp(db, {
    membre_id: moi.id, action: "joindre_justificatif_ecriture",
    cible_type: "ecriture_financiere", cible_id: ecr.id,
    details: { justificatif_id: justif.id, nom, sha256: sha, octets: octets.length, valide_avant: valideAvant, valide_apres: false },
  });
  revalidatePath("/finance");
  revalidatePath("/finance/journal");
  revalidatePath(`/finance/${ecr.id}`);
  return json(200, {
    ok: true, cible: "ecriture", ecriture_id: ecr.id, justificatif_id: justif.id, nom,
    nb_pieces: deja.length + 1, valide_avant: valideAvant, valide_apres: false,
  });
}
