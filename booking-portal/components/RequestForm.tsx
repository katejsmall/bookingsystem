"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { requestBooking, type ActionResult } from "@/app/actions/bookings";
import { PrimaryButton, inputCls } from "@/components/ui";
import { formatDate, todayIso } from "@/lib/display";
import { baseFormat, isUltraFormat, type BaseFormat } from "@/lib/types";

type ScreenOpt = { screenUnique: string; label: string; screenFormat: string | null };
type TitleOpt = {
  lineupId: number;
  titleNo: string;
  format: string;
  releaseDate: string | null;
  name: string;
};
/** The exhibitor's live (requested/confirmed) bookings, for duplicate hints. */
type ExistingBooking = { titleNo: string | null; date: string; screenUnique: string };

/** Whole days between two ISO dates, for the preview-lead-time note. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (isNaN(from) || isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Format wordmark, used on the selectable format cards. */
function FormatLogo({ format, className = "h-3.5" }: { format: BaseFormat; className?: string }) {
  const is4dx = format === "4DX";
  return (
    <Image
      src={is4dx ? "/4dx-logo-black.png" : "/screenx-logo-black.png"}
      alt={format}
      width={is4dx ? 2000 : 2800}
      height={is4dx ? 805 : 500}
      className={`${className} w-auto`}
    />
  );
}

