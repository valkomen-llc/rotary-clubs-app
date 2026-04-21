import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL="postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('Adding seoImage column to Post table...');
        await pool.query('ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "seoImage" TEXT;');
        console.log('Success: Column seoImage added to Post.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
