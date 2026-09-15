"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/display";
import type { ReleaseCoverageItem } from "@/lib/teamHome";
import { OutreachChip } from "@/components/team/home/OutreachChip";
import { PosterThumb } from "@/components/team/PosterThumb";
import type { OutreachMap } from "@/lib/outreach";

/**
 * Upcoming confirmed titles with how much of the territory has booked
 * them - the coverage bar plus, on expand, exactly which exhibitors
 * haven't, so the row doubles as a chase list.
 */
export function ReleaseCoverage({
  releases,
  outreach,
  canEdit,
}: {
  releases: ReleaseCoverageItem[];
  outreach: OutreachMap;
  canEdit: boolean;
}) {
  const [showRegional, setShowRegional] = useState(false);
  const [formats, setFormats] = useState<Record<"4DX" | "ScreenX", boolean>>({
    "4DX": true,
    ScreenX: true,
  });

  const regionalCount = releases.filter((r) => !r.isWide).length;

  const visible = useMemo(
    () =>
      releases.filter(
        (r) => (showRegional || r.isWide) && formats[r.format]
      ),
    [releases, showRegional, formats]
  );

  if (releases.length === 0) {
    return (
      <div className="rounded-[14px] border border-line bg-plane px-[18px] py-6 text-center text-sm text-muted">
        No confirmed titles with an upcoming release date.
      </div>
    );
  }

  const toggle = (f: "4DX" | "ScreenX") =>
    setFormats((prev) => ({ ...prev, [f]: !prev[f] }));

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(["4DX", "ScreenX"] as const).map((f) => (
            <button
              key={f}
              onClick={() => toggle(f)}
              aria-pressed={formats[f]}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition ${
                formats[f]
                  ? f === "4DX"
                    ? "border-fourdx bg-fourdx text-white"
                    : "border-screenx bg-screenx text-white"
                  : "border-line bg-surface text-muted hover:border-baseline"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {regionalCount > 0 && (
          <label className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <input
              type="checkbox"
              checked={showRegional}
              onChange={(e) => setShowRegional(e.target.checked)}
            />
            Also show local &amp; regional titles ({regionalCount})
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-plane px-[18px] py-6 text-center text-sm text-muted">
          Nothing matches those filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line">
          <div className="grid grid-cols-[104px_64px_1fr_180px_92px] items-center gap-3 border-b border-line bg-plane px-[18px] py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-ink2">
            <span>Release</span>
            <span>Format</span>
            <span className="pl-[42px]">Title</span>
            <span>Coverage</span>
            <span className="text-right">To chase</span>
          </div>
          <div className="divide-y divide-line">
            {visible.map((r) => (
              <Row key={r.key} release={r} outreach={outreach} canEdit={canEdit} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  release: r,
  outreach,
  canEdit,
}: {
  release: ReleaseCoverageItem;
  outreach: OutreachMap;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pct = r.capable > 0 ? Math.round((r.booked / r.capable) * 100) : 0;
  const tone = r.capable === 0 ? "none" : pct >= 75 ? "good" : pct >= 40 ? "warn" : "crit";
  const barColor =
    tone === "good"
      ? "bg-good-fill"
      : tone === "warn"
        ? "bg-warn-fill"
        : tone === "crit"
          ? "bg-crit-fill"
          : "bg-baseline";

  // "To chase" is the ones we haven't even asked yet - already-asked
  // exhibitors are still unbooked but they're not an action.
  const notAsked = r.missing.filter(
    (m) => !outreach[`${r.titleNo}|${r.format}|${m.exhibitorUnique}`]
  );

  return (
    <div className="px-[18px] py-2.5">
      <div className="grid grid-cols-[104px_64px_1fr_180px_92px] items-center gap-3">
        <span className="num text-[11px] leading-tight">
          {formatDate(r.releaseDate)}
          <span className="block text-[10px] text-muted">in {r.daysUntil}d</span>
        </span>
        <span
          className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            r.format === "4DX" ? "pill-4dx" : "pill-sx"
          }`}
        >
          {r.format}
        </span>
        <span className="flex min-w-0 items-center gap-2.5">
          <PosterThumb src={r.posterUrl} alt={r.title} />
          <span className="min-w-0 truncate font-medium" title={r.title}>
            {r.title}
            {!r.isWide && (
              <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wider text-muted">
                {r.titleType ?? "Local"}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-[7px] w-[70px] shrink-0 overflow-hidden rounded-full bg-seq1">
            <span className={`block h-full ${barColor}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="num text-[11px] text-ink2">
            {r.booked}/{r.capable}
          </span>
        </span>
        <span className="text-right">
          {r.missing.length > 0 ? (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[11px] font-semibold text-link hover:underline"
            >
              {notAsked.length > 0 ? `${notAsked.length} to ask` : "all asked"} {open ? "▾" : "▸"}
            </button>
          ) : (
            <span className="text-[11px] text-good">complete</span>
          )}
        </span>
      </div>

      {open && r.missing.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
          {r.missing.map((m) => (
            <OutreachChip
              key={m.exhibitorUnique}
              titleNo={r.titleNo}
              titleName={r.title}
              format={r.format}
              releaseDate={r.releaseDate}
              exhibitor={m}
              record={outreach[`${r.titleNo}|${r.format}|${m.exhibitorUnique}`]}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
