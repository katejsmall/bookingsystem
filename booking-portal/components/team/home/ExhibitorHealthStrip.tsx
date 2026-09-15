import type { ExhibitorHealth } from "@/lib/teamHome";

export function ExhibitorHealthStrip({ exhibitors }: { exhibitors: ExhibitorHealth[] }) {
  if (exhibitors.length === 0) {
    return (
      <div className="rounded-[14px] border border-line bg-plane px-[18px] py-6 text-center text-sm text-muted">
        No exhibitors assigned to this territory yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
      {exhibitors.map((e) => (
        <div
          key={e.exhibitorUnique}
          className="flex overflow-hidden rounded-[14px] border border-line transition hover:border-baseline"
        >
          <div className="flex w-[68px] shrink-0 items-center justify-center border-r border-line bg-plane text-[17px] font-bold text-muted">
            {e.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 px-3 py-2.5">
            <p className="truncate text-sm font-semibold" title={e.name}>
              {e.name}
            </p>
            <p className="truncate text-[11px] text-muted">{e.country || "—"}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {e.formats.map((f) => (
                <span
                  key={f}
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    f === "ScreenX" ? "pill-sx" : "pill-4dx"
                  }`}
                >
                  {f}
                </span>
              ))}
              {e.dormant ? (
                <span className="pill-crit ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                  Nothing booked
                </span>
              ) : (
                <span className="num ml-auto text-[11px] text-muted">{e.upcomingCount} upcoming</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
