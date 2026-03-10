import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
    connectionString: "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Adding favicon column to Club table...");
        await pool.query('ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "favicon" TEXT;');
        console.log("Column added successfully!");

        const res0 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Club' AND column_name = 'favicon'");
        console.log("Verification:", res0.rows);
    } catch (e) {
        console.error("DB Error:", e.stack);
    } finally {
        await pool.end();
    }
}
run();
