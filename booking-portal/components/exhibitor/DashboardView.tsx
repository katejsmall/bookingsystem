"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { DashboardTitle } from "@/lib/types";
import { deriveTitleType, formatDate } from "@/lib/display";

/** One card per film, carrying every format it's available in. The lineup
 * stores a row per (title, format), so the same film arrives twice for a
 * dual-format release - showing it as two identical posters just looks
 * like a duplicate. */
type TitleCardVM = {
  titleNo: string;
  name: string;
  posterUrl: string | null;
  /** Formats shown on the card, already narrowed by the active filter. */
  formats: string[];
  bookedDate: string | null;
  /** Booked-for date per format, so a partially-booked film reads right. */
  bookedByFormat: Record<string, string>;
};

export function DashboardView({
  exhibitorName,
  titles,
  formats,
}: {
  exhibitorName: string;
  titles: DashboardTitle[];
  formats: string[];
}) {
  const [format, setFormat] = useState("");
  const [showRegional, setShowRegional] = useState(false);
  const showFilter = formats.length > 1;

  const byFormat = useMemo(
    () => (format ? titles.filter((t) => t.format === format) : titles),
    [titles, format]
  );
  const hollywoodOnly = useMemo(
    () => byFormat.filter((t) => deriveTitleType(t.notes) === "Hollywood"),
    [byFormat]
  );
  const visibleRows = showRegional ? byFormat : hollywoodOnly;
  const hiddenCount = byFormat.length - hollywoodOnly.length;

  // Collapse the per-format lineup rows into one card per film. Only the
  // formats surviving the filter are merged in, so filtering to 4DX shows
  // a 4DX badge alone.
  const cards = useMemo(() => {
    const map = new Map<string, TitleCardVM>();
    for (const t of visibleRows) {
      const existing = map.get(t.title_no);
      const card =
        existing ??
        ({
          titleNo: t.title_no,
          name: t.name,
          posterUrl: t.posterUrl,
          formats: [],
          bookedDate: null,
          bookedByFormat: {},
        } satisfies TitleCardVM);
      if (!card.formats.includes(t.format)) card.formats.push(t.format);
      if (!card.posterUrl && t.posterUrl) card.posterUrl = t.posterUrl;
      if (t.bookedDate) {
        card.bookedByFormat[t.format] = t.bookedDate;
        // Surface the earliest booked date across formats.
        if (!card.bookedDate || t.bookedDate < card.bookedDate) card.bookedDate = t.bookedDate;
      }
      map.set(t.title_no, card);
    }
    for (const c of map.values()) c.formats.sort();
    return [...map.values()];
  }, [visibleRows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {exhibitorName}</h1>
        <p className="text-sm text-muted mt-1">Here&apos;s what&apos;s coming up in your lineup.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {showFilter && (
          <div className="flex items-center gap-2">
            {["", ...formats].map((f) => (
              <button
                key={f || "all"}
                onClick={() => setFormat(f)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  format === f
                    ? "border-foreground bg-foreground text-background"
                    : "border-line bg-surface text-muted hover:text-foreground"
                }`}
              >
                {f || "All formats"}
              </button>
            ))}
          </div>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted">
          <input
            type="checkbox"
            checked={showRegional}
            onChange={(e) => setShowRegional(e.target.checked)}
          />
          Also show regional titles{!showRegional && hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
        </label>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-muted py-12 text-center">
          No upcoming confirmed titles for this format right now.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {cards.map((c) => (
            <TitleCard key={c.titleNo} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Format wordmark, so a card shows the 4DX / ScreenX branding rather than
 * plain text. Ultra screens are combo installs and carry the base logo. */
function FormatLogo({ format }: { format: string }) {
  const base = format.replace(/^Ultra/, "");
  const is4dx = base === "4DX";
  return (
    <Image
      src={is4dx ? "/4dx-logo-black.png" : "/screenx-logo-black.png"}
      alt={format}
      width={is4dx ? 2000 : 2800}
      height={is4dx ? 805 : 500}
      className={is4dx ? "h-3 w-auto" : "h-2.5 w-auto"}
    />
  );
}

function TitleCard({ card: c }: { card: TitleCardVM }) {
  const allBooked = c.formats.every((f) => c.bookedByFormat[f]);
  const someBooked = !!c.bookedDate;

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden shadow-sm hover:shadow-md transition">
      <div className="aspect-[2/3] w-full bg-foreground/5">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed/CDN URL or static placeholder */}
        <img
          src={c.posterUrl ?? "/poster-placeholder.svg"}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-3 space-y-2">
        <p className="text-sm font-semibold leading-snug line-clamp-2" title={c.name}>
          {c.name}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {c.formats.map((f) => (
            <FormatLogo key={f} format={f} />
          ))}
        </div>
        {allBooked ? (
          <p className="text-xs font-medium text-confirmed">Booked for {formatDate(c.bookedDate)}</p>
        ) : (
          <>
            {someBooked && (
              <p className="text-[11px] text-confirmed">
                {Object.keys(c.bookedByFormat).join(", ")} booked {formatDate(c.bookedDate)}
              </p>
            )}
            <Link
              href={`/bookings?tab=request&title=${encodeURIComponent(c.titleNo)}`}
              className="inline-block rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background hover:opacity-90 transition"
            >
              {someBooked ? "Book other format" : "Book now"}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
