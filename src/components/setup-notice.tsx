/** Affiché tant que les variables d'environnement Supabase ne sont pas renseignées. */
export function SetupNotice() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-bold">Connexion à la base de données requise</h1>
        <p className="text-sm text-muted mt-2">
          L&apos;application n&apos;est pas encore reliée à Supabase. Renseigne les deux
          variables dans le fichier <code className="rounded bg-background px-1">.env.local</code>,
          puis redémarre le serveur.
        </p>
        <ol className="mt-4 space-y-2 text-sm list-decimal list-inside">
          <li>Crée un projet sur <strong>supabase.com</strong> (gratuit).</li>
          <li>Project Settings → API : copie l&apos;<strong>URL</strong> et la clé <strong>anon</strong>.</li>
          <li>
            Colle-les dans <code className="rounded bg-background px-1">.env.local</code> :
            <pre className="mt-2 rounded-lg bg-background p-3 text-xs overflow-x-auto">{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}</pre>
          </li>
          <li>Exécute le SQL de <code className="rounded bg-background px-1">docs/schema_deja_vu.sql</code> dans l&apos;éditeur SQL Supabase.</li>
          <li>Relance <code className="rounded bg-background px-1">npm run dev</code>.</li>
        </ol>
      </div>
    </main>
  );
}
