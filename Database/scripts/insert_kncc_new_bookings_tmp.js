const { Client } = require("pg");

const SCREENS = {
  "360": "360 Mall-15-13J",
  "alkout": "Al Kout-7-23Q",
  "avenue4dx": "Avenue Mall-2-13K",
  "avenuesx": "Avenue Mall-3-37X",
  "assima4dx": "Assima Mall-1-3CD",
  "assimasx": "Assima Mall-통합관-5ZM",
};

const IMPORTED_FROM = "kncc_manual_2026-09-02";

const ROWS = [
  // Coyote vs. Acme (4DX), lineup_id 72
  { screen: SCREENS["360"], lineup_id: 72, date: "2026-08-27", by: "스몰케이트" },
  { screen: SCREENS["alkout"], lineup_id: 72, date: "2026-08-27", by: "스몰케이트" },
  { screen: SCREENS["avenue4dx"], lineup_id: 72, date: "2026-08-27", by: "스몰케이트" },

  // Moana (2026)
  { screen: SCREENS["assima4dx"], lineup_id: 4, date: "2026-07-09", by: "스몰케이트" },
  { screen: SCREENS["assimasx"], lineup_id: 150, date: "2026-07-09", by: "스몰케이트" },
  { screen: SCREENS["360"], lineup_id: 4, date: "2026-07-09", by: "스몰케이트" },
  { screen: SCREENS["alkout"], lineup_id: 4, date: "2026-07-09", by: "스몰케이트" },
  { screen: SCREENS["avenue4dx"], lineup_id: 4, date: "2026-07-09", by: "스몰케이트" },
  { screen: SCREENS["avenuesx"], lineup_id: 150, date: "2026-07-09", by: "스몰케이트" },

  // ENHYPEN: IMMERSION IN CINEMAS
  { screen: SCREENS["assima4dx"], lineup_id: 40, date: "2026-05-14", by: "스몰케이트" },
  { screen: SCREENS["assimasx"], lineup_id: 168, date: "2026-05-14", by: "스몰케이트" },
  { screen: SCREENS["360"], lineup_id: 40, date: "2026-05-14", by: "스몰케이트" },
  { screen: SCREENS["alkout"], lineup_id: 40, date: "2026-05-14", by: "스몰케이트" },
  { screen: SCREENS["avenue4dx"], lineup_id: 40, date: "2026-05-14", by: "스몰케이트" },
  { screen: SCREENS["avenuesx"], lineup_id: 168, date: "2026-05-14", by: "스몰케이트" },

  // Top Gun (40th anniversary) -- confirmed by user to be the "(1986)" sheet entries
  { screen: SCREENS["360"], lineup_id: 141, date: "2026-05-14", by: "서정범" },
  { screen: SCREENS["alkout"], lineup_id: 141, date: "2026-05-14", by: "서정범" },
  { screen: SCREENS["avenue4dx"], lineup_id: 141, date: "2026-05-14", by: "서정범" },
  { screen: SCREENS["assima4dx"], lineup_id: 141, date: "2026-05-13", by: "스몰케이트" },
  { screen: SCREENS["assimasx"], lineup_id: 201, date: "2026-05-13", by: "스몰케이트" },
  { screen: SCREENS["avenuesx"], lineup_id: 201, date: "2026-05-13", by: "스몰케이트" },
];

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

  let inserted = 0, skipped = 0;
  for (const r of ROWS) {
    const { rows: dupe } = await client.query(
      `select booking_id from bookings
       where screen_unique = $1 and lineup_id = $2 and requested_play_date = $3
         and status in ('requested','confirmed')`,
      [r.screen, r.lineup_id, r.date]
    );
    if (dupe.length) { skipped++; console.log(`skip (already exists #${dupe[0].booking_id}): ${r.screen} lineup=${r.lineup_id} ${r.date}`); continue; }

    const { rows: ins } = await client.query(
      `insert into bookings
         (screen_unique, lineup_id, exhibitor_unique, requested_play_date, programming_weeks,
          status, requested_by, imported_from)
       values ($1, $2, 'EX10042', $3, 2, 'confirmed', $4, $5)
       returning booking_id`,
      [r.screen, r.lineup_id, r.date, r.by, IMPORTED_FROM]
    );
    inserted++;
    console.log(`inserted #${ins[0].booking_id}: ${r.screen} lineup=${r.lineup_id} ${r.date} by=${r.by}`);
  }
  console.log(`\nDone. inserted=${inserted} skipped=${skipped}`);
  await client.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
