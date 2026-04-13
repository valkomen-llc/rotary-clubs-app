import db from '../server/lib/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        const result = await db.query('SELECT content FROM "ContentSection" WHERE page = $1 AND section = $2 AND "clubId" IS NULL', ['home', 'images']);
        console.log(JSON.stringify(result.rows, null, 2));
    } catch (e) {
        console.error(e);
    }
}
check();
