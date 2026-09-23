import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type {
  Booking,
  BookingStatus,
  BookingVM,
  Contact,
  DashboardTitle,
  Exhibitor,
  LineupCatalogueItem,
  LineupWithTitle,
  Profile,
  ProductionRequestVM,
  Screen,
  TbdTitle,
  TbdTitleWithVotes,
  TbdVote,
  TrailerAsset,
  TrailerRequestWithAsset,
} from "@/lib/types";
import { screenLabel, titleDisplayName, todayIso } from "@/lib/display";
import { isExternalPoster, posterSrc, resolvePosterPath } from "@/lib/posters";

export async function getSupabase() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

/** Current user + profile; redirects to /login when signed out. */
export async function requireProfile() {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, exhibitor_unique, full_name, territory, is_admin, must_change_password, active")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Signed in but no profile row (should not happen once the signup
    // trigger is installed) — treat as unprovisioned.
    redirect("/login?error=unprovisioned");
  }

  return { supabase, user, profile: profile as Profile };
}

export async function requireTeam() {
  const ctx = await requireProfile();
  // /requests is team chrome now - exhibitors belong in their own portal.
  if (ctx.profile.role !== "team") redirect("/dashboard");
  return ctx;
}

type SupabaseClient = Awaited<ReturnType<typeof getSupabase>>;

const BOOKING_SELECT = `
  booking_id, requested_play_date, programming_weeks, status, notes, decision_note, requested_by, requested_at,
  confirmed_by, confirmed_at, screen_unique, lineup_id, exhibitor_unique, imported_from,
  screen:screen_db(screen_unique, site_name, screen_name, screen_format, location_country, location_city, exhibitor_id),
  lineup:lineup(lineup_id, format, confirmed, first_available_release_date, title_no,
    title:Title_master(title_no, erp_title, film_imdb_db(Title, genre, poster_path, poster_path_4dx, poster_path_screenx))),
  exhibitor:exhibitor_db(exhibitor_unique, exhibitor_erp, entity_country, account_manager)
`;

type BookingJoined = Booking & {
  screen: {
    screen_unique: string;
    site_name: string | null;
    screen_name: string | null;
    screen_format: string | null;
    location_country: string | null;
    location_city: string | null;
    exhibitor_id: string | null;
  } | null;
  lineup:
    | (Pick<LineupWithTitle, "lineup_id" | "format" | "confirmed" | "first_available_release_date" | "title_no" | "title">)
    | null;
  exhibitor: {
    exhibitor_unique: string;
    exhibitor_erp: string | null;
    entity_country: string | null;
    account_manager: string | null;
  } | null;
};

/** PostgREST caps an unbounded select (db-max-rows, 1000 here), and does
 * so silently - so every multi-thousand-row read must page explicitly. */
const PAGE_SIZE = 1000;

/**
 * Runs a select in PAGE_SIZE pages until the table is exhausted.
 * `build(from, to)` must apply .range(from, to) plus a deterministic
 * .order(), otherwise pages can overlap or skip rows.
 *
 * Pages after the first are fetched in parallel: paging bookings serially
 * cost ~2s per page (~44s for the full table), which is the difference
 * between a usable page and an unusable one. `total` (an exact head count
 * of the same filter) lets us know upfront how many pages to fire; without
 * it we fall back to serial paging.
 */
