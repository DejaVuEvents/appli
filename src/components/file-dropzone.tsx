"use client";

import { useRef, useState } from "react";

/** Zone de glisser-déposer autour d'un <input type="file"> (utilisable dans un <form action=…>). */
export function FileDropzone({
  name,
  accept,
  maxMo = 4,
  libelle,
  multiple = false,
  onFile,
}: {
  name: string;
  accept?: string;
  maxMo?: number;
  /** Autorise plusieurs fichiers d'un coup (plusieurs justificatifs pour une écriture). */
  multiple?: boolean;
  /** Texte affiché tant qu'aucun fichier n'est choisi. */
  libelle?: string;
  /** Prévient le parent du fichier retenu (null si retiré), pour dévoiler la suite du formulaire. */
  onFile?: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  // Au-delà de la limite des Server Actions, l'envoi échoue sans message lisible :
  // on refuse le fichier tout de suite en expliquant pourquoi.
  const tropLourd = (f: File) => f.size > maxMo * 1024 * 1024;

  function assign(files: FileList | null) {
    if (!ref.current || !files || !files.length) return;
    const liste = Array.from(files);
    const lourd = liste.find(tropLourd);
    if (lourd) {
      setErreur(`« ${lourd.name} » fait ${(lourd.size / 1024 / 1024).toFixed(1)} Mo — maximum ${maxMo} Mo. Compresse le fichier ou photographie le justificatif.`);
      setFileName(null);
      ref.current.value = "";
      onFile?.(null);
      return;
    }
    ref.current.files = files; // les fichiers déposés deviennent ceux de l'input → soumis avec le form
    setFileName(liste.length > 1 ? `${liste.length} fichiers` : liste[0].name);
    setErreur(null);
    onFile?.(liste[0]);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); assign(e.dataTransfer.files); }}
      onClick={() => ref.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed px-3 py-4 text-center text-sm transition-colors ${
        over ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => assign(e.target.files)}
      />
      {fileName ? (
        <span className="font-medium">{fileName}</span>
      ) : (
        <span className="text-muted">{libelle ?? "Glisser un justificatif ici, ou cliquer pour choisir (photo / PDF)"}</span>
      )}
      {erreur && <p className="mt-1.5 text-xs font-medium text-red-600">{erreur}</p>}
    </div>
  );
}
