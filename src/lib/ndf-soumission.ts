import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerMail, baseUrl } from "@/lib/mail";
import { itineraire, geocode } from "@/lib/routage";
import { genererTrajetPdf } from "@/lib/pdf/trajet";
import type { ModeTrajet } from "@/lib/trajet";
import { BUCKET_PRIVE } from "@/lib/storage";
import type { ParametresEntreprise } from "@/lib/types";

/**
 * Étapes de la soumission d'une note de frais partagées entre l'application
 * (notes-frais/actions.ts) et le MCP (/api/mcp) : prévenir les valideurs et
 * produire le relevé d'itinéraire des déplacements. Hors du fichier « use server »
 * pour ne pas devenir des actions appelables depuis le navigateur.
 */

/**
 * Prévient par mail les co-présidents habilités à valider — c'est-à-dire tous sauf
 * le demandeur, qui ne peut pas valider sa propre note. La cloche de l'app ne
 * signale rien tant que personne ne l'ouvre : sans mail, une note peut dormir
 * plusieurs jours.
 */
export async function prevenirValideurs(
  supabase: SupabaseClient,
  noteId: string,
  demandeur: { id: string; prenom?: string | null; nom?: string | null } | null,
) {
  const { data: note } = await supabase
    .from("note_frais")
    .select("numero, titre, lignes:ligne_note_frais(montant_ttc)")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return;

  const { data: membres } = await supabase
    .from("membre")
    .select("id, email")
    .eq("role", "co_president")
    .eq("actif", true);
  const destinataires = (membres ?? [])
    .filter((m) => m.id !== demandeur?.id && m.email)
    .map((m) => m.email as string);
  if (!destinataires.length) return;

  const n = note as unknown as { numero: string | null; titre: string | null; lignes: { montant_ttc: number }[] };
  const total = (n.lignes ?? []).reduce((s, l) => s + Number(l.montant_ttc ?? 0), 0);
  const auteur = [demandeur?.prenom, demandeur?.nom].filter(Boolean).join(" ") || "Un membre";
  const montant = total.toFixed(2).replace(".", ",");

  await envoyerMail({
    to: destinataires,
    sujet: `Note de frais à valider — ${n.numero ?? ""} ${n.titre ?? ""}`.trim(),
    corps: [
      `${auteur} a soumis une note de frais pour validation.`,
      "",
      `Note    : ${n.numero ?? "—"} — ${n.titre ?? "Sans titre"}`,
      `Montant : ${montant} €`,
      "",
      `À valider ici : ${baseUrl()}/notes-frais/${noteId}`,
      "",
      "Rappel : un co-président autre que le demandeur doit valider la note.",
      "",
      "— Déjà Vu",
    ].join("\n"),
  });
}

/**
 * Produit le relevé d'itinéraire en PDF et le range dans le bucket privé.
 * Best-effort : un échec (tuiles injoignables, moteur d'itinéraire en panne) ne doit
 * pas empêcher d'enregistrer le déplacement.
 */