async function fetchAllPages<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  total?: number
): Promise<T[]> {
  if (typeof total === "number") {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const results = await Promise.all(
      Array.from({ length: pages }, (_, p) => build(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1))
    );
    const rows: T[] = [];
    for (const { data, error } of results) {
      if (error) throw new Error(`Failed to load ${label}: ${error.message}`);
      rows.push(...((data ?? []) as T[]));
    }
    return rows;
  }

  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await build(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load ${label}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * All bookings visible to the current user (RLS scopes exhibitors to their
 * own rows), flattened for the calendar and request lists, with signed
 * poster URLs resolved.
 *
 * Pass a date window to avoid pulling the entire history - the table is
 * ~21k rows and most views only care about a slice of it.
 */
export async function getBookingVMs(
  supabase: SupabaseClient,
  opts: {
    from?: string;
    to?: string;
    statuses?: BookingStatus[];
    /** Exclude bulk-imported rows - i.e. only genuine site submissions. */
    siteSubmittedOnly?: boolean;
  } = {}
): Promise<BookingVM[]> {
  // Built inline in both places rather than through a shared generic:
  // PostgREST's builder type is recursive enough that a generic wrapper
  // trips TS2589 ("type instantiation is excessively deep").
  const countQuery = supabase
    .from("bookings")
    .select("booking_id", { count: "exact", head: true });
  if (opts.from) countQuery.gte("requested_play_date", opts.from);
  if (opts.to) countQuery.lte("requested_play_date", opts.to);
  if (opts.statuses) countQuery.in("status", opts.statuses);
  if (opts.siteSubmittedOnly) countQuery.is("imported_from", null);
  const { count } = await countQuery;

  const rows = await fetchAllPages<BookingJoined>(
    "bookings",
    (from, to) => {
      const q = supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .order("requested_play_date", { ascending: true })
        .order("booking_id", { ascending: true }) // stable paging tiebreak
        .range(from, to);
      if (opts.from) q.gte("requested_play_date", opts.from);
      if (opts.to) q.lte("requested_play_date", opts.to);
      if (opts.statuses) q.in("status", opts.statuses);
      if (opts.siteSubmittedOnly) q.is("imported_from", null);
      return q;
    },
    count ?? undefined
  );

  // Resolve each booking's artwork in its own format context (4DX art for
  // a 4DX run where it exists), then batch-sign only the bucket-hosted
  // ones - TMDB-hosted base posters are public URLs and need no signing.
  const resolved = rows.map((r) =>
    resolvePosterPath(r.lineup?.title?.film_imdb_db?.[0], r.lineup?.format)
  );
  const posterUrls = await signedImageUrls(
    supabase,
    [...new Set(resolved.filter((p): p is string => !!p && !isExternalPoster(p)))]
  );

  return rows.map((r, i) => {
    const imdb = r.lineup?.title?.film_imdb_db?.[0];
    return {
      id: r.booking_id,
      date: r.requested_play_date,
      programmingWeeks: r.programming_weeks,
      status: r.status,
      title: titleDisplayName(imdb ?? null, r.lineup?.title?.erp_title, r.lineup?.title_no),
      titleNo: r.lineup?.title_no ?? null,
      genre: imdb?.genre ?? null,
      // w185 is ample for a calendar pill / queue thumbnail.
      posterUrl: posterSrc(resolved[i], posterUrls, "w185"),
      format: r.lineup?.format ?? r.screen?.screen_format ?? "",
      screenUnique: r.screen_unique,
      screenLabel: r.screen ? screenLabel(r.screen) : r.screen_unique,
      exhibitorId: r.exhibitor_unique,
      exhibitorName: r.exhibitor?.exhibitor_erp ?? r.exhibitor_unique,
      country: r.exhibitor?.entity_country ?? "",
      accountManager: r.exhibitor?.account_manager ?? null,
      requestedBy: r.requested_by,
      requestedAt: r.requested_at,
      confirmedBy: r.confirmed_by,
      confirmedAt: r.confirmed_at,
      decisionNote: r.decision_note,
      notes: r.notes,
      importedFrom: r.imported_from,
    };
  });
}

/** Short-lived signed URLs for the private IMAGES bucket, keyed by path. */
export async function signedImageUrls(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from("IMAGES")
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

export async function getExhibitors(supabase: SupabaseClient): Promise<Exhibitor[]> {
  const { data, error } = await supabase
    .from("exhibitor_db")
    .select('exhibitor_unique, exhibitor_key, exhibitor_erp, entity_country, screenx, "4dx", ultra4dx, manager_email, logo_path, account_manager')
    .order("exhibitor_erp");
  if (error) throw new Error(`Failed to load exhibitors: ${error.message}`);
  return (data ?? []) as Exhibitor[];
}

export async function getScreens(supabase: SupabaseClient): Promise<Screen[]> {
  return fetchAllPages<Screen>("screens", (from, to) =>
    supabase
      .from("screen_db")
      .select("*")
      .order("site_name")
      .order("screen_unique") // stable paging tiebreak
      .range(from, to)
  );
}

export async function getLineup(
  supabase: SupabaseClient,
  opts: { confirmedOnly?: boolean } = {}
): Promise<LineupWithTitle[]> {
  return fetchAllPages<LineupWithTitle>("lineup", (from, to) => {
    let query = supabase
      .from("lineup")
      .select(
        "lineup_id, title_no, format, confirmed, first_available_release_date, notes, sync_status, title:Title_master(title_no, erp_title, film_imdb_db(Title, genre, poster_path, poster_path_4dx, poster_path_screenx))"
      )
      .order("first_available_release_date", { ascending: true, nullsFirst: false })
      .order("lineup_id", { ascending: true }) // stable paging tiebreak
      .range(from, to);
    if (opts.confirmedOnly) query = query.eq("confirmed", true);
    return query;
  });
}

/**
 * Upcoming confirmed lineup titles for an exhibitor's formats — release date
 * today or later only (this used to have no lower bound and surfaced
 * already-released titles first) — with posters resolved to signed URLs.
 */
export async function getUpcomingTitles(
  supabase: SupabaseClient,
  formats: string[],
  limit = 20
): Promise<LineupCatalogueItem[]> {
  if (formats.length === 0) return [];
  const { data, error } = await supabase
    .from("lineup")
    .select(
      "lineup_id, title_no, format, confirmed, first_available_release_date, notes, sync_status, title:Title_master(title_no, erp_title, film_imdb_db(Title, genre, poster_path, poster_path_4dx, poster_path_screenx))"
    )
    .eq("confirmed", true)
    .in("format", formats)
    .gte("first_available_release_date", todayIso())
    .order("first_available_release_date", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load upcoming titles: ${error.message}`);
  const rows = (data ?? []) as unknown as LineupWithTitle[];

  // Each lineup row is already format-specific, so resolve in that context.
  const resolved = rows.map((r) => resolvePosterPath(r.title?.film_imdb_db?.[0], r.format));
  const posterUrls = await signedImageUrls(
    supabase,
    [...new Set(resolved.filter((p): p is string => !!p && !isExternalPoster(p)))]
  );

  return rows.map((r, i) => ({
    ...r,
    // w342 - these render as dashboard/catalogue cards, not thumbnails.
    posterUrl: posterSrc(resolved[i], posterUrls, "w342"),
  }));
}

/**
 * The exhibitor Dashboard's catalogue: upcoming confirmed titles for the
 * exhibitor's formats, cross-referenced against their own live
 * (requested/confirmed) bookings so each title can render "Book now" or
 * "Booked for DD/MM". RLS already scopes getBookingVMs to this exhibitor.
 */
export async function getDashboardTitles(
  supabase: SupabaseClient,
  formats: string[]
): Promise<DashboardTitle[]> {
  const [titles, bookings] = await Promise.all([
    // Fetched wider than the ~10-20 actually shown: the Dashboard defaults
    // to Hollywood-only, so a chunk of this gets filtered client-side.
    getUpcomingTitles(supabase, formats, 80),
    getBookingVMs(supabase),
  ]);

  const bookedByTitle = new Map<string, { date: string; status: BookingVM["status"] }>();
  for (const b of bookings) {
    if (!b.titleNo || (b.status !== "requested" && b.status !== "confirmed")) continue;
    const existing = bookedByTitle.get(b.titleNo);
    if (!existing || b.date < existing.date) bookedByTitle.set(b.titleNo, { date: b.date, status: b.status });
  }

  return titles.map((t) => {
    const booked = bookedByTitle.get(t.title_no);
    return {
      ...t,
      name: titleDisplayName(t.title?.film_imdb_db ?? null, t.title?.erp_title, t.title_no),
      bookedDate: booked?.date ?? null,
      bookedStatus: booked?.status ?? null,
    };
  });
}

export async function getTitleMaster(supabase: SupabaseClient) {
  return fetchAllPages<{
    title_no: string;
    erp_title: string | null;
    film_imdb_db: { Title: string | null }[];
  }>("titles", (from, to) =>
    supabase
      .from("Title_master")
      .select("title_no, erp_title, film_imdb_db(Title)")
      .order("erp_title")
      .order("title_no") // stable paging tiebreak
      .range(from, to)
  );
}

/** Count of pending requests genuinely submitted via the site, for the
 * team's nav badge (excludes bulk-imported rows that happen to be
 * status='requested' - those are historical/reference state, not
 * something for the team to action). Pass exhibitorIds to scope the count
 * to one manager's territory; omit it to count everything. */
export async function getPendingCount(
  supabase: SupabaseClient,
  exhibitorIds?: string[]
): Promise<number> {
  let query = supabase
    .from("bookings")
    .select("booking_id", { count: "exact", head: true })
    .eq("status", "requested")
    .is("imported_from", null);
  if (exhibitorIds) query = query.in("exhibitor_unique", exhibitorIds);
  const { count } = await query;
  return count ?? 0;
}

export async function getContacts(supabase: SupabaseClient): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*, contact_screens(screen_unique), contact_titles(title_no)")
    .order("last_name");
  if (error) throw new Error(`Failed to load contacts: ${error.message}`);
  return (data ?? []) as Contact[];
}

const PRODUCTION_REQUEST_SELECT = `
  id, exhibitor_unique, title_text, imdb_link, first_release_date, format, notes,
  status, requested_by, requested_at, decided_by, decided_at, decision_note,
  exhibitor:exhibitor_db(exhibitor_unique, exhibitor_erp, entity_country, account_manager)
`;

type ProductionRequestJoined = ProductionRequestVM & {
  exhibitor: {
    exhibitor_unique: string;
    exhibitor_erp: string | null;
    entity_country: string | null;
    account_manager: string | null;
  } | null;
};

/** All production requests visible to the current user (RLS scopes
 * exhibitors to their own rows), newest first. */
export async function getProductionRequests(
  supabase: SupabaseClient
): Promise<ProductionRequestVM[]> {
  const { data, error } = await supabase
    .from("production_requests")
    .select(PRODUCTION_REQUEST_SELECT)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(`Failed to load production requests: ${error.message}`);
  const rows = (data ?? []) as unknown as ProductionRequestJoined[];
  return rows.map((r) => ({
    ...r,
    exhibitorName: r.exhibitor?.exhibitor_erp ?? r.exhibitor_unique,
    country: r.exhibitor?.entity_country ?? "",
    accountManager: r.exhibitor?.account_manager ?? null,
  }));
}

/** Count of undecided production requests, for the team's nav badge.
 * Pass exhibitorIds to scope it to one manager's territory. */
export async function getPendingProductionRequestCount(
  supabase: SupabaseClient,
  exhibitorIds?: string[]
): Promise<number> {
  let query = supabase
    .from("production_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "under_review");
  if (exhibitorIds) query = query.in("exhibitor_unique", exhibitorIds);
  const { count } = await query;
  return count ?? 0;
}

export async function getTbdTitles(
  supabase: SupabaseClient,
  opts: { activeOnly?: boolean } = {}
): Promise<TbdTitle[]> {
  let query = supabase.from("tbd_titles").select("*").order("created_at", { ascending: false });
  if (opts.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load TBD titles: ${error.message}`);
  return (data ?? []) as TbdTitle[];
}

/** Team: every TBD title with every vote cast, flattened for the collated
 * view's client-side tallying. */
export async function getTbdTitlesWithVotes(
  supabase: SupabaseClient
): Promise<TbdTitleWithVotes[]> {
  const { data, error } = await supabase
    .from("tbd_titles")
    .select(
      "*, tbd_votes(tbd_title_id, exhibitor_unique, vote, voted_by, voted_at, exhibitor:exhibitor_db(exhibitor_erp, entity_country))"
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load TBD title votes: ${error.message}`);
  const rows = (data ?? []) as unknown as (TbdTitle & {
    tbd_votes: {
      tbd_title_id: number;
      exhibitor_unique: string;
      vote: TbdVote;
      voted_by: string | null;
      voted_at: string | null;
      exhibitor: { exhibitor_erp: string | null; entity_country: string | null } | null;
    }[];
  })[];
  return rows.map((t) => ({
    ...t,
    votes: t.tbd_votes.map((v) => ({
      ...v,
      exhibitorName: v.exhibitor?.exhibitor_erp ?? v.exhibitor_unique,
      country: v.exhibitor?.entity_country ?? "",
    })),
  }));
}

/** Exhibitor: my own vote per TBD title, RLS already scopes this to the
 * caller's exhibitor. */
export async function getMyTbdVotes(
  supabase: SupabaseClient
): Promise<Record<number, TbdVote>> {
  const { data, error } = await supabase.from("tbd_votes").select("tbd_title_id, vote");
  if (error) throw new Error(`Failed to load your votes: ${error.message}`);
  return Object.fromEntries((data ?? []).map((v) => [v.tbd_title_id, v.vote as TbdVote]));
}

/**
 * The trailer catalogue for an exhibitor's formats. trailer_assets.format
 * uses the marketing team's own short codes (4DX/SX/ULTRA), not the
 * lineup/booking "4DX"/"ScreenX" family - so callers pass the exhibitor's
 * lineup-style formats plus whether they have an Ultra combo install, and
 * this maps them to the asset table's codes.
 */
export async function getTrailerAssets(
  supabase: SupabaseClient,
  opts: { formats: string[]; hasUltra?: boolean }
): Promise<TrailerAsset[]> {
  const wanted: string[] = [];
  if (opts.formats.includes("4DX")) wanted.push("4DX");
  if (opts.formats.includes("ScreenX")) wanted.push("SX");
  if (opts.hasUltra) wanted.push("ULTRA");
  if (wanted.length === 0) return [];

  const { data, error } = await supabase
    .from("trailer_assets")
    .select("*")
    .in("format", wanted)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load trailer assets: ${error.message}`);
  return (data ?? []) as TrailerAsset[];
}

const MY_TRAILER_REQUEST_SELECT = `
  id, exhibitor_unique, trailer_asset_id, notes, status, requested_by, requested_at, decided_by, decided_at, decision_note,
  asset:trailer_assets(id, title, year, category, format, version, studio, duration, remark, label, included, is_new, trailer_link, note, title_no, created_at)
`;

/** Exhibitor's own trailer requests, newest first - RLS already scopes
 * this to the caller's exhibitor. */
export async function getMyTrailerRequests(
  supabase: SupabaseClient
): Promise<TrailerRequestWithAsset[]> {
  const { data, error } = await supabase
    .from("trailer_requests")
    .select(MY_TRAILER_REQUEST_SELECT)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(`Failed to load trailer requests: ${error.message}`);
  return (data ?? []) as unknown as TrailerRequestWithAsset[];
}
