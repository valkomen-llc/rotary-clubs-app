import db from './server/lib/db.js';
import dotenv from 'dotenv';
dotenv.config({ path: './server/.env' });

async function check() {
    try {
        const r = await db.query('SELECT name, logo, "footerLogo", "endPolioLogo", status FROM "Club"');
        console.log(JSON.stringify(r.rows, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
