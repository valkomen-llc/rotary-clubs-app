import db from './server/lib/db.js';
async function test() {
    const r = await db.query('SELECT "clubId", "phone", "bodyText" FROM "WhatsAppMessageLog" WHERE direction=\'incoming\' ORDER BY "createdAt" DESC LIMIT 1');
    console.log('Last incoming message clubId:', r.rows[0]);
    process.exit(0);
}
test();
