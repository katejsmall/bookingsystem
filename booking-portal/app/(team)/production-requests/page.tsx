import { ProductionRequestQueue } from "@/components/ProductionRequestQueue";
import { PageHead } from "@/components/team/PageHead";
import { getProductionRequests } from "@/lib/data";
import { getTeamContext } from "@/lib/teamContext";
import { scopeSuffix } from "@/lib/teamScope";

export default async function ProductionRequestsPage() {
  const { supabase, scope, isAll, exhibitorIds } = await getTeamContext();
  const all = await getProductionRequests(supabase);
  const requests = isAll ? all : all.filter((r) => exhibitorIds.has(r.exhibitor_unique));

  return (
    <>
      <PageHead
        title="Production requests"
        subtitle={`Titles exhibitors ${scopeSuffix(scope)} want produced in 4DX or ScreenX.`}
      />
      <ProductionRequestQueue requests={requests} />
    </>
  );
}
