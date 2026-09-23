"use client";

import { useMemo, useState, useTransition } from "react";
import {
  completeTrailerRequests,
  confirmTrailerRequests,
  declineTrailerRequests,
} from "@/app/actions/trailerRequests";
import type { ActionResult } from "@/app/actions/bookings";
import { FormatBadge, SubtleButton, inputCls } from "@/components/ui";
import { formatDate } from "@/lib/display";
import { TRAILER_REQUEST_STATUSES, type TrailerRequestStatus, type TrailerRequestVM } from "@/lib/types";

function badgeFormat(format: string): string {
  if (format === "SX") return "ScreenX";
  if (format === "ULTRA") return "Ultra4DX";
  return "4DX";
}

const STATUS_STYLES: Record<TrailerRequestStatus, string> = {
  under_review: "bg-requested/10 text-requested border-requested/40 border-dashed",
  confirmed: "bg-confirmed/10 text-confirmed border-confirmed/30",
  declined: "bg-foreground/5 text-muted border-line",
  completed: "bg-foreground text-background border-foreground",
};
const STATUS_LABELS: Record<TrailerRequestStatus, string> = {
  under_review: "under review",
  confirmed: "confirmed",
  declined: "declined",
  completed: "completed",
};

const STATUS_FILTERS: { value: "" | TrailerRequestStatus; label: string }[] = [
  { value: "", label: "All" },
  ...TRAILER_REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

export function TrailerRequestQueue({ requests }: { requests: TrailerRequestVM[] }) {
  const [status, setStatus] = useState<"" | TrailerRequestStatus>("under_review");
  const [declining, setDeclining] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [rowWarning, setRowWarning] = useState<{ id: number; message: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      requests
        .filter((r) => !status || r.status === status)
        .sort((a, b) => (b.requested_at ?? "").localeCompare(a.requested_at ?? "")),
    [requests, status]
  );

  const act = (id: number, action: (ids: number[], note?: string) => Promise<ActionResult>, decisionNote?: string) => {
    setRowError(null);
    setRowWarning(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await action([id], decisionNote);
      if (!res.ok) setRowError({ id, message: res.error });
      else if (res.warning) setRowWarning({ id, message: res.warning });
      setBusyId(null);
      setDeclining(null);
      setNote("");
    });
  };

  return (
    <div className="space-y-3">
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
        <p className="ml-auto text-xs text-muted">
          {rows.length} request{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-medium">Trailer</th>
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
                  No trailer requests.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const busy = busyId === r.id;
              return [
                <tr key={r.id} className="border-b border-line align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.asset.title}</div>
                    {r.asset.version && <p className="mt-0.5 text-xs text-muted">{r.asset.version}</p>}
                    {r.notes && <p className="mt-0.5 text-xs text-muted">“{r.notes}”</p>}
                    {r.decision_note && (
                      <p className="mt-0.5 text-xs text-muted">CJ note: “{r.decision_note}”</p>
                    )}
                    {rowError?.id === r.id && <p className="mt-1 text-xs text-error">{rowError.message}</p>}
                    {rowWarning?.id === r.id && (
                      <p className="mt-1 text-xs text-requested">{rowWarning.message}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <FormatBadge format={badgeFormat(r.asset.format)} />
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
                          onClick={() => act(r.id, confirmTrailerRequests)}
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
                    {r.status === "confirmed" && (
                      <div className="flex justify-end whitespace-nowrap">
                        <button
                          disabled={busy}
                          onClick={() => act(r.id, completeTrailerRequests)}
                          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 transition"
                        >
                          {busy ? "Marking…" : "Mark completed"}
                        </button>
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
                            placeholder="e.g. Not available for your format"
                            className={`${inputCls} mt-1`}
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() => act(r.id, declineTrailerRequests, note)}
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
