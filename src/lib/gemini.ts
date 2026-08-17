// Résumé de transcript de réunion via l'API Gemini (Google AI Studio — free tier).
//
// Variable d'environnement : GEMINI_API_KEY (clé gratuite à créer sur
// https://aistudio.google.com/apikey — pas de carte bancaire).
// Sans clé, geminiConfigured() = false → le transcript est stocké mais non résumé.

// Modèle « lite » : non-thinking, rapide, quota gratuit plus élevé (moins de 429).
// Un fallback vers d'autres modèles est géré dans extraireMaterielPdf.
const MODELE = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export type ActionSuggeree = { personne: string; texte: string };
export type ResumeReunion = { resume: string; actions: ActionSuggeree[] };

export type MaterielLigne = { designation: string; quantite: number; prix_unitaire: number };

/**
 * Extrait les lignes de matériel/prestation d'un devis ou facture (PDF ou image).
 * Renvoie null si non configuré / échec (l'appelant gère le fallback).
 */
export async function extraireMaterielPdf(base64: string, mime: string): Promise<MaterielLigne[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !base64) return null;

  const prompt = [
    "Ce document est un DEVIS ou une FACTURE d'une association de prestation événementielle (son, lumière, structure).",
    "Extrais la liste des lignes de MATÉRIEL / PRESTATION facturées.",
    "Réponds UNIQUEMENT avec un tableau JSON d'objets :",
    '{"designation": string, "quantite": number, "prix_unitaire": number}  (prix unitaire HT).',
    "Ignore les lignes de total, sous-total, TVA, remise globale et frais de transport.",
    "Si une quantité ou un prix est absent, mets 1 et 0. N'invente aucune ligne.",
  ].join("\n");

  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });

  // Modèles candidats : le modèle configuré (lite, non-thinking, quota élevé) puis un
  // fallback si celui-ci n'est plus disponible (404). Retry sur rate-limit / erreur serveur.
  const modeles = [...new Set([MODELE, "gemini-2.5-flash-lite", "gemini-flash-latest"])];
  const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const modele of modeles) {
    for (let essai = 0; essai < 3; essai++) {
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${key}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body },
        );
      } catch (e) {
        console.error("Gemini PDF réseau :", (e as Error).message);
        await attendre(1500);
        continue; // réessaie
      }

      if (res.status === 404) break; // modèle indisponible → modèle suivant
      if (res.status === 429 || res.status >= 500) {
        // Rate limit / erreur serveur : petite attente puis nouvel essai.
        console.error("Gemini PDF", res.status, "— retry", essai + 1);
        await attendre(1500 * (essai + 1));
        continue;
      }
      if (!res.ok) {
        console.error("Gemini PDF HTTP", res.status, (await res.text().catch(() => "")).slice(0, 300));
        break; // erreur non récupérable → modèle suivant
      }

      const data = await res.json().catch(() => null);
      // Concatène le texte de toutes les parties non-« pensée » (modèles thinking).
      const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
      const txt = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("").trim();
      if (!txt) { console.error("Gemini PDF : réponse vide"); break; }
      try {
        const parsed = JSON.parse(txt);
        const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.lignes) ? parsed.lignes : [];
        return arr
          .map((l: Record<string, unknown>) => ({
            designation: String(l.designation ?? "").trim(),
            quantite: Number(l.quantite ?? 1) || 1,
            prix_unitaire: Number(l.prix_unitaire ?? 0) || 0,
          }))
          .filter((l: MaterielLigne) => l.designation);
      } catch (e) {
        console.error("Gemini PDF parse :", (e as Error).message, "·", txt.slice(0, 200));
        break; // JSON invalide → modèle suivant
      }
    }
  }
  return null;
}

/**
 * Résume un transcript de réunion et en extrait des actions par personne.
 * `membres` = noms connus (pour attribuer les actions au bon membre).
 * Renvoie null si non configuré ou en cas d'échec (l'appelant gère le fallback).
 */
export async function resumerTranscript(transcript: string, membres: string[]): Promise<ResumeReunion | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !transcript.trim()) return null;

  const prompt = [
    "Tu es l'assistant de l'association événementielle « Déjà Vu » (prestation son/lumière/structure).",
    "On te donne le TRANSCRIPT BRUT d'une réunion (issu d'une transcription automatique, donc avec des fautes et des mots mal reconnus — corrige-les en te basant sur le contexte technique/événementiel).",
    membres.length ? `Membres de l'équipe : ${membres.join(", ")}.` : "",
    "",
    "Produis un objet JSON STRICT avec exactement ces deux clés :",
    '- "resume" : un résumé clair et structuré en Markdown (sections : Sujets abordés, Décisions, Points bloquants, Prochaines étapes). En français.',
    '- "actions" : un tableau d\'actions concrètes à faire, chacune {"personne": <nom d\'un membre de la liste si identifiable sinon "">, "texte": <action précise et actionnable>}.',
    "N'invente rien qui ne soit pas dans le transcript. Réponds UNIQUEMENT avec le JSON.",
    "",
    "TRANSCRIPT :",
    transcript.slice(0, 100000),
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) {
      console.error("Gemini HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const txt: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!txt) return null;
    const parsed = JSON.parse(txt) as { resume?: string; actions?: ActionSuggeree[] };
    return {
      resume: String(parsed.resume ?? "").trim(),
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.filter((a) => a && a.texte).map((a) => ({ personne: String(a.personne ?? "").trim(), texte: String(a.texte).trim() }))
        : [],
    };
  } catch (e) {
    console.error("Gemini échec :", (e as Error).message);
    return null;
  }
}
