"use client";

import { useMemo, useRef, useState } from "react";
import { inputCls } from "@/components/ui";

export type TitleOpt = { titleNo: string; name: string };

/**
 * Searchable picker over Title_master (~1300 rows) that stores the chosen
 * title_no in a hidden input for form submission.
 */
export function TitleSearchSelect({
  name,
  titles,
  initial,
}: {
  name: string;
  titles: TitleOpt[];
  initial: TitleOpt | null;
}) {
  const [query, setQuery] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<TitleOpt | null>(initial);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return titles.slice(0, 25);
    return titles.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 25);
  }, [titles, query]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.titleNo ?? ""} />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Search Title_master…"
        className={inputCls}
        aria-autocomplete="list"
      />
      {selected === null && query && !open && (
        <p className="mt-1 text-xs text-error">Pick a title from the list.</p>
      )}
      {open && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No titles match.</li>
          )}
          {matches.map((t) => (
            <li key={t.titleNo}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelected(t);
                  setQuery(t.name);
                  setOpen(false);
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-foreground/5"
              >
                {t.name}
                <span className="ml-2 font-mono text-[10px] text-muted">{t.titleNo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
