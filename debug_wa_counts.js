import db from './server/lib/db.js';
async function test() {
    const platformClubId = '3c648ce7-3c47-41e2-9461-6e40a8615ae6';
    const otherClubId = 'f11cf249-af7d-4e6b-8d8c-d12688160f0d';
    
    const r1 = await db.query('SELECT COUNT(*) FROM "WhatsAppContact" WHERE "clubId"=$1', [platformClubId]);
    console.log(`Platform Club Contacts: ${r1.rows[0].count}`);
    
    const r2 = await db.query('SELECT COUNT(*) FROM "WhatsAppContact" WHERE "clubId"=$1', [otherClubId]);
    console.log(`Other Club Contacts: ${r2.rows[0].count}`);
    
    const r3 = await db.query('SELECT COUNT(*) FROM "WhatsAppMessageLog" WHERE "clubId"=$1', [platformClubId]);
    console.log(`Platform Club Messages: ${r3.rows[0].count}`);
    
    const r4 = await db.query('SELECT COUNT(*) FROM "WhatsAppMessageLog" WHERE "clubId"=$1', [otherClubId]);
    console.log(`Other Club Messages: ${r4.rows[0].count}`);
    
    process.exit(0);
}
test();
