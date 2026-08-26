"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { groupesVisibles, navHrefActif, type Group } from "./nav";
import type { RoleMembre } from "@/lib/membre";

export function MobileMenu({ role = "membre" }: { role?: RoleMembre }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vueLocation = searchParams?.get("vue") === "location";
  const hrefActive = (_p: string, href: string) => navHrefActif(pathname, vueLocation, href);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const groups = groupesVisibles(role);

  // Ouvre par défaut l'accordéon du groupe correspondant à la page courante.
  useEffect(() => {
    const g = groups.find((x) => x.children?.some((c) => hrefActive(pathname, c.href)));
    setExpanded(g?.label ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Verrouille le défilement de l'arrière-plan quand le tiroir est ouvert.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const groupActive = (g: Group) =>
    hrefActive(pathname, g.href) || (g.children?.some((c) => hrefActive(pathname, c.href)) ?? false);

  return (
    <>
      {/* Bouton hamburger (mobile) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        className="md:hidden rounded-lg border border-border p-2 hover:bg-background"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      {/* Tiroir latéral + fond — rendu via un portail sur <body> pour échapper au
          `backdrop-filter` du header (qui casse sinon le position:fixed). */}
      {mounted && createPortal(
        <div className="md:hidden fixed inset-0 z-[60]" style={{ pointerEvents: open ? "auto" : "none" }} aria-hidden={!open}>
        {/* Fond assombri/flou */}
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
            opacity: open ? 1 : 0, transition: "opacity 0.25s ease",
          }}
        />
        {/* Tiroir */}
        <div
          className="border-r border-border bg-surface shadow-2xl"
          style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: "17rem", maxWidth: "85vw",
            transform: open ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* En-tête du tiroir */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Link href="/" onClick={() => setOpen(false)} aria-label="Accueil">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Déjà Vu" className="h-8 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-blanc.png" alt="Déjà Vu" className="hidden h-8 w-auto dark:block" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
              className="rounded-lg border border-border p-1.5 text-muted hover:bg-background"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {groups.map((g) => {
              const active = groupActive(g);
              if (!g.children) {
                return (
                  <Link
                    key={g.label}
                    href={g.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-background"
                    }`}
                  >
                    {g.icon}
                    {g.label}
                  </Link>
                );
              }
              const isOpen = expanded === g.label;
              return (
                <div key={g.label}>
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => (e === g.label ? null : g.label))}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? "text-primary" : "text-foreground hover:bg-background"
                    }`}
                  >
                    {g.icon}
                    {g.label}
                    <svg
                      className="ml-auto h-4 w-4 opacity-60"
                      style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.22s ease" }}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {/* Sous-onglets — hauteur animée via grid-template-rows */}
                  <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
                    <div style={{ overflow: "hidden" }}>
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                        {g.children.map((c) => (
                          <Link
                            key={c.href}
                            href={c.href}
                            onClick={() => setOpen(false)}
                            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                              hrefActive(pathname, c.href) ? "bg-background font-medium text-primary" : "text-foreground hover:bg-background"
                            }`}
                          >
                            {c.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
      </div>,
      document.body)}
    </>
  );
}
