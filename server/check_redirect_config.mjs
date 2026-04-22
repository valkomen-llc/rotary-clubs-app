import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const res = await pool.query("SELECT * FROM \"PlatformConfig\" WHERE key = 'saas_redirect'");
        console.log("SaaS Redirect Config:", res.rows[0]);
    } catch (e) {
        console.error("DB Error:", e.stack);
    } finally {
        await pool.end();
    }
}
run();
