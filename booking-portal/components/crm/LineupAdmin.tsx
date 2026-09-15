"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { saveLineup, toggleLineupConfirmed } from "@/app/actions/crm";
import type { ActionResult } from "@/app/actions/bookings";
import { Field, FormatBadge, Modal, PrimaryButton, Select, SubtleButton, inputCls } from "@/components/ui";
import { formatDate } from "@/lib/display";
import { FORMATS } from "@/lib/types";
import { TitleSearchSelect, type TitleOpt } from "@/components/crm/TitleSearchSelect";

type LineupItem = {
  lineupId: number;
  titleNo: string;
  name: string;
  format: string;
  confirmed: boolean;
  releaseDate: string | null;
  notes: string | null;
};

export function LineupAdmin({
  lineup,
  titles,
}: {
  lineup: LineupItem[];
  titles: TitleOpt[];
}) {
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const [editing, setEditing] = useState<LineupItem | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return lineup.filter(
      (l) =>
        (!q || l.name.toLowerCase().includes(q)) && (!format || l.format === format)
    );
  }, [lineup, search, format]);

  const toggle = (l: LineupItem) => {
    setError(null);
    setBusyId(l.lineupId);
    startTransition(async () => {
      const res = await toggleLineupConfirmed(l.lineupId, !l.confirmed);
      if (!res.ok) setError(res.error);
      setBusyId(null);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles…"
          className={`${inputCls} max-w-xs`}
        />
        <Select
          label="Format"
          value={format}
          onChange={setFormat}
          options={FORMATS.map((f) => ({ value: f, label: f }))}
          allLabel="All formats"
        />
        <PrimaryButton onClick={() => setEditing("add")}>Add to lineup</PrimaryButton>
        <p className="ml-auto pb-2 text-xs text-muted">
          {rows.length} of {lineup.length} · only confirmed titles can be booked
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Format</th>
              <th className="px-4 py-2.5 font-medium">First available</th>
              <th className="px-4 py-2.5 font-medium">Confirmed</th>
              <th className="px-4 py-2.5 font-medium">Notes</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Nothing in the lineup yet — add a title to make it bookable.
                </td>
              </tr>
            )}
            {rows.map((l) => (
              <tr key={l.lineupId} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-medium">{l.name}</td>
                <td className="px-4 py-2.5">
                  <FormatBadge format={l.format} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(l.releaseDate)}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => toggle(l)}
                    disabled={busyId === l.lineupId}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition disabled:opacity-50 ${
                      l.confirmed
                        ? "border-confirmed/30 bg-confirmed/10 text-confirmed"
                        : "border-line bg-foreground/5 text-muted hover:text-foreground"
                    }`}
                    title="Toggle confirmed — only confirmed titles can be booked"
                  >
                    {l.confirmed ? "Confirmed" : "Not confirmed"}
                  </button>
                </td>
                <td className="max-w-60 truncate px-4 py-2.5 text-muted" title={l.notes ?? ""}>
                  {l.notes ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <SubtleButton onClick={() => setEditing(l)}>Edit</SubtleButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <LineupForm
          item={editing === "add" ? null : editing}
          titles={titles}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LineupForm({
  item,
  titles,
  onClose,
}: {
  item: LineupItem | null;
  titles: TitleOpt[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveLineup,
    null
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal title={item ? `Edit ${item.name}` : "Add title to lineup"} onClose={onClose}>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="mode" value={item ? "edit" : "add"} />
        {item && <input type="hidden" name="lineup_id" value={item.lineupId} />}
        <Field label="Title">
          <TitleSearchSelect
            name="title_no"
            titles={titles}
            initial={item ? { titleNo: item.titleNo, name: item.name } : null}
          />
        </Field>
        <Field label="Format">
          <select name="format" required defaultValue={item?.format ?? ""} className={inputCls}>
            <option value="">Choose…</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First available release date">
          <input
            type="date"
            name="first_available_release_date"
            defaultValue={item?.releaseDate ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Notes">
          <textarea name="notes" rows={2} defaultValue={item?.notes ?? ""} className={inputCls} />
        </Field>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="confirmed" defaultChecked={item?.confirmed ?? false} />
          Confirmed (bookable by exhibitors)
        </label>
        {state && !state.ok && <p className="text-sm text-error">{state.error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <SubtleButton type="button" onClick={onClose}>Cancel</SubtleButton>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
