"use client";

export function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background print:hidden"
    >
      {label}
    </button>
  );
}
