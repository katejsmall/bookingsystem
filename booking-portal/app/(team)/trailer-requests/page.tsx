import { TrailerRequestQueue } from "@/components/TrailerRequestQueue";
import { PageHead } from "@/components/team/PageHead";
import { getTrailerRequests } from "@/lib/data";
import { getTeamContext } from "@/lib/teamContext";
import { scopeSuffix } from "@/lib/teamScope";

export default async function TrailerRequestsPage() {
  const { supabase, scope, isAll, exhibitorIds } = await getTeamContext();
  const all = await getTrailerRequests(supabase);
  const requests = isAll ? all : all.filter((r) => exhibitorIds.has(r.exhibitor_unique));

  return (
    <>
      <PageHead
        title="Trailer requests"
        subtitle={`Trailer assets exhibitors ${scopeSuffix(scope)} have requested.`}
      />
      <TrailerRequestQueue requests={requests} />
    </>
  );
}
