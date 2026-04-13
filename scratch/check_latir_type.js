import db from '../server/lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        const result = await db.query('SELECT id, name, type FROM "Club" WHERE subdomain = $1', ['latir']);
        console.log(JSON.stringify(result.rows, null, 2));
    } catch (e) {
        console.error(e);
    }
}
check();
