import db from './lib/db.js';
import fs from 'fs';

async function run() {
  try {
    const club = await db.query("SELECT * FROM \"Club\" WHERE domain LIKE '%colrotario%';");
    const media = await db.query("SELECT * FROM \"Media\" WHERE \"clubId\" = $1 LIMIT 5;", [club.rows[0].id]);
    
    // Check site images
    const siteImages = await db.query("SELECT content FROM \"ContentSection\" WHERE \"clubId\" = $1 AND page = 'home' AND section = 'images';", [club.rows[0].id]);
    
    console.log("Club ID:", club.rows[0].id);
    console.log("Logo URL:", club.rows[0].logo);
    console.log("Site Images:", siteImages.rows[0]?.content);
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
