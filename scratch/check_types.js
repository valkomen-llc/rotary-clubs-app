import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkTypes() {
  try {
    const res = await pool.query('SELECT DISTINCT type FROM "Club"');
    console.log('Distinct types:', res.rows.map(r => r.type));
    
    const res2 = await pool.query('SELECT name, type FROM "Club" LIMIT 20');
    console.table(res2.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkTypes();
