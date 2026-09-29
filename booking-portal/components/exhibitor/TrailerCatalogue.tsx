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

/** One format this row can be requested in, and the specific
 * trailer_assets row that covers it - a combined row has one of these per
 * format so the request popup can let the exhibitor pick just one. */
type FormatAsset = { label: string; assetId: number };

/** One displayed catalogue row. Usually one trailer_assets row, but two
 * (one 4DX, one SX) collapse into one row - see groupRows(). */
type CatalogueRow = {
  key: string;
  title: string;
  versionLabel: string;
  formatAssets: FormatAsset[];
  /** Raw asset formats this row covers, for the Format filter. */
  rawFormats: TrailerAsset["format"][];
  category: string;
  studio: string | null;
  trailerLink: string | null;
  createdAt: string | null;
};

function formatLabel(format: TrailerAsset["format"]): string {
  return format === "SX" ? "ScreenX" : "4DX";
}

/** "F5/2" -> {"f5","2"} - the reel/version codes a version string packs
 * together, split on "/" the same way the source sheet does. */
function versionTokens(version: string | null): Set<string> {
  return new Set(
    (version ?? "")
      .split("/")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  );
}

function singleRow(a: TrailerAsset, formatAssets: FormatAsset[]): CatalogueRow {
  return {
    key: `single-${a.id}`,
    title: a.title,
    versionLabel: a.version ?? "—",
    formatAssets,
    rawFormats: [a.format],
    category: a.category,
    studio: a.studio,
    trailerLink: a.trailer_link,
    createdAt: a.created_at,
  };
}

/**
 * Collapses a title's separate 4DX and ScreenX trailer_assets rows into one
 * row when they're the same underlying reel - i.e. their Version strings
 * share at least one "/"-separated code (e.g. 4DX "F5/2" and SX "F5" both
 * carry "F5"). A ULTRA-tagged row is always shown as both formats too,
 * since an Ultra4DX screen is a 4DX+ScreenX combo auditorium. Everything
 * else stays a single-format row.
 */
function groupRows(assets: TrailerAsset[]): CatalogueRow[] {
  const byTitle = new Map<string, TrailerAsset[]>();
  for (const a of assets) {
    if (!byTitle.has(a.title)) byTitle.set(a.title, []);
    byTitle.get(a.title)!.push(a);
  }

  const rows: CatalogueRow[] = [];
  for (const list of byTitle.values()) {
    const fourDx = list.filter((a) => a.format === "4DX");
    const sx = list.filter((a) => a.format === "SX");
    const ultra = list.filter((a) => a.format === "ULTRA");
    const usedSxIds = new Set<number>();

    for (const a of fourDx) {
      const aTokens = versionTokens(a.version);
      const match = sx.find(
        (b) => !usedSxIds.has(b.id) && [...versionTokens(b.version)].some((t) => aTokens.has(t))
      );
      if (match) {
        usedSxIds.add(match.id);
        rows.push({
          key: `pair-${a.id}-${match.id}`,
          title: a.title,
          versionLabel:
            a.version === match.version ? (a.version ?? "—") : `${a.version ?? "—"} / ${match.version ?? "—"}`,
          formatAssets: [
            { label: "4DX", assetId: a.id },
            { label: "ScreenX", assetId: match.id },
          ],
          rawFormats: ["4DX", "SX"],
          category: a.category,
          studio: a.studio ?? match.studio,
          trailerLink: a.trailer_link ?? match.trailer_link,
          createdAt: (a.created_at ?? "") > (match.created_at ?? "") ? a.created_at : match.created_at,
        });
      } else {
        rows.push(singleRow(a, [{ label: "4DX", assetId: a.id }]));
      }
    }
    for (const b of sx) {
      if (!usedSxIds.has(b.id)) rows.push(singleRow(b, [{ label: "ScreenX", assetId: b.id }]));
    }
    for (const u of ultra) {
      // One trailer_assets row plays either screen type - there's no
      // separate 4DX-only/ScreenX-only file to pick between, but letting
      // the picker show both is harmless (see RequestCell: it de-dupes
      // asset ids before submitting).
      rows.push(
        singleRow(u, [
          { label: "4DX", assetId: u.id },
          { label: "ScreenX", assetId: u.id },
        ])
      );
    }
  }
  return rows;
}

