/**
 * Imports the CJ 4DPLEX "4DX ScreenX Programming_Marketing (Global)" Excel
 * workbook (the export of the team's master Google Sheet) into Supabase,
 * refreshing exhibitors, screens, the title catalog (4dx_db/sx_db,
 * Title_master, lineup), contacts, and historical bookings.
 *
 * Every phase is additive/idempotent: existing exhibitor_unique /
 * screen_unique / title_no keys already in use (referenced by profiles,
 * bookings, etc.) are matched and updated in place, never deleted or
 * regenerated. Safe to re-run whenever a fresh export of the sheet arrives.
 *
 * Usage:
 *   DB_PASSWORD=... node import_programming_sheet.js <path-to-xlsx> <phase>
 *
 * <phase> is one of: schema, exhibitors, screens, lineup, contacts,
 * bookings, all. Run them in that order the first time; `all` runs them
 * in sequence in one process.
 *
 * Requires the `pg` and `xlsx` npm packages (npm install pg xlsx).
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { Client } = require("pg");

const XLSX_PATH = process.argv[2];
const PHASE = process.argv[3] || "all";
if (!XLSX_PATH) {
  console.error("Usage: node import_programming_sheet.js <path-to-xlsx> <phase>");
  process.exit(1);
}

const CACHE_DIR = path.join(__dirname, ".import-cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

function connect() {
  return new Client({
    host: "aws-1-eu-central-1.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    user: "postgres.cvershkiffvpbnuxfaxk",
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

function readSheet(wb, name) {
  if (!wb.Sheets[name]) {
    console.log(`  (sheet "${name}" not present in this workbook, skipping)`);
    return [];
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
}

// Bookings Data / Booking Data (Raw) "Screen Type" column codes -> the four
// live screen_db.screen_format / lineup.format spellings.
const SCREEN_TYPE_FORMAT = {
  SO201100: "4DX",
  SO201200: "ScreenX",
  SO201300: "Ultra4DX",
  SO201400: "UltraScreenX",
};
function formatFromScreenType(code) {
  return SCREEN_TYPE_FORMAT[norm(code)] || null;
}
// Ultra4DX/UltraScreenX are combo screens; the lineup table only tracks
// confirmed/release-date per title for the base format (matches the
// normalize-Ultra logic added to validate_booking in
// 20260723130000_normalize_ultra_format_trigger.sql).
function baseFormat(format) {
  return format.replace(/^Ultra/, "");
}
// "Exhibitor Booking" column: CT022010 is the only code that means the
// exhibitor has actually confirmed the booking. CT022020/CT022030 and blank
// all mean "not confirmed yet" (per user 2026-07-23).
const EXHIBITOR_BOOKING_CONFIRMED = "CT022010";

function norm(s) {
  return String(s ?? "").trim();
}

/** Normalizes an exhibitor name for matching across sheets / against
 * exhibitor_db (strips common corporate suffixes, case/space-insensitive). */
