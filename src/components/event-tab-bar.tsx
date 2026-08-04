import Link from "next/link";
import { getMembreActuel } from "@/lib/membre";

export type EventTab = "infos" | "devis" | "technique" | "planification" | "preparation";

const TABS: { key: EventTab; label: string }[] = [
  { key: "infos", label: "Infos" },
  { key: "devis", label: "Devis & Factures" },
  { key: "technique", label: "Technique" },
  { key: "planification", label: "Planning" },
  { key: "preparation", label: "Préparation" },
];

function tabHref(eventId: string, tab: EventTab): string {
  switch (tab) {
    case "infos": return `/prestations/${eventId}`;
    case "devis": return `/prestations/${eventId}?tab=devis`;
    case "technique": return `/prestations/${eventId}/technique`;
    case "planification": return `/planification/${eventId}`;
    case "preparation": return `/prestations/${eventId}/preparation`;
  }
}

export async function EventTabBar({ eventId, active }: { eventId: string; active: EventTab }) {
  // Le rôle technique n'a pas accès aux devis/factures → on masque l'onglet.
  const moi = await getMembreActuel();
  const tabs = moi?.role === "co_president" ? TABS : TABS.filter((t) => t.key !== "devis");
  return (
    <div className="print:hidden">
      <Link href="/planification" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">← Événements</Link>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <nav className="flex w-max gap-1 rounded-xl border border-border bg-surface p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={tabHref(eventId, t.key)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active === t.key
                ? "border border-border bg-background shadow-sm"
                : "text-muted hover:text-foreground"
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
