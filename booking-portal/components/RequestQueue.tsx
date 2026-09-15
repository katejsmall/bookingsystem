"use client";

import { useMemo, useState, useTransition } from "react";
import { confirmBookings, rejectBookings, type ActionResult } from "@/app/actions/bookings";
import { FormatBadge, Select, SubtleButton, inputCls } from "@/components/ui";
import { formatDate } from "@/lib/display";
import type { BookingVM } from "@/lib/types";
import { FORMATS } from "@/lib/types";

type Group = {
  key: string;
  title: string;
  posterUrl: string | null;
  exhibitorId: string;
  exhibitorName: string;
  country: string;
  date: string;
  requestedAt: string | null;
  notes: string | null;
  formats: string[];
  bookings: BookingVM[];
};

type SortKey = "date" | "title" | "exhibitorName" | "country" | "requestedAt";

export function RequestQueue({ bookings }: { bookings: BookingVM[] }) {
  const [format, setFormat] = useState("");
  const [country, setCountry] = useState("");
  const [exhibitor, setExhibitor] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Reject flow: which ids the pending note applies to, keyed by group.
  const [rejecting, setRejecting] = useState<{ groupKey: string; ids: number[] } | null>(null);
  const [note, setNote] = useState("");
  const [groupError, setGroupError] = useState<{ groupKey: string; message: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Territory scoping happens server-side, above this component.
  const countries = useMemo(
    () => [...new Set(bookings.map((b) => b.country).filter(Boolean))].sort(),
    [bookings]
  );
  const exhibitors = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookings) {
      if (!country || b.country === country) map.set(b.exhibitorId, b.exhibitorName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [bookings, country]);

  // One queue row per exhibitor + title + play date - the shape a bulk
  // submission arrives in - expandable to the per-screen bookings.
  const groups = useMemo(() => {
    const filtered = bookings.filter(
      (b) =>
        (!format || b.format === format) &&
        (!country || b.country === country) &&
        (!exhibitor || b.exhibitorId === exhibitor)
    );
    const map = new Map<string, Group>();
    for (const b of filtered) {
      const key = `${b.exhibitorId}|${b.titleNo ?? b.title}|${b.date}`;
      const g = map.get(key);
      if (g) {
        g.bookings.push(b);
        if (!g.formats.includes(b.format)) g.formats.push(b.format);
        if (!g.posterUrl) g.posterUrl = b.posterUrl;
        if (!g.notes) g.notes = b.notes;
        if (b.requestedAt && (!g.requestedAt || b.requestedAt < g.requestedAt)) {
          g.requestedAt = b.requestedAt;
        }
      } else {
        map.set(key, {
          key,
          title: b.title,
          posterUrl: b.posterUrl,
          exhibitorId: b.exhibitorId,
          exhibitorName: b.exhibitorName,
          country: b.country,
          date: b.date,
          requestedAt: b.requestedAt,
          notes: b.notes,
          formats: [b.format],
          bookings: [b],
        });
      }
    }
    const dir = sortAsc ? 1 : -1;
    return [...map.values()].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [bookings, format, country, exhibitor, sortKey, sortAsc]);

  const totalPending = groups.reduce((n, g) => n + g.bookings.length, 0);

  const act = (
    groupKey: string,
    ids: number[],
    action: (ids: number[], note?: string) => Promise<ActionResult>,
    decisionNote?: string
  ) => {
    setGroupError(null);
    setBusyKey(groupKey);
    startTransition(async () => {
      const res = await action(ids, decisionNote);
      if (!res.ok) setGroupError({ groupKey, message: res.error });
      setBusyKey(null);
      setRejecting(null);
      setNote("");
    });
  };

  const header = (label: string, key: SortKey) => (
    <th
      className="cursor-pointer select-none px-4 py-2.5 font-medium hover:text-foreground"
      onClick={() => {
        if (sortKey === key) setSortAsc((a) => !a);
        else {
          setSortKey(key);
          setSortAsc(true);
        }
      }}
    >
      {label}
      {sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Format"
          value={format}
          onChange={setFormat}
          options={FORMATS.map((f) => ({ value: f, label: f }))}
          allLabel="All formats"
        />
        <Select
          label="Country"
          value={country}
          onChange={(v) => {
            setCountry(v);
            setExhibitor("");
          }}
          options={countries.map((c) => ({ value: c, label: c }))}
          allLabel="All countries"
        />
        <Select
          label="Exhibitor"
          value={exhibitor}
          onChange={setExhibitor}
          options={exhibitors.map(([id, name]) => ({ value: id, label: name }))}
          allLabel="All exhibitors"
        />
        <a
          href="/api/export"
          download="bookings.csv"
          className="mb-0.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 transition"
        >
          Export CSV
        </a>
        <p className="ml-auto pb-2 text-xs text-muted">
          {totalPending} pending request{totalPending === 1 ? "" : "s"} in {groups.length} group
          {groups.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              {header("Title", "title")}
              <th className="px-4 py-2.5 font-medium">Formats</th>
              {header("Exhibitor", "exhibitorName")}
              {header("Country", "country")}
              <th className="px-4 py-2.5 font-medium">Screens</th>
              {header("Play date", "date")}
              {header("Requested", "requestedAt")}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  No pending requests.
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const ids = g.bookings.map((b) => b.id);
              const isExpanded = expanded.has(g.key);
              const busy = busyKey === g.key;
              return [
                <tr key={g.key} className="border-b border-line align-top">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {g.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img src={g.posterUrl} alt="" className="h-9 w-6 rounded-[2px] object-cover" />
                      ) : (
                        <span className="h-9 w-6 rounded-[2px] bg-foreground/10" />
                      )}
                      <span className="font-medium">{g.title}</span>
                    </div>
                    {g.notes && <p className="mt-1 text-xs text-muted">“{g.notes}”</p>}
                    {groupError?.groupKey === g.key && (
                      <p className="mt-1 text-xs text-error">{groupError.message}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {g.formats.map((f) => (
                        <FormatBadge key={f} format={f} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{g.exhibitorName}</td>
                  <td className="px-4 py-2.5 text-muted">{g.country}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      className="text-left font-medium text-link hover:underline"
                    >
                      {g.bookings.length} screen{g.bookings.length === 1 ? "" : "s"}{" "}
                      {isExpanded ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-medium">
                    {formatDate(g.date)}
                    <span className="ml-1 font-normal text-muted">
                      · {g.bookings[0].programmingWeeks} wk{g.bookings[0].programmingWeeks === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {formatDate(g.requestedAt?.slice(0, 10))}
                  </td>
                  <td className="px-4 py-2.5">
                    {rejecting?.groupKey === g.key ? null : (
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button
                          disabled={busy}
                          onClick={() => act(g.key, ids, confirmBookings)}
                          className="rounded-md bg-confirmed px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                        >
                          Confirm{g.bookings.length > 1 ? " all" : ""}
                        </button>
                        <SubtleButton
                          disabled={busy}
                          onClick={() => {
                            setRejecting({ groupKey: g.key, ids });
                            setNote("");
                          }}
                        >
                          Reject{g.bookings.length > 1 ? " all" : ""}
                        </SubtleButton>
                      </div>
                    )}
                  </td>
                </tr>,
                rejecting?.groupKey === g.key && (
                  <tr key={`${g.key}-reject`} className="border-b border-line bg-foreground/2">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="flex items-end gap-2">
                        <label className="flex-1 text-xs font-medium text-muted">
                          Reason shown to {g.exhibitorName} (optional)
                          <input
                            autoFocus
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g. Date clashes with an existing hold — try the following week"
                            className={`${inputCls} mt-1`}
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() => act(g.key, rejecting.ids, rejectBookings, note)}
                          className="rounded-md bg-action px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                        >
                          Reject {rejecting.ids.length > 1 ? `${rejecting.ids.length} requests` : "request"}
                        </button>
                        <SubtleButton onClick={() => setRejecting(null)}>Cancel</SubtleButton>
                      </div>
                    </td>
                  </tr>
                ),
                isExpanded && (
                  <tr key={`${g.key}-detail`} className="border-b border-line bg-background/60">
                    <td colSpan={8} className="px-4 py-2">
                      <table className="w-full text-sm">
                        <tbody>
                          {g.bookings.map((b) => (
                            <tr key={b.id} className="border-b border-line/60 last:border-0">
                              <td className="py-1.5 pl-8 text-muted">{b.screenLabel}</td>
                              <td className="py-1.5">
                                <FormatBadge format={b.format} />
                              </td>
                              <td className="py-1.5 text-muted">
                                {b.programmingWeeks} wk{b.programmingWeeks === 1 ? "" : "s"}
                              </td>
                              <td className="py-1.5">
                                <div className="flex justify-end gap-2 whitespace-nowrap">
                                  <button
                                    disabled={busy}
                                    onClick={() => act(g.key, [b.id], confirmBookings)}
                                    className="rounded-md bg-confirmed px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => {
                                      setRejecting({ groupKey: g.key, ids: [b.id] });
                                      setNote("");
                                    }}
                                    className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-foreground/5 disabled:opacity-50 transition"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
