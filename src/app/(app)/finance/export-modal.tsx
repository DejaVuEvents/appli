"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

/** Bouton « Exporter » ouvrant une popup : plage de dates + format CSV/PDF + téléchargement. */
export function ExportModal({ annee }: { annee: number }) {
  const [debut, setDebut] = useState(`${annee}-01-01`);
  const [fin, setFin] = useState(`${annee}-12-31`);
  const [format, setFormat] = useState<"csv" | "pdf">("csv");

  const href = `/finance/export${format === "pdf" ? "/pdf" : ""}?debut=${debut}&fin=${fin}`;
  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  return (
    <Modal
      trigger={<>Exporter</>}
      title="Exporter le journal"
      panelClassName="max-w-md"
      triggerClassName="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Du</span>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Au</span>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className={input} />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-xs text-muted">Format</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat("csv")}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${format === "csv" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-background"}`}
            >
              CSV (Excel)
            </button>
            <button
              type="button"
              onClick={() => setFormat("pdf")}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${format === "pdf" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-background"}`}
            >
              📄 PDF
            </button>
          </div>
        </div>

        <a
          href={href}
          className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Télécharger
        </a>
        <p className="text-xs text-muted">
          Le {format === "pdf" ? "PDF" : "fichier CSV"} inclut le solde cumulé projeté. Le CSV s&apos;ouvre dans Excel / Google Sheets.
        </p>
      </div>
    </Modal>
  );
}
