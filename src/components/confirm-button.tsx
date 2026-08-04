"use client";

/** Bouton d'envoi (dans un <form action=…>) qui demande confirmation avant de soumettre.
 *  Utile pour les petites suppressions par icône (pont, transport, etc.). */
export function ConfirmButton({
  confirm,
  className,
  title,
  children,
}: {
  confirm: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      title={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
