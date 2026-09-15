import { PosterThumb } from "@/components/team/PosterThumb";
import { formatDate } from "@/lib/display";
import type { ThisWeekRow } from "@/lib/teamHome";

export function ThisWeekList({ rows, total }: { rows: ThisWeekRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-line bg-plane px-[18px] py-6 text-center text-sm text-muted">
        Nothing on screen in this territory over the next 7 days.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-line">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-[18px] py-2.5">
            <PosterThumb src={r.posterUrl} alt={r.title} />
            {r.startsThisWeek && (
              <span className="rounded-full bg-plane px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink2">
                Opens
              </span>
            )}
            <span className="font-medium">{r.title}</span>
            <span className="text-[11px] text-muted">{r.formats.join(" · ")}</span>
            <span
              className="num ml-auto text-[11px] whitespace-nowrap text-muted"
              title={r.exhibitorNames.join(", ")}
            >
              {r.exhibitorCount} exhibitor{r.exhibitorCount === 1 ? "" : "s"} · {r.screenCount}{" "}
              screen{r.screenCount === 1 ? "" : "s"} · {formatDate(r.startDate)} –{" "}
              {formatDate(r.endDate)}
            </span>
          </li>
        ))}
      </ul>
      {total > rows.length && (
        <p className="border-t border-line bg-plane px-[18px] py-2 text-center text-[11px] text-muted">
          Showing {rows.length} of {total} titles on screen this week
        </p>
      )}
    </div>
  );
}
