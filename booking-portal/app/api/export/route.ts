import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getBookingVMs } from "@/lib/data";

function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Team-only CSV export of every booking with its joins. */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "team") return new Response("Forbidden", { status: 403 });

  const bookings = await getBookingVMs(supabase);

  const header = [
    "booking_id", "title", "format", "exhibitor", "country", "screen",
    "play_date", "programming_weeks", "status", "requested_by", "requested_at",
    "decided_by", "decided_at", "decision_note", "exhibitor_notes",
  ];
  const lines = [header.join(",")];
  for (const b of bookings) {
    lines.push(
      [
        b.id, b.title, b.format, b.exhibitorName, b.country, b.screenLabel,
        b.date, b.programmingWeeks, b.status, b.requestedBy, b.requestedAt,
        b.confirmedBy, b.confirmedAt, b.decisionNote, b.notes,
      ]
        .map(csvField)
        .join(",")
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${today}.csv"`,
    },
  });
}
