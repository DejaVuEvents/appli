"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { euros } from "@/lib/format";
import { Modal } from "@/components/modal";
import { ConfirmButton } from "@/components/confirm-button";
import { ReunionForm } from "./reunion-form";
import { deleteReunion } from "./actions";

type Prestation = {
  id: string;
  nom: string;
  statut: string;
  date_prepa: string | null;
  date_event_debut: string | null;
  date_event_fin: string | null;
  date_retour: string | null;
  client: { nom: string } | null;
};

type Ecriture = {
  id: string;
  date: string;
  denomination: string | null;
  sens: string;
  montant_ttc: number;
  statut: string;
  prestation_id: string | null;
};

type MembreLite = { id: string; prenom: string | null; nom: string | null; email: string | null };

type Reunion = {
  id: string;
  titre: string;
  date: string;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  description: string | null;
  meet_url: string | null;
  google_html_link?: string | null;
  participants: MembreLite[];
};

type MembreLite2 = MembreLite;

type LocationLite = {
  id: string;
  titre: string;
  sens: string;
  client_id: string | null;
  tiers: string | null;
  lieu: string | null;
  date_debut: string;
  date_fin: string;
  montant: number | null;
  statut: string;
};

type Cat = "event" | "prepa" | "retour" | "entree" | "sortie" | "reunion" | "location";

type CalEvent = {
  key: string;
  cat: Cat;
  date: string;
  dateEnd: string;
  title: string;
  subtitle?: string;
  href: string;
  pill: string;
  dot: string;
  reunionId?: string;
  mine: boolean;
};

const CATS: { key: Cat; label: string; dot: string }[] = [
  { key: "event", label: "Événement", dot: "bg-primary" },
  { key: "prepa", label: "Préparation", dot: "bg-blue-400" },
  { key: "retour", label: "Retour matériel", dot: "bg-gray-400" },
  { key: "reunion", label: "Réunion", dot: "bg-indigo-500" },
  { key: "location", label: "Location", dot: "bg-teal-500" },
  { key: "entree", label: "Entrée prévisionnelle", dot: "bg-green-400" },
  { key: "sortie", label: "Sortie prévisionnelle", dot: "bg-amber-400" },
];

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateFr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function nomMembre(m: MembreLite) {
  return `${(m.prenom ?? "").trim()} ${(m.nom ?? "").trim()}`.trim() || m.email?.split("@")[0] || "Membre";
}

/** Lien « Ajouter à Google Agenda » (pré-rempli, avec invités + Meet). */
function googleCalUrl(r: Reunion): string {
  const d = r.date.replace(/-/g, "");
  const t1 = (r.heure_debut ?? "18:00").replace(":", "").padEnd(4, "0") + "00";
  const t2 = (r.heure_fin ?? r.heure_debut ?? "19:00").replace(":", "").padEnd(4, "0") + "00";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: r.titre,
    dates: `${d}T${t1}/${d}T${t2}`,
    details: `${r.description ?? ""}${r.meet_url ? `\n\nGoogle Meet : ${r.meet_url}` : ""}`,
    location: r.lieu ?? "",
  });
  const emails = r.participants.map((p) => p.email).filter(Boolean) as string[];
  let url = `https://calendar.google.com/calendar/render?${params.toString()}`;
  if (emails.length) url += `&add=${encodeURIComponent(emails.join(","))}`;
  return url;
}

function mailtoInvit(r: Reunion): string {
  const emails = r.participants.map((p) => p.email).filter(Boolean) as string[];
  const body = `Bonjour,\n\nVous êtes invité(e) à la réunion « ${r.titre} » le ${dateFr(r.date)}${r.heure_debut ? ` à ${r.heure_debut}` : ""}.${r.lieu ? `\nLieu : ${r.lieu}` : ""}${r.meet_url ? `\nGoogle Meet : ${r.meet_url}` : ""}${r.description ? `\n\n${r.description}` : ""}\n\nÀ bientôt !`;
  return `mailto:${emails.join(",")}?subject=${encodeURIComponent(`Invitation : ${r.titre}`)}&body=${encodeURIComponent(body)}`;
}

