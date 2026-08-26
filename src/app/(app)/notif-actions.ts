"use server";

import { createClient } from "@/lib/supabase/server";
import { getMembreActuel } from "@/lib/membre";

/** Marque des notifications comme lues pour le membre courant (persistant, multi-appareils). */
export async function marquerNotificationsLues(ids: string[]) {
  if (!ids.length) return;
  const supabase = await createClient();
  const membre = await getMembreActuel(supabase);
  if (!membre) return;
  await supabase
    .from("notification_lue")
    .upsert(ids.map((notif_id) => ({ membre_id: membre.id, notif_id })), { onConflict: "membre_id,notif_id" });
}
