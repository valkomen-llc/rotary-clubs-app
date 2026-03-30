require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    try {
        const id = '2dcefad0-c2fa-4752-85d9-1ca90dc2ee4c';
        console.log('Fetching club...');
        const currentClub = await db.query('SELECT * FROM "Club" WHERE id = $1', [id]);
        console.log('Found:', !!currentClub.rows[0]);
        
        console.log('Updating club...');
        const result = await db.query(
                `UPDATE "Club" SET 
                 name=COALESCE($1, name), 
                 description=COALESCE($2, description), 
                 "updatedAt"=NOW()
                 WHERE id=$3 RETURNING *`,
                ['Distrito 4271', 'Test script update', id]
            );
        console.log('Result:', result.rows[0]);

        console.log('Updating settings...');
        const email = 'info@rotary4271.org';
        await db.query(`INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, NOW())
                     ON CONFLICT (key, "clubId") DO UPDATE SET value = $2, "updatedAt" = NOW()`,
                    ['contact_email', email, id]);
        console.log('Settings updated!');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await db.end();
        await prisma.$disconnect();
    }
}
run();
