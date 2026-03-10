import postgres from 'postgres';

const sql = postgres("postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

async function run() {
    try {
        console.log("Adding favicon column to Club table using postgres module...");
        await sql`ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "favicon" TEXT;`;
        console.log("Column added successfully!");

        const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'Club' AND column_name = 'favicon'`;
        console.log("Verification:", columns);
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        await sql.end();
    }
}
run();
