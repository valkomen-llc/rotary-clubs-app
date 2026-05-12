import db from './server/lib/db.js';
async function test() {
    const r = await db.query('SELECT name, email FROM "User" WHERE email IS NOT NULL LIMIT 5');
    console.log('Users:', r.rows);
    const r2 = await db.query('SELECT name, image FROM "ClubMember" WHERE image IS NOT NULL LIMIT 5');
    console.log('Members with images:', r2.rows);
    process.exit(0);
}
test();
