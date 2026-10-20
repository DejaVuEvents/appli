"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { regenererJetonMcp, revoquerJetonMcp } from "./actions";

/**
 * Jeton d'accès MCP : c'est lui que Claude envoie pour consulter l'outil à la
 * voix. Masqué par défaut, car il vaut identité : qui l'a peut lire ce que ce
 * membre peut lire.
 */
export function JetonMcp({ jeton }: { jeton: string | null }) {
  const [visible, setVisible] = useState(false);
  const [copie, setCopie] = useState(false);

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Accès vocal (Claude)</h2>
        <p className="mt-0.5 text-xs text-muted">
          Ce jeton vaut identité : qui l&apos;a peut consulter ce que tu peux consulter.
        </p>
      </div>

      {jeton ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              {visible ? jeton : "•".repeat(32)}
            </code>
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-background"
            >
              {visible ? "Masquer" : "Afficher"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(jeton);
                setCopie(true);
                setTimeout(() => setCopie(false), 2000);
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-background"
            >
              {copie ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="text-xs text-muted">
            Dans Claude : Connectors, Add custom connector, en-tête{" "}
            <code className="font-mono">Authorization: Bearer &lt;jeton&gt;</code>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <form action={regenererJetonMcp}>
              <SubmitButton
                className="!px-2.5 !py-1.5 !text-xs"
                confirm="Régénérer le jeton ? Les connecteurs qui portaient l'ancien cesseront de répondre."
              >
                Régénérer
              </SubmitButton>
            </form>
            <form action={revoquerJetonMcp}>
              <ConfirmButton
                confirm="Couper l'accès vocal ? Il faudra régénérer un jeton pour le rétablir."
                className="text-xs text-muted hover:text-red-600"
              >
                Couper l&apos;accès
              </ConfirmButton>
            </form>
          </div>
        </>
      ) : (
        <form action={regenererJetonMcp}>
          <SubmitButton className="!px-2.5 !py-1.5 !text-xs">Générer un jeton</SubmitButton>
        </form>
      )}
    </Card>
  );
}