export async function releveItineraire(
  supabase: SupabaseClient,
  a: {
    depart: string;
    arrivee: string;
    /** Coordonnées déjà connues ; sinon les adresses sont localisées. */
    coordDepart?: [number, number] | null;
    coordArrivee?: [number, number] | null;
    date: string | null;
    eviterPeages: boolean;
    allerRetour: boolean;
    mode: ModeTrajet;
    conso: number;
    prixCarburant: number;
    tarifKm: number;
    detail: { km: number; carburant: number; peages: number; total: number };
    vehicule: string | null;
  },
): Promise<{ path: string; nom: string } | { erreur: string }> {
  try {
    const ca = a.coordDepart ?? (await geocode(a.depart).then((g) => g.coord).catch(() => null));
    const cb = a.coordArrivee ?? (await geocode(a.arrivee).then((g) => g.coord).catch(() => null));

    let trace: [number, number][] = [];
    let dureeMin: number | null = null;
    let peage: boolean | undefined;
    if (ca && cb) {
      const r = await itineraire([ca, cb], { eviterPeages: a.eviterPeages });
      trace = r.trace;
      dureeMin = r.dureeMin * (a.allerRetour ? 2 : 1);
      peage = r.peage;
    }

    const { data: ent } = await supabase.from("parametres_entreprise").select("*").limit(1).maybeSingle();
    const pdf = await genererTrajetPdf({
      ent: (ent ?? null) as ParametresEntreprise | null,
      depart: a.depart,
      arrivee: a.arrivee,
      date: a.date,
      allerRetour: a.allerRetour,
      eviterPeages: a.eviterPeages,
      km: a.detail.km,
      dureeMin,
      peage,
      vehicule: a.vehicule,
      mode: a.mode,
      conso: a.mode === "reel" ? a.conso : null,
      prixCarburant: a.mode === "reel" ? a.prixCarburant : null,
      peages: a.detail.peages,
      tarifKm: a.mode === "bareme" ? a.tarifKm : null,
      carburant: a.detail.carburant,
      total: a.detail.total,
      trace,
    });

    const chemin = `ndf/${Date.now()}-itineraire.pdf`;
    // Uint8Array plutôt que Buffer : c'est ce que le client de stockage attend,
    // un Buffer part parfois en objet sérialisé et le fichier arrive vide.
    const { data, error } = await supabase.storage
      .from(BUCKET_PRIVE)
      .upload(chemin, new Uint8Array(pdf), { contentType: "application/pdf", upsert: false });
    if (error) throw new Error(`dépôt du fichier : ${error.message}`);
    return { path: data.path, nom: `Itineraire ${a.depart} - ${a.arrivee}.pdf`.replace(/[\\/]/g, "-") };
  } catch (e) {
    const raison = e instanceof Error ? e.message : String(e);
    console.error("[ndf] relevé d'itinéraire non généré :", raison);
    return { erreur: raison };
  }
}

/**
 * Produit et attache le relevé d'itinéraire d'une ligne de déplacement.
 * Renvoie false si la ligne n'est pas un trajet ou si le relevé a échoué.
 */
export async function produireReleveTrajet(supabase: SupabaseClient, ligneId: string): Promise<string | null> {
  const { data: l } = await supabase
    .from("ligne_note_frais")
    .select("depart, arrivee, date, distance_km, aller_retour, conso_l_100km, prix_carburant, peages, tarif_km, vehicule_id")
    .eq("id", ligneId)
    .single();
  if (!l?.depart || !l?.arrivee) return "cette ligne n'est pas un déplacement (ni départ ni arrivée)";

  const { data: veh } = l.vehicule_id
    ? await supabase.from("vehicule").select("nom").eq("id", l.vehicule_id).maybeSingle()
    : { data: null };

  const mode: ModeTrajet = l.tarif_km != null ? "bareme" : "reel";
  const km = Number(l.distance_km ?? 0);
  const carburant = Math.round((km * Number(l.conso_l_100km ?? 0) * Number(l.prix_carburant ?? 0)) / 100 * 100) / 100;
  const peages = Number(l.peages ?? 0);
  const detail = {
    km,
    carburant,
    peages,
    total: mode === "bareme"
      ? Math.round(km * Number(l.tarif_km ?? 0) * 100) / 100
      : Math.round((carburant + peages) * 100) / 100,
  };

  const releve = await releveItineraire(supabase, {
    depart: l.depart,
    arrivee: l.arrivee,
    date: l.date,
    // Le détail stocké ne dit pas si les péages ont été évités ; on retrace
    // l'itinéraire standard, celui qui correspond à la distance enregistrée.
    eviterPeages: false,
    allerRetour: l.aller_retour === true,
    mode,
    conso: Number(l.conso_l_100km ?? 0),
    prixCarburant: Number(l.prix_carburant ?? 0),
    tarifKm: Number(l.tarif_km ?? 0),
    detail,
    vehicule: veh?.nom ?? null,
  });
  if ("erreur" in releve) return releve.erreur;

  await supabase
    .from("ligne_note_frais")
    .update({ justificatif_url: releve.path, justificatif_nom: releve.nom })
    .eq("id", ligneId);
  return null;
}
