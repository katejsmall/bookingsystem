"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireTeam } from "@/lib/data";
import { bookingErrorMessage } from "@/lib/display";
import type { ActionResult } from "@/app/actions/bookings";
import type { ProductionRequestStatus } from "@/lib/types";

function revalidateProductionRequestViews() {
  revalidatePath("/production-requests");
  revalidatePath("/home");
}

/** Exhibitor: recommend a title for production in 4DX or ScreenX. */
export async function submitProductionRequest(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, profile } = await requireProfile();
  if (profile.role !== "exhibitor" || !profile.exhibitor_unique) {
    return { ok: false, error: "Only exhibitor accounts can submit production requests." };
  }

  const title_text = String(formData.get("title_text") ?? "").trim();
  const format = String(formData.get("format") ?? "");
  const imdb_link = String(formData.get("imdb_link") ?? "").trim() || null;
  const first_release_date = String(formData.get("first_release_date") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!title_text || (format !== "4DX" && format !== "ScreenX")) {
    return { ok: false, error: "Enter a title and choose a format." };
  }

  const { error } = await supabase.from("production_requests").insert({
    exhibitor_unique: profile.exhibitor_unique,
    title_text,
    format,
    imdb_link,
    first_release_date,
    notes,
    requested_by: user.email,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidateProductionRequestViews();
  return { ok: true, submitted: 1 };
}

async function setProductionRequestStatus(
  ids: number[],
  status: Extract<ProductionRequestStatus, "confirmed" | "declined">,
  note?: string
): Promise<ActionResult> {
  const { supabase, user } = await requireTeam();
  const { error } = await supabase
    .from("production_requests")
    .update({
      status,
      decided_by: user.email,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .in("id", ids);
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidateProductionRequestViews();
  return { ok: true, submitted: ids.length };
}

export async function confirmProductionRequests(ids: number[], note?: string) {
  return setProductionRequestStatus(ids, "confirmed", note);
}
export async function declineProductionRequests(ids: number[], note?: string) {
  return setProductionRequestStatus(ids, "declined", note);
}
