"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { peutAcceder } from "@/lib/roles";
import type { RoleMembre } from "@/lib/membre";

type Sub = { href: string; label: string };
type Group = { label: string; href: string; icon: React.ReactNode; children?: Sub[] };

const ICON = "h-5 w-5 shrink-0";

const ALL_GROUPS: Group[] = [
  {
    href: "/",
    label: "Accueil",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/planification",
    label: "Planification",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" /><path d="M14 3v5h5" strokeLinejoin="round" />
        <path d="M9.5 13h5M9.5 16.5h5" strokeLinecap="round" />
      </svg>
    ),
    children: [
      { href: "/planification", label: "Événements" },
      { href: "/prestations", label: "Devis & Factures" },
    ],
  },
  {
    href: "/calendrier",
    label: "Organisation",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
        <path d="M8 13h3M8 17h3" strokeLinecap="round" />
      </svg>
    ),
    children: [
      { href: "/calendrier", label: "Calendrier" },
      { href: "/avancement", label: "Avancement" },
      { href: "/reunions", label: "Réunions" },
      { href: "/equipe", label: "Équipe" },
    ],
  },
  {
    href: "/catalogue",
    label: "Matériel",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    children: [
      { href: "/catalogue", label: "Catalogue" },
      { href: "/inventaire", label: "Inventaire" },
    ],
  },
  {
    href: "/finance",
    label: "Finance",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 17l5-5 3 3 7-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    children: [
      { href: "/finance", label: "Trésorerie" },
      { href: "/notes-frais", label: "Notes de frais" },
    ],
  },
  {
    href: "/clients",
    label: "Annuaire",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8M21 20c0-2.5-1.5-4.6-3.6-5.4" strokeLinecap="round" />
      </svg>
    ),
    children: [
      { href: "/clients", label: "Clients" },
      { href: "/vehicules", label: "Véhicules" },
    ],
  },
];

export function Nav({ role = "co_president" }: { role?: RoleMembre }) {
  const pathname = usePathname();
  const [openMobile, setOpenMobile] = useState<string | null>(null);
  const [openDesktop, setOpenDesktop] = useState<string | null>(null);

  // Masque les liens interdits au rôle courant (la sécurité réelle est côté proxy).
  const groups = ALL_GROUPS
    .map((g) => ({ ...g, children: g.children?.filter((c) => peutAcceder(role, c.href)) }))
    .filter((g) => (g.children ? g.children.length > 0 : peutAcceder(role, g.href)));

  const hrefActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const groupActive = (g: Group) =>
    hrefActive(g.href) || (g.children?.some((c) => hrefActive(c.href)) ?? false);

  return (
    <>
      {/* Sidebar — desktop */}
      <aside style={{ zIndex: 45 }} className="app-sidebar hidden md:flex md:flex-col md:fixed md:inset-y-0 bg-surface border-r border-border print:!hidden">
        <Link href="/" className="flex justify-center px-4 py-5" aria-label="Accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Déjà Vu" className="h-9 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanc.png" alt="Déjà Vu" className="hidden h-9 w-auto dark:block" />
        </Link>
        <nav className="flex-1 px-3 space-y-1">
          {groups.map((g) => (
            <div
              key={g.label}
              style={{ position: "relative" }}
              onMouseEnter={() => g.children && setOpenDesktop(g.label)}
              onMouseLeave={() => setOpenDesktop(null)}
            >
              <Link
                href={g.href}
                onClick={() => setOpenDesktop(null)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  groupActive(g) ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-background"
                }`}
              >
                {g.icon}
                {g.label}
                {g.children && (
                  <svg className="ml-auto h-4 w-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </Link>

              {/* Flyout au survol — positionnement en style inline (indépendant de Tailwind) */}
              {g.children && openDesktop === g.label && (
                <div style={{ position: "absolute", left: "100%", top: 0, zIndex: 50, minWidth: "12rem", paddingLeft: 8 }}>
                  <div className="rounded-xl border border-border bg-surface p-1 shadow-lg" onClick={() => setOpenDesktop(null)}>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</div>
                    {g.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                          hrefActive(c.href) ? "bg-background font-medium text-primary" : "text-foreground hover:bg-background"
                        }`}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Tab bar — mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] print:!hidden">
        {/* Sous-menu mobile (au-dessus de la barre) */}
        {groups.map((g) =>
          g.children && openMobile === g.label ? (
            <div key={g.label} className="absolute bottom-full inset-x-0 mb-px border-t border-border bg-surface p-2 shadow-lg">
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</div>
              <div className="grid grid-cols-2 gap-1">
                {g.children.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={() => setOpenMobile(null)}
                    className={`rounded-lg px-3 py-2 text-sm ${hrefActive(c.href) ? "bg-background font-medium text-primary" : "hover:bg-background"}`}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null,
        )}

        <div className="flex justify-around">
          {groups.map((g) => {
            const active = groupActive(g);
            const cls = `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-primary" : "text-muted"}`;
            return g.children ? (
              <button
                key={g.label}
                onClick={() => setOpenMobile((o) => (o === g.label ? null : g.label))}
                className={cls}
              >
                {g.icon}
                {g.label}
              </button>
            ) : (
              <Link key={g.label} href={g.href} onClick={() => setOpenMobile(null)} className={cls}>
                {g.icon}
                {g.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
