"use client";

import { useMemo, useState, useTransition } from "react";
import { submitTrailerRequest } from "@/app/actions/trailerRequests";
import { FormatBadge, Modal, PrimaryButton, Select, SubtleButton, inputCls } from "@/components/ui";
import type { TrailerAsset, TrailerRequestStatus, TrailerRequestWithAsset } from "@/lib/types";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title-asc", label: "Title (A–Z)" },
  { value: "title-desc", label: "Title (Z–A)" },
] as const;
type SortKey = (typeof SORTS)[number]["value"];

function sortAssets(list: TrailerAsset[], sort: SortKey): TrailerAsset[] {
  const sorted = [...list];
  switch (sort) {
    case "newest":
      sorted.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      break;
    case "oldest":
      sorted.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
      break;
    case "title-asc":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "title-desc":
      sorted.sort((a, b) => b.title.localeCompare(a.title));
      break;
  }
  return sorted;
}

/** trailer_assets.format uses the marketing team's short codes; map to the
 * lineup-family labels FormatBadge already knows how to style. */
function badgeFormat(format: TrailerAsset["format"]): string {
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
  under_review: "requested",
  confirmed: "confirmed",
  declined: "declined",
  completed: "delivered",
};

export function TrailerCatalogue({
  assets,
  myRequests,
}: {
  assets: TrailerAsset[];
  myRequests: TrailerRequestWithAsset[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [format, setFormat] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const categories = useMemo(() => [...new Set(assets.map((a) => a.category))].sort(), [assets]);
  const formats = useMemo(() => [...new Set(assets.map((a) => a.format))].sort(), [assets]);

  // myRequests comes back newest-first, so the first hit per asset is the
  // latest status - good enough since exhibitors can't resubmit once
  // they've requested an asset (see RequestCell).
  const latestStatusByAsset = useMemo(() => {
    const map = new Map<number, TrailerRequestStatus>();
    for (const r of myRequests) {
      if (!map.has(r.trailer_asset_id)) map.set(r.trailer_asset_id, r.status);
    }
    return map;
  }, [myRequests]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = assets.filter(
      (a) =>
        (!category || a.category === category) &&
        (!format || a.format === format) &&
        (!q || a.title.toLowerCase().includes(q) || (a.studio ?? "").toLowerCase().includes(q))
    );
    return sortAssets(filtered, sort);
  }, [assets, search, category, format, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Search
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title or studio…"
            className={`${inputCls} min-w-48`}
          />
        </label>
        {categories.length > 1 && (
          <Select
            label="Category"
            value={category}
            onChange={setCategory}
            options={categories.map((c) => ({ value: c, label: c }))}
            allLabel="All categories"
          />
        )}
        {formats.length > 1 && (
          <Select
            label="Format"
            value={format}
            onChange={setFormat}
            options={formats.map((f) => ({ value: f, label: badgeFormat(f) }))}
            allLabel="All formats"
          />
        )}
        <Select
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
        />
        <p className="ml-auto pb-2 text-xs text-muted">
          {rows.length} trailer{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted py-12 text-center">
          {assets.length === 0
            ? "No trailer assets for your format(s) yet."
            : "No trailers match your filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Format</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Studio</th>
                <th className="px-4 py-2.5 font-medium">Preview</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-2.5 font-medium">{a.title}</td>
                  <td className="px-4 py-2.5 text-muted">{a.version ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <FormatBadge format={badgeFormat(a.format)} />
                  </td>
                  <td className="px-4 py-2.5 text-muted">{a.category}</td>
                  <td className="px-4 py-2.5 text-muted">{a.studio ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {a.trailer_link ? (
                      <a
                        href={a.trailer_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium hover:underline"
                      >
                        Watch
                      </a>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <RequestCell asset={a} status={latestStatusByAsset.get(a.id)} />
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

function RequestCell({
  asset,
  status,
}: {
  asset: TrailerAsset;
  status: TrailerRequestStatus | undefined;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [justRequested, setJustRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveStatus = justRequested ? "under_review" : status;

  if (effectiveStatus) {
    return (
      <span
        className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[effectiveStatus]}`}
      >
        {STATUS_LABELS[effectiveStatus]}
      </span>
    );
  }

  const confirm = () => {
    setError(null);
    const fd = new FormData();
    fd.set("trailer_asset_id", String(asset.id));
    startTransition(async () => {
      const res = await submitTrailerRequest(null, fd);
      if (res.ok) {
        setJustRequested(true);
        setConfirming(false);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <SubtleButton onClick={() => setConfirming(true)}>Request</SubtleButton>
      {error && <p className="text-xs text-error">{error}</p>}

      {confirming && (
        <Modal title="Confirm trailer request" onClose={() => setConfirming(false)}>
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <p className="font-medium">{asset.title}</p>
              {asset.version && <p className="text-muted">Version: {asset.version}</p>}
              <div className="flex items-center gap-2 pt-1">
                <FormatBadge format={badgeFormat(asset.format)} />
                <span className="text-xs text-muted">{asset.category}</span>
              </div>
            </div>
            <p className="text-sm text-muted">
              Send this request to the CJ 4DPLEX team? They&apos;ll get in touch once it&apos;s
              ready.
            </p>
            <div className="flex justify-end gap-2">
              <SubtleButton disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </SubtleButton>
              <PrimaryButton disabled={pending} onClick={confirm}>
                {pending ? "Requesting…" : "Request"}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
