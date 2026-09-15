import { LineupAdmin } from "@/components/crm/LineupAdmin";
import { PageHead } from "@/components/team/PageHead";
import { titleDisplayName } from "@/lib/display";
import { getLineup, getTitleMaster } from "@/lib/data";
import { getTeamContext } from "@/lib/teamContext";

export default async function LineupPage() {
  const { supabase } = await getTeamContext();
  const [lineup, titles] = await Promise.all([getLineup(supabase), getTitleMaster(supabase)]);

  return (
    <>
      <PageHead
        title="Lineup"
        subtitle="The global title catalogue — shared across all territories. Only confirmed titles can be booked."
      />
      <LineupAdmin
        lineup={lineup.map((l) => ({
          lineupId: l.lineup_id,
          titleNo: l.title_no,
          name: titleDisplayName(l.title?.film_imdb_db ?? null, l.title?.erp_title, l.title_no),
          format: l.format,
          confirmed: l.confirmed,
          releaseDate: l.first_available_release_date,
          notes: l.notes,
        }))}
        titles={titles.map((t) => ({
          titleNo: t.title_no,
          name: titleDisplayName(t.film_imdb_db, t.erp_title, t.title_no),
        }))}
      />
    </>
  );
}
