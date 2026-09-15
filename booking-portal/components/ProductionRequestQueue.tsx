"use client";

import { useMemo, useState, useTransition } from "react";
import {
  confirmProductionRequests,
  declineProductionRequests,
} from "@/app/actions/productionRequests";
import type { ActionResult } from "@/app/actions/bookings";
import { FormatBadge, Select, SubtleButton, inputCls } from "@/components/ui";
import { formatDate } from "@/lib/display";
import { PRODUCTION_FORMATS, type ProductionRequestStatus, type ProductionRequestVM } from "@/lib/types";

const STATUS_STYLES: Record<ProductionRequestStatus, string> = {
  under_review: "bg-requested/10 text-requested border-requested/40 border-dashed",
  confirmed: "bg-confirmed/10 text-confirmed border-confirmed/30",
  declined: "bg-foreground/5 text-muted border-line",
};
const STATUS_LABELS: Record<ProductionRequestStatus, string> = {
  under_review: "under review",
  confirmed: "confirmed",
  declined: "declined",
};

const STATUS_FILTERS: { value: "" | ProductionRequestStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "under_review", label: "Under review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
];

export function ProductionRequestQueue({ requests }: { requests: ProductionRequestVM[] }) {
  const [status, setStatus] = useState<"" | ProductionRequestStatus>("under_review");
  const [format, setFormat] = useState("");
  const [country, setCountry] = useState("");
  const [exhibitor, setExhibitor] = useState("");
  const [declining, setDeclining] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const countries = useMemo(
    () => [...new Set(requests.map((r) => r.country).filter(Boolean))].sort(),
    [requests]
  );
  const exhibitors = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      if (!country || r.country === country) map.set(r.exhibitor_unique, r.exhibitorName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [requests, country]);

  const rows = useMemo(() => {
    return requests
      .filter(
        (r) =>
          (!status || r.status === status) &&
          (!format || r.format === format) &&
          (!country || r.country === country) &&
          (!exhibitor || r.exhibitor_unique === exhibitor)
      )
      .sort((a, b) => (b.requested_at ?? "").localeCompare(a.requested_at ?? ""));
  }, [requests, status, format, country, exhibitor]);

  const act = (
    id: number,
    action: (ids: number[], note?: string) => Promise<ActionResult>,
    decisionNote?: string
  ) => {
    setRowError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await action([id], decisionNote);
      if (!res.ok) setRowError({ id, message: res.error });
      setBusyId(null);
      setDeclining(null);
      setNote("");
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Format"
          value={format}
          onChange={setFormat}
          options={PRODUCTION_FORMATS.map((f) => ({ value: f, label: f }))}
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
        <p className="ml-auto pb-2 text-xs text-muted">
          {rows.length} request{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              status === f.value
                ? "border-foreground bg-foreground text-background"
                : "border-line bg-surface text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Format</th>
              <th className="px-4 py-2.5 font-medium">Exhibitor</th>
              <th className="px-4 py-2.5 font-medium">Country</th>
              <th className="px-4 py-2.5 font-medium">Requested</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No production requests.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const busy = busyId === r.id;
              return [
                <tr key={r.id} className="border-b border-line align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">
                      {r.imdb_link ? (
                        <a href={r.imdb_link} target="_blank" rel="noreferrer" className="hover:underline">
                          {r.title_text}
                        </a>
                      ) : (
                        r.title_text
                      )}
                    </div>
                    {r.first_release_date && (
                      <p className="mt-0.5 text-xs text-muted">
                        First release: {formatDate(r.first_release_date)}
                      </p>
                    )}
                    {r.notes && <p className="mt-0.5 text-xs text-muted">“{r.notes}”</p>}
                    {r.decision_note && (
                      <p className="mt-0.5 text-xs text-muted">CJ note: “{r.decision_note}”</p>
                    )}
                    {rowError?.id === r.id && (
                      <p className="mt-1 text-xs text-error">{rowError.message}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <FormatBadge format={r.format} />
                  </td>
                  <td className="px-4 py-2.5">{r.exhibitorName}</td>
                  <td className="px-4 py-2.5 text-muted">{r.country}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {formatDate(r.requested_at?.slice(0, 10))}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[r.status]}`}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.status === "under_review" && declining !== r.id && (
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button
                          disabled={busy}
                          onClick={() => act(r.id, confirmProductionRequests)}
                          className="rounded-md bg-confirmed px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                        >
                          Confirm
                        </button>
                        <SubtleButton
                          disabled={busy}
                          onClick={() => {
                            setDeclining(r.id);
                            setNote("");
                          }}
                        >
                          Decline
                        </SubtleButton>
                      </div>
                    )}
                  </td>
                </tr>,
                declining === r.id && (
                  <tr key={`${r.id}-decline`} className="border-b border-line bg-foreground/2">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="flex items-end gap-2">
                        <label className="flex-1 text-xs font-medium text-muted">
                          Reason shown to {r.exhibitorName} (optional)
                          <input
                            autoFocus
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g. Not enough demand for this format right now"
                            className={`${inputCls} mt-1`}
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() => act(r.id, declineProductionRequests, note)}
                          className="rounded-md bg-action px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                        >
                          Decline request
                        </button>
                        <SubtleButton onClick={() => setDeclining(null)}>Cancel</SubtleButton>
                      </div>
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
