"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** Contexte donnant accès à la fermeture de la modale depuis un composant enfant
 *  (ex : fermer après un envoi de formulaire réussi). */
const ModalCtx = createContext<{ close: () => void }>({ close: () => {} });
export function useModalClose() {
  return useContext(ModalCtx).close;
}

/** Formulaire à utiliser DANS une modale : exécute l'action serveur puis ferme
 *  la modale en cas de succès (l'action ne doit pas rediriger). */
export function ModalForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}) {
  const close = useModalClose();
  return (
    <form
      className={className}
      action={async (fd) => {
        await action(fd);
        close();
      }}
    >
      {children}
    </form>
  );
}

/** Bouton « Annuler » qui ferme la modale courante. */
export function ModalCancelButton({ label = "Annuler" }: { label?: string }) {
  const close = useModalClose();
  return (
    <button type="button" onClick={close} className="text-sm text-muted hover:underline">
      {label}
    </button>
  );
}

/**
 * Fenêtre modale réutilisable : un bouton déclencheur ouvre une grande popup
 * par-dessus la page, avec l'arrière-plan flouté.
 * Ferme au clic sur le fond, sur ✕ ou avec la touche Échap.
 */
export function Modal({
  trigger,
  title,
  children,
  panelClassName = "max-w-2xl",
  triggerClassName = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90",
  triggerTitle,
}: {
  trigger: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  panelClassName?: string;
  triggerClassName?: string;
  triggerTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName} title={triggerTitle}>
        {trigger}
      </button>
      {open && (
        <div
          onClick={close}
          className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:p-6 print:hidden"
          style={{ zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative my-6 w-full ${panelClassName} rounded-2xl border border-border bg-surface shadow-2xl`}
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold">{title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="rounded-lg p-1.5 text-muted hover:bg-background"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <ModalCtx.Provider value={{ close }}>{children}</ModalCtx.Provider>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
