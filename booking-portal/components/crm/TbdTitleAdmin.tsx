"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { saveTbdTitle, toggleTbdTitleActive } from "@/app/actions/crm";
import type { ActionResult } from "@/app/actions/bookings";
import { Field, FormatBadge, Modal, PrimaryButton, Select, SubtleButton, inputCls } from "@/components/ui";
import { PRODUCTION_FORMATS, type TbdTitleWithVotes, type TbdVote } from "@/lib/types";

const VOTE_LABELS: Record<TbdVote, string> = { yes: "Yes", no: "No", tbd: "TBD" };

export function TbdTitleAdmin({ titles }: { titles: TbdTitleWithVotes[] }) {
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const [editing, setEditing] = useState<TbdTitleWithVotes | "add" | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return titles.filter(
      (t) => (!q || t.title_text.toLowerCase().includes(q)) && (!format || t.format === format)
    );
  }, [titles, search, format]);

  const toggle = (t: TbdTitleWithVotes) => {
    setError(null);
    setBusyId(t.id);
    startTransition(async () => {
      const res = await toggleTbdTitleActive(t.id, !t.active);
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
          options={PRODUCTION_FORMATS.map((f) => ({ value: f, label: f }))}
          allLabel="All formats"
        />
        <PrimaryButton onClick={() => setEditing("add")}>Add TBD title</PrimaryButton>
        <p className="ml-auto pb-2 text-xs text-muted">
          {rows.length} of {titles.length}
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Format</th>
              <th className="px-4 py-2.5 font-medium">Open for voting</th>
              <th className="px-4 py-2.5 font-medium">Votes</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No TBD titles yet — add one to start collecting interest.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const isExpanded = expanded.has(t.id);
              const tally = t.votes.reduce(
                (acc, v) => {
                  acc[v.vote] += 1;
                  return acc;
                },
                { yes: 0, no: 0, tbd: 0 } as Record<TbdVote, number>
              );
              return [
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {t.imdb_link ? (
                      <a href={t.imdb_link} target="_blank" rel="noreferrer" className="hover:underline">
                        {t.title_text}
                      </a>
                    ) : (
                      t.title_text
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <FormatBadge format={t.format} />
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggle(t)}
                      disabled={busyId === t.id}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition disabled:opacity-50 ${
                        t.active
                          ? "border-confirmed/30 bg-confirmed/10 text-confirmed"
                          : "border-line bg-foreground/5 text-muted hover:text-foreground"
                      }`}
                      title="Toggle whether exhibitors can vote on this title"
                    >
                      {t.active ? "Open" : "Closed"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        })
                      }
                      className="text-left font-medium text-link hover:underline"
                    >
                      {tally.yes} yes · {tally.no} no · {tally.tbd} tbd {isExpanded ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <SubtleButton onClick={() => setEditing(t)}>Edit</SubtleButton>
                  </td>
                </tr>,
                isExpanded && (
                  <tr key={`${t.id}-detail`} className="border-b border-line bg-background/60">
                    <td colSpan={5} className="px-4 py-2">
                      {t.votes.length === 0 ? (
                        <p className="py-1.5 pl-8 text-xs text-muted">No votes yet.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {[...t.votes]
                              .sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName))
                              .map((v) => (
                                <tr
                                  key={v.exhibitor_unique}
                                  className="border-b border-line/60 last:border-0"
                                >
                                  <td className="py-1.5 pl-8 text-muted">{v.exhibitorName}</td>
                                  <td className="py-1.5 text-muted">{v.country}</td>
                                  <td className="py-1.5 font-medium">{VOTE_LABELS[v.vote]}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <TbdTitleForm item={editing === "add" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function TbdTitleForm({
  item,
  onClose,
}: {
  item: TbdTitleWithVotes | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveTbdTitle,
    null
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal title={item ? `Edit ${item.title_text}` : "Add TBD title"} onClose={onClose}>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="mode" value={item ? "edit" : "add"} />
        {item && <input type="hidden" name="id" value={item.id} />}
        <Field label="Title">
          <input
            type="text"
            name="title_text"
            required
            defaultValue={item?.title_text ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Format">
          <select name="format" required defaultValue={item?.format ?? ""} className={inputCls}>
            <option value="">Choose…</option>
            {PRODUCTION_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="IMDb link (optional)">
          <input type="url" name="imdb_link" defaultValue={item?.imdb_link ?? ""} className={inputCls} />
        </Field>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
          Open for voting
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
