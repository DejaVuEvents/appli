import Link from "next/link";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SetupNotice } from "@/components/setup-notice";
import { NotificationBell } from "@/components/notification-bell";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { getMembreActuel, nomMembre } from "@/lib/membre";
import { urlDocument } from "@/lib/storage";
import { chargerNotifications } from "@/lib/notifications";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!supabaseConfigured) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const moi = await getMembreActuel(supabase);
  const avatarUrl = await urlDocument(supabase, moi?.photo_url);
  const notifications = await chargerNotifications(supabase, moi);

  return (
    <div className="min-h-dvh">
      {/* Décalage du contenu / largeur sidebar — inline pour être insensible au cache du bundler. */}
      <style>{`@media (min-width:768px){.app-shift{padding-left:13rem}.app-sidebar{width:13rem}}`}</style>
      <Nav role={moi?.role ?? "membre"} />
      <div className="app-shift print:pl-0">
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur md:px-8 print:hidden">
          <Link href="/" className="md:hidden" aria-label="Accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Déjà Vu" className="h-7 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-blanc.png" alt="Déjà Vu" className="hidden h-7 w-auto dark:block" />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full border border-border object-cover" />
            ) : null}
            <span className="hidden text-sm text-muted sm:inline">{moi?.prenom?.trim() || (moi?.nom ? nomMembre(moi) : user?.email)}</span>
            <NotificationBell notifications={notifications} />
            <ThemeToggle />
            <Link
              href="/parametres"
              title="Paramètres"
              className="rounded-lg border border-border p-2 hover:bg-background"
              aria-label="Paramètres"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <form action={signOut}>
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background">
                Déconnexion
              </button>
            </form>
          </div>
        </header>

        {/* Contenu — padding bas pour la tab bar mobile */}
        <main className="px-4 py-6 pb-24 md:px-8 md:pb-10 print:p-0">{children}</main>
      </div>
    </div>
  );
}
