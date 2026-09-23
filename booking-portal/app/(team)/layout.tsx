import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NoticeBoard, type TeamNotice } from "@/components/team/NoticeBoard";
import { TeamShell } from "@/components/team/TeamShell";
import {
  getExhibitors,
  getPendingCount,
  getPendingProductionRequestCount,
  getPendingTrailerRequestCount,
  requireProfile,
} from "@/lib/data";
import {
  isAllScope,
  managersFrom,
  readTeamScope,
  scopeExhibitors,
  TEAM_SCOPE_COOKIE,
} from "@/lib/teamScope";

export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, profile } = await requireProfile();
  // The team portal is team-only; exhibitors have their own shell.
  if (profile.role !== "team") redirect("/dashboard");

  const [cookieStore, exhibitors] = await Promise.all([cookies(), getExhibitors(supabase)]);
  const managers = managersFrom(exhibitors);
  const scope = readTeamScope(
    cookieStore.get(TEAM_SCOPE_COOKIE)?.value,
    managers,
    profile.territory
  );

  // Scoped badge counts: when a territory is selected the nav should only
  // nag about that territory's work.
  const scopedIds = isAllScope(scope)
    ? undefined
    : scopeExhibitors(exhibitors, scope).map((e) => e.exhibitor_unique);
  const [pendingCount, productionPendingCount, trailerPendingCount, notices] = await Promise.all([
    getPendingCount(supabase, scopedIds),
    getPendingProductionRequestCount(supabase, scopedIds),
    getPendingTrailerRequestCount(supabase, scopedIds),
    supabase
      .from("team_notices")
      .select("id, kind, body, territory, due_date, pinned, done, created_by, created_at, done_by")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100)
      .then((r) => (r.data ?? []) as TeamNotice[]),
  ]);

  // Board items are either territory-specific or for everyone.
  const boardNotices = isAllScope(scope)
    ? notices
    : notices.filter((n) => !n.territory || n.territory === scope);

  return (
    <TeamShell
      fullName={profile.full_name ?? "Team"}
      email={user.email}
      scope={scope}
      managers={managers}
      pendingCount={pendingCount}
      productionPendingCount={productionPendingCount}
      trailerPendingCount={trailerPendingCount}
    >
      {children}
      <NoticeBoard notices={boardNotices} managers={managers} scope={scope} />
    </TeamShell>
  );
}
