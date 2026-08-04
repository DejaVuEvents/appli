import { ReinitForm } from "./reinit-form";

export default async function ReinitialiserPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const tokenHash = sp?.token_hash ?? "";
  const type = sp?.type ?? "recovery";

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Déjà Vu" className="mx-auto h-12 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-blanc.png" alt="Déjà Vu" className="mx-auto hidden h-12 w-auto dark:block" />
          <p className="text-sm text-muted mt-3">Nouveau mot de passe</p>
        </div>
        <ReinitForm tokenHash={tokenHash} type={type} />
      </div>
    </main>
  );
}
