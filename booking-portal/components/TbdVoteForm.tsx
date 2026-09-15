"use client";

import { useState, useTransition } from "react";
import { castTbdVote } from "@/app/actions/tbdVotes";
import { FormatBadge } from "@/components/ui";
import type { TbdTitle, TbdVote } from "@/lib/types";
import { TBD_VOTES } from "@/lib/types";

const VOTE_LABELS: Record<TbdVote, string> = { yes: "Yes", no: "No", tbd: "TBD" };
const VOTE_STYLES: Record<TbdVote, string> = {
  yes: "border-confirmed/40 bg-confirmed/10 text-confirmed",
  no: "border-line bg-foreground/5 text-muted",
  tbd: "border-requested/40 bg-requested/10 text-requested",
};

export function TbdVoteForm({
  titles,
  myVotes,
}: {
  titles: TbdTitle[];
  myVotes: Record<number, TbdVote>;
}) {
  const [votes, setVotes] = useState(myVotes);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);
  const [, startTransition] = useTransition();

  const vote = (id: number, v: TbdVote) => {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await castTbdVote(id, v);
      if (res.ok) {
        setVotes((prev) => ({ ...prev, [id]: v }));
      } else {
        setError({ id, message: res.error });
      }
      setBusyId(null);
    });
  };

  if (titles.length === 0) {
    return <p className="text-sm text-muted">No TBD titles to vote on right now.</p>;
  }

  return (
    <div className="space-y-3">
      {titles.map((t) => {
        const current = votes[t.id];
        const closed = !t.active;
        const busy = busyId === t.id;
        return (
          <div
            key={t.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm"
          >
            <div className="min-w-48 flex-1">
              <div className="flex items-center gap-2">
                {t.imdb_link ? (
                  <a href={t.imdb_link} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {t.title_text}
                  </a>
                ) : (
                  <span className="font-medium">{t.title_text}</span>
                )}
                <FormatBadge format={t.format} />
                {closed && (
                  <span className="inline-block whitespace-nowrap rounded border border-line bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Poll closed
                  </span>
                )}
              </div>
              {error?.id === t.id && <p className="mt-1 text-xs text-error">{error.message}</p>}
            </div>
            <div className="flex gap-1.5">
              {TBD_VOTES.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={closed || busy}
                  onClick={() => vote(t.id, v)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                    current === v ? VOTE_STYLES[v] : "border-line bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {VOTE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
