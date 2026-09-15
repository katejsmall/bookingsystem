"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireTeam } from "@/lib/data";
import { bookingErrorMessage } from "@/lib/display";
import { baseFormat } from "@/lib/types";

export type ActionResult =
  | { ok: true; submitted?: number; skipped?: number }
  | { ok: false; error: string };

/** Matches the bookings.programming_weeks column default. */
const DEFAULT_PROGRAMMING_WEEKS = 2;

function revalidateBookingViews() {
  revalidatePath("/home");
  revalidatePath("/calendar");
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
}

/**
 * Exhibitor: request a play date for a title across any number of the
 * exhibitor's own screens (possibly spanning several formats at once), as
 * one 'requested' booking per screen so each can still be
 * confirmed/rejected/cancelled individually. Each screen is matched to the
 * confirmed lineup entry for *its own* format - a title can have a
 * different lineup_id (and release date) per format. Screens that already
 * have a live (requested/confirmed) booking for this title and date are
 * skipped and reported back rather than failing the whole submission; the
 * bookings_active_unique index is the backstop for races. The
 * validate_booking trigger remains the safety net for stale data.
 */
export async function requestBooking(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, profile } = await requireProfile();
  if (profile.role !== "exhibitor" || !profile.exhibitor_unique) {
    return { ok: false, error: "Only exhibitor accounts can request bookings." };
  }

  const title_no = String(formData.get("title_no") ?? "");
  // requested_play_date is the first screening; the national release is
  // recorded alongside it and may be later (previews screen ahead of it).
  const requested_play_date = String(formData.get("requested_play_date") ?? "");
  const official_release_date = String(formData.get("official_release_date") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const screenUniques = formData.getAll("screen_unique").map(String).filter(Boolean);

  // The run length is no longer asked for on the form - it was more detail
  // than exhibitors wanted at request time. The column is NOT NULL, so keep
  // writing the same default the schema uses; the team can adjust later.
  const programming_weeks = DEFAULT_PROGRAMMING_WEEKS;

  if (!title_no || !requested_play_date || screenUniques.length === 0) {
    return { ok: false, error: "Choose a title, a play date, and at least one screen." };
  }

  const [{ data: ownScreens, error: screenErr }, { data: lineupRows, error: lineupErr }] =
    await Promise.all([
      supabase
        .from("screen_db")
        .select("screen_unique, screen_format")
        .eq("exhibitor_id", profile.exhibitor_unique)
        .in("screen_unique", screenUniques),
      supabase
        .from("lineup")
        .select("lineup_id, format")
        .eq("title_no", title_no)
        .eq("confirmed", true),
    ]);
  if (screenErr) return { ok: false, error: bookingErrorMessage(screenErr.message) };
  if (lineupErr) return { ok: false, error: bookingErrorMessage(lineupErr.message) };

  const lineupIdByFormat = new Map(lineupRows?.map((l) => [l.format, l.lineup_id]) ?? []);

  // lineup only ever holds the base formats ('4DX' / 'ScreenX'); an Ultra
  // screen is a combo install that plays the base format's lineup entry.
  // Looking up the raw screen_format here found nothing for Ultra screens,
  // so they were silently dropped as "not confirmed for their format" -
  // the same normalization validate_booking() does in the database.
  const candidates = (ownScreens ?? [])
    .map((s) => ({
      screen_unique: s.screen_unique,
      lineup_id: s.screen_format
        ? lineupIdByFormat.get(baseFormat(s.screen_format))
        : undefined,
    }))
    .filter((r): r is { screen_unique: string; lineup_id: number } => r.lineup_id !== undefined);

  if (candidates.length === 0) {
    return {
      ok: false,
      error: "None of the selected screens have this title confirmed for their format.",
    };
  }

  // Skip screens that already have a live booking for this title + date.
  const { data: existing, error: existingErr } = await supabase
    .from("bookings")
    .select("screen_unique")
    .in("lineup_id", [...new Set(candidates.map((c) => c.lineup_id))])
    .eq("requested_play_date", requested_play_date)
    .in("status", ["requested", "confirmed"])
    .in("screen_unique", candidates.map((c) => c.screen_unique));
  if (existingErr) return { ok: false, error: bookingErrorMessage(existingErr.message) };

  const taken = new Set(existing?.map((e) => e.screen_unique) ?? []);
  const rows = candidates
    .filter((c) => !taken.has(c.screen_unique))
    .map((c) => ({
      screen_unique: c.screen_unique,
      lineup_id: c.lineup_id,
      exhibitor_unique: profile.exhibitor_unique!,
      requested_play_date,
      official_release_date,
      programming_weeks,
      status: "requested" as const,
      requested_by: user.email,
      notes,
    }));

  if (rows.length === 0) {
    return {
      ok: false,
      error: "Every selected screen already has an active request for this title and date.",
    };
  }

  const { error } = await supabase.from("bookings").insert(rows);
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidateBookingViews();
  return { ok: true, submitted: rows.length, skipped: taken.size };
}

/**
 * Exhibitor: cancel their own pending requests. RLS only lets exhibitors
 * move their own 'requested' rows to 'cancelled'.
 */
export async function cancelBookings(bookingIds: number[]): Promise<ActionResult> {
  const { supabase } = await requireProfile();
  const { error, count } = await supabase
    .from("bookings")
    .update({ status: "cancelled" }, { count: "exact" })
    .in("booking_id", bookingIds);
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  if (count === 0) {
    return { ok: false, error: "These requests can no longer be cancelled." };
  }
  revalidateBookingViews();
  return { ok: true, submitted: count ?? 0 };
}

export async function cancelBooking(bookingId: number): Promise<ActionResult> {
  return cancelBookings([bookingId]);
}

/**
 * Team: confirm requests, optionally with a note shown to the exhibitor.
 * One update statement; the validate_booking trigger re-checks every row,
 * and a single failure aborts the whole batch - surfaced plainly so the
 * team can expand the group and act per screen.
 */
export async function confirmBookings(
  bookingIds: number[],
  note?: string
): Promise<ActionResult> {
  const { supabase, user } = await requireTeam();
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      confirmed_by: user.email,
      confirmed_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .in("booking_id", bookingIds);
  if (error) {
    const reason = bookingErrorMessage(error.message);
    return {
      ok: false,
      error:
        bookingIds.length > 1
          ? `${reason} None of the group was confirmed — expand it and confirm screens individually.`
          : reason,
    };
  }
  revalidateBookingViews();
  return { ok: true, submitted: bookingIds.length };
}

export async function confirmBooking(bookingId: number): Promise<ActionResult> {
  return confirmBookings([bookingId]);
}

/** Team: reject requests, optionally with a reason shown to the exhibitor. */
export async function rejectBookings(
  bookingIds: number[],
  note?: string
): Promise<ActionResult> {
  const { supabase, user } = await requireTeam();
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "rejected",
      confirmed_by: user.email,
      confirmed_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .in("booking_id", bookingIds);
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidateBookingViews();
  return { ok: true, submitted: bookingIds.length };
}

export async function rejectBooking(bookingId: number, note?: string): Promise<ActionResult> {
  return rejectBookings([bookingId], note);
}