"use client";

import { useEffect, useMemo, useState } from "react";
import type { BookingStatus, CalendarBooking } from "@/lib/types";
import { FORMATS, STATUSES } from "@/lib/types";
import { Select, SubtleButton } from "@/components/ui";
import { addDaysIso } from "@/lib/display";

type ScreenOpt = {
  screen_unique: string;
  exhibitor_id: string | null;
  site_name: string | null;
  screen_name: string | null;
  screen_format: string | null;
};

type ExhibitorOpt = { exhibitor_unique: string; name: string; country: string };

type Filters = {
  format: string;
  country: string;
  exhibitor: string;
  screen: string;
  status: string;
  showHidden: boolean;
  showEarlier: boolean;
};

const EMPTY_FILTERS: Filters = {
  format: "",
  country: "",
  exhibitor: "",
  screen: "",
  status: "",
  showHidden: false,
  showEarlier: false,
};

// v2: the manager filter moved to the portal-wide territory selector, so
// any persisted v1 filters would carry a stale `manager` key.
const STORAGE_KEY = "cj4dplex-calendar-filters-v2";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function CalendarView({
  bookings,
  screens,
  exhibitors,
  isTeam,
}: {
  bookings: CalendarBooking[];
  screens: ScreenOpt[];
  exhibitors: ExhibitorOpt[];
  isTeam: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loaded, setLoaded] = useState(false);

  // Restore persisted filters after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setFilters({ ...EMPTY_FILTERS, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {}
  }, [filters, loaded]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  // Cascading options: country narrows exhibitors, exhibitor narrows
  // screens. (Territory scoping happens server-side, above this.)
  const countries = useMemo(
    () => [...new Set(exhibitors.map((e) => e.country).filter(Boolean))].sort(),
    [exhibitors]
  );
  const exhibitorOpts = useMemo(
    () => exhibitors.filter((e) => !filters.country || e.country === filters.country),
    [exhibitors, filters.country]
  );
  const screenOpts = useMemo(() => {
    const allowedExhibitors = new Set(exhibitorOpts.map((e) => e.exhibitor_unique));
    return screens.filter(
      (s) =>
        (!filters.exhibitor
          ? !filters.country || (s.exhibitor_id && allowedExhibitors.has(s.exhibitor_id))
          : s.exhibitor_id === filters.exhibitor) &&
        (!filters.format || s.screen_format === filters.format)
    );
  }, [screens, exhibitorOpts, filters.exhibitor, filters.country, filters.format]);

  const visible = useMemo(() => {
    return bookings.filter((b) => {
      if (!filters.showHidden && (b.status === "rejected" || b.status === "cancelled"))
        return false;
      if (filters.status && b.status !== filters.status) return false;
      if (filters.format && b.format !== filters.format) return false;
      if (filters.country && b.country !== filters.country) return false;
      if (filters.exhibitor && b.exhibitorId !== filters.exhibitor) return false;
      if (filters.screen && b.screenUnique !== filters.screen) return false;
      return true;
    });
  }, [bookings, filters]);

  // Month range: current month forward to the last booking's run end (min 4
  // months); "show earlier" reveals back to the earliest booking's start.
  const months = useMemo(() => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let start = currentMonth;
    let end = addMonths(currentMonth, 3);
    for (const b of visible) {
      const startD = new Date(b.date + "T00:00:00");
      const endD = new Date(addDaysIso(b.date, b.programmingWeeks * 7 - 1) + "T00:00:00");
      const mStart = new Date(startD.getFullYear(), startD.getMonth(), 1);
      const mEnd = new Date(endD.getFullYear(), endD.getMonth(), 1);
      if (mEnd > end) end = mEnd;
      if (filters.showEarlier && mStart < start) start = mStart;
    }
    const out: Date[] = [];
    for (let m = start; m <= end && out.length < 36; m = addMonths(m, 1)) out.push(m);
    return out;
  }, [visible, filters.showEarlier]);

  // One run per (exhibitor, title, status, start date) - the shape a bulk
  // multi-screen submission arrives in - spanning from its start date to the
  // run's end date (longest programmingWeeks among its merged screens).
  const runs = useMemo(() => {
    const map = new Map<string, PillRun>();
    for (const b of visible) {
      const key = `${b.exhibitorId}|${b.titleNo ?? b.title}|${b.status}|${b.date}`;
      const endIso = addDaysIso(b.date, Math.max(b.programmingWeeks, 1) * 7 - 1);
      let run = map.get(key);
      if (!run) {
        run = {
          key,
          title: b.title,
          posterUrl: b.posterUrl,
          status: b.status,
          exhibitorId: b.exhibitorId,
          exhibitorName: b.exhibitorName,
          country: b.country,
          screens: [],
          startIso: b.date,
          endIso,
        };
        map.set(key, run);
      } else if (endIso > run.endIso) {
        run.endIso = endIso;
      }
      run.screens.push({ id: b.id, screenLabel: b.screenLabel, format: b.format });
    }
    return [...map.values()];
  }, [visible]);

  // Runs shown once, in full, on their start day; a thin continuation strip
  // marks every later day of the run (including across month boundaries) so
  // a multi-week booking doesn't reprint its title on every calendar square.
  const byDate = useMemo(() => {
    const starting = new Map<string, PillRun[]>();
    const continuing = new Map<string, PillRun[]>();
    for (const run of runs) {
      const startList = starting.get(run.startIso) ?? [];
      startList.push(run);
      starting.set(run.startIso, startList);

      // Capped at a year of days: addDaysIso falls back to returning its
      // input unchanged for a malformed date, which would otherwise spin
      // forever here (iso never advancing past an invalid startIso/endIso).
      let iso = addDaysIso(run.startIso, 1);
      for (let guard = 0; guard < 366 && iso > run.startIso && iso <= run.endIso; guard++) {
        const list = continuing.get(iso) ?? [];
        list.push(run);
        continuing.set(iso, list);
        const next = addDaysIso(iso, 1);
        if (next <= iso) break; // didn't advance - malformed date, stop here
        iso = next;
      }
    }
    for (const list of starting.values()) list.sort((a, b) => a.title.localeCompare(b.title));
    for (const list of continuing.values()) list.sort((a, b) => a.title.localeCompare(b.title));
    return { starting, continuing };
  }, [runs]);

  return (
    <div className="space-y-4">
      {/* Sticky filter bar - sticks to the top of the portal's content
          sheet, which is the scroll container. */}
      <div className="sticky top-0 z-30 -mx-7 -mt-6 border-b border-line bg-surface/95 px-7 py-3 backdrop-blur">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Format"
            value={filters.format}
            onChange={(v) => set({ format: v, screen: "" })}
            options={FORMATS.map((f) => ({ value: f, label: f }))}
            allLabel="All formats"
          />
          {isTeam && (
            <>
              <Select
                label="Country"
                value={filters.country}
                onChange={(v) => set({ country: v, exhibitor: "", screen: "" })}
                options={countries.map((c) => ({ value: c, label: c }))}
                allLabel="All countries"
              />
              <Select
                label="Exhibitor"
                value={filters.exhibitor}
                onChange={(v) => set({ exhibitor: v, screen: "" })}
                options={exhibitorOpts.map((e) => ({
                  value: e.exhibitor_unique,
                  label: e.name,
                }))}
                allLabel="All exhibitors"
              />
            </>
          )}
          <Select
            label="Screen"
            value={filters.screen}
            onChange={(v) => set({ screen: v })}
            options={screenOpts.map((s) => ({
              value: s.screen_unique,
              label: [s.site_name, s.screen_name].filter(Boolean).join(" · ") || s.screen_unique,
            }))}
            allLabel="All screens"
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => set({ status: v })}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            allLabel="All statuses"
          />
          <label className="flex items-center gap-1.5 pb-2 text-xs font-medium text-muted">
            <input
              type="checkbox"
              checked={filters.showHidden}
              onChange={(e) => set({ showHidden: e.target.checked })}
            />
            Show rejected / cancelled
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs font-medium text-muted">
            <input
              type="checkbox"
              checked={filters.showEarlier}
              onChange={(e) => set({ showEarlier: e.target.checked })}
            />
            Show earlier months
          </label>
          <SubtleButton onClick={() => setFilters(EMPTY_FILTERS)}>Clear</SubtleButton>
          <p className="ml-auto pb-2 text-xs text-muted">
            {visible.length} booking{visible.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Month columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {months.map((month) => (
          <MonthGrid key={monthKey(month)} month={month} byDate={byDate} isTeam={isTeam} />
        ))}
      </div>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Beyond this a day cell is unreadable; the rest collapse to a "+N more". */
const MAX_PILLS_PER_DAY = 4;

type PillOccurrence = { id: number; screenLabel: string; format: string };
type PillRun = {
  key: string;
  title: string;
  posterUrl: string | null;
  status: BookingStatus;
  exhibitorId: string;
  exhibitorName: string;
  country: string;
  screens: PillOccurrence[];
  startIso: string;
  endIso: string;
};

function MonthGrid({
  month,
  byDate,
  isTeam,
}: {
  month: Date;
  byDate: { starting: Map<string, PillRun[]>; continuing: Map<string, PillRun[]> };
  isTeam: boolean;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const rawFirstWeekday = (new Date(year, m, 1).getDay() + 6) % 7; // Monday = 0
  // Defensive: a NaN weekday (from an invalid upstream date) would otherwise
  // throw "Invalid array length" building the leading blank cells below.
  const firstWeekday = Number.isFinite(rawFirstWeekday) ? rawFirstWeekday : 0;

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: Number.isFinite(daysInMonth) ? daysInMonth : 30 }, (_, i) => i + 1),
  ];

  return (
    <section className="w-135 shrink-0">
      <h2 className="mb-2 text-sm font-semibold">
        {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
      </h2>
      <div className="grid grid-cols-7 gap-px rounded-lg border border-line bg-line overflow-hidden">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-surface px-1.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="bg-surface/60 min-h-20" />;
          const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const starting = byDate.starting.get(iso) ?? [];
          const continuing = byDate.continuing.get(iso) ?? [];
          // A cell with 20+ identical pills is unreadable anyway, and
          // rendering every run on every day of its span is what made this
          // page ship megabytes of DOM. Cap it and summarise the rest.
          const shownStarting = starting.slice(0, MAX_PILLS_PER_DAY);
          const hiddenStarting = starting.length - shownStarting.length;
          return (
            // min-h leaves vertical room for the future occupancy indicator.
            <div key={iso} className="bg-surface min-h-20 px-1 pb-4 pt-0.5">
              <p className="text-[10px] text-muted text-right pr-0.5">{day}</p>
              <div className="space-y-0.5">
                {shownStarting.map((r) => (
                  <Pill key={r.key} run={r} isTeam={isTeam} />
                ))}
                {hiddenStarting > 0 && (
                  <p
                    className="px-1 text-[10px] font-medium text-muted"
                    title={starting
                      .slice(MAX_PILLS_PER_DAY)
                      .map((r) => `${r.title} — ${r.exhibitorName}`)
                      .join("\n")}
                  >
                    +{hiddenStarting} more starting
                  </p>
                )}
                {continuing.length > 0 && <ContinuationBand runs={continuing} />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-confirmed text-white border border-confirmed",
  requested: "bg-requested/15 text-requested border border-dashed border-requested",
  rejected: "bg-foreground/5 text-muted border border-line line-through",
  cancelled: "bg-foreground/5 text-muted border border-line line-through",
};
const STRIP_STYLES: Record<string, string> = {
  confirmed: "bg-confirmed",
  requested: "bg-requested",
  rejected: "bg-foreground/15",
  cancelled: "bg-foreground/15",
};

function runTooltip(r: PillRun, isTeam: boolean) {
  const screenLines = r.screens.map((s) => `${s.format} · ${s.screenLabel}`).join("\n");
  return [
    r.title,
    screenLines,
    isTeam ? `${r.exhibitorName} (${r.country})` : null,
    r.status,
  ]
    .filter(Boolean)
    .join("\n");
}

function Pill({ run: r, isTeam }: { run: PillRun; isTeam: boolean }) {
  return (
    <div
      title={runTooltip(r, isTeam)}
      className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${STATUS_STYLES[r.status]}`}
    >
      {r.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable
        <img
          src={r.posterUrl}
          alt=""
          className="h-6 w-4 shrink-0 rounded-[2px] object-cover"
        />
      ) : (
        <span className="h-6 w-4 shrink-0 rounded-[2px] bg-foreground/10" />
      )}
      <span className="truncate">{r.title}</span>
      {r.screens.length > 1 && (
        <span className="shrink-0 opacity-70">×{r.screens.length}</span>
      )}
    </div>
  );
}

/**
 * Mid-run days for everything still playing, merged into one thin band per
 * status rather than a strip per run: on a busy day 20+ identical strips
 * told the reader nothing and cost 20 DOM nodes. The count and the full
 * list stay available on hover.
 */
function ContinuationBand({ runs }: { runs: PillRun[] }) {
  const byStatus = new Map<BookingStatus, PillRun[]>();
  for (const r of runs) {
    const list = byStatus.get(r.status) ?? [];
    list.push(r);
    byStatus.set(r.status, list);
  }
  return (
    <div className="space-y-0.5 pt-0.5">
      {[...byStatus.entries()].map(([status, list]) => (
        <div
          key={status}
          title={`${list.length} ${status} run${list.length === 1 ? "" : "s"} continuing:\n${list
            .slice(0, 12)
            .map((r) => `${r.title} — ${r.exhibitorName}`)
            .join("\n")}${list.length > 12 ? `\n…and ${list.length - 12} more` : ""}`}
          className={`h-1.5 rounded-full ${STRIP_STYLES[status]}`}
        />
      ))}
    </div>
  );
}
