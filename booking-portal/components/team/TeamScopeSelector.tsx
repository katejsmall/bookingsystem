"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TEAM_SCOPE_ALL, TEAM_SCOPE_COOKIE } from "@/lib/teamScope";

/**
 * The team portal's primary control: which manager's territory everything
 * on screen is scoped to.
 *
 * Server Components can't set cookies during render, so the value is
 * written straight from the browser and then router.refresh() re-runs the
 * server tree (layout included) with the new cookie attached. Every team
 * page is dynamic (they all read cookies), so nothing is served stale.
 * Deliberately not httpOnly - this is a view preference the client owns -
 * and not Secure, so it keeps working on http://localhost.
 */
export function TeamScopeSelector({
  scope,
  managers,
}: {
  scope: string;
  managers: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (value: string) => {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${TEAM_SCOPE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div className="px-3">
      <label
        htmlFor="team-scope"
        className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-white/60"
      >
        Territory
      </label>
      <select
        id="team-scope"
        value={scope}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="w-full rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none backdrop-blur-sm transition hover:bg-white/15 focus:border-white/50 disabled:opacity-60"
      >
        <option value={TEAM_SCOPE_ALL} className="text-foreground">
          All territories
        </option>
        {managers.map((m) => (
          <option key={m} value={m} className="text-foreground">
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
