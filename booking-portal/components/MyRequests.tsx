"use client";

import { useMemo, useState, useTransition } from "react";
import { cancelBookings } from "@/app/actions/bookings";
import { FormatBadge, StatusBadge, SubtleButton } from "@/components/ui";
import { formatDate } from "@/lib/display";
import type { BookingStatus, BookingVM } from "@/lib/types";

const FILTERS: { value: "" | BookingStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

type Group = {
  key: string;
  title: string;
  date: string;
  bookings: BookingVM[];
};

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function MyRequests({ bookings }: { bookings: BookingVM[] }) {
  const [filter, setFilter] = useState<"" | BookingStatus>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Decisions from the last 14 days - the in-app stand-in for email
  // notifications, so a returning exhibitor sees what changed first.
  const recentDecisions = useMemo(() => {
    const cutoff = daysAgoIso(14);
    return bookings
      .filter(
        (b) =>
          (b.status === "confirmed" || b.status === "rejected") &&
          b.confirmedAt &&
          b.confirmedAt >= cutoff
      )
      .sort((a, b) => (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? ""));
  }, [bookings]);

  const groups = useMemo(() => {
    const filtered = bookings.filter((b) => !filter || b.status === filter);
    const map = new Map<string, Group>();
    for (const b of filtered) {
      const key = `${b.titleNo ?? b.title}|${b.date}`;
      const g = map.get(key);
      if (g) g.bookings.push(b);
      else map.set(key, { key, title: b.title, date: b.date, bookings: [b] });
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [bookings, filter]);

  const cancelGroup = (key: string, ids: number[]) => {
    setError(null);
    setBusyKey(key);
    startTransition(async () => {
      const res = await cancelBookings(ids);
      if (!res.ok) setError(res.error);
      setBusyKey(null);
    });
  };

  return (
    <div className="space-y-4">
      {recentDecisions.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Recent decisions (last 14 days)
          </h3>
          <ul className="space-y-1.5">
            {recentDecisions.slice(0, 8).map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <StatusBadge status={b.status} />
                <span className="font-medium">{b.title}</span>
                <span className="text-muted">
                  {b.screenLabel} · {formatDate(b.date)}
                </span>
                <span className="ml-auto text-xs text-muted">
                  decided {formatDate(b.confirmedAt?.slice(0, 10))}
                </span>
                {b.decisionNote && (
                  <p className="w-full pl-1 text-xs text-muted">“{b.decisionNote}”</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === f.value
                ? "border-foreground bg-foreground text-background"
                : "border-line bg-surface text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        {error && <p className="ml-2 text-sm text-error">{error}</p>}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">
          {filter ? `No ${filter} requests.` : "No requests yet — submit one on the left."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Play date</th>
                <th className="px-4 py-2.5 font-medium">Screens</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Decided</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isExpanded = expanded.has(g.key);
                const pending = g.bookings.filter((b) => b.status === "requested");
                const statuses = [...new Set(g.bookings.map((b) => b.status))];
                const decidedAt = g.bookings
                  .map((b) => b.confirmedAt)
                  .filter(Boolean)
                  .sort()
                  .pop();
                const note = g.bookings.find((b) => b.decisionNote)?.decisionNote;
                return [
                  <tr key={g.key} className="border-b border-line align-top">
                    <td className="px-4 py-2.5 font-medium">
                      {g.title}
                      {note && <p className="mt-0.5 text-xs font-normal text-muted">“{note}”</p>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {formatDate(g.date)}
                      <span className="ml-1 text-muted">
                        · {g.bookings[0].programmingWeeks} wk{g.bookings[0].programmingWeeks === 1 ? "" : "s"}
                      </span>
                    </td>
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
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {statuses.map((s) => (
                          <StatusBadge key={s} status={s} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {decidedAt ? formatDate(decidedAt.slice(0, 10)) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {pending.length > 0 && (
                        <SubtleButton
                          disabled={busyKey === g.key}
                          onClick={() =>
                            cancelGroup(
                              g.key,
                              pending.map((b) => b.id)
                            )
                          }
                        >
                          Cancel{pending.length > 1 ? ` all (${pending.length})` : ""}
                        </SubtleButton>
                      )}
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${g.key}-detail`} className="border-b border-line bg-background/60">
                      <td colSpan={6} className="px-4 py-2">
                        <table className="w-full text-sm">
                          <tbody>
                            {g.bookings.map((b) => (
                              <tr key={b.id} className="border-b border-line/60 last:border-0">
                                <td className="py-1.5 pl-8 text-muted">{b.screenLabel}</td>
                                <td className="py-1.5">
                                  <FormatBadge format={b.format} />
                                </td>
                                <td className="py-1.5">
                                  <StatusBadge status={b.status} />
                                </td>
                                <td className="py-1.5 text-xs text-muted">
                                  {b.decisionNote ? `“${b.decisionNote}”` : ""}
                                </td>
                                <td className="py-1.5 text-right">
                                  {b.status === "requested" && (
                                    <button
                                      disabled={busyKey === g.key}
                                      onClick={() => cancelGroup(g.key, [b.id])}
                                      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-foreground/5 disabled:opacity-50 transition"
                                    >
                                      Cancel
                                    </button>
                                  )}
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
      )}
    </div>
  );
}
