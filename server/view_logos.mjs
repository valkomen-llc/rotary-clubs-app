import postgres from 'postgres';

const sql = postgres("postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

async function run() {
    try {
        const clubs = await sql`SELECT subdomain, name, logo, "footerLogo", "endPolioLogo", favicon FROM "Club"`;
        console.log("All Clubs Logos:");
        console.log(JSON.stringify(clubs, null, 2));
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        await sql.end();
    }
}
run();
