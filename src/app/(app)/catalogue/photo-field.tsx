"use client";

import { useRef, useState } from "react";

/**
 * Champ photo : vignette à gauche, actions à droite.
 *
 * Le `<input type="file">` natif affiche son bouton et son « no file selected » dans la
 * langue du navigateur, d'où le mélange anglais/français. On le masque et on pilote un
 * bouton à nous, en français, qui affiche le nom du fichier choisi.
 */
export function PhotoField({ photoUrl }: { photoUrl?: string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [supprimer, setSupprimer] = useState(false);

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">Photo / illustration</span>
      <div className="flex items-start gap-3">
        {photoUrl && !supprimer && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Photo actuelle"
            className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background"
            >
              {photoUrl && !supprimer ? "Changer la photo" : "Choisir une photo"}
            </button>
            <span className="min-w-0 truncate text-xs text-muted">
              {nomFichier ?? "Aucun fichier sélectionné"}
            </span>
          </div>

          <input
            ref={ref}
            type="file"
            name="photo"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setNomFichier(e.target.files?.[0]?.name ?? null)}
          />

          {photoUrl &&
            (supprimer ? (
              <div className="flex items-center gap-2 text-xs">
                <input type="hidden" name="remove_photo" value="1" />
                <span className="text-red-600">Photo retirée à l&apos;enregistrement</span>
                <button type="button" onClick={() => setSupprimer(false)} className="text-muted underline hover:text-foreground">
                  Annuler
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setSupprimer(true)} className="block text-xs text-red-600 hover:underline">
                Supprimer la photo
              </button>
            ))}
          <p className="text-xs text-muted">JPG, PNG ou WebP · max 5 Mo</p>
        </div>
      </div>
    </div>
  );
}
