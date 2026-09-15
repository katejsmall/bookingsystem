/**
 * Points one title at a specific TMDB movie id, for when automatic name
 * matching picked the wrong film (usually an older entry sharing a title).
 *
 * Usage: TMDB_API_KEY=... DB_PASSWORD=... node fix_one_poster.js "<title search>" <tmdbId> [--apply]
 */
const { Client } = require("pg");

const SEARCH = process.argv[2];
const TMDB_ID = process.argv[3];
const APPLY = process.argv.includes("--apply");
const API_KEY = process.env.TMDB_API_KEY;

async function main() {
  const client = new Client({
    host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
    user: "postgres.cvershkiffvpbnuxfaxk", password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query(
    `select f.title_no, f."Title", f.poster_path, f.imdb_link,
            (select string_agg(distinct l.format || ' ' || coalesce(l.first_available_release_date::text,'?'), ', ')
               from lineup l where l.title_no = f.title_no) as lineup
     from film_imdb_db f
     where f."Title" ilike $1
     order by f."Title"`,
    [`%${SEARCH}%`]
  );
  console.log(`matching rows for "${SEARCH}":`);
  for (const r of rows) {
    console.log(`  ${r.Title}  [${r.title_no}]`);
    console.log(`     lineup : ${r.lineup ?? "(not in lineup)"}`);
    console.log(`     poster : ${r.poster_path ?? "(none)"}`);
  }
  if (!TMDB_ID) { await client.end(); return; }

  const res = await fetch(`https://api.themoviedb.org/3/movie/${TMDB_ID}?api_key=${API_KEY}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const movie = await res.json();
  const url = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
  console.log(`\nTMDB ${TMDB_ID}: "${movie.title}" (${(movie.release_date ?? "?").slice(0, 4)})`);
  console.log(`  poster -> ${url}`);

  if (APPLY) {
    for (const r of rows) {
      await client.query(`update film_imdb_db set poster_path = $1 where title_no = $2`, [url, r.title_no]);
      console.log(`  set on ${r.Title}`);
    }
  } else {
    console.log(`\n(dry run - re-run with --apply)`);
  }
  await client.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
