import db from './server/lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function addSlugColumn() {
  try {
    console.log("Adding 'slug' column to 'Post' table...");
    await db.query('ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "slug" TEXT');
    console.log("Creating unique index on 'slug'...");
    // We use a unique index that ignores NULLs if possible, or just standard unique.
    // In Postgres, UNIQUE allows multiple NULLs.
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS "Post_slug_key" ON "Post"("slug")');
    console.log("Column 'slug' added successfully.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

addSlugColumn();
