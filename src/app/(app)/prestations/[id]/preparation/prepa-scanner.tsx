"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scannerPourCharger, remplacerUnite, type ResultatScan } from "./actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Feedback = { kind: "ok" | "warn" | "info"; title: string; detail?: string; attendus?: string[] };

function resultToFeedback(r: ResultatScan): Feedback {
  switch (r.status) {
    case "ok": return { kind: "ok", title: `✓ ${r.label} chargé` };
    case "deja": return { kind: "info", title: `${r.label} : déjà chargé` };
    case "mauvais_objet": return {
      kind: "warn",
      title: `⚠ Mauvais objet — ${r.label}`,
      detail: r.attendus.length
        ? `Cette unité n'est pas prévue. À charger pour « ${r.refNom} » :`
        : `Cette unité n'est pas prévue et toutes les « ${r.refNom} » prévues sont déjà chargées.`,
      attendus: r.attendus,
    };
    case "hors_presta": return { kind: "warn", title: `⚠ ${r.label} n'est pas prévu pour cette prestation` };
    case "inconnu": return { kind: "warn", title: "⚠ Étiquette inconnue", detail: r.code };
  }
}

/** Scanner de chargement : charge l'unité scannée si elle est prévue, sinon avertit. */
export function PrepaScanner({ prestationId }: { prestationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function traiter(code: string) {
    const cleaned = code.trim();
    if (!cleaned || busyRef.current) return;
    // Anti-rebond : ignore le même code scanné dans les 2,5 s.
    const now = Date.now();
    if (lastRef.current.code === cleaned && now - lastRef.current.t < 2500) return;
    lastRef.current = { code: cleaned, t: now };
    busyRef.current = true;
    startTransition(async () => {
      const res = await scannerPourCharger(prestationId, cleaned);
      setFeedback(resultToFeedback(res));
      if (res.status === "ok") router.refresh();
      busyRef.current = false;
    });
  }

  function close() {
    stopCamera();
    setOpen(false);
    setFeedback(null);
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function start() {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        tick();
      } catch {
        setError("Caméra inaccessible — autorise l'accès ou saisis le code manuellement.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth, h = video.videoHeight;
        if (w && h) {
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const found = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (found?.data) traiter(found.data);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => { cancelled = true; stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fbCls = feedback?.kind === "ok"
    ? "bg-green-100 text-green-900 border-green-300"
    : feedback?.kind === "info"
      ? "bg-blue-100 text-blue-900 border-blue-300"
      : "bg-amber-100 text-amber-900 border-amber-300";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        📷 Scanner au chargement
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            <div className="flex items-center justify-between text-white">
              <span className="text-sm font-medium">Scanner au chargement</span>
              <button type="button" onClick={close} className="rounded-lg bg-white/10 px-3 py-1 text-sm">Fermer ✕</button>
            </div>
            <div className="relative my-3 flex-1 overflow-hidden rounded-xl bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-x-8 inset-y-12 rounded-xl border-2 border-white/70" />
            </div>

            {feedback && (
              <div className={`mb-2 rounded-lg border px-3 py-2 text-sm ${fbCls}`}>
                <p className="font-semibold">{feedback.title}</p>
                {feedback.detail && <p className="mt-0.5 text-xs">{feedback.detail}</p>}
                {feedback.attendus && feedback.attendus.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs font-medium">
                    {feedback.attendus.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                )}
              </div>
            )}

            {error && <p className="mb-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">{error}</p>}
            <form onSubmit={(e) => { e.preventDefault(); traiter(manual); setManual(""); }} className="flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Code QR / n° (saisie manuelle)"
                className="flex-1 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none"
              />
              <button type="submit" disabled={pending} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-50">Valider</button>
            </form>
            <p className="mt-2 text-center text-xs text-white/60">Scanne les unités une à une : chargées automatiquement, avec alerte si l&apos;objet n&apos;est pas prévu.</p>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </>
  );
}

/** Bouton « Remplacer » : bascule vers une autre unité disponible de la même référence. */
export function RemplacerBtn({ prestationId, uniteId }: { prestationId: string; uniteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function remplacer() {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await remplacerUnite(prestationId, uniteId);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        title="Remplacer par une autre unité disponible"
        className="rounded-lg border border-border px-2 py-2 text-sm text-muted hover:bg-background disabled:opacity-50"
      >
        {pending ? "…" : "⇄"}
      </button>
      {msg && <span className={`text-[11px] ${msg.ok ? "text-green-600" : "text-amber-600"}`}>{msg.text}</span>}
      <ConfirmDialog
        open={confirmOpen}
        message="Remplacer cette unité (cassée / inaccessible) par une autre unité disponible ?"
        confirmLabel="Remplacer"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remplacer}
      />
    </div>
  );
}
