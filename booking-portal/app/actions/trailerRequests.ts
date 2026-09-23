"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireTeam } from "@/lib/data";
import { bookingErrorMessage } from "@/lib/display";
import { sendEmail } from "@/lib/email";
import type { ActionResult } from "@/app/actions/bookings";
import type { TrailerRequestStatus } from "@/lib/types";

function revalidateTrailerRequestViews() {
  revalidatePath("/lineup-trailers");
  revalidatePath("/bookings");
  revalidatePath("/trailer-requests");
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deliveredEmailHtml(assetTitle: string, version: string | null): string {
  const title = escapeHtml(assetTitle);
  const versionLine = version
    ? `<p style="margin:0 0 16px;color:#555;font-size:14px;">Version: ${escapeHtml(version)}</p>`
    : "";
  return `
    <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#111;max-width:480px;">
      <h2 style="margin:0 0 12px;font-size:18px;">Your trailer is ready</h2>
      <p style="margin:0 0 8px;">The trailer asset you requested has been delivered:</p>
      <p style="margin:0 0 8px;font-weight:600;font-size:16px;">${title}</p>
      ${versionLine}
      <p style="margin:16px 0 0;color:#777;font-size:12px;">CJ 4DPLEX Content Support</p>
    </div>
  `;
}

/**
 * Team: mark trailer requests as delivered and email each requesting
 * exhibitor's account (trailer_requests.requested_by - the exact login
 * that submitted the request) that it's ready. Only requests already
 * 'confirmed' can be completed - see TrailerRequestQueue.
 */
export async function completeTrailerRequests(ids: number[]): Promise<ActionResult> {
  const { supabase, user } = await requireTeam();

  const { data: rows, error: fetchError } = await supabase
    .from("trailer_requests")
    .select("id, requested_by, asset:trailer_assets(title, version)")
    .in("id", ids);
  if (fetchError) return { ok: false, error: bookingErrorMessage(fetchError.message) };

  const { error } = await supabase
    .from("trailer_requests")
    .update({ status: "completed", completed_by: user.email, completed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidateTrailerRequestViews();

  const failures: string[] = [];
  for (const row of (rows ?? []) as unknown as {
    id: number;
    requested_by: string | null;
    asset: { title: string; version: string | null } | { title: string; version: string | null }[] | null;
  }[]) {
    const asset = Array.isArray(row.asset) ? row.asset[0] : row.asset;
    if (!row.requested_by || !asset) continue;
    const result = await sendEmail({
      to: row.requested_by,
      subject: `Trailer delivered: ${asset.title}`,
      html: deliveredEmailHtml(asset.title, asset.version),
    });
    if (!result.ok) failures.push(`${asset.title} (${row.requested_by}): ${result.error}`);
  }

  if (failures.length > 0) {
    return {
      ok: true,
      submitted: ids.length,
      warning: `Marked completed, but the notification email failed for: ${failures.join("; ")}`,
    };
  }
  return { ok: true, submitted: ids.length };
}
