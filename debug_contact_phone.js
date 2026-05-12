import db from './server/lib/db.js';
async function test() {
    const r = await db.query('SELECT name, phone FROM "WhatsAppContact" WHERE name LIKE \'%Daniel%\' LIMIT 1');
    console.log('Daniel Contact:', r.rows[0]);
    process.exit(0);
}
test();
