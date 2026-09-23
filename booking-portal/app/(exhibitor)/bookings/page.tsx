import { Suspense } from "react";
import { BookingsView } from "@/components/exhibitor/BookingsView";
import { titleDisplayName } from "@/lib/display";
import {
  getBookingVMs,
  getExhibitors,
  getLineup,
  getMyTrailerRequests,
  getScreens,
  getTrailerAssets,
  requireProfile,
} from "@/lib/data";

export default async function BookingsPage() {
  const { supabase } = await requireProfile();

  const [screens, lineup, bookings, exhibitors] = await Promise.all([
    getScreens(supabase),
    getLineup(supabase, { confirmedOnly: true }),
    getBookingVMs(supabase),
    getExhibitors(supabase),
  ]);

  // Same exhibitor-format derivation the Dashboard/Lineup & Trailers pages
  // use - kept local rather than shared since it's three lines and each
  // page already has its own exhibitor row in hand.
  const exhibitor = exhibitors[0];
  const trailerFormats: string[] = [];
  if (exhibitor?.["4dx"] || exhibitor?.ultra4dx) trailerFormats.push("4DX");
  if (exhibitor?.screenx) trailerFormats.push("ScreenX");
  const [trailerAssets, myTrailerRequests] = await Promise.all([
    getTrailerAssets(supabase, { formats: trailerFormats, hasUltra: !!exhibitor?.ultra4dx }),
    getMyTrailerRequests(supabase),
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
        trailerAssets={trailerAssets}
        myTrailerRequests={myTrailerRequests}
      />
    </Suspense>
  );
}
