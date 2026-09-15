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

  const { rows: screens } = await client.query(`
    select screen_unique, site_name, screen_format, screen_name
    from screen_db
    where exhibitor_id = 'EX10042' or exhibitor_id = (select exhibitor_unique from exhibitor_db where exhibitor_unique='EX10042')
    order by site_name, screen_format
  `);
  console.log(`=== KNCC screens (${screens.length}) ===`);
  for (const s of screens) console.log(JSON.stringify(s));

  const titles = ["Coyote vs. Acme", "Moana", "ENHYPEN", "Top Gun"];
  console.log(`\n=== lineup matches for candidate new titles ===`);
  for (const t of titles) {
    const { rows } = await client.query(
      `select l.lineup_id, l.title_no, f."Title", l.format, l.confirmed, l.first_available_release_date
       from lineup l join film_imdb_db f on f.title_no = l.title_no
       where f."Title" ilike $1
       order by f."Title", l.format`,
      [`%${t}%`]
    );
    console.log(`-- "${t}" --`);
    for (const r of rows) console.log(JSON.stringify(r));
  }
  await client.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
