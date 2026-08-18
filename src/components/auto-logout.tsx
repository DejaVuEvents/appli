"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "@/app/login/actions";

// Déconnexion automatique après inactivité (sécurité, comme les sites bancaires).
const INACTIF_MINUTES = 30; // délai total d'inactivité avant déconnexion
const AVERTIR_AVANT_S = 60; // avertissement affiché N secondes avant

export function AutoLogout({ minutes = INACTIF_MINUTES }: { minutes?: number }) {
  const [avert, setAvert] = useState(false);
  const [reste, setReste] = useState(AVERTIR_AVANT_S);
  const [monte, setMonte] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tWarn = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tOut = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const dernierReset = useRef(0);

  useEffect(() => {
    setMonte(true);
    const totalMs = minutes * 60 * 1000;

    const clearAll = () => {
      if (tWarn.current) clearTimeout(tWarn.current);
      if (tOut.current) clearTimeout(tOut.current);
      if (tTick.current) clearInterval(tTick.current);
    };

    const armer = () => {
      clearAll();
      setAvert(false);
      tWarn.current = setTimeout(() => {
        setAvert(true);
        setReste(AVERTIR_AVANT_S);
        tTick.current = setInterval(() => setReste((r) => Math.max(0, r - 1)), 1000);
      }, totalMs - AVERTIR_AVANT_S * 1000);
      tOut.current = setTimeout(() => formRef.current?.requestSubmit(), totalMs);
    };

    // Réinitialise sur activité (throttle : au plus une fois / 5 s).
    const onActivite = () => {
      const now = Date.now();
      if (now - dernierReset.current < 5000) return;
      dernierReset.current = now;
      armer();
    };

    const evts = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    evts.forEach((e) => window.addEventListener(e, onActivite, { passive: true }));
    armer();

    return () => {
      clearAll();
      evts.forEach((e) => window.removeEventListener(e, onActivite));
    };
  }, [minutes]);

  const resterConnecte = () => {
    dernierReset.current = Date.now();
    setAvert(false);
    // Ré-arme via un faux événement d'activité.
    window.dispatchEvent(new Event("mousemove"));
  };

  return (
    <>
      <form ref={formRef} action={signOut} className="hidden" />
      {monte && avert && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
          <div className="animate-popin w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <h2 className="text-base font-semibold">Toujours là ?</h2>
            <p className="mt-1.5 text-sm text-muted">Par sécurité, tu seras déconnecté dans <strong className="text-foreground">{reste}s</strong> pour cause d&apos;inactivité.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => formRef.current?.requestSubmit()} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background">Se déconnecter</button>
              <button type="button" onClick={resterConnecte} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Rester connecté</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