export function RequestForm({
  screens,
  titles,
  existing,
  preselectedTitleNo,
}: {
  screens: ScreenOpt[];
  titles: TitleOpt[];
  existing: ExistingBooking[];
  preselectedTitleNo?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    requestBooking,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  const [titleNo, setTitleNo] = useState(preselectedTitleNo ?? "");
  const [selectedFormats, setSelectedFormats] = useState<BaseFormat[]>([]);
  const [releaseDate, setReleaseDate] = useState("");
  const [playDate, setPlayDate] = useState("");
  // Until the exhibitor touches the screening date it simply mirrors the
  // release date; once they've set a preview date it stops following.
  const [screeningEdited, setScreeningEdited] = useState(false);
  const [checkedScreens, setCheckedScreens] = useState<Set<string>>(new Set());

  // Base formats this exhibitor can actually play. An Ultra auditorium is
  // one room fitted with both technologies, so it counts towards its base
  // format rather than appearing as a fourth option nobody can interpret.
  const exhibitorFormats = useMemo(() => {
    const set = new Set<BaseFormat>();
    for (const s of screens) if (s.screenFormat) set.add(baseFormat(s.screenFormat));
    return [...set].sort();
  }, [screens]);

  // One entry per title, carrying the lineup row for each base format.
  const titleMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; byFormat: Partial<Record<BaseFormat, { lineupId: number; releaseDate: string | null }>> }
    >();
    for (const t of titles) {
      const bf = baseFormat(t.format);
      const entry = map.get(t.titleNo) ?? { name: t.name, byFormat: {} };
      entry.byFormat[bf] = { lineupId: t.lineupId, releaseDate: t.releaseDate };
      map.set(t.titleNo, entry);
    }
    return map;
  }, [titles]);

  // Every confirmed title playable on at least one of this exhibitor's
  // formats - the list is now the starting point, not gated behind a
  // format choice.
  const titleOptions = useMemo(
    () =>
      [...titleMap.entries()]
        .filter(([, v]) => exhibitorFormats.some((f) => v.byFormat[f]))
        .map(([no, v]) => ({ titleNo: no, name: v.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [titleMap, exhibitorFormats]
  );

  const selectedTitle = titleNo ? titleMap.get(titleNo) : undefined;

  // Formats offered depend on the chosen title: only those it's confirmed
  // in AND the exhibitor has screens for.
  const availableFormats = useMemo(
    () => (selectedTitle ? exhibitorFormats.filter((f) => selectedTitle.byFormat[f]) : []),
    [selectedTitle, exhibitorFormats]
  );

  // Drop any selection that the newly chosen title doesn't support.
  useEffect(() => {
    setSelectedFormats((prev) => {
      const next = prev.filter((f) => availableFormats.includes(f));
      return next.length === prev.length ? prev : next;
    });
  }, [availableFormats]);

  const candidateScreens = useMemo(() => {
    if (!selectedTitle) return [];
    return screens.filter(
      (s) => s.screenFormat && selectedFormats.includes(baseFormat(s.screenFormat))
    );
  }, [screens, selectedFormats, selectedTitle]);

  const takenScreens = useMemo(() => {
    if (!titleNo || !playDate) return new Set<string>();
    return new Set(
      existing.filter((e) => e.titleNo === titleNo && e.date === playDate).map((e) => e.screenUnique)
    );
  }, [existing, titleNo, playDate]);

  // Default every available screen to checked; re-sync when the candidate
  // set changes, and drop screens that become taken when the date changes,
  // without clobbering individual unchecks.
  const candidateKey = candidateScreens.map((s) => s.screenUnique).join(",");
  const prevCandidateKey = useRef<string | null>(null);
  useEffect(() => {
    if (candidateKey !== prevCandidateKey.current) {
      setCheckedScreens(
        new Set(candidateScreens.map((s) => s.screenUnique).filter((s) => !takenScreens.has(s)))
      );
      prevCandidateKey.current = candidateKey;
    } else {
      setCheckedScreens((prev) => {
        const next = [...prev].filter((s) => !takenScreens.has(s));
        return next.length === prev.size ? prev : new Set(next);
      });
    }
  }, [candidateKey, candidateScreens, takenScreens]);

  // Earliest bookable date: the latest release date among the formats in
  // play, since a title can open later in one format than another.
  const minDate = useMemo(() => {
    if (!selectedTitle) return todayIso();
    let max = todayIso();
    for (const f of selectedFormats.length ? selectedFormats : availableFormats) {
      const rd = selectedTitle.byFormat[f]?.releaseDate;
      if (rd && rd > max) max = rd;
    }
    return max;
  }, [selectedTitle, selectedFormats, availableFormats]);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setTitleNo("");
      setSelectedFormats([]);
      setReleaseDate("");
      setPlayDate("");
      setScreeningEdited(false);
      setCheckedScreens(new Set());
    }
  }, [state]);

  const toggleFormat = (f: BaseFormat) =>
    setSelectedFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const datesDisabled = !selectedTitle || selectedFormats.length === 0;

  const screensByFormat = selectedFormats.map((f) => ({
    format: f,
    screens: candidateScreens.filter((s) => s.screenFormat && baseFormat(s.screenFormat) === f),
  }));

  const canSubmit =
    !!titleNo && !!releaseDate && !!playDate && checkedScreens.size > 0 && !pending;

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <input type="hidden" name="title_no" value={titleNo} />

      {/* 1 — Title */}
      <Step n={1} label="Choose a title">
        <select
          required
          value={titleNo}
          onChange={(e) => setTitleNo(e.target.value)}
          className={inputCls}
        >
          <option value="">
            {titleOptions.length
              ? "Search or choose a confirmed title…"
              : "No confirmed titles available for your screens"}
          </option>
          {titleOptions.map((t) => (
            <option key={t.titleNo} value={t.titleNo}>
              {t.name}
            </option>
          ))}
        </select>
      </Step>

      {/* 2 — Formats available for that title */}
      <Step
        n={2}
        label="Choose formats"
        hint="Select every format you want to book this title in."
      >
        {!selectedTitle ? (
          <p className="text-sm text-muted">Choose a title first.</p>
        ) : availableFormats.length === 0 ? (
          <p className="text-sm text-muted">
            This title isn&apos;t confirmed for any of your screen formats.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {availableFormats.map((f) => {
              const on = selectedFormats.includes(f);
              const count = screens.filter(
                (s) => s.screenFormat && baseFormat(s.screenFormat) === f
              ).length;
              return (
                <button
                  type="button"
                  key={f}
                  onClick={() => toggleFormat(f)}
                  aria-pressed={on}
                  className={`flex min-w-44 items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                    on
                      ? "border-foreground bg-foreground/5"
                      : "border-line bg-surface hover:border-foreground/30"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-bold ${
                      on ? "border-foreground bg-foreground text-background" : "border-line"
                    }`}
                    aria-hidden="true"
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <FormatLogo format={f} />
                    <span className="mt-1 block text-[11px] text-muted">
                      {count} screen{count === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Step>

      {/* 3 — Dates */}
      <Step n={3} label="Dates">
        {/* Each label is a full-height column with the input pushed to the
            bottom, so the two fields line up even though one description
            wraps to two lines and the other doesn't. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col">
            <span className="text-sm font-medium">Official release date</span>
            <span className="mt-0.5 text-xs text-muted">Official national release.</span>
            <span className="mt-auto block pt-2">
              <input
                type="date"
                name="official_release_date"
                required
                min={minDate}
                value={releaseDate}
                onChange={(e) => {
                  setReleaseDate(e.target.value);
                  // Keep the screening date in step until it's deliberately
                  // set to something else.
                  if (!screeningEdited) setPlayDate(e.target.value);
                }}
                disabled={datesDisabled}
                className={inputCls}
              />
            </span>
          </label>

          <label className="flex flex-col">
            <span className="text-sm font-medium">First screening date</span>
            <span className="mt-0.5 text-xs text-muted">
              Matches the release date unless you&apos;re running previews or pre-release testing.
            </span>
            <span className="mt-auto block pt-2">
              <input
                type="date"
                name="requested_play_date"
                required
                value={playDate}
                onChange={(e) => {
                  setPlayDate(e.target.value);
                  setScreeningEdited(true);
                }}
                disabled={datesDisabled}
                className={inputCls}
              />
            </span>
          </label>
        </div>

        {selectedTitle && selectedFormats.length > 0 && minDate > todayIso() && (
          <p className="mt-2 text-xs text-muted">
            This title isn&apos;t available to release before {formatDate(minDate)}.
          </p>
        )}
        {releaseDate && releaseDate < minDate && (
          <p className="mt-2 text-xs text-error" role="alert">
            The release date can&apos;t be before {formatDate(minDate)} for this title.
          </p>
        )}
        {playDate && releaseDate && playDate < releaseDate && (
          <p className="mt-2 text-xs text-muted">
            Screening {daysBetween(playDate, releaseDate)} day
            {daysBetween(playDate, releaseDate) === 1 ? "" : "s"} ahead of the national release —
            flagged to the team as a preview.
          </p>
        )}
      </Step>

      {/* 4 — Screens */}
      <Step n={4} label="Screens" hint="Every matching screen is selected by default.">
        {selectedFormats.length === 0 ? (
          <p className="text-sm text-muted">Choose a title and format first.</p>
        ) : candidateScreens.length === 0 ? (
          <p className="text-sm text-muted">You have no screens in the selected format(s).</p>
        ) : (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex justify-end gap-3 text-xs">
              <button
                type="button"
                className="text-muted hover:text-foreground"
                onClick={() =>
                  setCheckedScreens(
                    new Set(
                      candidateScreens
                        .map((s) => s.screenUnique)
                        .filter((s) => !takenScreens.has(s))
                    )
                  )
                }
              >
                Select all
              </button>
              <button
                type="button"
                className="text-muted hover:text-foreground"
                onClick={() => setCheckedScreens(new Set())}
              >
                Clear
              </button>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto">
              {screensByFormat.map(
                ({ format, screens: group }) =>
                  group.length > 0 && (
                    <div key={format}>
                      <div className="mb-1 flex items-center gap-2">
                        <FormatLogo format={format} className="h-3" />
                        <span className="text-[11px] text-muted">
                          {group.length} screen{group.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {group.map((s) => {
                        const taken = takenScreens.has(s.screenUnique);
                        return (
                          <label
                            key={s.screenUnique}
                            className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition hover:bg-foreground/5 ${
                              taken ? "text-muted" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              name="screen_unique"
                              value={s.screenUnique}
                              disabled={taken}
                              checked={!taken && checkedScreens.has(s.screenUnique)}
                              onChange={(e) =>
                                setCheckedScreens((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(s.screenUnique);
                                  else next.delete(s.screenUnique);
                                  return next;
                                })
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{s.label}</span>
                            {isUltraFormat(s.screenFormat) && (
                              <span
                                className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                title="Combo auditorium — 4DX and ScreenX in one room"
                              >
                                Ultra
                              </span>
                            )}
                            {taken && (
                              <span className="shrink-0 text-[11px] text-requested">
                                already requested
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )
              )}
            </div>
          </div>
        )}
      </Step>

      <Step n={5} label="Notes" hint="Optional — anything the CJ team should know.">
        <textarea name="notes" rows={2} className={inputCls} />
      </Step>

      {state && !state.ok && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-sm text-confirmed" role="status">
          {state.submitted === 1 ? "Request" : `${state.submitted} requests`} submitted
          {state.skipped
            ? ` (${state.skipped} screen${state.skipped === 1 ? "" : "s"} already requested)`
            : ""}{" "}
          — the CJ team will review {state.submitted === 1 ? "it" : "them"}.
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <PrimaryButton type="submit" disabled={!canSubmit}>
          {pending
            ? "Submitting…"
            : `Submit request${checkedScreens.size > 1 ? `s (${checkedScreens.size})` : ""}`}
        </PrimaryButton>
        {!canSubmit && !pending && (
          <span className="text-xs text-muted">
            {!titleNo
              ? "Choose a title to begin."
              : selectedFormats.length === 0
                ? "Choose at least one format."
                : !releaseDate
                  ? "Set the official release date."
                  : !playDate
                    ? "Set the first screening date."
                    : "Select at least one screen."}
          </span>
        )}
      </div>
    </form>
  );
}

/** Numbered step wrapper, so the form reads as a sequence rather than a
 * flat stack of inputs. */
function Step({
  n,
  label,
  hint,
  children,
}: {
  n: number;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[28px_1fr] gap-x-3 gap-y-2">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-foreground/5 text-xs font-bold text-muted">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{label}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <div className="col-start-2">{children}</div>
    </section>
  );
}
