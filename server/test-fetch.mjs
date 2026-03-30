import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import pg from 'pg';
const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    try {
        const id = '2dcefad0-c2fa-4752-85d9-1ca90dc2ee4c';
        const club = await db.query('SELECT * FROM "Club" WHERE id = $1', [id]);
        console.log('Club:', club.rows[0]);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await db.end();
        await prisma.$disconnect();
    }
}
run();
