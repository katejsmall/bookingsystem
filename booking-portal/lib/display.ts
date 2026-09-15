/** Display helpers shared by server and client code. */

/**
 * Formats a Date's *local* calendar day as YYYY-MM-DD.
 *
 * Deliberately not toISOString(), which converts to UTC first: in any zone
 * ahead of UTC (KST is +9) local midnight is still the previous day in UTC,
 * so toISOString() would report yesterday's date.
 */
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today as an ISO date string (local time), the floor used across booking
 * date pickers and "upcoming" queries. */
export function todayIso(): string {
  return localIso(new Date());
}

/** Prefer the IMDb title, fall back to the ERP title, then the title_no. */
export function titleDisplayName(
  imdb: { Title: string | null } | { Title: string | null }[] | null | undefined,
  erpTitle: string | null | undefined,
  titleNo?: string
): string {
  const row = Array.isArray(imdb) ? imdb[0] : imdb;
  return row?.Title?.trim() || erpTitle?.trim() || titleNo || "Untitled";
}

export function screenLabel(s: {
  site_name: string | null;
  screen_name: string | null;
  screen_number?: string | null;
}): string {
  const parts = [s.site_name, s.screen_name].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Unnamed screen";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

/** The sheet's "Hollywood/Local" content-type tag for a title, extracted
 * from lineup.notes. notes is a " · "-joined string of
 * [Distributor, Country, Type, Release] with any missing field dropped
 * (not a fixed position), so this matches by value against the known
 * closed set of tags rather than by position. Returns null if the tag
 * isn't present (no reliable way to distinguish "not tagged" from
 * "tagged but value changed" without a dedicated column). */
const KNOWN_TITLE_TYPES = new Set(["Hollywood", "Local", "Original", "Short", "EVENT"]);
export function deriveTitleType(notes: string | null | undefined): string | null {
  if (!notes) return null;
  for (const part of notes.split(" · ")) {
    if (KNOWN_TITLE_TYPES.has(part)) return part;
  }
  return null;
}

/** Adds (or subtracts) whole days to an ISO date string, calendar-correct
 * across month/year boundaries. Dates in this app are timezone-naive
 * calendar dates, so this is local-time arithmetic only. Falls back to the
 * input unchanged for a malformed/out-of-range date rather than throwing -
 * one corrupt row shouldn't be able to crash the whole calendar page. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  if (isNaN(d.getTime())) return iso;
  return localIso(d);
}

/**
 * Turns validate_booking trigger exceptions (and RLS denials) into
 * plain-English messages. The form only offers valid combinations, so these
 * only fire on races or stale data.
 */
export function bookingErrorMessage(message: string): string {
  if (message.includes("does not belong to exhibitor")) {
    return "That screen doesn't belong to this exhibitor. Refresh and try again.";
  }
  if (message.includes("does not have format")) {
    return "The screen's format no longer matches this title's format. It may have changed since the page loaded — refresh and pick again.";
  }
  if (message.includes("is not confirmed yet")) {
    return "This title is no longer confirmed in the lineup, so it can't be booked or confirmed right now.";
  }
  if (message.includes("before the release date")) {
    return "The requested play date is before the title's first available release date.";
  }
  if (message.includes("bookings_active_unique") || message.includes("duplicate key")) {
    return "One or more of these screens already has an active request for this title and date.";
  }
  if (message.includes("row-level security") || message.includes("42501")) {
    return "You don't have permission to make this change.";
  }
  return message;
}
