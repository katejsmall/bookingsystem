"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Bell, X } from "lucide-react";
import { addNotice, deleteNotice, setNoticeDone } from "@/app/actions/notices";
import type { ActionResult } from "@/app/actions/bookings";
import { formatDate, todayIso } from "@/lib/display";

export type TeamNotice = {
  id: number;
  kind: "task" | "notice";
  body: string;
  territory: string | null;
  due_date: string | null;
  pinned: boolean;
  done: boolean;
  created_by: string | null;
  created_at: string;
  done_by: string | null;
};

/**
 * Corner panel for team to-dos and standing notices. Lives in the team
 * layout so it's reachable from every page, and stays collapsed to a
 * badge until opened.
 */
export function NoticeBoard({
  notices,
  managers,
  scope,
}: {
  notices: TeamNotice[];
  managers: string[];
  scope: string;
}) {
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [composing, setComposing] = useState(false);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    addNotice,
    null
  );

  // Derived from the action result rather than mirrored into state - a
  // successful submit closes the composer without an effect round-trip.
  const showComposer = composing && !state?.ok;
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const openItems = notices.filter((n) => !n.done);
  const doneItems = notices.filter((n) => n.done);
  const visible = showDone ? notices : openItems;
  const today = todayIso();
  const overdue = openItems.filter((n) => n.due_date && n.due_date < today).length;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-lg transition hover:opacity-90"
        >
          <Bell className="h-4 w-4" strokeWidth={2} />
          Team board
          {openItems.length > 0 && (
            <span
              className={`num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                overdue > 0 ? "bg-crit text-white" : "bg-background text-foreground"
              }`}
            >
              {openItems.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex max-h-[75vh] w-[360px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line bg-plane px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold">Team board</p>
              <p className="text-[11px] text-muted">
                {openItems.length} open{overdue > 0 ? ` · ${overdue} overdue` : ""}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded p-1 text-muted transition hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {visible.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted">
                Nothing on the board. Add a task or a notice for the team.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {visible.map((n) => {
                  const isOverdue = !n.done && n.due_date && n.due_date < today;
                  return (
                    <li
                      key={n.id}
                      className={`rounded-lg border px-2.5 py-2 ${
                        n.done ? "border-line bg-plane opacity-60" : "border-line"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={n.done}
                          onChange={(e) =>
                            startTransition(() => {
                              void setNoticeDone(n.id, e.target.checked);
                            })
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[12.5px] ${n.done ? "line-through" : ""}`}>
                            {n.body}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted">
                            {n.kind === "notice" && (
                              <span className="pill-4dx rounded-full px-1.5 py-px font-semibold uppercase tracking-wider">
                                Notice
                              </span>
                            )}
                            {n.pinned && <span className="font-semibold">Pinned</span>}
                            {n.territory && <span>{n.territory}</span>}
                            {n.due_date && (
                              <span className={isOverdue ? "font-semibold text-crit" : ""}>
                                due {formatDate(n.due_date)}
                              </span>
                            )}
                            <span>· {n.created_by ?? "team"}</span>
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            startTransition(() => {
                              void deleteNotice(n.id);
                            })
                          }
                          aria-label="Delete"
                          className="text-muted transition hover:text-error"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-line px-3 py-2">
            {showComposer ? (
              <form ref={formRef} action={formAction} className="space-y-2">
                <textarea
                  name="body"
                  rows={2}
                  autoFocus
                  placeholder="What needs doing, or what should everyone know?"
                  className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-foreground/40"
                />
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <select
                    name="kind"
                    defaultValue="task"
                    className="rounded-md border border-line bg-surface px-2 py-1"
                  >
                    <option value="task">Task</option>
                    <option value="notice">Notice</option>
                  </select>
                  <select
                    name="territory"
                    defaultValue={scope === "all" ? "" : scope}
                    className="rounded-md border border-line bg-surface px-2 py-1"
                  >
                    <option value="">All territories</option>
                    {managers.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    name="due_date"
                    className="rounded-md border border-line bg-surface px-2 py-1"
                  />
                  <label className="flex items-center gap-1 text-muted">
                    <input type="checkbox" name="pinned" /> Pin
                  </label>
                </div>
                {state && !state.ok && <p className="text-[11px] text-error">{state.error}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setComposing(false)}
                    className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background disabled:opacity-50"
                  >
                    {pending ? "Adding…" : "Add"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setComposing(true)}
                  className="rounded-md bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition hover:opacity-90"
                >
                  + Add
                </button>
                {doneItems.length > 0 && (
                  <button
                    onClick={() => setShowDone((s) => !s)}
                    className="text-[11px] font-medium text-link hover:underline"
                  >
                    {showDone ? "Hide" : "Show"} done ({doneItems.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
