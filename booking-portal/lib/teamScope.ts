import type { BookingVM, Exhibitor } from "@/lib/types";

/**
 * The team portal's global territory filter. Every team page reads this
 * from a cookie and scopes its data to one account manager's exhibitors
 * before rendering, so a manager only sees their own patch by default.
 *
 * It's a display preference, not an access control - RLS still governs
 * what the account can actually read. That's why the cookie is written
 * client-side (never httpOnly) and validated loosely on read.
 */
export const TEAM_SCOPE_COOKIE = "team-scope";
export const TEAM_SCOPE_ALL = "all";

/** Distinct account managers across all exhibitors, sorted for the picker. */
export function managersFrom(exhibitors: Exhibitor[]): string[] {
  return [
    ...new Set(exhibitors.map((e) => e.account_manager).filter((m): m is string => !!m)),
  ].sort((a, b) => a.localeCompare(b));
}

/**
 * The active scope, validated against the managers that actually exist.
 * Anything unrecognised (stale cookie after a manager is renamed, hand-
 * edited value, decode failure) falls back to showing everything.
 * Manager names include non-ASCII (황혜린, 이경민), so the value is
 * percent-encoded on write and decoded defensively here.
 */
export function readTeamScope(
  raw: string | undefined,
  validManagers: string[],
  /** The signed-in manager's own patch (profiles.territory), used when
   * they haven't explicitly chosen a scope yet - so a manager lands on
   * their own exhibitors instead of the whole world. */
  ownTerritory?: string | null
): string {
  if (!raw) {
    return ownTerritory && validManagers.includes(ownTerritory)
      ? ownTerritory
      : TEAM_SCOPE_ALL;
  }
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding - fall through with the raw value, which
    // simply won't match a known manager and lands on "all".
  }
  return validManagers.includes(value) ? value : TEAM_SCOPE_ALL;
}

export function isAllScope(scope: string): boolean {
  return scope === TEAM_SCOPE_ALL;
}

/** Human label for the current scope, for page headers. */
export function scopeLabel(scope: string): string {
  return isAllScope(scope) ? "All territories" : scope;
}

/**
 * Trailing clause for page subtitles, e.g. "172 exhibitors across all
 * territories" / "24 exhibitors in Frankie's territory". Manager values
 * mix people (Frankie, Kate) and regions (CHINA, US), so this keeps the
 * name cased as-is rather than lowercasing it into a sentence.
 */
export function scopeSuffix(scope: string): string {
  return isAllScope(scope) ? "across all territories" : `in ${scope}'s territory`;
}

/** Exhibitors in scope. "All" deliberately includes unassigned ones. */
export function scopeExhibitors(exhibitors: Exhibitor[], scope: string): Exhibitor[] {
  if (isAllScope(scope)) return exhibitors;
  return exhibitors.filter((e) => e.account_manager === scope);
}

export function scopeBookings(bookings: BookingVM[], scope: string): BookingVM[] {
  if (isAllScope(scope)) return bookings;
  return bookings.filter((b) => b.accountManager === scope);
}

/**
 * Filters any exhibitor-owned rows (screens, production requests, ...) to
 * those belonging to the given exhibitor ids. Pass the scoped exhibitor
 * set; a null/undefined owner id is treated as out of scope.
 */
export function scopeByExhibitorIds<T>(
  rows: T[],
  ids: Set<string>,
  ownerOf: (row: T) => string | null | undefined
): T[] {
  return rows.filter((r) => {
    const owner = ownerOf(r);
    return !!owner && ids.has(owner);
  });
}
