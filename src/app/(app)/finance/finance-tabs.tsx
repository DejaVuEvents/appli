"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/finance", label: "Tableau de bord" },
  { href: "/finance/synthese", label: "Synthèse" },
  { href: "/finance/journal", label: "Journal" },
  { href: "/finance/previsionnel", label: "Prévisionnel" },
  { href: "/finance/fournisseurs", label: "Fournisseurs" },
  { href: "/finance/roi", label: "ROI matériel" },
  { href: "/finance/qonto", label: "Sync Qonto" },
];

export function FinanceTabs({ annee }: { annee: number }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          // Actif sur la page ET ses sous-pages (ex. /finance/roi/[id]), sauf « /finance »
          // qui ne doit pas s'activer pour tout le reste.
          const active = t.href === "/finance" ? pathname === "/finance" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={`${t.href}?annee=${annee}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                active ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="mb-1 flex items-center gap-2 text-sm">
        <Link href={`${pathname}?annee=${annee - 1}`} className="rounded-md border border-border px-2 py-1 hover:bg-background" aria-label="Année précédente">‹</Link>
        <span className="font-semibold tabular-nums">{annee}</span>
        <Link href={`${pathname}?annee=${annee + 1}`} className="rounded-md border border-border px-2 py-1 hover:bg-background" aria-label="Année suivante">›</Link>
      </div>
    </div>
  );
}
