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
    select b.booking_id, b.status, b.requested_play_date, b.programming_weeks,
           b.imported_from, b.requested_by, b.confirmed_by, s.site_name,
           s.screen_format, f."Title"
    from bookings b
    join screen_db s on s.screen_unique = b.screen_unique
    join lineup l on l.lineup_id = b.lineup_id
    join film_imdb_db f on f.title_no = l.title_no
    where b.exhibitor_unique = 'EX10042'
    order by b.booking_id
  `);
  console.log(`All ${rows.length} booking row(s) on KNCC (EX10042):\n`);
  for (const r of rows) {
    console.log(
      `#${r.booking_id}  ${r.Title.padEnd(30)} ${r.screen_format.padEnd(12)} ${r.site_name.padEnd(15)} ` +
      `play=${String(r.requested_play_date).slice(0,10)} status=${r.status} ` +
      `imported_from=${r.imported_from ?? "null"} requested_by=${r.requested_by}`
    );
  }
  await client.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
