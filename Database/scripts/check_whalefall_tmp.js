const { Client } = require("pg");

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

  const { rows } = await client.query(`
    select b.booking_id, b.status, b.requested_play_date, b.official_release_date,
           b.programming_weeks, b.imported_from, b.requested_by, b.confirmed_by,
           b.decision_note, b.screen_unique, s.screen_format, s.site_name,
           l.format as lineup_format, f."Title"
    from bookings b
    join screen_db s on s.screen_unique = b.screen_unique
    join lineup l on l.lineup_id = b.lineup_id
    join film_imdb_db f on f.title_no = l.title_no
    join exhibitor_db e on e.exhibitor_unique = b.exhibitor_unique
    where e.exhibitor_unique = 'EX10042'
      and f."Title" ilike '%whale%fall%'
    order by b.booking_id
  `);
  console.log(`Found ${rows.length} KNCC booking row(s) matching "Whale Fall":\n`);
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
  }
  await client.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
