import Link from "next/link";
import { KpiRow, KpiTile } from "@/components/team/KpiTile";
import { PageHead, SectionHead } from "@/components/team/PageHead";
import { ActionQueue } from "@/components/team/home/ActionQueue";
import { ExhibitorHealthStrip } from "@/components/team/home/ExhibitorHealthStrip";
import { ReleaseCoverage } from "@/components/team/home/ReleaseCoverage";
import { ThisWeekList } from "@/components/team/home/ThisWeekList";
import { getTeamContext } from "@/lib/teamContext";
import { getTeamHomeData } from "@/lib/teamHome";
import { scopeLabel } from "@/lib/teamScope";

export default async function TeamHomePage() {
  const { supabase, scope, exhibitors } = await getTeamContext();
  const data = await getTeamHomeData(supabase, scope, exhibitors);
  const { kpis } = data;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <PageHead title={scopeLabel(scope)} subtitle={today} />

      <KpiRow>
        <KpiTile
          label="Awaiting your decision"
          value={kpis.pending}
          tone={kpis.pending > 0 ? "warn" : undefined}
          sub={
            kpis.pendingOldestAgeDays !== null
              ? `Oldest waiting ${kpis.pendingOldestAgeDays} day${kpis.pendingOldestAgeDays === 1 ? "" : "s"}`
              : "Queue is clear"
          }
          href="/requests"
        />
        <KpiTile
          label="Confirmed next 30 days"
          value={kpis.upcoming30d}
          sub="Bookings starting within a month"
          href="/calendar"
        />
        <KpiTile
          label="Exhibitors"
          value={kpis.exhibitorCount}
          tone={kpis.dormantCount > 0 ? "warn" : undefined}
          sub={
            kpis.dormantCount > 0
              ? `${kpis.dormantCount} with nothing booked`
              : "All have upcoming bookings"
          }
          href="/crm/exhibitors"
        />
        <KpiTile
          label="Releasing next 8 weeks"
          value={kpis.releasing8w}
          tone={kpis.lowCoverage > 0 ? "crit" : undefined}
          sub={
            kpis.lowCoverage > 0
              ? `${kpis.lowCoverage} under half-covered`
              : "Coverage looks healthy"
          }
        />
      </KpiRow>

      <ActionQueue
        groups={data.actionQueue.groups}
        totalGroups={data.actionQueue.totalGroups}
        production={data.productionPending}
      />

      <section>
        <SectionHead title="Upcoming releases & coverage">
          <Link href="/crm/lineup" className="text-[11px] font-medium text-link hover:underline">
            Manage lineup →
          </Link>
        </SectionHead>
        <ReleaseCoverage releases={data.releases} outreach={data.outreach} canEdit />
      </section>

      <section>
        <SectionHead title="On screen this week">
          <Link href="/calendar" className="text-[11px] font-medium text-link hover:underline">
            Open calendar →
          </Link>
        </SectionHead>
        <ThisWeekList rows={data.thisWeek.rows} total={data.thisWeek.total} />
      </section>

      <section>
        <SectionHead title="Exhibitor health">
          <Link
            href="/crm/exhibitors"
            className="text-[11px] font-medium text-link hover:underline"
          >
            All exhibitors →
          </Link>
        </SectionHead>
        <ExhibitorHealthStrip exhibitors={data.exhibitorHealth} />
      </section>
    </div>
  );
}
