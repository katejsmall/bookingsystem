import { ScreenAdmin } from "@/components/crm/ScreenAdmin";
import { PageHead } from "@/components/team/PageHead";
import { getScreens } from "@/lib/data";
import { getTeamContext } from "@/lib/teamContext";
import { scopeByExhibitorIds, scopeSuffix } from "@/lib/teamScope";

export default async function ScreensPage() {
  const { supabase, scope, isAll, exhibitors, exhibitorIds } = await getTeamContext();
  const allScreens = await getScreens(supabase);
  const screens = isAll
    ? allScreens
    : scopeByExhibitorIds(allScreens, exhibitorIds, (s) => s.exhibitor_id);

  return (
    <>
      <PageHead
        title="Screens"
        subtitle={`${screens.length} screen${screens.length === 1 ? "" : "s"} ${scopeSuffix(scope)}.`}
      />
      <ScreenAdmin
        screens={screens}
        exhibitors={exhibitors.map((e) => ({
          exhibitor_unique: e.exhibitor_unique,
          name: e.exhibitor_erp ?? e.exhibitor_unique,
        }))}
      />
    </>
  );
}
