// Résumé de transcript de réunion via l'API Gemini (Google AI Studio — free tier).
//
// Variable d'environnement : GEMINI_API_KEY (clé gratuite à créer sur
// https://aistudio.google.com/apikey — pas de carte bancaire).
// Sans clé, geminiConfigured() = false → le transcript est stocké mais non résumé.

const MODELE = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export type ActionSuggeree = { personne: string; texte: string };
export type ResumeReunion = { resume: string; actions: ActionSuggeree[] };

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
