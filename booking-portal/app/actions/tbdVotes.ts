"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/data";
import { bookingErrorMessage } from "@/lib/display";
import type { ActionResult } from "@/app/actions/bookings";
import type { TbdVote } from "@/lib/types";

/** Exhibitor: cast/change a yes/no/tbd vote (upsert). Re-derives "is this
 * poll still open" server-side before writing, mirroring requestBooking's
 * re-check of confirmed lineup rows, so a stale client gets a clean message
 * instead of a raw RLS-denial string. */
export async function castTbdVote(tbdTitleId: number, vote: TbdVote): Promise<ActionResult> {
  const { supabase, user, profile } = await requireProfile();
  if (profile.role !== "exhibitor" || !profile.exhibitor_unique) {
    return { ok: false, error: "Only exhibitor accounts can vote." };
  }

  const { data: title, error: titleErr } = await supabase
    .from("tbd_titles")
    .select("active")
    .eq("id", tbdTitleId)
    .single();
  if (titleErr) return { ok: false, error: bookingErrorMessage(titleErr.message) };
  if (!title?.active) return { ok: false, error: "This poll is closed." };

  const { error } = await supabase.from("tbd_votes").upsert(
    {
      tbd_title_id: tbdTitleId,
      exhibitor_unique: profile.exhibitor_unique,
      vote,
      voted_by: user.email,
      voted_at: new Date().toISOString(),
    },
    { onConflict: "tbd_title_id,exhibitor_unique" }
  );
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  revalidatePath("/tbd-titles");
  return { ok: true };
}
