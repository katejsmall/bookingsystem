"use client";

import { useMemo, useState } from "react";
import { FormatBadge } from "@/components/ui";
import { formatDate } from "@/lib/display";
import type { ProductionRequestStatus, ProductionRequestVM } from "@/lib/types";

const FILTERS: { value: "" | ProductionRequestStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "under_review", label: "Under review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
];

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

function ProductionStatusBadge({ status }: { status: ProductionRequestStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function MyProductionRequests({ requests }: { requests: ProductionRequestVM[] }) {
  const [filter, setFilter] = useState<"" | ProductionRequestStatus>("");

  const rows = useMemo(
    () => requests.filter((r) => !filter || r.status === filter),
    [requests, filter]
  );

  return (
    <div className="space-y-4">
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
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          {filter ? `No ${STATUS_LABELS[filter]} requests.` : "No requests yet — submit one on the left."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Format</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Requested</th>
                <th className="px-4 py-2.5 font-medium">Decided</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {r.imdb_link ? (
                      <a
                        href={r.imdb_link}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {r.title_text}
                      </a>
                    ) : (
                      r.title_text
                    )}
                    {r.first_release_date && (
                      <p className="mt-0.5 text-xs font-normal text-muted">
                        First release: {formatDate(r.first_release_date)}
                      </p>
                    )}
                    {r.notes && <p className="mt-0.5 text-xs font-normal text-muted">“{r.notes}”</p>}
                    {r.decision_note && (
                      <p className="mt-0.5 text-xs font-normal text-muted">
                        CJ note: “{r.decision_note}”
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <FormatBadge format={r.format} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ProductionStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {formatDate(r.requested_at?.slice(0, 10))}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {r.decided_at ? formatDate(r.decided_at.slice(0, 10)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
