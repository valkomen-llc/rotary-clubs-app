import db from './server/lib/db.js';
async function test() {
    const r = await db.query('SELECT name FROM "WhatsAppContact" WHERE phone = \'+573158372895\'');
    console.log('Contact with +573158372895:', r.rows[0]);
    process.exit(0);
}
test();