function normExhibitorKey(name) {
  return norm(name)
    .toLowerCase()
    .replace(/\b(cinemas?|theatres?|theaters?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel-ish M/D/YYYY strings some columns come through as.
  const m4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m4) return `${m4[3]}-${m4[1].padStart(2, "0")}-${m4[2].padStart(2, "0")}`;
  // Bookings Data's Preview/Start/End/Input Date columns use 2-digit years
  // (e.g. "4/30/26"); the sheet only spans the 2020s-2030s so 00-99 -> 2000-2099.
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  return null;
}

const GARBAGE_NAMES = new Set([
  "approval status", "sub-total", "subtotal", "total", "grand total",
  "exhibitor", "region", "country", "n/a", "-", "tbd",
]);

function newExhibitorKeyGenerator(existingIds) {
  let max = 10000;
  for (const id of existingIds) {
    const m = /^EX(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let next = max + 1;
  return () => `EX${next++}`;
}

function newTitleKeyGenerator(existingKeys) {
  const taken = new Set(existingKeys);
  return () => {
    let key;
    do {
      const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
      key = `${letter()}${letter()}-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}-${letter()}${letter()}${letter()}`;
    } while (taken.has(key));
    taken.add(key);
    return key;
  };
}

// ---------------------------------------------------------------------------
// Phase: schema — small additive columns/indexes this import needs.
// ---------------------------------------------------------------------------
async function phaseSchema(client) {
  console.log("\n=== schema ===");
  await client.query(`alter table screen_db add column if not exists data_source text`);
  await client.query(`alter table bookings add column if not exists imported_from text`);
  await client.query(`alter table contacts add column if not exists role text`);
  await client.query(`
    create unique index if not exists contacts_email_unique
      on contacts (lower(email)) where email is not null
  `);
  // 4dx_db/sx_db are hand-edited via the Supabase table editor from time to
  // time, which has been observed to silently drop the primary key (seen
  // 2026-07-23: 4dx_db's PK on "Title" was gone, FK survived). Restore it
  // idempotently so the on-conflict upserts below always have a target.
  for (const t of ['"4dx_db"', "sx_db"]) {
    const { rows } = await client.query(
      `select 1 from pg_constraint where conrelid = $1::regclass and contype = 'p'`,
      [t]
    );
    if (rows.length === 0) {
      const bare = t.replace(/"/g, "");
      await client.query(`alter table ${t} add constraint "${bare}_pkey" primary key ("Title")`);
      console.log(`  restored missing primary key on ${bare}("Title")`);
    }
  }
  console.log("schema updated: screen_db.data_source, bookings.imported_from, contacts.role, contacts_email_unique index");
}

// ---------------------------------------------------------------------------
// Phase: exhibitors — consolidate every sheet that mentions an exhibitor,
// match against existing exhibitor_db by normalized name, update in place
// or insert new rows with freshly generated keys.
// ---------------------------------------------------------------------------
function buildExhibitorList(wb) {
  const exhibitors = new Map(); // normExhibitorKey -> record
  function upsert(name, country, region) {
    const n = norm(name);
    if (!n || GARBAGE_NAMES.has(n.toLowerCase())) return null;
    const k = normExhibitorKey(n);
    if (!k) return null;
    let rec = exhibitors.get(k);
    if (!rec) {
      rec = { name: n, country: null, region: null, screenCounts: {} };
      exhibitors.set(k, rec);
    }
    if (country && !rec.country) rec.country = norm(country);
    if (region && !rec.region) rec.region = norm(region);
    return rec;
  }

  for (const [sheet, fmt] of [
    ["4DX Title Poll", "4DX"], ["SX Title Poll", "ScreenX"],
    ["BTS JIN(4DX)", "4DX"], ["BTS JIN(SX)", "ScreenX"],
  ]) {
    for (const r of readSheet(wb, sheet).slice(2)) {
      if (!r || !r[2]) continue;
      const rec = upsert(r[2], r[1], r[0]);
      if (!rec) continue;
      const cnt = parseInt(r[3], 10);
      if (!isNaN(cnt)) rec.screenCounts[fmt] = Math.max(rec.screenCounts[fmt] || 0, cnt);
    }
  }
  for (const r of readSheet(wb, "Dashboard (All Exhibitors)").slice(3)) {
    if (r && r[2]) upsert(r[2], r[1], r[0]);
  }
  for (const r of readSheet(wb, "Contact Email").slice(2)) {
    if (r && r[2]) upsert(r[2], r[3], r[1]);
  }
  for (const r of readSheet(wb, "Bookings Data").slice(1)) {
    if (r && r[3]) upsert(r[3], r[1], null);
  }
  return exhibitors;
}

async function phaseExhibitors(client, wb) {
  console.log("\n=== exhibitors ===");
  const sheetExhibitors = buildExhibitorList(wb);
  console.log(`consolidated ${sheetExhibitors.size} distinct exhibitors from the workbook`);

  const { rows: existing } = await client.query(
    `select exhibitor_unique, exhibitor_key, exhibitor_erp, entity_country, screenx, "4dx" from exhibitor_db`
  );
  const byNormName = new Map(existing.map((e) => [normExhibitorKey(e.exhibitor_erp), e]));
  const genKey = newExhibitorKeyGenerator(existing.map((e) => e.exhibitor_unique));

  let updated = 0, inserted = 0;
  const idMap = new Map(); // normExhibitorKey -> exhibitor_unique, for later phases

  for (const [k, rec] of sheetExhibitors) {
    const match = byNormName.get(k);
    if (match) {
      idMap.set(k, match.exhibitor_unique);
      const wantsSx = !!rec.screenCounts.ScreenX;
      const wants4dx = !!rec.screenCounts["4DX"];
      const needsUpdate =
        (rec.country && !match.entity_country) ||
        (wantsSx && !match.screenx) ||
        (wants4dx && !match["4dx"]);
      if (needsUpdate) {
        await client.query(
          `update exhibitor_db set
             entity_country = coalesce(entity_country, $1),
             screenx = screenx or $2,
             "4dx" = "4dx" or $3
           where exhibitor_unique = $4`,
          [rec.country, wantsSx, wants4dx, match.exhibitor_unique]
        );
        updated++;
      }
    } else {
      const id = genKey();
      idMap.set(k, id);
      await client.query(
        `insert into exhibitor_db
           (exhibitor_unique, exhibitor_key, exhibitor_erp, entity_country, screenx, "4dx", ultra4dx)
         values ($1, $2, $3, $4, $5, $6, false)`,
        [id, rec.name, rec.name, rec.country, !!rec.screenCounts.ScreenX, !!rec.screenCounts["4DX"]]
      );
      inserted++;
    }
  }
  console.log(`exhibitor_db: ${updated} existing rows updated, ${inserted} new rows inserted`);

  fs.writeFileSync(
    path.join(CACHE_DIR, "exhibitor-id-map.json"),
    JSON.stringify([...idMap.entries()])
  );
  fs.writeFileSync(
    path.join(CACHE_DIR, "exhibitor-screen-counts.json"),
    JSON.stringify([...sheetExhibitors.entries()].map(([k, v]) => [k, v.screenCounts]))
  );
  console.log("cached exhibitor id map + screen counts for later phases");
}

// ---------------------------------------------------------------------------
// Phase: screens — real screens from Booking Data (Raw) site names, plus
// clearly-tagged placeholder screens for exhibitors known only by a screen
// count from the poll sheets.
// ---------------------------------------------------------------------------
async function phaseScreens(client, wb) {
  console.log("\n=== screens ===");
  const idMap = new Map(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "exhibitor-id-map.json"))));
  const screenCounts = new Map(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "exhibitor-screen-counts.json"))));

  const { rows: existingScreens } = await client.query(
    `select screen_unique, exhibitor_id, site_name, screen_format from screen_db`
  );
  const existingKey = new Set(
    existingScreens.map((s) => `${s.exhibitor_id}|${(s.site_name || "").toLowerCase()}|${s.screen_format}`)
  );

  const { rows: exhibitorRows } = await client.query(`select exhibitor_unique, exhibitor_key from exhibitor_db`);
  const exhibitorKeyById = new Map(exhibitorRows.map((e) => [e.exhibitor_unique, e.exhibitor_key]));

  // Real screens from Bookings Data: unique (exhibitor, site, format), format
  // from the "Screen Type" column (SO2011.. etc, exact incl. Ultra variants).
  const bd = readSheet(wb, "Bookings Data").slice(1);
  const realScreens = new Map(); // key -> {exhibitorId, siteName, format}
  let unmatchedExhibitors = new Set();
  for (const r of bd) {
    if (!r || !r[3] || !r[4]) continue;
    const format = formatFromScreenType(r[6]);
    if (!format) continue;
    const exKey = normExhibitorKey(r[3]);
    const exId = idMap.get(exKey);
    if (!exId) {
      unmatchedExhibitors.add(r[3]);
      continue;
    }
    const site = norm(r[4]);
    const key = `${exId}|${site.toLowerCase()}|${format}`;
    if (!realScreens.has(key)) realScreens.set(key, { exhibitorId: exId, siteName: site, format });
  }
  console.log(`Bookings Data: ${realScreens.size} distinct real (exhibitor, site, format) screens`);
  if (unmatchedExhibitors.size) {
    console.log(`  (${unmatchedExhibitors.size} exhibitor names in Booking Data had no exhibitor match, skipped)`);
  }

  let insertedReal = 0;
  for (const [key, s] of realScreens) {
    if (existingKey.has(key)) continue;
    const screenUnique = `${s.exhibitorId}-${s.siteName}-${s.format}`.slice(0, 120);
    await client.query(
      `insert into screen_db
         (screen_unique, exhibitor_key, exhibitor_id, site_name, screen_name, format, screen_format, data_source)
       values ($1, $2, $3, $4, $4, $5, $5, 'excel_import_confirmed')
       on conflict (screen_unique) do nothing`,
      [screenUnique, exhibitorKeyById.get(s.exhibitorId) || s.exhibitorId, s.exhibitorId, s.siteName, s.format]
    );
    existingKey.add(key);
    insertedReal++;
  }
  console.log(`inserted ${insertedReal} new real screens`);

  // Placeholder screens for exhibitors known only via a screen count.
  let insertedPlaceholder = 0;
  for (const [exKey, counts] of screenCounts) {
    const exId = idMap.get(exKey);
    if (!exId) continue;
    for (const format of ["4DX", "ScreenX"]) {
      const count = counts[format];
      if (!count) continue;
      // How many real screens of this format does this exhibitor already have
      // (from Booking Data or pre-existing)? Only fill the gap with placeholders.
      const haveReal = [...realScreens.values()].filter((s) => s.exhibitorId === exId && s.format === format).length;
      const havePreexisting = existingScreens.filter((s) => s.exhibitor_id === exId && s.screen_format === format).length;
      const need = count - haveReal - havePreexisting;
      for (let i = 1; i <= need; i++) {
        const screenUnique = `${exId}-${format}-PLACEHOLDER-${i}`;
        const key = `${exId}|placeholder ${i}|${format}`;
        if (existingKey.has(key)) continue;
        await client.query(
          `insert into screen_db
             (screen_unique, exhibitor_key, exhibitor_id, site_name, screen_name, format, screen_format, data_source)
           values ($1, $2, $3, $4, $4, $5, $5, 'excel_import_placeholder')
           on conflict (screen_unique) do nothing`,
          [screenUnique, exhibitorKeyById.get(exId) || exId, exId, `Unconfirmed site ${i}`, format]
        );
        existingKey.add(key);
        insertedPlaceholder++;
      }
    }
  }
  console.log(`inserted ${insertedPlaceholder} placeholder screens (data_source='excel_import_placeholder', need manual verification)`);
}

