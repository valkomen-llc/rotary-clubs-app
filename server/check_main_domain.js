import db from './lib/db.js';
async function run() {
  const result = await db.query('SELECT domain, subdomain, name FROM "Club" ORDER BY "createdAt" ASC LIMIT 5');
  console.log(result.rows);
  process.exit(0);
}
run();
