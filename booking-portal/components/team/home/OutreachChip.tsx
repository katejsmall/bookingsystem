"use client";

import { useState, useTransition } from "react";
import { clearOutreach, markOutreach } from "@/app/actions/outreach";
import { formatDate } from "@/lib/display";
import { OUTREACH_LABELS, type OutreachRecord, type OutreachStatus } from "@/lib/outreach";

export type ChaseExhibitor = {
  exhibitorUnique: string;
  name: string;
  country: string;
  email: string | null;
};

const PILL: Record<OutreachStatus, string> = {
  asked: "pill-warn",
  declined: "pill-crit",
  no_response: "pill-crit",
};

/**
 * One exhibitor in a title's chase list. Untouched it reads as "to ask";
 * once logged it shows who asked and when, so the list becomes a record of
 * outreach rather than just a gap report. Opens a small menu on click.
 */
export function OutreachChip({
  titleNo,
  titleName,
  format,
  releaseDate,
  exhibitor,
  record,
  canEdit,
}: {
  titleNo: string;
  titleName: string;
  format: string;
  releaseDate: string;
  exhibitor: ChaseExhibitor;
  record: OutreachRecord | undefined;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<unknown>) => {
    setOpen(false);
    startTransition(() => {
      void fn();
    });
  };

  const mailto = exhibitor.email
    ? `mailto:${exhibitor.email}?subject=${encodeURIComponent(
        `${titleName} (${format}) — releasing ${releaseDate}`
      )}&body=${encodeURIComponent(
        `Hi ${exhibitor.name},\n\nWe have ${titleName} confirmed in ${format} from ${releaseDate}. Would you like to book it?\n\nBest,\nCJ 4DPLEX`
      )}`
    : null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        disabled={!canEdit || pending}
        onClick={() => setOpen((o) => !o)}
        title={
          record
            ? `${OUTREACH_LABELS[record.status]} by ${record.actioned_by ?? "team"} on ${formatDate(record.actioned_at.slice(0, 10))}${record.note ? `\n"${record.note}"` : ""}`
            : `${exhibitor.name} — not asked yet`
        }
        className={`rounded-full border px-2 py-0.5 text-[11px] transition disabled:opacity-60 ${
          record
            ? `border-transparent ${PILL[record.status]}`
            : "border-line bg-surface hover:border-baseline"
        }`}
      >
        {exhibitor.name}
        {record && (
          <span className="ml-1 font-semibold">· {OUTREACH_LABELS[record.status]}</span>
        )}
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="absolute left-0 top-full z-50 mt-1 block w-52 rounded-lg border border-line bg-surface p-1 shadow-lg">
            <span className="block px-2 py-1 text-[10px] uppercase tracking-wider text-muted">
              {exhibitor.name}
            </span>
            {mailto && (
              <a
                href={mailto}
                onClick={() => act(() => markOutreach(titleNo, format, exhibitor.exhibitorUnique, "asked"))}
                className="block rounded px-2 py-1.5 text-[12px] hover:bg-plane"
              >
                ✉ Email &amp; mark asked
              </a>
            )}
            {(["asked", "no_response", "declined"] as OutreachStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => act(() => markOutreach(titleNo, format, exhibitor.exhibitorUnique, s))}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-plane"
              >
                Mark {OUTREACH_LABELS[s].toLowerCase()}
              </button>
            ))}
            {record && (
              <button
                onClick={() => act(() => clearOutreach(titleNo, format, exhibitor.exhibitorUnique))}
                className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-error hover:bg-plane"
              >
                Clear — not asked
              </button>
            )}
            {!mailto && (
              <span className="block px-2 py-1 text-[10px] text-muted">
                No contact email on file
              </span>
            )}
          </span>
        </>
      )}
    </span>
  );
}
