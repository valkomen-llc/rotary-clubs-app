import db from './server/lib/db.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

async function check() {
    try {
        const r = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Club'");
        console.log(r.rows.map(x => x.column_name));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
