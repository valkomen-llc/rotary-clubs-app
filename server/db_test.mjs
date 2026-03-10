import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const res0 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Club'");
        console.log("Columns:", res0.rows.map(r => r.column_name));
        const res = await pool.query('SELECT subdomain, logo, "footerLogo", "endPolioLogo", favicon FROM "Club" WHERE subdomain IN (\'origen\', \'rotaryarmeniainternational\')');
        console.log("Logos Data Result:", JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error("DB Error:", e.stack);
    } finally {
        await pool.end();
    }
}
run();
