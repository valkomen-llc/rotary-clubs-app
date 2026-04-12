import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" });

async function view() {
    await client.connect();
    
    const pastoUser = await client.query("SELECT id, email, role, \"clubId\" FROM \"User\" WHERE email='admin@rotarypasto.org'");
    if (pastoUser.rows[0]) {
        const pastoId = pastoUser.rows[0].clubId;
        const media = await client.query('SELECT id, filename FROM "Media" WHERE "clubId" = $1', [pastoId]);
        console.log(`Pasto now has ${media.rows.length} images.`);
        media.rows.forEach(m => console.log(m.id, m.filename));
    }
    await client.end();
}
view();
