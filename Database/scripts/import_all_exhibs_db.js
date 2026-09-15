/**
 * Reconciles the CJ 4DPLEX team's "all_exhibs_db" master sheet (exhibitor +
 * site + screen + manager, exported from Google Sheets as CSV) against the
 * live exhibitor_db/screen_db. This is a different source from the
 * programming workbook (import_programming_sheet.js) - this one is the
 * team's canonical site/manager registry.
 *
 * IMPORTANT: the sheet's own `exhibitor_id`/`site_id` columns are NOT the
 * same numbering scheme as the live DB's exhibitor_unique/site_id (confirmed
 * 2026-07-29: only 19/155 exhibitor IDs and 45/1050 site IDs coincidentally
 * overlap). Matching is done by normalized exhibitor name + (exhibitor,
 * site_name, format) triple instead - the same reliable approach
 * import_programming_sheet.js already uses.
 *
 * What it does:
 *   - exhibitor_db.account_manager: overwritten with the sheet's Manager
 *     column for every matched exhibitor (this sheet is the authoritative
 *     source, superseding the earlier best-guess backfill from booking
 *     history). Exhibitors the sheet doesn't cover are left untouched.
 *   - screen_db: matched rows get site_id/site_address/seat_count/
 *     opening_date backfilled/updated from the sheet. Unmatched rows are
 *     inserted as new screens (data_source='all_exhibs_sheet').
 *   - New exhibitors (by normalized name) are inserted using the same
 *     EX##### key generator as import_programming_sheet.js.
 *
 * Usage: DB_PASSWORD=... node import_all_exhibs_db.js <csv-path> [--apply]
 * Without --apply, does a dry run and only prints what it would do.
 */
const fs = require("fs");
const { Client } = require("pg");

