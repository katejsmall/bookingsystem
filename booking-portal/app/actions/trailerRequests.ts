"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireTeam } from "@/lib/data";
import { bookingErrorMessage } from "@/lib/display";
import type { ActionResult } from "@/app/actions/bookings";
import type { TrailerRequestStatus } from "@/lib/types";

function revalidateTrailerRequestViews() {
  revalidatePath("/lineup-trailers");
  revalidatePath("/bookings");
}

/** Exhibitor: request a specific trailer_assets row. */
export async function submitTrailerRequest(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, profile } = await requireProfile();
  if (profile.role !== "exhibitor" || !profile.exhibitor_unique) {
    return { ok: false, error: "Only exhibitor accounts can request trailers." };
  }

  const trailerAssetId = Number(formData.get("trailer_asset_id"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!trailerAssetId) return { ok: false, error: "Missing trailer." };

  const { error } = await supabase.from("trailer_requests").insert({
    exhibitor_unique: profile.exhibitor_unique,
    trailer_asset_id: trailerAssetId,
    notes,
    requested_by: user.email,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidateTrailerRequestViews();
  return { ok: true, submitted: 1 };
}

async function setTrailerRequestStatus(
  ids: number[],
  status: Extract<TrailerRequestStatus, "confirmed" | "declined">,
  note?: string
): Promise<ActionResult> {
  const { supabase, user } = await requireTeam();
  const { error } = await supabase
    .from("trailer_requests")
    .update({
      status,
      decided_by: user.email,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .in("id", ids);
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidateTrailerRequestViews();
  return { ok: true, submitted: ids.length };
}

export async function confirmTrailerRequests(ids: number[], note?: string) {
  return setTrailerRequestStatus(ids, "confirmed", note);
}
export async function declineTrailerRequests(ids: number[], note?: string) {
  return setTrailerRequestStatus(ids, "declined", note);
}
