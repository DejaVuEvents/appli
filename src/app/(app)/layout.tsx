import Link from "next/link";
import { Nav } from "@/components/nav";
import { MobileMenu } from "@/components/mobile-menu";
import { ProfileMenu } from "@/components/profile-menu";
import { SetupNotice } from "@/components/setup-notice";
import { NotificationBell } from "@/components/notification-bell";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { getMembreActuel, nomMembre } from "@/lib/membre";
import { urlDocument } from "@/lib/storage";
import { chargerNotifications } from "@/lib/notifications";

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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur md:px-8 print:hidden">
          <MobileMenu role={moi?.role ?? "membre"} />
          <Link href="/" className="md:hidden" aria-label="Accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Déjà Vu" className="h-7 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-blanc.png" alt="Déjà Vu" className="hidden h-7 w-auto dark:block" />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{moi?.prenom?.trim() || (moi?.nom ? nomMembre(moi) : user?.email)}</span>
            <NotificationBell notifications={notifications} />
            <ProfileMenu
              avatarUrl={avatarUrl}
              nom={moi?.prenom?.trim() || (moi?.nom ? nomMembre(moi) : user?.email) || "Compte"}
              email={moi?.email ?? user?.email ?? null}
            />
          </div>
        </header>

        {/* Contenu — padding bas pour la tab bar mobile */}
        <main className="px-4 py-6 pb-10 md:px-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