const CSV_PATH = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!CSV_PATH) {
  console.error("Usage: node import_all_exhibs_db.js <csv-path> [--apply]");
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
function normExhibitorKey(name) {
  return norm(name).toLowerCase().replace(/\b(cinemas?|theatres?|theaters?)\b/g, "").replace(/\s+/g, " ").trim();
}
function isoDate(v) {
  const s = norm(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}
const SCREEN_TYPE_FORMAT = { SO201100: "4DX", SO201200: "ScreenX", SO201300: "Ultra4DX", SO201400: "UltraScreenX" };

function newExhibitorKeyGenerator(existingIds) {
  let max = 10000;
  for (const id of existingIds) {
    const m = /^EX(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let next = max + 1;
  return () => `EX${next++}`;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const data = rows.slice(1).filter((r) => r.length > 1 && r[idx.exhibitor_id]);
  console.log(`Loaded ${data.length} rows from sheet. Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  const client = new Client({
    host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
    user: "postgres.cvershkiffvpbnuxfaxk", password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // --- Exhibitors: match by normalized name, update account_manager ---
  const { rows: existingExh } = await client.query(`select exhibitor_unique, exhibitor_erp, entity_country, account_manager from exhibitor_db`);
  const existingByName = new Map(existingExh.map((e) => [normExhibitorKey(e.exhibitor_erp), e]));
  const genExhKey = newExhibitorKeyGenerator(existingExh.map((e) => e.exhibitor_unique));

  const csvExhibitors = new Map(); // normKey -> {name, country, manager}
  for (const r of data) {
    const key = normExhibitorKey(r[idx.exhibitor]);
    if (!csvExhibitors.has(key)) csvExhibitors.set(key, { name: r[idx.exhibitor], country: r[idx.country], manager: norm(r[idx.Manager]) || null });
  }

  const exhIdByNormKey = new Map(); // for the screens phase below
  let exhUpdated = 0, exhInserted = 0, exhUnchanged = 0;
  for (const [key, v] of csvExhibitors) {
    const existing = existingByName.get(key);
    if (existing) {
      exhIdByNormKey.set(key, existing.exhibitor_unique);
      if (existing.account_manager !== v.manager) {
        exhUpdated++;
        if (APPLY) {
          await client.query(`update exhibitor_db set account_manager = $1 where exhibitor_unique = $2`, [v.manager, existing.exhibitor_unique]);
        }
      } else exhUnchanged++;
    } else {
      const id = genExhKey();
      exhIdByNormKey.set(key, id);
      exhInserted++;
      console.log(`  NEW exhibitor: ${v.name} (${v.country}) -> ${id}`);
      if (APPLY) {
        await client.query(
          `insert into exhibitor_db (exhibitor_unique, exhibitor_key, exhibitor_erp, entity_country, account_manager) values ($1,$2,$3,$4,$5)`,
          [id, v.name, v.name, v.country || null, v.manager]
        );
      }
    }
  }
  console.log(`\nExhibitors: ${exhUpdated} account_manager updates, ${exhInserted} new, ${exhUnchanged} unchanged (${existingExh.length - csvExhibitors.size >= 0 ? existingExh.length - [...exhIdByNormKey.values()].length : 0} existing exhibitors not covered by this sheet, left untouched)`);

  // --- Screens: match by (exhibitor, site_name, format) triple ---
  const { rows: existingScreens } = await client.query(`
    select s.screen_unique, s.exhibitor_id, s.site_name, s.screen_format, s.site_id, s.site_address, s.seat_count, s.opening_date, e.exhibitor_erp
    from screen_db s left join exhibitor_db e on e.exhibitor_unique = s.exhibitor_id
  `);
  const existingByTriple = new Map();
  for (const s of existingScreens) {
    const key = `${normExhibitorKey(s.exhibitor_erp)}|${norm(s.site_name).toLowerCase()}|${s.screen_format}`;
    existingByTriple.set(key, s);
  }

  let screenUpdated = 0, screenInserted = 0, screenUnchanged = 0, screenSkippedNoFormat = 0;
  for (const r of data) {
    const format = SCREEN_TYPE_FORMAT[r[idx.screen_type]];
    if (!format) { screenSkippedNoFormat++; continue; }
    const exNormKey = normExhibitorKey(r[idx.exhibitor]);
    const exId = exhIdByNormKey.get(exNormKey);
    const siteName = norm(r[idx.site_name]);
    const key = `${exNormKey}|${siteName.toLowerCase()}|${format}`;
    const existing = existingByTriple.get(key);

    const siteId = norm(r[idx.site_id]) || null;
    const siteAddress = norm(r[idx.site_address]) || null;
    const seatCount = norm(r[idx.seat_count]) || null;
    const openingDate = isoDate(r[idx.open_date]) || norm(r[idx.open_date]) || null;

    if (existing) {
      const changed =
        existing.site_id !== siteId || existing.site_address !== siteAddress ||
        existing.seat_count !== seatCount || existing.opening_date !== openingDate;
      if (changed) {
        screenUpdated++;
        if (APPLY) {
          await client.query(
            `update screen_db set site_id = $1, site_address = $2, seat_count = coalesce($3, seat_count), opening_date = coalesce($4, opening_date) where screen_unique = $5`,
            [siteId, siteAddress, seatCount, openingDate, existing.screen_unique]
          );
        }
      } else screenUnchanged++;
    } else {
      screenInserted++;
      const screenUnique = `${exId}-${siteName}-${format}`.slice(0, 120);
      console.log(`  NEW screen: ${r[idx.exhibitor]} / ${siteName} / ${format} -> ${screenUnique}`);
      if (APPLY) {
        await client.query(
          `insert into screen_db (screen_unique, exhibitor_key, exhibitor_id, site_id, site_name, screen_name, screen_number, format, screen_format, seat_count, opening_date, site_address, data_source)
           values ($1,$2,$3,$4,$5,$5,$6,$7,$7,$8,$9,$10,'all_exhibs_sheet')
           on conflict (screen_unique) do nothing`,
          [screenUnique, r[idx.exhibitor], exId, siteId, siteName, norm(r[idx.screen_number]), format, seatCount, openingDate, siteAddress]
        );
      }
    }
  }
  console.log(`\nScreens: ${screenUpdated} updated, ${screenInserted} new, ${screenUnchanged} unchanged, ${screenSkippedNoFormat} skipped (unrecognized screen_type)`);

  await client.end();
  if (!APPLY) console.log("\n(Dry run only - re-run with --apply to write these changes.)");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
