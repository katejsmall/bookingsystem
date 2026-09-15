import Link from "next/link";
import { SectionHead } from "@/components/team/PageHead";
import { PosterThumb } from "@/components/team/PosterThumb";
import { formatDate } from "@/lib/display";
import type { ActionGroup, TeamHomeData } from "@/lib/teamHome";

const AGE_PILL: Record<ActionGroup["severity"], string> = {
  ok: "pill-good",
  warn: "pill-warn",
  crit: "pill-crit",
};

export function ActionQueue({
  groups,
  totalGroups,
  production,
}: {
  groups: ActionGroup[];
  totalGroups: number;
  production: TeamHomeData["productionPending"];
}) {
  if (groups.length === 0 && production.length === 0) {
    return (
      <section>
        <SectionHead title="Needs your decision" />
        <div className="rounded-[14px] border border-line bg-plane px-[18px] py-6 text-center text-sm text-muted">
          Nothing waiting on you. Every request in this territory has been decided.
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHead title="Needs your decision">
        {totalGroups > groups.length && (
          <Link href="/requests" className="text-[11px] font-medium text-link hover:underline">
            {totalGroups} total — open queue →
          </Link>
        )}
      </SectionHead>

      {groups.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-plane text-left text-[10px] uppercase tracking-[0.07em] text-ink2">
                <th className="px-4 py-2 font-bold">Title</th>
                <th className="px-4 py-2 font-bold">Exhibitor</th>
                <th className="px-4 py-2 font-bold">Play date</th>
                <th className="px-4 py-2 font-bold">Screens</th>
                <th className="px-4 py-2 font-bold">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-b border-line last:border-0 hover:bg-plane">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <PosterThumb src={g.posterUrl} alt={g.title} className="h-9 w-6" />
                      <span className="font-medium">
                        {g.title}
                        <span className="ml-1.5 text-[11px] font-normal text-muted">
                          {g.formats.join(" · ")}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{g.exhibitorName}</td>
                  <td className="num px-4 py-2.5 whitespace-nowrap">{formatDate(g.playDate)}</td>
                  <td className="num px-4 py-2.5 text-muted">{g.screenCount}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`num inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${AGE_PILL[g.severity]}`}
                    >
                      {g.ageDays}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link
            href="/requests"
            className="block border-t border-line bg-plane px-4 py-2 text-center text-[11px] font-semibold text-link hover:underline"
          >
            Open the full request queue →
          </Link>
        </div>
      )}

      {production.length > 0 && (
        <div className="mt-3 rounded-[14px] border border-line px-[18px] py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-ink2">
            Production requests under review
          </p>
          <ul className="space-y-1.5">
            {production.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{p.titleText}</span>
                <span className="text-[11px] text-muted">
                  {p.format} · {p.exhibitorName}
                </span>
                <span className="num ml-auto text-[11px] text-muted">{p.ageDays}d ago</span>
              </li>
            ))}
          </ul>
          <Link
            href="/production-requests"
            className="mt-2 inline-block text-[11px] font-semibold text-link hover:underline"
          >
            Review production requests →
          </Link>
        </div>
      )}
    </section>
  );
}
