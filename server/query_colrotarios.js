import db from './lib/db.js';

async function run() {
  try {
    const club = await db.query("SELECT * FROM \"Club\" WHERE domain LIKE '%colrotario%';");
    console.log("Club:");
    console.log(JSON.stringify(club.rows[0], null, 2));

    const media = await db.query("SELECT * FROM \"Media\" WHERE \"clubId\" = $1 LIMIT 5;", [club.rows[0].id]);
    console.log("\nMedia:");
    console.log(JSON.stringify(media.rows, null, 2));
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