function sortRows(list: CatalogueRow[], sort: SortKey): CatalogueRow[] {
  const sorted = [...list];
  switch (sort) {
    case "newest":
      sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      break;
    case "oldest":
      sorted.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
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
  const grouped = useMemo(() => groupRows(assets), [assets]);

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
    const filtered = grouped.filter(
      (r) =>
        (!category || r.category === category) &&
        (!format || r.rawFormats.includes(format as TrailerAsset["format"])) &&
        (!q || r.title.toLowerCase().includes(q) || (r.studio ?? "").toLowerCase().includes(q))
    );
    return sortRows(filtered, sort);
  }, [grouped, search, category, format, sort]);

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
            options={formats.map((f) => ({ value: f, label: formatLabel(f) }))}
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
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-2.5 font-medium">{r.title}</td>
                  <td className="px-4 py-2.5 text-muted">{r.versionLabel}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {r.formatAssets.map((f) => (
                        <FormatBadge key={f.label} format={f.label} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.category}</td>
                  <td className="px-4 py-2.5 text-muted">{r.studio ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {r.trailerLink ? (
                      <a
                        href={r.trailerLink}
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
                    <RequestCell row={r} status={latestStatusByAsset.get(r.formatAssets[0].assetId)} />
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

function RequestCell({ row, status }: { row: CatalogueRow; status: TrailerRequestStatus | undefined }) {
  const [confirming, setConfirming] = useState(false);
  // Both formats picked by default when there are two; toggling either off
  // requests just the other one. Keyed by label since a combined row's two
  // FormatAssets always have distinct labels.
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(row.formatAssets.map((f) => [f.label, true]))
  );
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

  const chosenIds = [...new Set(row.formatAssets.filter((f) => picked[f.label]).map((f) => f.assetId))];
  const canSubmit = chosenIds.length > 0;

  const confirm = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      // A combined row is still one or two separate trailer_assets rows
      // under the hood (one per format) - the team delivers each as its
      // own file, so each chosen format is its own request.
      const results = await Promise.all(
        chosenIds.map((id) => {
          const fd = new FormData();
          fd.set("trailer_asset_id", String(id));
          return submitTrailerRequest(null, fd);
        })
      );
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) {
        setError(failed.error);
      } else {
        setJustRequested(true);
        setConfirming(false);
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
              <p className="font-medium">{row.title}</p>
              {row.versionLabel !== "—" && <p className="text-muted">Version: {row.versionLabel}</p>}
              <div className="flex items-center gap-2 pt-1">
                {row.formatAssets.map((f) => (
                  <FormatBadge key={f.label} format={f.label} />
                ))}
                <span className="text-xs text-muted">{row.category}</span>
              </div>
            </div>

            {row.formatAssets.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted">Request for</p>
                {row.formatAssets.map((f) => (
                  <label key={f.label} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={picked[f.label]}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [f.label]: e.target.checked }))}
                    />
                    {f.label}
                  </label>
                ))}
                {!canSubmit && (
                  <p className="text-xs text-error">Pick at least one format.</p>
                )}
              </div>
            )}

            <p className="text-sm text-muted">
              Send this request to the CJ 4DPLEX team? They&apos;ll get in touch once it&apos;s
              ready.
            </p>
            <div className="flex justify-end gap-2">
              <SubtleButton disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </SubtleButton>
              <PrimaryButton disabled={pending || !canSubmit} onClick={confirm}>
                {pending ? "Requesting…" : "Request"}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
