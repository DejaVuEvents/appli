"use client";

import { useRef, useState } from "react";

/** Zone de glisser-déposer autour d'un <input type="file"> (utilisable dans un <form action=…>). */
export function FileDropzone({ name, accept }: { name: string; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  function assign(files: FileList | null) {
    if (ref.current && files && files.length) {
      ref.current.files = files; // les fichiers déposés deviennent ceux de l'input → soumis avec le form
      setFileName(files[0].name);
    }
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
        className="hidden"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
      {fileName ? (
        <span className="font-medium">{fileName}</span>
      ) : (
        <span className="text-muted">Glisser un justificatif ici, ou cliquer pour choisir (photo / PDF)</span>
      )}
    </div>
  );
}
