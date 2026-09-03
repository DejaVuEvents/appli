"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Notif } from "@/lib/notifications";
import { marquerNotificationsLues, masquerNotification } from "@/app/(app)/notif-actions";

export function NotificationBell({ notifications: toutes, lues: luesServeur = [] }: { notifications: Notif[]; lues?: string[] }) {
  const [open, setOpen] = useState(false);
  // Masquées à la croix : retirées tout de suite, la persistance suit côté serveur.
  const [masquees, setMasquees] = useState<Set<string>>(new Set());
  const notifications = toutes.filter((n) => !masquees.has(n.id));
  const [lues, setLues] = useState<Set<string>>(new Set());
  const [monte, setMonte] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L'état « lu » vient du serveur (persistant, partagé entre appareils).
  useEffect(() => {
    setLues(new Set(luesServeur));
    setMonte(true);
  }, [luesServeur]);

  const nonLues = notifications.filter((n) => !lues.has(n.id));
  const aDuNonLu = monte && nonLues.length > 0;

  const masquer = (id: string) => {
    setMasquees((p) => new Set([...p, id]));
    void masquerNotification(id);
  };

  const marquerLues = () => {
    const nouvelles = notifications.map((n) => n.id).filter((id) => !lues.has(id));
    if (!nouvelles.length) return;
    setLues((p) => new Set([...p, ...nouvelles]));
    void marquerNotificationsLues(nouvelles);
  };

  const ouvrir = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
    marquerLues();
  };
  const fermerBientot = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <div className="relative" onMouseEnter={ouvrir} onMouseLeave={fermerBientot}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : ouvrir())}
        className="relative rounded-lg border border-border p-2 hover:bg-background"
        aria-label="Notifications"
        title="Notifications"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {aDuNonLu && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Notifications</div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">Aucune notification.</div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <div key={n.id} className={`group/notif flex items-start gap-2 border-b border-border/60 px-4 py-3 text-sm last:border-0 ${n.cls}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.cls?.includes("red") ? "bg-red-500" : n.cls?.includes("amber") ? "bg-amber-500" : "bg-primary"}`} />
                  <Link href={n.href} onClick={() => setOpen(false)} className="min-w-0 flex-1 hover:opacity-90">
                    {n.text}
                  </Link>
                  <button
                    type="button"
                    onClick={() => masquer(n.id)}
                    aria-label="Supprimer cette notification"
                    title="Supprimer cette notification"
                    className="-mr-1 shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-foreground group-hover/notif:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
