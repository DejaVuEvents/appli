import Link from "next/link";
import { Nav } from "@/components/nav";
import { MobileMenu } from "@/components/mobile-menu";
import { ProfileMenu } from "@/components/profile-menu";
import { SetupNotice } from "@/components/setup-notice";
import { NotificationBell } from "@/components/notification-bell";
import { AutoLogout } from "@/components/auto-logout";
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
  // État « lu » persistant (par membre) : la pastille rouge ne réapparaît plus à tort.
  const { data: luesData } = moi
    ? await supabase.from("notification_lue").select("notif_id, masquee").eq("membre_id", moi.id)
    : { data: [] };
  const lignesLues = (luesData ?? []) as { notif_id: string; masquee: boolean | null }[];
  const notifsLues = lignesLues.map((l) => l.notif_id);
  // Notifications supprimées à la croix : elles ne réapparaissent plus.
  const masquees = new Set(lignesLues.filter((l) => l.masquee).map((l) => l.notif_id));
  const notifsVisibles = notifications.filter((n) => !masquees.has(n.id));

  return (
    <div className="min-h-dvh">
      {/* Décalage du contenu / largeur sidebar — inline pour être insensible au cache du bundler. */}
      <style>{`@media (min-width:768px){.app-shift{padding-left:13rem}.app-sidebar{width:13rem}}\n/* Chaque page pose son propre max-width : on les centre toutes d'un coup. */\nmain > *{margin-left:auto;margin-right:auto}`}</style>
      <AutoLogout />
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
            <NotificationBell notifications={notifsVisibles} lues={notifsLues} />
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
