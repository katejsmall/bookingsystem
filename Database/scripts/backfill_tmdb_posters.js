/**
 * Backfills film_imdb_db.poster_path from TMDB.
 *
 * Why TMDB and not IMDb: IMDb has no public API and its artwork is
 * copyrighted, so scraping it isn't an option. TMDB exposes a
 * find-by-external-id endpoint, which means the IMDb IDs already stored in
 * film_imdb_db.imdb_link map across exactly - no guessing.
 *
 * Two passes:
 *   1. IMDb ID  -> exact match, always safe.
 *   2. Title (+ year, when film_imdb_db.release_date yields one) -> only
 *      accepted above a similarity threshold, because a wrong poster on a
 *      title is worse than no poster.
 *
 * Stores the absolute TMDB CDN URL (w500). The app swaps the size segment
 * per view, so one stored value serves a 15KB calendar thumbnail and a
 * crisp dashboard card, and nothing is copied into our own storage.
 *
 * Usage:
 *   TMDB_API_KEY=... DB_PASSWORD=... node backfill_tmdb_posters.js [--apply] [--limit=N]
 * Dry run by default: prints what it would set and the match confidence.
 */
const { Client } = require("pg");

const API_KEY = process.env.TMDB_API_KEY;
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || 0;
const IMG_BASE = "https://image.tmdb.org/t/p/w500";
/** Below this, a title+year match is left for a human. 0..1. */
const MIN_CONFIDENCE = 0.82;

if (!API_KEY) {
  console.error("Set TMDB_API_KEY (free: themoviedb.org -> Settings -> API).");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < 5) {
      // TMDB asks callers to back off rather than hammering.
      await sleep(Number(res.headers.get("retry-after") || 1) * 1000 + 250);
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
    return res.json();
  }
}

/** "https://www.imdb.com/title/tt0373051/" -> "tt0373051" */
function imdbId(link) {
  const m = /\/(tt\d{6,})/.exec(String(link ?? ""));
  return m ? m[1] : null;
}

/** film_imdb_db.release_date is messy varchar (mixed d/m/y orders). We only
 *  need the year, which is unambiguous in every observed format. */
function yearOf(raw) {
  const m = /(19|20)\d{2}/.exec(String(raw ?? ""));
  return m ? m[0] : null;
}

/**
 * Strips bracketed local-language titles, format tags and punctuation so
 * "Nobody (浪浪山小妖怪)" and "Nobody" compare equal.
 *
 * Unicode-aware on purpose: an earlier [^a-z0-9] version deleted every
 * CJK character, so "탕런지에 2" collapsed to "2" and matched anything
 * else that also reduced to "2" at a bogus 1.00 confidence. Keeping
 * letters in any script means a Korean/Japanese/Chinese title still
 * compares as itself.
 */
