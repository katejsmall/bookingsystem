import { Suspense } from "react";
import { BookingsView } from "@/components/exhibitor/BookingsView";
import { titleDisplayName } from "@/lib/display";
import { getBookingVMs, getExhibitors, getLineup, getScreens, requireProfile } from "@/lib/data";

export default async function BookingsPage() {
  const { supabase } = await requireProfile();

  const [screens, lineup, bookings, exhibitors] = await Promise.all([
    getScreens(supabase),
    getLineup(supabase, { confirmedOnly: true }),
    getBookingVMs(supabase),
    getExhibitors(supabase),
  ]);

  const titles = lineup.map((l) => ({
    lineupId: l.lineup_id,
    titleNo: l.title_no,
    format: l.format,
    releaseDate: l.first_available_release_date,
    name: titleDisplayName(l.title?.film_imdb_db ?? null, l.title?.erp_title, l.title_no),
  }));

  const existing = bookings
    .filter((b) => b.status === "requested" || b.status === "confirmed")
    .map((b) => ({ titleNo: b.titleNo, date: b.date, screenUnique: b.screenUnique }));

  return (
    <Suspense>
      <BookingsView
        bookings={bookings}
        screens={screens.map((s) => ({
          screenUnique: s.screen_unique,
          label: [s.site_name, s.screen_name].filter(Boolean).join(" · ") || s.screen_unique,
          screenFormat: s.screen_format,
        }))}
        titles={titles}
        existing={existing}
        calendarScreens={screens.map((s) => ({
          screen_unique: s.screen_unique,
          exhibitor_id: s.exhibitor_id,
          site_name: s.site_name,
          screen_name: s.screen_name,
          screen_format: s.screen_format,
        }))}
        exhibitors={exhibitors.map((e) => ({
          exhibitor_unique: e.exhibitor_unique,
          name: e.exhibitor_erp ?? e.exhibitor_unique,
          country: e.entity_country ?? "",
          accountManager: e.account_manager,
        }))}
      />
    </Suspense>
  );
}
