/**
 * One-time load of the CJ marketing team's "Asset List" trailer/QC/brand-TLR
 * catalogue (exported from Google Sheets as CSV) into trailer_assets. This
 * is a fresh table with no existing rows to reconcile against, so it's a
 * straight insert, not a match-and-update like import_all_exhibs_db.js.
 *
 * Skipped: fully blank rows, and rows titled "TEST" (sheet test data, not a
 * real asset).
 *
 * Usage: DB_PASSWORD=... node import_trailer_assets.js <csv-path> [--apply]
 * Without --apply, does a dry run and only prints what it would do.
 */
const fs = require("fs");
const { Client } = require("pg");

const CSV_PATH = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!CSV_PATH) {
  console.error("Usage: node import_trailer_assets.js <csv-path> [--apply]");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") {}
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function norm(s) { return String(s ?? "").trim(); }
function normOrNull(s) { return norm(s) || null; }
function intOrNull(s) { const n = parseInt(norm(s), 10); return Number.isFinite(n) ? n : null; }
function toBool(s) { const v = norm(s); return v === "Y" || v === "1"; }

/** "2025-06-11 오후 6:53" -> ISO timestamp (Asia/Seoul, no source timezone given). */
function parseKoreanDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (오전|오후) (\d{1,2}):(\d{2})$/.exec(norm(s));
  if (!m) return null;
  const [, y, mo, d, ampm, hRaw, mi] = m;
  let h = parseInt(hRaw, 10) % 12;
  if (ampm === "오후") h += 12;
  return `${y}-${mo}-${d}T${String(h).padStart(2, "0")}:${mi}:00+09:00`;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8").replace(/^﻿/, ""));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const data = rows.slice(1).filter((r) => {
    const title = norm(r[idx.Title]);
    return title && title !== "TEST";
  });
  const skipped = rows.length - 1 - data.length;
  console.log(`Loaded ${data.length} rows from CSV (${skipped} blank/TEST rows skipped). Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  const client = APPLY
    ? new Client({
        host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
        user: "postgres.cvershkiffvpbnuxfaxk", password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
      })
    : null;
  if (client) await client.connect();

  let inserted = 0, skippedNoFormat = 0;
  for (const r of data) {
    const format = norm(r[idx.Format]);
    if (!["4DX", "SX", "ULTRA"].includes(format)) { skippedNoFormat++; continue; }

    const values = [
      norm(r[idx.Title]),
      intOrNull(r[idx.Year]),
      norm(r[idx.Category]) || "TLR",
      format,
      normOrNull(r[idx.Version]),
      normOrNull(r[idx.Studio]),
      normOrNull(r[idx.Duration]),
      normOrNull(r[idx.Remark]),
      normOrNull(r[idx.Lable]),
      toBool(r[idx.Included]),
      toBool(r[idx.NEW]),
      normOrNull(r[idx.TrailerLink]),
      normOrNull(r[idx.Note]),
      parseKoreanDate(r[idx["만든 날짜"]]),
    ];

    inserted++;
    if (client) {
      await client.query(
        `insert into trailer_assets
           (title, year, category, format, version, studio, duration, remark, label, included, is_new, trailer_link, note, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, coalesce($14, now()))`,
        values
      );
    }
  }

  console.log(`\nTrailer assets: ${inserted} to insert, ${skippedNoFormat} skipped (unrecognized format)`);
  if (client) await client.end();
  if (!APPLY) console.log("\n(Dry run only - re-run with --apply to write these rows.)");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
