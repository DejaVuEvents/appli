"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

/**
 * Champ fichier + bouton d'envoi grisé tant qu'aucun fichier n'est choisi.
 *
 * Les Server Actions qui exigent un fichier lèvent une erreur quand le formulaire part
 * à vide, ce qui se traduit par un écran d'erreur. Ici le bouton n'est simplement pas
 * cliquable tant qu'il n'y a rien à envoyer (la validation serveur reste en place).
 */
export function FileSubmit({
  name,
  accept,
  children,
  pendingLabel,
  inputClassName = "",
  buttonClassName = "",
}: {
  name: string;
  accept?: string;
  children: React.ReactNode;
  pendingLabel?: string;
  inputClassName?: string;
  buttonClassName?: string;
}) {
  const [aFichier, setAFichier] = useState(false);
  return (
    <>
      <input
        type="file"
        name={name}
        accept={accept}
        required
        onChange={(e) => setAFichier((e.target.files?.length ?? 0) > 0)}
        className={inputClassName}
      />
      <SubmitButton disabled={!aFichier} pendingLabel={pendingLabel} className={buttonClassName}>
        {children}
      </SubmitButton>
    </>
  );
}
