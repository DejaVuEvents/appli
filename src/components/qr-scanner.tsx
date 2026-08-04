"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Scanner QR intégré (caméra arrière) qui ouvre la fiche unité scannée (/u/{code}).
 * Décodage via jsQR (fonctionne sur iOS Safari, contrairement à BarcodeDetector).
 * Fallback : saisie manuelle du code. Nécessite HTTPS (OK sur Vercel).
 */
export function QrScanner({ label = "📷 Scanner une étiquette QR" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function go(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    let dest = `/u/${encodeURIComponent(cleaned)}`;
    try {
      const u = new URL(cleaned);
      const m = u.pathname.match(/\/u\/(.+)$/);
      if (m) dest = `/u/${m[1]}`;
    } catch {
      /* pas une URL → code brut */
    }
    stopCamera();
    setOpen(false);
    router.push(dest);
  }

  function close() {
    stopCamera();
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function start() {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
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
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              go(code.data);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            <div className="flex items-center justify-between text-white">
              <span className="text-sm font-medium">Scanner une étiquette QR</span>
              <button type="button" onClick={close} className="rounded-lg bg-white/10 px-3 py-1 text-sm">Fermer ✕</button>
            </div>
            <div className="relative my-3 flex-1 overflow-hidden rounded-xl bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-x-8 inset-y-12 rounded-xl border-2 border-white/70" />
            </div>
            {error && <p className="mb-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">{error}</p>}
            <form onSubmit={(e) => { e.preventDefault(); go(manual); }} className="flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Code QR / n° (saisie manuelle)"
                className="flex-1 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none"
              />
              <button type="submit" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black">Ouvrir</button>
            </form>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </>
  );
}
