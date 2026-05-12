import db from './server/lib/db.js';
async function test() {
    const r = await db.query('SELECT "clubId", COUNT(*) FROM "ClubMember" WHERE image IS NOT NULL GROUP BY "clubId"');
    console.log('ClubMember images by club:', r.rows);
    process.exit(0);
}
test();
