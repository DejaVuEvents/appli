// Synchronisation Google Agenda + Google Meet via OAuth (même compte Google que Drive).
//
// Réutilise GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN.
// ⚠️ Le refresh token doit inclure le scope « calendar.events » :
//    https://www.googleapis.com/auth/calendar.events
// S'il a été généré uniquement pour Drive, relancer scripts/google-oauth-token.mjs
// en ajoutant ce scope. Sans ça (ou sans config), tout est no-op : la réunion est
// quand même enregistrée dans l'app, avec le bouton « Ajouter à Google Agenda » en secours.
import { google } from "googleapis";

export function calendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function getCalendar() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth: oauth2 });
}

export type EvenementCalendar = {
  titre: string;
  date: string; // YYYY-MM-DD
  heureDebut: string | null; // HH:MM
  heureFin: string | null;
  lieu: string | null;
  description: string | null;
  emails: string[];
};

export type ResultatCalendar = {
  eventId: string | null;
  htmlLink: string | null;
  meetUrl: string | null;
};

/**
 * Crée un événement Google Agenda avec lien Meet et invitations e-mail (sendUpdates=all).
 * Renvoie null en cas d'échec (config absente, scope manquant…) — l'appelant continue sans bloquer.
 */
export async function creerEvenementCalendar(ev: EvenementCalendar): Promise<ResultatCalendar | null> {
  if (!calendarConfigured()) return null;
  try {
    const cal = getCalendar();
    const hDebut = ev.heureDebut || "18:00";
    const hFin = ev.heureFin || hDebut;
    // Si l'heure de fin est <= début (ou égale), on ajoute 1h par défaut.
    const finCalc = hFin > hDebut ? hFin : `${String(Math.min(23, parseInt(hDebut) + 1)).padStart(2, "0")}:${hDebut.slice(3)}`;

    const requestId = `dejavu-${ev.date}-${Math.round(Math.random() * 1e9)}`;
    const res = await cal.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: ev.titre,
        location: ev.lieu ?? undefined,
        description: ev.description ?? undefined,
        start: { dateTime: `${ev.date}T${hDebut}:00`, timeZone: "Europe/Paris" },
        end: { dateTime: `${ev.date}T${finCalc}:00`, timeZone: "Europe/Paris" },
        attendees: ev.emails.filter(Boolean).map((email) => ({ email })),
        // Marque l'événement comme créé par l'app → filtré à l'import (pas de doublon).
        extendedProperties: { private: { dejavu: "app" } },
        conferenceData: {
          createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      },
    });
    const data = res.data;
    const meetUrl =
      data.hangoutLink ||
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
      null;
    return { eventId: data.id ?? null, htmlLink: data.htmlLink ?? null, meetUrl };
  } catch (e) {
    console.error("Google Calendar — échec création événement :", (e as Error).message);
    return null;
  }
}

export type GoogleEventLite = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (début)
  dateEnd: string; // YYYY-MM-DD (fin, inclusive)
  heure: string | null; // HH:MM si événement horaire, sinon null (journée entière)
  lieu: string | null;
  htmlLink: string | null;
};

/** Décale une date YYYY-MM-DD de `n` jours (les fins d'événements « journée entière » Google sont exclusives). */
function decaleJour(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * Liste les événements Google Agenda (calendrier principal) sur une fenêtre de dates,
 * hors événements créés par l'app (tag `dejavu`). Renvoie [] si non configuré / échec.
 */
export async function listerEvenementsCalendar(timeMinISO: string, timeMaxISO: string): Promise<GoogleEventLite[]> {
  if (!calendarConfigured()) return [];
  try {
    const cal = getCalendar();
    // Garde-fou : ne jamais bloquer le rendu de la page calendrier plus de 4 s si Google traîne.
    const res = await Promise.race([
      cal.events.list({
        calendarId: "primary",
        timeMin: timeMinISO,
        timeMax: timeMaxISO,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    const items = res.data.items ?? [];
    const out: GoogleEventLite[] = [];
    for (const e of items) {
      if (e.status === "cancelled") continue;
      if (e.extendedProperties?.private?.dejavu === "app") continue; // créé par l'app → déjà affiché
      const startDateTime = e.start?.dateTime ?? null;
      const startDate = e.start?.date ?? null;
      if (!startDateTime && !startDate) continue;
      let date: string, dateEnd: string, heure: string | null;
      if (startDateTime) {
        date = startDateTime.slice(0, 10);
        heure = startDateTime.slice(11, 16);
        dateEnd = (e.end?.dateTime ?? startDateTime).slice(0, 10);
      } else {
        date = startDate!;
        heure = null;
        // Fin « journée entière » exclusive → on retire 1 jour pour l'inclusive.
        const endEx = e.end?.date ?? decaleJour(startDate!, 1);
        dateEnd = decaleJour(endEx, -1);
        if (dateEnd < date) dateEnd = date;
      }
      out.push({
        id: e.id ?? `${date}-${e.summary ?? ""}`,
        title: e.summary ?? "(sans titre)",
        date, dateEnd, heure,
        lieu: e.location ?? null,
        htmlLink: e.htmlLink ?? null,
      });
    }
    return out;
  } catch (err) {
    console.error("Google Calendar — échec listing :", (err as Error).message);
    return [];
  }
}

/** Supprime un événement Google Agenda (best-effort). */
export async function supprimerEvenementCalendar(eventId: string): Promise<void> {
  if (!calendarConfigured()) return;
  try {
    const cal = getCalendar();
    await cal.events.delete({ calendarId: "primary", eventId, sendUpdates: "all" });
  } catch (e) {
    console.error("Google Calendar — échec suppression :", (e as Error).message);
  }
}