// ---------------------------------------------------------------------------
// Phase: lineup — refresh Title_master links, 4dx_db/sx_db, and lineup from
// the Lineup(Detail) sheet (full history: every title, any status).
// ---------------------------------------------------------------------------
async function phaseLineup(client, wb) {
  console.log("\n=== lineup ===");
  const rows = readSheet(wb, "Lineup(Detail)").slice(1).filter((r) => r && r[0]);
  console.log(`Lineup(Detail): ${rows.length} title rows`);

  function mapRow(r, statusIdx) {
    const yearStr = norm(r[1]);
    return {
      Title: norm(r[0]),
      Year: /^\d+$/.test(yearStr) ? yearStr : null, // 4dx_db/sx_db "Year" is bigint; source has stray "TBD" values
      Month: r[2] ? String(r[2]) : null,
      FirstReleaseDate: norm(r[3]) || null,
      Distributor: norm(r[4]) || null,
      Country: norm(r[5]) || null,
      Type: norm(r[6]) || null, // Hollywood/Local
      Release: norm(r[7]) || null, // New / Re-release
      status: norm(r[statusIdx]) || null,
    };
  }
  const fourDx = rows.filter((r) => r[8]).map((r) => mapRow(r, 8));
  const screenX = rows.filter((r) => r[9]).map((r) => mapRow(r, 9));
  console.log(`4DX rows: ${fourDx.length}, ScreenX rows: ${screenX.length}`);

  await client.query("begin");
  try {
    await client.query(`delete from "4dx_db"`);
    for (const t of fourDx) {
      await client.query(
        `insert into "4dx_db" ("Title","Year","Month","First Release Date","Distributor","Country","Type","Release")
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict ("Title") do update set
           "Year"=excluded."Year", "Month"=excluded."Month", "First Release Date"=excluded."First Release Date",
           "Distributor"=excluded."Distributor", "Country"=excluded."Country", "Type"=excluded."Type", "Release"=excluded."Release"`,
        [t.Title, t.Year, t.Month, t.FirstReleaseDate, t.Distributor, t.Country, t.Type, t.Release]
      );
    }
    await client.query(`delete from sx_db`);
    for (const t of screenX) {
      await client.query(
        `insert into sx_db ("Title","Year","Month","First Release Date","Distributor","Country","Type","Release")
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict ("Title") do update set
           "Year"=excluded."Year", "Month"=excluded."Month", "First Release Date"=excluded."First Release Date",
           "Distributor"=excluded."Distributor", "Country"=excluded."Country", "Type"=excluded."Type", "Release"=excluded."Release"`,
        [t.Title, t.Year, t.Month, t.FirstReleaseDate, t.Distributor, t.Country, t.Type, t.Release]
      );
    }
    await client.query("commit");
    console.log(`4dx_db refreshed: ${fourDx.length} rows. sx_db refreshed: ${screenX.length} rows.`);
  } catch (e) {
    await client.query("rollback");
    throw e;
  }

  // Link every distinct title (across both formats) to Title_master.
  const { rows: titleMasterRows } = await client.query(`select title_no, erp_title from "Title_master"`);
  const byErp = new Map(titleMasterRows.map((t) => [norm(t.erp_title).toLowerCase(), t.title_no]));
  const genTitleKey = newTitleKeyGenerator(titleMasterRows.map((t) => t.title_no));

  const allTitles = new Map(); // Title -> title_no
  const distinctTitles = [...new Set([...fourDx, ...screenX].map((t) => t.Title))];
  let matched = 0, created = 0;
  for (const title of distinctTitles) {
    const key = title.toLowerCase();
    let titleNo = byErp.get(key);
    if (!titleNo) {
      titleNo = genTitleKey();
      await client.query(`insert into "Title_master" (title_no, erp_title) values ($1, $2)`, [titleNo, title]);
      byErp.set(key, titleNo);
      created++;
    } else {
      matched++;
    }
    allTitles.set(title, titleNo);
  }
  console.log(`Title_master: ${matched} titles matched existing, ${created} new titles created`);

  fs.writeFileSync(path.join(CACHE_DIR, "title-map.json"), JSON.stringify([...allTitles.entries()]));

  // Sync into lineup: confirmed reflects the real status, not forced true.
  let lineupUpserts = 0;
  for (const [list, format] of [[fourDx, "4DX"], [screenX, "ScreenX"]]) {
    for (const t of list) {
      const titleNo = allTitles.get(t.Title);
      const confirmed = t.status === "Confirmed";
      const releaseDate = isoDate(t.FirstReleaseDate);
      const notes = [t.Distributor, t.Country, t.Type, t.Release].filter(Boolean).join(" · ") || null;
      const syncStatus = releaseDate
        ? `synced from Lineup(Detail) (status: ${t.status || "unknown"})`
        : `synced from Lineup(Detail) (status: ${t.status || "unknown"}) — release date unresolved: ${t.FirstReleaseDate || "none"}`;
      await client.query(
        `insert into lineup (title_no, format, confirmed, first_available_release_date, notes, sync_status)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (title_no, format) do update set
           confirmed = excluded.confirmed,
           first_available_release_date = excluded.first_available_release_date,
           notes = excluded.notes,
           sync_status = excluded.sync_status,
           updated_at = now()`,
        [titleNo, format, confirmed, releaseDate, notes, syncStatus]
      );
      lineupUpserts++;
    }
  }
  console.log(`lineup: ${lineupUpserts} rows upserted`);
}

