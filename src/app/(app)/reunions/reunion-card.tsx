"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { dateFr } from "@/lib/format";
import { saveTranscript, genererResume } from "./actions";

type Reunion = {
  id: string;
  titre: string;
  date: string;
  transcript: string | null;
  resume: string | null;
  resume_at: string | null;
};

export function ReunionCard({ reunion, geminiOk }: { reunion: Reunion; geminiOk: boolean }) {
  const [transcript, setTranscript] = useState(reunion.transcript ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [ouvert, setOuvert] = useState(!reunion.resume);

  async function lireFichier(file: File) {
    const texte = await file.text();
    setTranscript((prev) => (prev.trim() ? prev + "\n\n" + texte : texte));
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{reunion.titre}</div>
          <div className="text-xs text-muted">{dateFr(reunion.date)}{reunion.resume_at ? " · résumé généré" : reunion.transcript ? " · transcript enregistré" : ""}</div>
        </div>
        <button onClick={() => setOuvert((o) => !o)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">
          {ouvert ? "Réduire" : "Ouvrir"}
        </button>
      </div>

      {/* Résumé généré */}
      {reunion.resume && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Résumé</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{reunion.resume}</div>
        </div>
      )}

      {ouvert && (
        <div className="mt-4 space-y-3">
          {/* Zone de dépôt / collage */}
          <form action={saveTranscript.bind(null, reunion.id)} className="space-y-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) lireFichier(f);
              }}
              className={`rounded-xl border-2 border-dashed p-3 transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>Glisse un fichier transcript (.txt, .vtt, .srt, .md) ou colle le texte ci-dessous.</span>
                <label className="cursor-pointer rounded-md border border-border px-2 py-1 hover:bg-background">
                  Parcourir…
                  <input
                    type="file"
                    accept=".txt,.md,.vtt,.srt,.text,text/plain"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) lireFichier(f); }}
                  />
                </label>
              </div>
              <textarea
                name="transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={8}
                placeholder="Colle ici le transcript de la réunion (Quill : exporte puis colle)…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <SubmitButton>Enregistrer le transcript</SubmitButton>
              <span className="text-xs text-muted">{transcript.length} caractères</span>
            </div>
          </form>

          {/* Génération du résumé */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            {!geminiOk ? (
              <p className="text-xs text-amber-600">
                Résumé automatique indisponible : ajoute une clé <code>GEMINI_API_KEY</code> (gratuite sur aistudio.google.com/apikey) dans <code>.env.local</code> et Vercel.
              </p>
            ) : reunion.transcript ? (
              <form action={genererResume.bind(null, reunion.id)}>
                <SubmitButton pendingLabel="Génération…">
                  ✨ {reunion.resume ? "Régénérer" : "Générer"} le résumé + actions
                </SubmitButton>
              </form>
            ) : (
              <span className="text-xs text-muted">Enregistre d&apos;abord un transcript pour générer le résumé.</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
