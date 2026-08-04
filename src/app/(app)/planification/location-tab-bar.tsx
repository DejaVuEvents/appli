import Link from "next/link";

export type LocationTab = "infos" | "devis" | "preparation";

const TABS: { key: LocationTab; label: string }[] = [
  { key: "infos", label: "Infos" },
  { key: "devis", label: "Devis & Factures" },
  { key: "preparation", label: "Préparation" },
];

export function LocationTabBar({ locationId, active }: { locationId: string; active: LocationTab }) {
  return (
    <div className="print:hidden">
      <Link href="/planification?vue=location" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Locations</Link>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav className="flex w-max gap-1 rounded-xl border border-border bg-surface p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/planification/location/${locationId}?tab=${t.key}`}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active === t.key ? "border border-border bg-background shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
