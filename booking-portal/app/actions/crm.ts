"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/data";
import type { ActionResult } from "@/app/actions/bookings";

function friendly(message: string): string {
  if (message.includes("duplicate key")) {
    return "A record with this key already exists.";
  }
  if (message.includes("violates foreign key")) {
    return "A linked record referenced here doesn't exist (or this record is still referenced by bookings/contacts).";
  }
  return message;
}

const str = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
};

// ---------------------------------------------------------------------------
// Exhibitors
// ---------------------------------------------------------------------------
export async function saveExhibitor(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const isNew = formData.get("mode") === "add";
  const exhibitor_unique = str(formData, "exhibitor_unique");
  if (!exhibitor_unique) return { ok: false, error: "Exhibitor ID is required." };

  const values = {
    exhibitor_erp: str(formData, "exhibitor_erp"),
    exhibitor_key: str(formData, "exhibitor_key"),
    entity_country: str(formData, "entity_country"),
    manager_email: str(formData, "manager_email"),
    account_manager: str(formData, "account_manager"),
    screenx: formData.get("screenx") === "on",
    "4dx": formData.get("4dx") === "on",
    ultra4dx: formData.get("ultra4dx") === "on",
  };

  const { error } = isNew
    ? await supabase.from("exhibitor_db").insert({ exhibitor_unique, ...values })
    : await supabase.from("exhibitor_db").update(values).eq("exhibitor_unique", exhibitor_unique);

  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/crm/exhibitors");
  // Territory assignment and format flags drive Home's scope + coverage.
  revalidatePath("/home");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
export async function saveScreen(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const isNew = formData.get("mode") === "add";

  const site_name = str(formData, "site_name");
  const screen_name = str(formData, "screen_name");
  const exhibitor_id = str(formData, "exhibitor_id");
  if (!exhibitor_id || !site_name) {
    return { ok: false, error: "Exhibitor and site name are required." };
  }

  // New screens follow the existing key pattern, e.g. "Talatona-4DX-24A".
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  const screen_unique = isNew
    ? `${site_name}-${screen_name ?? "SCREEN"}-${suffix}`
    : str(formData, "screen_unique");
  if (!screen_unique) return { ok: false, error: "Missing screen key." };

  const values = {
    exhibitor_id,
    site_name,
    screen_name,
    screen_number: str(formData, "screen_number"),
    location_country: str(formData, "location_country"),
    location_city: str(formData, "location_city"),
    format: str(formData, "format"),
    screen_format: str(formData, "screen_format"),
    seat_count: str(formData, "seat_count"),
    opening_date: str(formData, "opening_date"),
  };

  const { error } = isNew
    ? await supabase.from("screen_db").insert({ screen_unique, ...values })
    : await supabase.from("screen_db").update(values).eq("screen_unique", screen_unique);

  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/crm/screens");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lineup
// ---------------------------------------------------------------------------
export async function saveLineup(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const isNew = formData.get("mode") === "add";
  const lineup_id = Number(formData.get("lineup_id") || 0);
  const title_no = str(formData, "title_no");
  const format = str(formData, "format");
  if (!title_no || !format) return { ok: false, error: "Pick a title and a format." };

  const values = {
    title_no,
    format,
    confirmed: formData.get("confirmed") === "on",
    first_available_release_date: str(formData, "first_available_release_date"),
    notes: str(formData, "notes"),
    updated_at: new Date().toISOString(),
  };

  const { error } = isNew
    ? await supabase.from("lineup").insert(values)
    : await supabase.from("lineup").update(values).eq("lineup_id", lineup_id);

  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "This title is already in the lineup for that format." };
    }
    return { ok: false, error: friendly(error.message) };
  }
  revalidatePath("/crm/lineup");
  revalidatePath("/requests");
  // Home's release-coverage section is built from the confirmed lineup.
  revalidatePath("/home");
  return { ok: true };
}

/** The key lineup action: only confirmed titles can be booked. */
export async function toggleLineupConfirmed(
  lineupId: number,
  confirmed: boolean
): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const { error } = await supabase
    .from("lineup")
    .update({ confirmed, updated_at: new Date().toISOString() })
    .eq("lineup_id", lineupId);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/crm/lineup");
  revalidatePath("/requests");
  // Home's release-coverage section is built from the confirmed lineup.
  revalidatePath("/home");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contacts (contact row + screen/title link tables)
// ---------------------------------------------------------------------------
export async function saveContact(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const id = str(formData, "id");

  const values = {
    first_name: str(formData, "first_name"),
    last_name: str(formData, "last_name"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    country: str(formData, "country"),
    exhibitor_unique: str(formData, "exhibitor_unique"),
    relevant_formats: formData.getAll("relevant_formats").map(String),
  };

  let contactId = id;
  if (id) {
    const { error } = await supabase.from("contacts").update(values).eq("id", id);
    if (error) return { ok: false, error: friendly(error.message) };
  } else {
    const { data, error } = await supabase
      .from("contacts")
      .insert(values)
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: friendly(error?.message ?? "Insert failed") };
    contactId = data.id;
  }

  // Replace the link rows with the submitted sets.
  const screens = formData.getAll("screens").map(String).filter(Boolean);
  const titles = formData.getAll("titles").map(String).filter(Boolean);

  const { error: delScreens } = await supabase
    .from("contact_screens")
    .delete()
    .eq("contact_id", contactId);
  if (delScreens) return { ok: false, error: friendly(delScreens.message) };
  if (screens.length) {
    const { error } = await supabase
      .from("contact_screens")
      .insert(screens.map((screen_unique) => ({ contact_id: contactId, screen_unique })));
    if (error) return { ok: false, error: friendly(error.message) };
  }

  const { error: delTitles } = await supabase
    .from("contact_titles")
    .delete()
    .eq("contact_id", contactId);
  if (delTitles) return { ok: false, error: friendly(delTitles.message) };
  if (titles.length) {
    const { error } = await supabase
      .from("contact_titles")
      .insert(titles.map((title_no) => ({ contact_id: contactId, title_no })));
    if (error) return { ok: false, error: friendly(error.message) };
  }

  revalidatePath("/crm/contacts");
  return { ok: true };
}

export async function deleteContact(id: string): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/crm/contacts");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// TBD titles
// ---------------------------------------------------------------------------
function revalidateTbdTitleViews() {
  revalidatePath("/crm/tbd-titles");
  revalidatePath("/tbd-titles");
}

export async function saveTbdTitle(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const isNew = formData.get("mode") === "add";
  const id = Number(formData.get("id") || 0);
  const title_text = str(formData, "title_text");
  const format = str(formData, "format");
  if (!title_text || (format !== "4DX" && format !== "ScreenX")) {
    return { ok: false, error: "Enter a title and choose a format." };
  }

  const values = {
    title_text,
    format,
    imdb_link: str(formData, "imdb_link"),
    active: formData.get("active") === "on",
  };

  const { error } = isNew
    ? await supabase.from("tbd_titles").insert(values)
    : await supabase.from("tbd_titles").update(values).eq("id", id);

  if (error) return { ok: false, error: friendly(error.message) };
  revalidateTbdTitleViews();
  return { ok: true };
}

/** Closes/reopens a poll. Closing stops exhibitors from casting new votes -
 * enforced by RLS on tbd_votes (insert/update both re-check tbd_titles.active). */
export async function toggleTbdTitleActive(id: number, active: boolean): Promise<ActionResult> {
  const { supabase } = await requireTeam();
  const { error } = await supabase.from("tbd_titles").update({ active }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateTbdTitleViews();
  return { ok: true };
}