function normalizeTitle(t) {
  return String(t ?? "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(4DX|ScreenX|Ultra4DX|UltraScreenX|Re-?release|Extended (Edition|Cut))\b/gi, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A query with almost nothing left in it can only produce noise. */
function tooVagueToSearch(q) {
  return q.length < 2 || /^[\d\s]*$/.test(q);
}

/**
 * Pulls a release year out of the title itself ("Cars 2006",
 * "Resident Evil (2026)") so it can be used as a search hint rather than
 * being treated as a sequel number - otherwise the number guard rejects
 * TMDB's "Cars", which carries no digit at all.
 * A title that is *only* a year ("2012", "1917") is left alone.
 */
function splitYear(q) {
  const m = q.match(/\b(?:19|20)\d{2}\b/);
  if (!m) return { text: q, year: null };
  const text = q.replace(m[0], " ").replace(/\s+/g, " ").trim();
  return text ? { text, year: m[0] } : { text: q, year: null };
}

/**
 * Sequel numbers are the entire distinction between many titles, but a
 * single changed digit barely moves a bigram score ("toy story 5" vs
 * "toy story 4" scores 0.90). So compare number tokens exactly and reject
 * outright when they disagree, rather than trusting the fuzzy score.
 */
function numberTokens(s) {
  return (String(s).match(/\b(\d+|i{1,3}|iv|v|vi{1,3}|ix|x)\b/g) ?? []).join(" ");
}
function numbersAgree(a, b) {
  return numberTokens(a) === numberTokens(b);
}

/** Dice coefficient on bigrams - tolerant of word order and small edits. */
function similarity(a, b) {
  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let hits = 0;
  let total = 0;
  for (const n of A.values()) total += n;
  for (const n of B.values()) total += n;
  for (const [g, n] of A) if (B.has(g)) hits += Math.min(n, B.get(g));
  return total ? (2 * hits) / total : 0;
}

async function main() {
  const client = new Client({
    host: "aws-1-eu-central-1.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    user: "postgres.cvershkiffvpbnuxfaxk",
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Two populations need artwork:
  //  (a) film_imdb_db rows that simply have no poster yet, and
  //  (b) Title_master entries with NO film_imdb_db row at all - most of
  //      the *upcoming* catalogue, since the programming-sheet import
  //      creates bare title rows with no IMDb metadata. Those need a
  //      metadata row inserted, not updated.
  // lineup_date is the strongest year signal available: for a remake or
  // reboot sharing a title (Street Fighter, Resident Evil), it's what
  // separates the 2026 film from the 1994 one. Rows created from
  // Title_master have no release_date at all, so without it those match
  // purely on popularity and land on the wrong film.
  const { rows } = await client.query(`
    select f.title_no, f."Title", f.imdb_link, f.release_date, false as needs_insert,
           (select min(l.first_available_release_date) from lineup l where l.title_no = f.title_no) as lineup_date
    from film_imdb_db f
    where f.poster_path is null
    union all
    select t.title_no, t.erp_title as "Title", null, null, true as needs_insert,
           (select min(l.first_available_release_date) from lineup l where l.title_no = t.title_no) as lineup_date
    from "Title_master" t
    where not exists (select 1 from film_imdb_db f where f.title_no = t.title_no)
      and t.erp_title is not null
    order by "Title"
    ${LIMIT ? `limit ${LIMIT}` : ""}
  `);
  const inserts = rows.filter((r) => r.needs_insert).length;
  console.log(
    `${rows.length} titles without a base poster (${rows.length - inserts} existing rows, ${inserts} with no metadata row yet). Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`
  );

  const stats = { byId: 0, byName: 0, lowConfidence: 0, noResult: 0, errors: 0 };
  const updates = [];
  const rejected = [];

  for (const [i, row] of rows.entries()) {
    if (i && i % 100 === 0) console.log(`  …${i}/${rows.length}`);
    try {
      const id = imdbId(row.imdb_link);
      let posterPath = null;
      let how = null;
      let confidence = 1;

      if (id) {
        const found = await tmdb(`/find/${id}`, { external_source: "imdb_id" });
        const hit = found.movie_results?.[0];
        if (hit?.poster_path) {
          posterPath = hit.poster_path;
          how = "imdb-id";
        }
      }

      if (!posterPath) {
        // Year hints, most trustworthy first: one written into the title
        // ("Cars 2006"), then when we're actually programming it, then the
        // messy ERP release_date varchar.
        const split = splitYear(normalizeTitle(row.Title));
        const year = split.year ?? yearOf(row.lineup_date) ?? yearOf(row.release_date);
        const query = split.text;
        if (query && !tooVagueToSearch(query)) {
          const res = await tmdb("/search/movie", { query, year, include_adult: "false" });
          const scored = (res.results ?? [])
            .filter((r) => r.poster_path)
            // A sequel number mismatch is disqualifying, not just a penalty.
            .filter((r) => numbersAgree(query, normalizeTitle(r.title)))
            // Best of the two title fields, not a weighted blend: for a
            // foreign film TMDB's original_title is in its own script,
            // which normalizes to nothing here and would drag an exact
            // English-title match (1.00) down to 0.70 and get it rejected.
            .map((r) => ({
              r,
              score: Math.max(
                similarity(query, normalizeTitle(r.title)),
                similarity(query, normalizeTitle(r.original_title))
              ),
              // Distance from the hint year, for the tie-break below.
              yearGap: year
                ? Math.abs(Number(year) - Number((r.release_date ?? "").slice(0, 4) || 0))
                : 0,
            }))
            // Remakes and reboots share a title exactly, so both score
            // 1.00 and the sort order alone decides - TMDB returns them
            // by popularity, which picked the 1994 Street Fighter over the
            // 2026 one we're actually programming. Break ties on the year.
            .sort((a, b) => b.score - a.score || a.yearGap - b.yearGap);
          const best = scored[0];
          if (best && best.score >= MIN_CONFIDENCE) {
            posterPath = best.r.poster_path;
            how = "title-year";
            confidence = best.score;
          } else if (best) {
            stats.lowConfidence++;
            rejected.push({ title: row.Title, guess: best.r.title, score: best.score.toFixed(2) });
          }
        }
      }

      if (posterPath) {
        const url = `${IMG_BASE}${posterPath}`;
        // Keyed on title_no, NOT title_key: title_key is not unique
        // (380 rows share the literal value 'imdb'), so updating by it
        // overwrites every one of those rows with the same poster.
        updates.push({
          title_no: row.title_no,
          title: row.Title,
          url,
          needsInsert: row.needs_insert,
        });
        if (how === "imdb-id") stats.byId++;
        else stats.byName++;
        if (how === "title-year") {
          console.log(`  ~ ${row.Title}  ->  ${url}  (name match ${confidence.toFixed(2)})`);
        }
      } else if (!posterPath && how === null) {
        stats.noResult++;
      }
    } catch (e) {
      stats.errors++;
      if (stats.errors < 5) console.log(`  ! ${row.Title}: ${e.message}`);
    }
    await sleep(30); // stay well inside TMDB's rate limit
  }

  console.log(`\nmatched by IMDb ID : ${stats.byId}`);
  console.log(`matched by name    : ${stats.byName}`);
  console.log(`rejected (too low) : ${stats.lowConfidence}`);
  console.log(`no result          : ${stats.noResult}`);
  console.log(`errors             : ${stats.errors}`);

  if (rejected.length) {
    console.log(`\nLow-confidence guesses NOT applied (first 15):`);
    for (const r of rejected.slice(0, 15)) {
      console.log(`  "${r.title}"  vs TMDB "${r.guess}"  (${r.score})`);
    }
  }

  if (APPLY && updates.length) {
    let updated = 0;
    let inserted = 0;
    for (const u of updates) {
      if (u.needsInsert) {
        // title_key is non-null but not unique in this table; derive one
        // from title_no so at least the new rows are distinguishable.
        await client.query(
          `insert into film_imdb_db (title_key, "Title", title_no, poster_path)
           values ($1, $2, $3, $4)`,
          [`${u.title_no}_tmdb`, u.title, u.title_no, u.url]
        );
        inserted++;
      } else {
        await client.query(`update film_imdb_db set poster_path = $1 where title_no = $2`, [
          u.url,
          u.title_no,
        ]);
        updated++;
      }
    }
    console.log(`\nApplied ${updated} poster links, created ${inserted} new metadata rows.`);
  } else if (!APPLY) {
    console.log(`\n(Dry run - ${updates.length} would be set. Re-run with --apply.)`);
  }

  await client.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
