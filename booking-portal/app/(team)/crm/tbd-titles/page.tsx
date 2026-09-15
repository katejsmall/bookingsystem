import { TbdTitleAdmin } from "@/components/crm/TbdTitleAdmin";
import { PageHead } from "@/components/team/PageHead";
import { getTbdTitlesWithVotes } from "@/lib/data";
import { getTeamContext } from "@/lib/teamContext";

export default async function TbdTitlesAdminPage() {
  const { supabase } = await getTeamContext();
  const titles = await getTbdTitlesWithVotes(supabase);

  return (
    <>
      <PageHead
        title="TBD titles"
        subtitle="Demand polls put to exhibitors globally — votes come in from all territories."
      />
      <TbdTitleAdmin titles={titles} />
    </>
  );
}
