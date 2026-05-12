import db from './server/lib/db.js';
async function test() {
    console.log('--- Checking Recent Incoming Messages ---');
    const r = await db.query('SELECT "createdAt", "phone", "bodyText", "status" FROM "WhatsAppMessageLog" WHERE direction=\'incoming\' ORDER BY "createdAt" DESC LIMIT 10');
    console.log(JSON.stringify(r.rows, null, 2));
    
    console.log('--- Checking WhatsAppConfig ---');
    const r2 = await db.query('SELECT "clubId", "phoneNumberId", "enabled", "lastVerifiedAt" FROM "WhatsAppConfig"');
    console.log(JSON.stringify(r2.rows, null, 2));
    
    process.exit(0);
}
test();
