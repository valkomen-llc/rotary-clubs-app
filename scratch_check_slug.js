import db from './server/lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkSlug() {
  try {
    const result = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Post' AND column_name = 'slug'");
    if (result.rows.length > 0) {
      console.log("Column 'slug' already exists.");
    } else {
      console.log("Column 'slug' does NOT exist.");
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSlug();
