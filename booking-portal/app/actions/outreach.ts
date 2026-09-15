"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/data";
import type { ActionResult } from "@/app/actions/bookings";
import type { OutreachStatus } from "@/lib/outreach";

/**
 * Records that this exhibitor has been approached about this title, so the
 * chase list can separate "hasn't booked" from "hasn't been asked". Any
 * team member can log against any territory - cover happens.
 */
export async function markOutreach(
  titleNo: string,
  format: string,
  exhibitorUnique: string,
  status: OutreachStatus,
  note?: string
): Promise<ActionResult> {
  const { supabase, user, profile } = await requireTeam();
  const actionedBy = profile.full_name?.trim() || user.email || "team";

  const { error } = await supabase.from("title_outreach").upsert(
    {
      title_no: titleNo,
      format,
      exhibitor_unique: exhibitorUnique,
      status,
      note: note?.trim() || null,
      actioned_by: actionedBy,
      actioned_at: new Date().toISOString(),
    },
    { onConflict: "title_no,format,exhibitor_unique" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/home");
  return { ok: true };
}

/** Undo - back to "not asked yet". */
export async function clearOutreach(
  titleNo: string,
  format: string,
  exhibitorUnique: string
): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const { error } = await supabase
    .from("title_outreach")
    .delete()
    .eq("title_no", titleNo)
    .eq("format", format)
    .eq("exhibitor_unique", exhibitorUnique);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/home");
  return { ok: true };
}
