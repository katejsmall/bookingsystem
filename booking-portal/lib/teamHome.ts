import "server-only";
import {
  getBookingVMs,
  getContacts,
  getLineup,
  getProductionRequests,
  signedImageUrls,
} from "@/lib/data";
import { isExternalPoster, posterSrc, resolvePosterPath } from "@/lib/posters";
import { addDaysIso, deriveTitleType, titleDisplayName, todayIso } from "@/lib/display";
import { outreachKey, type OutreachMap, type OutreachRecord } from "@/lib/outreach";
import { scopeBookings } from "@/lib/teamScope";
import type { BookingVM, Exhibitor } from "@/lib/types";

type SupabaseClient = Parameters<typeof getBookingVMs>[0];

/** 4DX and ScreenX are the only formats the lineup tracks; Ultra screens
 * are combo installs that book against their base format's lineup row. */
export type BaseFormat = "4DX" | "ScreenX";
function baseFormat(format: string): BaseFormat {
  return format.replace(/^Ultra/, "") === "ScreenX" ? "ScreenX" : "4DX";
}

/** A booking that still counts - rejected/cancelled runs aren't coverage. */
function isLive(b: BookingVM): boolean {
  return b.status === "requested" || b.status === "confirmed";
}

/** Genuine site submissions only; imported rows aren't awaiting a decision. */
function isActionable(b: BookingVM): boolean {
  return b.status === "requested" && !b.importedFrom;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (isNaN(from) || isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** End of a booking's run (inclusive), from its start + programming weeks. */
function runEnd(b: BookingVM): string {
  return addDaysIso(b.date, Math.max(b.programmingWeeks, 1) * 7 - 1);
}

function severityFor(ageDays: number): "ok" | "warn" | "crit" {
  if (ageDays > 7) return "crit";
  if (ageDays > 3) return "warn";
  return "ok";
}

export type ActionGroup = {
  key: string;
  exhibitorName: string;
  title: string;
  posterUrl: string | null;
  playDate: string;
  formats: string[];
  screenCount: number;
  ageDays: number;
  severity: "ok" | "warn" | "crit";
};

export type ReleaseCoverageItem = {
  key: string;
  titleNo: string;
  title: string;
  format: BaseFormat;
  /** The sheet's Hollywood/Local tag. Local-language titles rarely apply
   * outside their home region, so the UI leads with Hollywood. */
  titleType: string | null;
  isWide: boolean;
  posterUrl: string | null;
  releaseDate: string;
  daysUntil: number;
  booked: number;
  capable: number;
  /** Capable exhibitors with no live booking - the chase list. Carries a
   * contact email so the chip can open a pre-filled mail draft. */
  missing: { exhibitorUnique: string; name: string; country: string; email: string | null }[];
};

export type ThisWeekRow = {
  key: string;
  title: string;
  posterUrl: string | null;
  formats: string[];
  exhibitorCount: number;
  exhibitorNames: string[];
  screenCount: number;
  startDate: string;
  endDate: string;
  startsThisWeek: boolean;
};

export type ExhibitorHealth = {
  exhibitorUnique: string;
  name: string;
  country: string;
  formats: string[];
  upcomingCount: number;
  dormant: boolean;
};

export type TeamHomeData = {
  kpis: {
    pending: number;
    pendingOldestAgeDays: number | null;
    upcoming30d: number;
    exhibitorCount: number;
    dormantCount: number;
    releasing8w: number;
    lowCoverage: number;
  };
  actionQueue: { groups: ActionGroup[]; totalGroups: number };
  productionPending: {
    id: number;
    exhibitorName: string;
    titleText: string;
    format: string;
    ageDays: number;
  }[];
  releases: ReleaseCoverageItem[];
  /** Every logged approach, keyed by title|format|exhibitor. Team-wide,
   * not scoped, so cover across territories is visible. */
  outreach: OutreachMap;
  thisWeek: { rows: ThisWeekRow[]; total: number };
  exhibitorHealth: ExhibitorHealth[];
};

/**
 * Everything the team Home page shows, for one territory. Composed from
 * the existing fetchers and reduced here - no new queries, since
 * getBookingVMs already carries status/format/dates/manager per booking.
 */
export async function getTeamHomeData(
  supabase: SupabaseClient,
  scope: string,
  exhibitors: Exhibitor[]
): Promise<TeamHomeData> {
  const today = todayIso();
  const in7 = addDaysIso(today, 7);
  const in30 = addDaysIso(today, 30);
  const in56 = addDaysIso(today, 56);

  // Two narrow reads instead of one wide one. Everything Home shows is
  // current-or-forward, so the main read starts 60 days back (enough to
  // catch multi-week runs still in progress). Pending requests are pulled
  // separately with no date floor, since one can sit in the queue with an
  // old play date and must never silently drop off the action list.
  const [recentBookings, pendingBookings, lineup, allProduction, contacts, outreachRows] =
    await Promise.all([
      getBookingVMs(supabase, { from: addDaysIso(today, -60) }),
      getBookingVMs(supabase, { statuses: ["requested"], siteSubmittedOnly: true }),
      getLineup(supabase, { confirmedOnly: true }),
      getProductionRequests(supabase),
      getContacts(supabase),
      supabase
        .from("title_outreach")
        .select("id, title_no, format, exhibitor_unique, status, note, actioned_by, actioned_at")
        .then((r) => (r.data ?? []) as OutreachRecord[]),
    ]);

  const outreach: OutreachMap = {};
  for (const r of outreachRows) {
    outreach[outreachKey(r.title_no, r.format, r.exhibitor_unique)] = r;
  }

  // First contact email per exhibitor, for the chase list's mail draft.
  const emailByExhibitor = new Map<string, string>();
  for (const c of contacts) {
    if (c.exhibitor_unique && c.email && !emailByExhibitor.has(c.exhibitor_unique)) {
      emailByExhibitor.set(c.exhibitor_unique, c.email);
    }
  }
  // The two reads overlap; de-duplicate by booking id.
  const seen = new Set(recentBookings.map((b) => b.id));
  const allBookings = [...recentBookings, ...pendingBookings.filter((b) => !seen.has(b.id))];

  const bookings = scopeBookings(allBookings, scope);
  const exhibitorIds = new Set(exhibitors.map((e) => e.exhibitor_unique));

  // --- Action queue: pending requests grouped the way they were submitted
  const actionable = bookings.filter(isActionable);
  const groupMap = new Map<string, ActionGroup & { requestedAt: string | null }>();
  for (const b of actionable) {
    const key = `${b.exhibitorId}|${b.titleNo ?? b.title}|${b.date}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.screenCount++;
      if (!existing.formats.includes(b.format)) existing.formats.push(b.format);
      if (b.requestedAt && (!existing.requestedAt || b.requestedAt < existing.requestedAt)) {
        existing.requestedAt = b.requestedAt;
      }
    } else {
      groupMap.set(key, {
        key,
        exhibitorName: b.exhibitorName,
        title: b.title,
        posterUrl: b.posterUrl,
        playDate: b.date,
        formats: [b.format],
        screenCount: 1,
        ageDays: 0,
        severity: "ok",
        requestedAt: b.requestedAt,
      });
    }
  }
  const groups = [...groupMap.values()]
    .map((g) => {
      const ageDays = g.requestedAt ? daysBetween(g.requestedAt.slice(0, 10), today) : 0;
      return { ...g, ageDays, severity: severityFor(ageDays) };
    })
    .sort((a, b) => b.ageDays - a.ageDays || a.playDate.localeCompare(b.playDate));

  // --- Coverage: which of my exhibitors haven't booked what's coming up
  const capableFor = (f: BaseFormat) =>
    exhibitors.filter((e) => (f === "4DX" ? !!e["4dx"] || !!e.ultra4dx : !!e.screenx));

  // Live bookings keyed by title+base format, for fast coverage lookups.
  const bookedByTitleFormat = new Map<string, Set<string>>();
  for (const b of bookings) {
    if (!isLive(b) || !b.titleNo) continue;
    const key = `${b.titleNo}|${baseFormat(b.format)}`;
    const set = bookedByTitleFormat.get(key) ?? new Set<string>();
    set.add(b.exhibitorId);
    bookedByTitleFormat.set(key, set);
  }

  // Lineup rows carry raw poster references; resolve each in its own
  // format context and sign the bucket-hosted ones in one batch (TMDB
  // base posters are public URLs and skip signing entirely).
  const lineupPosterPaths = [
    ...new Set(
      lineup
        .map((l) => resolvePosterPath(l.title?.film_imdb_db?.[0], l.format))
        .filter((p): p is string => !!p && !isExternalPoster(p))
    ),
  ];
  const lineupPosterUrls = await signedImageUrls(supabase, lineupPosterPaths);

  const toCoverage = (l: (typeof lineup)[number]): ReleaseCoverageItem => {
    const format = baseFormat(l.format);
    const releaseDate = l.first_available_release_date!;
    const capableList = capableFor(format);
    const bookedSet = bookedByTitleFormat.get(`${l.title_no}|${format}`) ?? new Set<string>();
    const booked = capableList.filter((e) => bookedSet.has(e.exhibitor_unique));
    const titleType = deriveTitleType(l.notes);
    return {
      key: `${l.lineup_id}`,
      titleNo: l.title_no,
      title: titleDisplayName(l.title?.film_imdb_db ?? null, l.title?.erp_title, l.title_no),
      format,
      titleType,
      isWide: titleType === "Hollywood",
      posterUrl: posterSrc(
        resolvePosterPath(l.title?.film_imdb_db?.[0], l.format),
        lineupPosterUrls,
        "w185"
      ),
      releaseDate,
      daysUntil: daysBetween(today, releaseDate),
      booked: booked.length,
      capable: capableList.length,
      missing: capableList
        .filter((e) => !bookedSet.has(e.exhibitor_unique))
        .map((e) => ({
          exhibitorUnique: e.exhibitor_unique,
          name: e.exhibitor_erp ?? e.exhibitor_unique,
          country: e.entity_country ?? "",
          email: emailByExhibitor.get(e.exhibitor_unique) ?? e.manager_email ?? null,
        })),
    };
  };

  const upcomingLineup = lineup
    .filter((l) => !!l.first_available_release_date && l.first_available_release_date >= today)
    .sort((a, b) =>
      (a.first_available_release_date ?? "").localeCompare(b.first_available_release_date ?? "")
    );

  // Wide (Hollywood) releases lead - a local-language title from another
  // region isn't something this territory's exhibitors would ever book, so
  // listing it as "16 to chase" would be noise. Regional titles are still
  // included after them, and the UI can toggle them off.
  const allCoverage = upcomingLineup.map(toCoverage);
  const releases = [
    ...allCoverage.filter((r) => r.isWide).slice(0, 8),
    ...allCoverage.filter((r) => !r.isWide).slice(0, 8),
  ];

  // Low coverage across the whole 8-week window, wide releases only -
  // those are the ones a manager is actually accountable for filling.
  const releasing8wList = allCoverage.filter((r) => r.releaseDate <= in56 && r.isWide);
  const lowCoverage = releasing8wList.filter(
    (r) => r.capable > 0 && r.booked / r.capable < 0.5
  ).length;

  // --- This week on screen, grouped by title. One blockbuster across 20
  // exhibitors is one line the manager scans, not 20.
  const weekMap = new Map<string, ThisWeekRow & { exhibitorSet: Set<string> }>();
  for (const b of bookings) {
    if (!isLive(b)) continue;
    const end = runEnd(b);
    if (end < today || b.date > in7) continue;
    const key = b.titleNo ?? b.title;
    const existing = weekMap.get(key);
    if (existing) {
      existing.screenCount++;
      existing.exhibitorSet.add(b.exhibitorName);
      if (!existing.formats.includes(b.format)) existing.formats.push(b.format);
      if (end > existing.endDate) existing.endDate = end;
      if (b.date < existing.startDate) existing.startDate = b.date;
      existing.startsThisWeek ||= b.date >= today;
    } else {
      weekMap.set(key, {
        key,
        title: b.title,
        posterUrl: b.posterUrl,
        formats: [b.format],
        exhibitorCount: 0,
        exhibitorNames: [],
        exhibitorSet: new Set([b.exhibitorName]),
        screenCount: 1,
        startDate: b.date,
        endDate: end,
        startsThisWeek: b.date >= today,
      });
    }
  }
  const weekRows: ThisWeekRow[] = [...weekMap.values()]
    .map(({ exhibitorSet, ...r }) => ({
      ...r,
      exhibitorCount: exhibitorSet.size,
      exhibitorNames: [...exhibitorSet].sort(),
    }))
    .sort(
      (a, b) =>
        Number(b.startsThisWeek) - Number(a.startsThisWeek) ||
        b.screenCount - a.screenCount ||
        a.startDate.localeCompare(b.startDate)
    );

  // --- Exhibitor health: who has nothing coming up
  const upcomingByExhibitor = new Map<string, number>();
  for (const b of bookings) {
    if (!isLive(b)) continue;
    if (runEnd(b) < today) continue;
    upcomingByExhibitor.set(b.exhibitorId, (upcomingByExhibitor.get(b.exhibitorId) ?? 0) + 1);
  }
  const exhibitorHealth: ExhibitorHealth[] = exhibitors
    .map((e) => {
      const formats: string[] = [];
      if (e["4dx"]) formats.push("4DX");
      if (e.screenx) formats.push("ScreenX");
      if (e.ultra4dx) formats.push("Ultra");
      const upcomingCount = upcomingByExhibitor.get(e.exhibitor_unique) ?? 0;
      return {
        exhibitorUnique: e.exhibitor_unique,
        name: e.exhibitor_erp ?? e.exhibitor_unique,
        country: e.entity_country ?? "",
        formats,
        upcomingCount,
        dormant: upcomingCount === 0,
      };
    })
    .sort(
      (a, b) =>
        Number(b.dormant) - Number(a.dormant) ||
        a.upcomingCount - b.upcomingCount ||
        a.name.localeCompare(b.name)
    );

  // --- KPI figures
  const upcoming30d = bookings.filter(
    (b) => b.status === "confirmed" && b.date >= today && b.date <= in30
  ).length;

  const productionPending = allProduction
    .filter((r) => r.status === "under_review" && exhibitorIds.has(r.exhibitor_unique))
    .map((r) => ({
      id: r.id,
      exhibitorName: r.exhibitorName,
      titleText: r.title_text,
      format: r.format,
      ageDays: r.requested_at ? daysBetween(r.requested_at.slice(0, 10), today) : 0,
    }))
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    kpis: {
      pending: actionable.length,
      pendingOldestAgeDays: groups.length ? groups[0].ageDays : null,
      upcoming30d,
      exhibitorCount: exhibitors.length,
      dormantCount: exhibitorHealth.filter((e) => e.dormant).length,
      releasing8w: releasing8wList.length,
      lowCoverage,
    },
    actionQueue: { groups: groups.slice(0, 6), totalGroups: groups.length },
    productionPending: productionPending.slice(0, 4),
    releases,
    outreach,
    thisWeek: { rows: weekRows.slice(0, 8), total: weekRows.length },
    exhibitorHealth: exhibitorHealth.slice(0, 12),
  };
}