function buildEvents(
  prestations: Prestation[],
  ecritures: Ecriture[],
  reunions: Reunion[],
  locations: LocationLite[],
  moiId: string | null,
  mesPrestationIds: Set<string>,
): CalEvent[] {
  const events: CalEvent[] = [];

  for (const p of prestations) {
    const subtitle = p.client?.nom;
    const mine = mesPrestationIds.has(p.id);
    if (p.date_prepa) {
      events.push({ key: `prepa-${p.id}`, cat: "prepa", date: p.date_prepa, dateEnd: p.date_prepa, title: `Prépa · ${p.nom}`, subtitle, href: `/prestations/${p.id}/preparation`, pill: "bg-blue-100 text-blue-800 border border-blue-200", dot: "bg-blue-400", mine });
    }
    if (p.date_event_debut) {
      events.push({ key: `event-${p.id}`, cat: "event", date: p.date_event_debut, dateEnd: p.date_event_fin ?? p.date_event_debut, title: p.nom, subtitle, href: `/prestations/${p.id}`, pill: "bg-primary/10 text-primary border border-primary/25", dot: "bg-primary", mine });
    }
    if (p.date_retour) {
      events.push({ key: `retour-${p.id}`, cat: "retour", date: p.date_retour, dateEnd: p.date_retour, title: `Retour · ${p.nom}`, subtitle, href: `/prestations/${p.id}/preparation`, pill: "bg-gray-100 text-gray-600 border border-gray-200", dot: "bg-gray-400", mine });
    }
  }

  for (const e of ecritures) {
    events.push({
      key: `ecr-${e.id}`,
      cat: e.sens === "entree" ? "entree" : "sortie",
      date: e.date.slice(0, 10),
      dateEnd: e.date.slice(0, 10),
      title: e.denomination ?? (e.sens === "entree" ? "Entrée prévue" : "Sortie prévue"),
      subtitle: `${e.sens === "entree" ? "+" : "−"} ${euros(e.montant_ttc)}`,
      href: `/finance/${e.id}`,
      pill: e.sens === "entree" ? "bg-green-100 text-green-800 border border-green-200" : "bg-amber-100 text-amber-800 border border-amber-200",
      dot: e.sens === "entree" ? "bg-green-400" : "bg-amber-400",
      // Les écritures financières prévisionnelles ne sont rattachées à personne (masquées par « me concerne »).
      mine: e.prestation_id ? mesPrestationIds.has(e.prestation_id) : false,
    });
  }

  for (const r of reunions) {
    events.push({
      key: `reunion-${r.id}`,
      cat: "reunion",
      date: r.date,
      dateEnd: r.date,
      title: `📅 ${r.titre}`,
      subtitle: r.heure_debut ? `${r.heure_debut}${r.heure_fin ? `–${r.heure_fin}` : ""}` : undefined,
      href: `/calendrier`,
      pill: "bg-indigo-100 text-indigo-800 border border-indigo-200",
      dot: "bg-indigo-500",
      reunionId: r.id,
      mine: moiId ? r.participants.some((p) => p.id === moiId) : false,
    });
  }

  for (const l of locations) {
    events.push({
      key: `loc-${l.id}`,
      cat: "location",
      date: l.date_debut,
      dateEnd: l.date_fin || l.date_debut,
      title: `${l.sens === "sortie" ? "↗" : "↘"} ${l.titre}`,
      subtitle: [l.tiers, l.montant != null ? euros(l.montant) : null, l.lieu].filter(Boolean).join(" · ") || undefined,
      href: `/planification?vue=location`,
      pill: "bg-teal-100 text-teal-800 border border-teal-200",
      dot: "bg-teal-500",
      // Locations = logistique d'équipe, considérées comme « me concernant ».
      mine: true,
    });
  }

  return events;
}

function eventsForDay(events: CalEvent[], dateStr: string): CalEvent[] {
  return events.filter((e) => e.date <= dateStr && e.dateEnd >= dateStr);
}

