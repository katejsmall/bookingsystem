"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/data";
import type { ActionResult } from "@/app/actions/bookings";

/** Post a task or standing notice for the programming team. */
export async function addNotice(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, profile } = await requireTeam();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write something first." };

  const kind = formData.get("kind") === "notice" ? "notice" : "task";
  const territory = String(formData.get("territory") ?? "").trim() || null;
  const dueDate = String(formData.get("due_date") ?? "").trim() || null;

  const { error } = await supabase.from("team_notices").insert({
    kind,
    body,
    territory,
    due_date: dueDate,
    pinned: formData.get("pinned") === "on",
    created_by: profile.full_name?.trim() || user.email || "team",
  });
  if (error) return { ok: false, error: error.message };

  revalidateTeamViews();
  return { ok: true };
}

export async function setNoticeDone(id: number, done: boolean): Promise<ActionResult> {
  const { supabase, user, profile } = await requireTeam();
  const who = profile.full_name?.trim() || user.email || "team";
  const { error } = await supabase
    .from("team_notices")
    .update({
      done,
      done_by: done ? who : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateTeamViews();
  return { ok: true };
}

export async function deleteNotice(id: number): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const { error } = await supabase.from("team_notices").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateTeamViews();
  return { ok: true };
}

/** The panel rides in the team layout, so every team route shows it. */
function revalidateTeamViews() {
  for (const p of [
    "/home",
    "/calendar",
    "/requests",
    "/production-requests",
    "/crm/exhibitors",
    "/crm/screens",
    "/crm/lineup",
    "/crm/tbd-titles",
    "/crm/contracts",
  ]) {
    revalidatePath(p);
  }
}
