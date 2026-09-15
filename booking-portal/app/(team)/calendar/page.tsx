import { CalendarView } from "@/components/CalendarView";
import { PageHead } from "@/components/team/PageHead";
import { getBookingVMs, getScreens } from "@/lib/data";
import { addDaysIso, todayIso } from "@/lib/display";
import { getTeamContext } from "@/lib/teamContext";
import { scopeBookings, scopeByExhibitorIds, scopeSuffix } from "@/lib/teamScope";
import { toCalendarBooking } from "@/lib/types";

/** How far back the calendar loads. It opens on the current month and the
 * "show earlier months" toggle reveals what's already loaded - fetching
 * the full multi-year history instead pushed ~17MB of HTML to the browser. */
const HISTORY_DAYS = 45;

export default async function CalendarPage() {
  const { supabase, scope, isAll, exhibitors, exhibitorIds } = await getTeamContext();
  const windowStart = addDaysIso(todayIso(), -HISTORY_DAYS);
  const [allBookings, allScreens] = await Promise.all([
    getBookingVMs(supabase, { from: windowStart }),
    getScreens(supabase),
  ]);

  const bookings = scopeBookings(allBookings, scope);
  const screens = isAll
    ? allScreens
    : scopeByExhibitorIds(allScreens, exhibitorIds, (s) => s.exhibitor_id);

  return (
    <>
      <PageHead
        title="Calendar"
        subtitle={`Booking runs ${scopeSuffix(scope)}, from ${windowStart} onward.`}
      >
        <a
          href="/api/export"
          download
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-baseline"
        >
          Export CSV
        </a>
      </PageHead>
      <CalendarView
        bookings={bookings.map(toCalendarBooking)}
        screens={screens.map((s) => ({
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
        }))}
        isTeam={true}
      />
    </>
  );
}
