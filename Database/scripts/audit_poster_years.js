/**
 * Flags posters whose TMDB source film was released years apart from the
 * lineup's release date - the signature of matching a remake to the wrong
 * generation (e.g. the 1994 Street Fighter instead of the 2026 one).
 *
 * !! READ BEFORE USING --apply !!
 * This catalogue is full of 4DX/ScreenX RE-RELEASES of classics, and for
 * those a decades-old poster is the CORRECT one. The year gap looks
 * identical whether the title is a re-release (old poster right) or a
 * remake (old poster wrong), and this script cannot tell them apart.
 * A 2026-08 run flagged 15 titles of which nearly all were re-releases -
 * Titanic (25th Anniversary), Aliens (1986), The Terminator - and its
 * "better match" suggestions were worse (it offered "The Real! ChatGPT:
 * Creator or Terminator?" for The Terminator).
 *
 * Treat the output as a review list only. Fix confirmed mistakes one at a
 * time with fix_one_poster.js, which takes an explicit TMDB id.
 *
 * Usage: TMDB_API_KEY=... DB_PASSWORD=... node audit_poster_years.js [--gap=N]
 */
const { Client } = require("pg");
const API_KEY = process.env.TMDB_API_KEY;
// Not `|| 3` - that turns a deliberate --gap=0 back into 3.
const gapArg = (process.argv.find((a) => a.startsWith("--gap=")) || "").split("=")[1];
const GAP = gapArg !== undefined && gapArg !== "" && !isNaN(Number(gapArg)) ? Number(gapArg) : 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const client = new Client({
    host: "aws-1-eu-central-1.pooler.supabase.com", port: 5432, database: "postgres",
    user: "postgres.cvershkiffvpbnuxfaxk", password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Only titles that are actually programmed - those are the ones anyone
  // will see - and only TMDB-sourced posters.
  const { rows } = await client.query(`
    select distinct f.title_no, f."Title", f.poster_path, f.imdb_link,
           -- ::text matters: the pg driver hands back a JS Date otherwise,
           -- and String(date).slice(0,4) yields "Mon " rather than a year.
           min(l.first_available_release_date)::text as lineup_date
    from film_imdb_db f
    join lineup l on l.title_no = f.title_no
    where f.poster_path like 'https://image.tmdb.org%'
      and l.first_available_release_date is not null
    group by f.title_no, f."Title", f.poster_path, f.imdb_link
  `);
  console.log(`checking ${rows.length} programmed titles with a TMDB poster (flagging gaps > ${GAP}y)\n`);

  // poster file -> TMDB movie, resolved by searching the poster path.
  const suspects = [];
  // Track how many rows we could actually verify - a run that matched
  // nothing would otherwise report "0 problems" and look like a clean bill
  // of health when it had simply checked nothing.
  const stats = { searched: 0, posterFound: 0, comparable: 0, apiErrors: 0 };
  for (const [i, r] of rows.entries()) {
    if (i && i % 150 === 0) console.log(`  …${i}/${rows.length}`);
    const file = r.poster_path.split("/").pop();
    try {
      // Cheapest reliable way back from a poster file to its movie is the
      // title search again; compare the top result's year.
      const q = encodeURIComponent(String(r.Title).replace(/\([^)]*\)|\[[^\]]*\]/g, " ").trim());
      const res = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&query=${q}`
      );
      stats.searched++;
      if (!res.ok) { stats.apiErrors++; continue; }
      const js = await res.json();
      const hit = (js.results ?? []).find((m) => m.poster_path && r.poster_path.endsWith(m.poster_path));
      if (!hit) continue; // poster came from an id-match; leave it be
      stats.posterFound++;
      const tmdbYear = Number((hit.release_date ?? "").slice(0, 4));
      const lineupYear = Number(String(r.lineup_date).slice(0, 4));
      if (!tmdbYear || !lineupYear) continue;
      stats.comparable++;
      const gap = lineupYear - tmdbYear;
      if (gap > GAP) {
        // Is there a better-matching same-titled film nearer the lineup year?
        const better = (js.results ?? [])
          .filter((m) => m.poster_path)
          .map((m) => ({ m, y: Number((m.release_date ?? "").slice(0, 4)) }))
          .filter((x) => x.y && Math.abs(lineupYear - x.y) <= 2)
          .sort((a, b) => Math.abs(lineupYear - a.y) - Math.abs(lineupYear - b.y))[0];
        suspects.push({
          title: r.Title, title_no: r.title_no, lineupYear, tmdbYear, file,
          better: better ? `${better.m.title} (${better.y}) id=${better.m.id}` : null,
          betterId: better?.m.id ?? null,
          betterPoster: better ? `https://image.tmdb.org/t/p/w500${better.m.poster_path}` : null,
        });
      }
    } catch {}
    await sleep(25);
  }

  console.log(
    `\ncoverage: searched ${stats.searched}, poster traced back to a search hit ${stats.posterFound}, ` +
      `year-comparable ${stats.comparable}, api errors ${stats.apiErrors}`
  );
  console.log(`=== ${suspects.length} likely-wrong posters (gap > ${GAP}y) ===`);
  for (const s of suspects) {
    console.log(`\n  ${s.title}`);
    console.log(`     lineup releases ${s.lineupYear}, poster is from the ${s.tmdbYear} film`);
    console.log(`     ${s.better ? `better match: ${s.better}` : "no closer same-title match found"}`);
  }

  if (process.argv.includes("--apply")) {
    let fixed = 0;
    for (const s of suspects) {
      if (!s.betterPoster) continue;
      await client.query(`update film_imdb_db set poster_path = $1 where title_no = $2`, [
        s.betterPoster, s.title_no,
      ]);
      fixed++;
    }
    console.log(`\nrepointed ${fixed} posters to the year-appropriate film.`);
  } else {
    console.log(`\n(dry run - re-run with --apply to repoint the ones with a better match)`);
  }
  await client.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
