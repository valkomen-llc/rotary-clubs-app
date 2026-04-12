import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" });

async function fix() {
    await client.connect();
    
    // 1. Delete the global images from "ContentSection" where "clubId" IS NULL and section = 'images'
    console.log("Fixing Global site-images...");
    const delRes = await client.query(`DELETE FROM "ContentSection" WHERE "clubId" IS NULL AND section = 'images' RETURNING id`);
    console.log(`Deleted ${delRes.rowCount} corrupted global site-images configurations.`);

    const pastoUser = await client.query("SELECT id, email, role, \"clubId\" FROM \"User\" WHERE email='admin@rotarypasto.org'");
    if (pastoUser.rows[0]) {
        const pastoId = pastoUser.rows[0].clubId;
        console.log(`Pasto Club ID: ${pastoId}`);

        // 2. Delete Usauquén images from Pasto's Media
        const usaquenTerms = ['usaquen', 'bolso', 'luz', 'nino', 'niño', 'hilo', 'usaqu'];
        let deletedCount = 0;
        
        const media = await client.query('SELECT id, filename FROM "Media" WHERE "clubId" = $1', [pastoId]);
        for(let m of media.rows) {
            const lowName = m.filename.toLowerCase();
            const shouldDelete = usaquenTerms.some(term => lowName.includes(term));
            if(shouldDelete) {
                console.log(`Deleting ${m.filename} from Pasto media DB...`);
                await client.query('DELETE FROM "Media" WHERE id = $1', [m.id]);
                deletedCount++;
            }
        }
        console.log(`Cleaned ${deletedCount} misplaced Usaquén images from Pasto.`);
    }

    await client.end();
}
fix();
