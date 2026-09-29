/**
 * Loads the marketing team's FTR_SXWingDistribution_Recipient sheet into
 * screenx_trailer_recipients. Fresh table, straight insert. Best-effort
 * matches each row to exhibitor_db by normalized (exhibitor name, country)
 * - many rows won't match, because this sheet covers every physical
 * ScreenX site globally, most of which have never had a portal account.
 * Unmatched rows are still inserted (exhibitor_unique left null) so the
 * distribution list itself isn't lost.
 *
 * Usage: DB_PASSWORD=... node import_screenx_trailer_recipients.js <csv-path> [--apply]
 * Without --apply, does a dry run and only prints what it would do.
 */
const fs = require("fs");
const { Client } = require("pg");

const CSV_PATH = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!CSV_PATH) {
  console.error("Usage: node import_screenx_trailer_recipients.js <csv-path> [--apply]");
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
function normExhibitorKey(name) {
  return norm(name).toLowerCase().replace(/\b(cinemas?|theatres?|theaters?)\b/g, "").replace(/\s+/g, " ").trim();
}
/** ";a@x.com;b@x.com" -> ["a@x.com","b@x.com"] - these columns lead with a
 * stray ";" and sometimes carry blank entries. */
function splitEmails(s) {
  return norm(s)
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean);
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8").replace(/^﻿/, ""));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const data = rows.slice(1).filter((r) => r.length > 1 && norm(r[idx.R_Exhibitor]));
  console.log(`Loaded ${data.length} rows from CSV. Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  const client = new Client({
    host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
    user: "postgres.cvershkiffvpbnuxfaxk", password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows: exh } = await client.query(
    "select exhibitor_unique, exhibitor_erp, entity_country from exhibitor_db"
  );
  const byKey = new Map();
  for (const e of exh) {
    byKey.set(`${normExhibitorKey(e.exhibitor_erp)}|${norm(e.entity_country).toLowerCase()}`, e.exhibitor_unique);
  }

  let matched = 0, unmatched = 0;
  for (const r of data) {
    const key = `${normExhibitorKey(r[idx.R_Exhibitor])}|${norm(r[idx.R_Country]).toLowerCase()}`;
    const exhibitorUnique = byKey.get(key) ?? null;
    if (exhibitorUnique) matched++; else unmatched++;

    const values = [
      norm(r[idx.Territory]),
      normOrNull(r[idx.R_Country]),
      norm(r[idx.R_Exhibitor]),
      exhibitorUnique,
      splitEmails(r[idx.R_Recipient]),
      splitEmails(r[idx.R_CC_BAEPO]),
      splitEmails(r[idx["R_CC_Lineup-Manager"]]),
      normOrNull(norm(r[idx.R_Sender_Email]).replace(/^;/, "")),
      normOrNull(r[idx.R_Sender]),
    ];

    if (APPLY) {
      await client.query(
        `insert into screenx_trailer_recipients
           (territory, country, exhibitor_name, exhibitor_unique, recipients, cc_baepo, cc_lineup_manager, sender_email, sender)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        values
      );
    }
  }

  console.log(`\nRows: ${data.length} to insert, ${matched} matched to a portal exhibitor, ${unmatched} unmatched (still inserted, exhibitor_unique null)`);
  await client.end();
  if (!APPLY) console.log("\n(Dry run only - re-run with --apply to write these rows.)");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
