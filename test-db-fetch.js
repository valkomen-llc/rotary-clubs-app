import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL || "postgres://rotary_owner:zY8Hk0lXpQjx@ep-weathered-haze-a5p1n3e7.us-east-2.aws.neon.tech/rotary?sslmode=require" });
async function run() {
  await client.connect();
  const pastoUser = await client.query("SELECT id, email, role, \"clubId\" FROM \"User\" WHERE email='admin@rotarypasto.org'");
  console.log("Pasto User:", pastoUser.rows[0]);
  
  if (pastoUser.rows[0]) {
      const pastoImages = await client.query("SELECT id, filename, \"clubId\" FROM \"Media\" WHERE \"clubId\" = $1", [pastoUser.rows[0].clubId]);
      console.log("Images with Pasto clubId:", pastoImages.rows.map(r => r.filename));
  }
  
  const nullImages = await client.query("SELECT id, filename, \"clubId\" FROM \"Media\" WHERE \"clubId\" IS NULL");
  console.log("Global null clubId images:", nullImages.rows.map(r => r.filename));
  
  await client.end();
}
run();
