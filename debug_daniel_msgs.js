import db from './server/lib/db.js';
async function test() {
    const phone = '+573158372895';
    const r = await db.query('SELECT * FROM "WhatsAppMessageLog" WHERE phone=$1 ORDER BY "createdAt" ASC', [phone]);
    console.log('Messages for Daniel Yazo:', JSON.stringify(r.rows, null, 2));
    process.exit(0);
}
test();
