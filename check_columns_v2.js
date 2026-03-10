import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

async function check() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Club'");
        console.log(r.rows.map(x => x.column_name));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