export function CalendarView({
  prestations,
  ecritures,
  reunions = [],
  membres = [],
  locations = [],
  moiId = null,
  mesPrestationIds = [],
}: {
  prestations: Prestation[];
  ecritures: Ecriture[];
  reunions?: Reunion[];
  membres?: MembreLite2[];
  locations?: LocationLite[];
  moiId?: string | null;
  mesPrestationIds?: string[];
}) {
  const today = toYMD(new Date());
  const todayDate = new Date();
  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth() + 1);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [visible, setVisible] = useState<Set<Cat>>(new Set(CATS.map((c) => c.key)));
  const [onlyMine, setOnlyMine] = useState(false);

  const mesPrestaSet = useMemo(() => new Set(mesPrestationIds), [mesPrestationIds]);
  const reunionMap = useMemo(() => new Map(reunions.map((r) => [r.id, r])), [reunions]);
  const allEvents = useMemo(
    () => buildEvents(prestations, ecritures, reunions, locations, moiId, mesPrestaSet),
    [prestations, ecritures, reunions, locations, moiId, mesPrestaSet],
  );
  const events = useMemo(
    () => allEvents.filter((e) => visible.has(e.cat) && (!onlyMine || e.mine)),
    [allEvents, visible, onlyMine],
  );

  const toggleCat = (c: Cat) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };
  const goToday = () => { setYear(todayDate.getFullYear()); setMonth(todayDate.getMonth() + 1); setSelected(null); };

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthEvents = events
    .filter((e) => e.date.startsWith(monthStr) || e.dateEnd.startsWith(monthStr) || (e.date < monthStr + "-00" && e.dateEnd > monthStr + "-31"))
    .sort((a, b) => a.date.localeCompare(b.date));

  const selectedReunion = selected?.reunionId ? reunionMap.get(selected.reunionId) ?? null : null;

  return (
    <div>
      {/* Navigation + créer une réunion */}
      <div className="mb-4 flex items-center gap-2">
        <button onClick={prevMonth} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background">‹</button>
        <h2 className="flex-1 text-center text-lg font-semibold">{MOIS_FR[month - 1]} {year}</h2>
        <button onClick={nextMonth} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background">›</button>
        <button onClick={goToday} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background">Aujourd&apos;hui</button>
        <Modal trigger={<>+ Réunion</>} title="Créer une réunion" panelClassName="max-w-lg">
          <ReunionForm membres={membres} />
        </Modal>
      </div>

      <div className="flex gap-4">
        {/* Grille calendrier */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-[560px] overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-7 border-b border-border bg-surface">
              {JOURS.map((j) => (
                <div key={j} className="py-2.5 text-center text-xs font-semibold text-muted">{j}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) {
                  return <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border/40 bg-surface/30" style={{ borderRight: (i + 1) % 7 === 0 ? "none" : undefined }} />;
                }
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = eventsForDay(events, dateStr);
                const isToday = dateStr === today;
                const isWeekend = (i % 7) >= 5;
                const isLastInRow = (i + 1) % 7 === 0;
                return (
                  <div key={dateStr} className={`min-h-[100px] border-b border-border/40 p-1.5 ${!isLastInRow ? "border-r" : ""} ${isToday ? "bg-primary/5" : isWeekend ? "bg-surface/60" : "bg-background"}`}>
                    <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-primary text-primary-foreground" : "text-foreground/70"}`}>{day}</div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button key={ev.key} onClick={() => setSelected(selected?.key === ev.key ? null : ev)} className={`w-full truncate rounded px-1.5 py-0.5 text-left text-xs leading-snug ${ev.pill} ${selected?.key === ev.key ? "ring-2 ring-primary ring-offset-1" : ""}`} title={`${ev.title}\n${dateFr(ev.date)}${ev.dateEnd !== ev.date ? ` → ${dateFr(ev.dateEnd)}` : ""}${ev.subtitle ? `\n${ev.subtitle}` : ""}`}>{ev.title}</button>
                      ))}
                      {dayEvents.length > 3 && <div className="px-1 text-xs font-medium text-muted">+{dayEvents.length - 3} de plus</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Volet droit desktop : détail + filtres + légende */}
        <div className="hidden w-60 shrink-0 space-y-4 lg:block">
          {/* Détail sélectionné */}
          {selected && (
            <div className="rounded-xl border border-border bg-background p-4">
              <button onClick={() => setSelected(null)} className="mb-3 text-xs text-muted hover:text-foreground">← Retour</button>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {selected.date === selected.dateEnd ? dateFr(selected.date) : `${dateFr(selected.date)} → ${dateFr(selected.dateEnd)}`}
              </p>
              <p className="mb-1 font-semibold leading-snug">{selected.title}</p>
              {selected.subtitle && <p className="mb-3 text-sm text-muted">{selected.subtitle}</p>}

              {selectedReunion ? (
                <ReunionDetail r={selectedReunion} />
              ) : (
                <Link href={selected.href} className="block w-full rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">Ouvrir →</Link>
              )}
            </div>
          )}

          {/* Filtres / légende */}
          <div className="rounded-xl border border-border bg-surface p-3">
            <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-medium">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4 rounded border-border" />
              <span>👤 Ce qui me concerne</span>
            </label>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Afficher</p>
            <div className="space-y-1.5">
              {CATS.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={visible.has(c.key)} onChange={() => toggleCat(c.key)} className="h-4 w-4 rounded border-border" />
                  <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                  <span className={visible.has(c.key) ? "" : "text-muted line-through"}>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Liste du mois */}
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">{MOIS_FR[month - 1]}</p>
            {monthEvents.length === 0 ? (
              <p className="text-xs text-muted">Aucun élément affiché ce mois-ci.</p>
            ) : (
              <div className="space-y-2">
                {monthEvents.map((ev) => (
                  <button key={ev.key} onClick={() => setSelected(ev)} className="flex w-full items-start gap-2 text-left hover:opacity-80">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ev.dot}`} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium leading-snug">{ev.title}</p>
                      <p className="text-[10px] text-muted">{dateFr(ev.date)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filtres mobile */}
      <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
        <button onClick={() => setOnlyMine((v) => !v)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${onlyMine ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"}`}>
          👤 Me concerne
        </button>
        {CATS.map((c) => (
          <button key={c.key} onClick={() => toggleCat(c.key)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${visible.has(c.key) ? "border-border bg-surface" : "border-border/50 text-muted line-through"}`}>
            <span className={`h-2 w-2 rounded-full ${c.dot}`} />
            {c.label}
          </button>
        ))}
      </div>

      {/* Détail mobile */}
      {selected && (
        <div className="mt-4 rounded-xl border border-border bg-background p-4 lg:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {selected.date === selected.dateEnd ? dateFr(selected.date) : `${dateFr(selected.date)} → ${dateFr(selected.dateEnd)}`}
              </p>
              <p className="truncate font-semibold">{selected.title}</p>
              {selected.subtitle && <p className="text-sm text-muted">{selected.subtitle}</p>}
            </div>
            <button onClick={() => setSelected(null)} className="shrink-0 text-xl text-muted hover:text-foreground">✕</button>
          </div>
          <div className="mt-3">
            {selectedReunion ? <ReunionDetail r={selectedReunion} /> : (
              <Link href={selected.href} className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground">Ouvrir →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReunionDetail({ r }: { r: Reunion }) {
  return (
    <div className="space-y-2">
      {r.lieu && <p className="text-xs text-muted">📍 {r.lieu}</p>}
      {r.description && <p className="text-xs">{r.description}</p>}
      {r.participants.length > 0 && (
        <p className="text-xs text-muted">👥 {r.participants.map(nomMembre).join(", ")}</p>
      )}
      {r.meet_url && (
        <a href={r.meet_url} target="_blank" rel="noopener noreferrer" className="block w-full rounded-lg border border-border px-3 py-2 text-center text-sm hover:bg-surface">🎥 Rejoindre le Meet</a>
      )}
      {r.google_html_link ? (
        <a href={r.google_html_link} target="_blank" rel="noopener noreferrer" className="block w-full rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">📅 Voir dans Google Agenda</a>
      ) : (
        <a href={googleCalUrl(r)} target="_blank" rel="noopener noreferrer" className="block w-full rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">📅 Ajouter à Google Agenda</a>
      )}
      {r.participants.some((p) => p.email) && (
        <a href={mailtoInvit(r)} className="block w-full rounded-lg border border-border px-3 py-2 text-center text-sm hover:bg-surface">✉️ Envoyer l&apos;invitation</a>
      )}
      <form action={deleteReunion.bind(null, r.id)}>
        <ConfirmButton confirm="Supprimer cette réunion ?" className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-600 hover:bg-red-100">Supprimer la réunion</ConfirmButton>
      </form>
    </div>
  );
}
