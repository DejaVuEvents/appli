"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Notif } from "@/lib/notifications";

const LS_KEY = "dejavu_notifs_lues";

export function NotificationBell({ notifications }: { notifications: Notif[] }) {
  const [open, setOpen] = useState(false);
  const [lues, setLues] = useState<Set<string>>(new Set());
  const [monte, setMonte] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charge l'état « lu » depuis le localStorage au montage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setLues(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
    setMonte(true);
  }, []);

  const nonLues = notifications.filter((n) => !lues.has(n.id));
  const aDuNonLu = monte && nonLues.length > 0;

  const marquerLues = () => {
    const ids = notifications.map((n) => n.id);
    setLues(new Set(ids));
    try { localStorage.setItem(LS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
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
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-2 border-b border-border/60 px-4 py-3 text-sm last:border-0 hover:opacity-90 ${n.cls}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.cls?.includes("red") ? "bg-red-500" : n.cls?.includes("amber") ? "bg-amber-500" : "bg-primary"}`} />
                  <span className="min-w-0">{n.text}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
