const { Client } = require("pg");

const IDS = [27, 28, 29, 30, 28104, 28105, 28106, 28107];

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

  const { rows } = await client.query(
    `delete from bookings where booking_id = any($1::int[]) returning booking_id`,
    [IDS]
  );
  console.log(`Deleted ${rows.length} rows: ${rows.map((r) => r.booking_id).join(", ")}`);
  await client.end();
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
