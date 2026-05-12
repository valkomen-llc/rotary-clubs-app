import db from './server/lib/db.js';

async function migrate() {
    console.log('Running migration...');
    try {
        await db.query(`ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "profilePictureUrl" TEXT`);
        console.log('Migration successful');
    } catch (e) {
        console.error('Migration failed:', e);
    }
    process.exit(0);
}

migrate();
