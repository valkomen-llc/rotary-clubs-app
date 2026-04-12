import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" });

async function fix() {
    await client.connect();
    
    const pastoUser = await client.query("SELECT id, email, role, \"clubId\" FROM \"User\" WHERE email='admin@rotarypasto.org'");
    if (pastoUser.rows[0]) {
        const pastoId = pastoUser.rows[0].clubId;
        const media = await client.query('SELECT id, filename FROM "Media" WHERE "clubId" = $1', [pastoId]);
        
        let deleted = 0;
        for(let m of media.rows) {
            const lowName = m.filename.toLowerCase();
            // If it's pure "Rotary Pasto", it typically contains "Pasto" in the name or we can just leave it if it contains "12".
            // Let's delete the Origen and (4) and (6) logos.
            if(lowName.includes('origen') || lowName.includes('(4)') || lowName.includes('(6)')) {
                await client.query('DELETE FROM "Media" WHERE id = $1', [m.id]);
                deleted++;
            }
        }
        console.log(`Deleted ${deleted} Origen/International logos`);
    }
    await client.end();
}
fix();
