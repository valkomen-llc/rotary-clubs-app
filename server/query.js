import db from './lib/db.js';
async function run() {
  const res = await db.query("SELECT id, name, domain, settings FROM \"Club\" WHERE domain LIKE '%pasto%';");
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
run();
