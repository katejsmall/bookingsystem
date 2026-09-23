/**
 * Backfills trailer_assets.title_no by matching trailer_assets.title against
 * Title_master (via film_imdb_db.Title / Title_master.erp_title) on
 * normalized name. ~88% of real trailers (category='TLR') match this way;
 * the rest (naming drift, or Brand TLR/QC/demo-reel rows with no film at
 * all) are left null for the team to link manually later.
 *
 * Usage: DB_PASSWORD=... node link_trailer_assets_titles.js [--apply]
 * Without --apply, does a dry run and only prints what it would link.
 */
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[:\-–.,!'"*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const client = new Client({
    host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
    user: "postgres.cvershkiffvpbnuxfaxk", password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows: lineupTitles } = await client.query(`
    select tm.title_no, coalesce(f."Title", tm.erp_title) as title
    from "Title_master" tm
    left join film_imdb_db f on f.title_no = tm.title_no
  `);
  const titleNoByNorm = new Map();
  for (const r of lineupTitles) {
    const key = norm(r.title);
    if (key && !titleNoByNorm.has(key)) titleNoByNorm.set(key, r.title_no);
  }

  const { rows: assets } = await client.query(
    "select id, title from trailer_assets where title_no is null"
  );

  let matched = 0, unmatched = 0;
  for (const a of assets) {
    const titleNo = titleNoByNorm.get(norm(a.title));
    if (!titleNo) { unmatched++; continue; }
    matched++;
    if (APPLY) {
      await client.query("update trailer_assets set title_no = $1 where id = $2", [titleNo, a.id]);
    }
  }

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Trailer assets: ${matched} matched to a title, ${unmatched} left unlinked (out of ${assets.length} unlinked rows checked)`);
  await client.end();
  if (!APPLY) console.log("\n(Dry run only - re-run with --apply to write these links.)");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
