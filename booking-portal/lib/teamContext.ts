import "server-only";
import { cookies } from "next/headers";
import { getExhibitors, requireTeam } from "@/lib/data";
import {
  isAllScope,
  managersFrom,
  readTeamScope,
  scopeExhibitors,
  TEAM_SCOPE_COOKIE,
} from "@/lib/teamScope";
import type { Exhibitor } from "@/lib/types";

/**
 * Everything a team page needs to scope itself to the active territory:
 * the Supabase client, the full exhibitor list, and the subset in scope.
 * The route-group layout already gates on role, but this calls
 * requireTeam() too so a page is never scope-less if it's ever rendered
 * outside the group.
 */
export async function getTeamContext(): Promise<{
  supabase: Awaited<ReturnType<typeof requireTeam>>["supabase"];
  scope: string;
  isAll: boolean;
  allExhibitors: Exhibitor[];
  exhibitors: Exhibitor[];
  exhibitorIds: Set<string>;
}> {
  const { supabase, profile } = await requireTeam();
  const [cookieStore, allExhibitors] = await Promise.all([cookies(), getExhibitors(supabase)]);
  const scope = readTeamScope(
    cookieStore.get(TEAM_SCOPE_COOKIE)?.value,
    managersFrom(allExhibitors),
    profile.territory
  );
  const exhibitors = scopeExhibitors(allExhibitors, scope);
  return {
    supabase,
    scope,
    isAll: isAllScope(scope),
    allExhibitors,
    exhibitors,
    exhibitorIds: new Set(exhibitors.map((e) => e.exhibitor_unique)),
  };
}
