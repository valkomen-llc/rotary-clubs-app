import db from './server/lib/db.js';

async function check() {
    try {
        console.log('--- USER COLUMNS ---');
        const userCols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'User'");
        console.log(userCols.rows.map(r => r.column_name).join(', '));
        
        console.log('\n--- CLUB COLUMNS ---');
        const clubCols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Club'");
        console.log(clubCols.rows.map(r => r.column_name).join(', '));
        
        process.exit(0);
    } catch (err) {
        console.error('Check failed:', err.message);
        process.exit(1);
    }
}

check();