// ---------------------------------------------------------------------------
// Phase: contacts — "Main Contact" rows from Contact Email (named person +
// email + job title); the bare "Additional Contacts" emails have no
// associated name, so they're intentionally skipped.
// ---------------------------------------------------------------------------
async function phaseContacts(client, wb) {
  console.log("\n=== contacts ===");
  const idMap = new Map(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "exhibitor-id-map.json"))));
  const rows = readSheet(wb, "Contact Email").slice(2);

  let inserted = 0, updated = 0, skippedNoExhibitor = 0, skippedNoNameOrEmail = 0;
  for (const r of rows) {
    const format = norm(r[0]);
    const exhibitorName = norm(r[2]);
    const country = norm(r[3]);
    const contactType = norm(r[4]);
    const name = norm(r[5]);
    const jobTitle = norm(r[6]) || null;
    const email = norm(r[7]) || null;
    if (!name || !email) { skippedNoNameOrEmail++; continue; }

    const exId = idMap.get(normExhibitorKey(exhibitorName));
    if (!exId) { skippedNoExhibitor++; continue; }

    const parts = name.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ") || null;
    const relevantFormats = format === "4DX" || format === "ScreenX" ? [format] : null;

    const { rows: existing } = await client.query(
      `select id, role from contacts where lower(email) = lower($1)`,
      [email]
    );
    if (existing.length) {
      // Same person can be listed under more than one Contact Type (e.g.
      // both Programming and Marketing) - accumulate distinct roles rather
      // than letting the later row overwrite the earlier one.
      const existingRoles = (existing[0].role || "").split(" / ").map((s) => s.trim()).filter(Boolean);
      const mergedRole = contactType && !existingRoles.includes(contactType)
        ? [...existingRoles, contactType].join(" / ")
        : (existing[0].role || contactType || null);
      await client.query(
        `update contacts set first_name=$1, last_name=$2, country=$3, exhibitor_unique=$4, role=$5,
           relevant_formats = case when $6::text[] is null then relevant_formats
             else (select array(select distinct unnest(coalesce(relevant_formats,'{}') || $6))) end
         where id = $7`,
        [firstName, lastName, country || null, exId, mergedRole, relevantFormats, existing[0].id]
      );
      updated++;
    } else {
      await client.query(
        `insert into contacts (first_name, last_name, email, country, exhibitor_unique, relevant_formats, role)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [firstName, lastName, email, country || null, exId, relevantFormats, contactType || null]
      );
      inserted++;
    }
    void jobTitle; // captured in role/contactType; no dedicated column for job title yet
  }
  console.log(`contacts: ${inserted} inserted, ${updated} updated, ${skippedNoExhibitor} skipped (no exhibitor match), ${skippedNoNameOrEmail} skipped (no name/email)`);
}

// ---------------------------------------------------------------------------
// Phase: bookings — historical/current bookings from Bookings Data,
// pre-validated in JS against the same rules validate_booking enforces, so
// every row we attempt to insert should pass; batched with ON CONFLICT DO
// NOTHING against bookings_active_unique as the final backstop.
// ---------------------------------------------------------------------------
async function phaseBookings(client, wb) {
  console.log("\n=== bookings ===");
  const idMap = new Map(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "exhibitor-id-map.json"))));
  const titleMap = new Map(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "title-map.json"))));

  const { rows: screens } = await client.query(
    `select screen_unique, exhibitor_id, site_name, screen_format from screen_db`
  );
  const screenByKey = new Map(
    screens.map((s) => [`${s.exhibitor_id}|${(s.site_name || "").toLowerCase()}|${s.screen_format}`, s.screen_unique])
  );

  const { rows: lineupRows } = await client.query(
    `select lineup_id, title_no, format, confirmed, first_available_release_date::text as release_date from lineup`
  );
  const lineupByKey = new Map(lineupRows.map((l) => [`${l.title_no}|${l.format}`, l]));

  // Bookings Data titles carry a leading "(Ultra)" tag and/or a trailing
  // "(4DX)"/"(ScreenX)" format tag and/or a trailing "(YYYY Re-release)" tag,
  // in that left-to-right order — strip re-release before format since
  // format isn't always the last thing in the string.
  function cleanTitle(raw) {
    return norm(raw)
      .replace(/^\(Ultra\)\s*/i, "")
      .replace(/\s*\(\d{4}\s*Re-release\)\s*$/i, "")
      .replace(/\s*\((4DX|ScreenX)\)\s*$/i, "")
      .trim();
  }

  const bd = readSheet(wb, "Bookings Data").slice(1);
  console.log(`Bookings Data: ${bd.length} rows`);

  const candidates = [];
  const skip = {
    noFormat: 0, noExhibitor: 0, noTitle: 0, noScreen: 0,
    noLineup: 0, notConfirmed: 0, beforeRelease: 0, noDate: 0, duplicate: 0,
  };
  const seen = new Set();

  for (const r of bd) {
    if (!r || !r[2] || !r[3] || !r[4]) continue;
    const format = formatFromScreenType(r[6]);
    if (!format) { skip.noFormat++; continue; }

    const exId = idMap.get(normExhibitorKey(r[3]));
    if (!exId) { skip.noExhibitor++; continue; }

    const title = cleanTitle(r[2]);
    const titleNo = titleMap.get(title);
    if (!titleNo) { skip.noTitle++; continue; }

    // Screen must be the exact format (Ultra4DX screens are their own row);
    // the lineup title, however, is only tracked at the base format.
    const screenKey = `${exId}|${norm(r[4]).toLowerCase()}|${format}`;
    const screenUnique = screenByKey.get(screenKey);
    if (!screenUnique) { skip.noScreen++; continue; }

    const lineup = lineupByKey.get(`${titleNo}|${baseFormat(format)}`);
    if (!lineup) { skip.noLineup++; continue; }
    if (!lineup.confirmed) { skip.notConfirmed++; continue; }

    const playDate = isoDate(r[9]);
    if (!playDate) { skip.noDate++; continue; }
    if (lineup.release_date && playDate < lineup.release_date) { skip.beforeRelease++; continue; }

    const dedupeKey = `${screenUnique}|${lineup.lineup_id}|${playDate}`;
    if (seen.has(dedupeKey)) { skip.duplicate++; continue; }
    seen.add(dedupeKey);

    // "Exhibitor Booking" CT022010 is the only code meaning actually
    // confirmed; CT022020/CT022030/blank all mean not confirmed yet.
    const confirmed = norm(r[7]) === EXHIBITOR_BOOKING_CONFIRMED;
    const inputBy = norm(r[12]) || null;
    const inputAt = isoDate(r[13]);

    candidates.push({
      screen_unique: screenUnique,
      lineup_id: lineup.lineup_id,
      exhibitor_unique: exId,
      requested_play_date: playDate,
      status: confirmed ? "confirmed" : "requested",
      requested_by: inputBy,
      confirmed_by: confirmed ? inputBy : null,
      confirmed_at: confirmed ? inputAt : null,
    });
  }

  console.log(`candidates ready to insert: ${candidates.length}`);
  console.log("skipped:", JSON.stringify(skip));

  const BATCH = 300;
  let inserted = 0, batchFailures = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const values = [];
    const params = [];
    batch.forEach((b, idx) => {
      const base = idx * 9;
      values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`);
      params.push(
        b.screen_unique, b.lineup_id, b.exhibitor_unique, b.requested_play_date,
        b.status, b.requested_by, b.confirmed_at, b.confirmed_by, "excel_import Bookings Data 2026-07-23"
      );
    });
    const sql = `
      insert into bookings
        (screen_unique, lineup_id, exhibitor_unique, requested_play_date, status, requested_by, confirmed_at, confirmed_by, imported_from)
      values ${values.join(",")}
      on conflict (screen_unique, lineup_id, requested_play_date) where status in ('requested','confirmed') do nothing
    `;
    try {
      const res = await client.query(sql, params);
      inserted += res.rowCount;
    } catch (e) {
      batchFailures++;
      console.log(`  batch ${i}-${i + batch.length} FAILED: ${e.message}`);
    }
  }
  console.log(`bookings inserted: ${inserted} (of ${candidates.length} candidates; ${batchFailures} batches failed)`);
}

// ---------------------------------------------------------------------------
async function main() {
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true });
  const client = connect();
  await client.connect();
  console.log("connected to live DB");

  const phases = {
    schema: () => phaseSchema(client),
    exhibitors: () => phaseExhibitors(client, wb),
    screens: () => phaseScreens(client, wb),
    lineup: () => phaseLineup(client, wb),
    contacts: () => phaseContacts(client, wb),
    bookings: () => phaseBookings(client, wb),
  };

  if (PHASE === "all") {
    for (const name of ["schema", "exhibitors", "screens", "lineup", "contacts", "bookings"]) {
      await phases[name]();
    }
  } else if (phases[PHASE]) {
    await phases[PHASE]();
  } else {
    console.error(`Unknown phase "${PHASE}". Valid: schema, exhibitors, screens, lineup, contacts, bookings, all`);
    process.exitCode = 1;
  }

  await client.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
