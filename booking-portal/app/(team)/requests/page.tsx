import { RequestQueue } from "@/components/RequestQueue";
import { PageHead } from "@/components/team/PageHead";
import { getBookingVMs } from "@/lib/data";
import { getTeamContext } from "@/lib/teamContext";
import { scopeBookings, scopeSuffix } from "@/lib/teamScope";

export default async function RequestsPage() {
  const { supabase, scope } = await getTeamContext();
  // Filtered in the query, not after: only genuine site submissions are
  // actionable (bulk-imported status='requested' rows reflect the sheet
  // not marking a title confirmed yet, not an exhibitor awaiting us), and
  // pulling the whole 21k-row table just to keep a handful is what made
  // this page take ~45s.
  const pending = scopeBookings(
    await getBookingVMs(supabase, { statuses: ["requested"], siteSubmittedOnly: true }),
    scope
  );

  return (
    <>
      <PageHead
        title="Request queue"
        subtitle={`Booking requests awaiting a decision ${scopeSuffix(scope)}.`}
      />
      <RequestQueue bookings={pending} />
    </>
  );
}
