import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkData() {
  try {
    const clubs = await pool.query('SELECT COUNT(*) FROM "Club"');
    const users = await pool.query('SELECT COUNT(*) FROM "User"');
    const associations = await pool.query('SELECT COUNT(*) FROM "Club" WHERE type = \'association\'');
    
    console.log('Clubs count:', clubs.rows[0].count);
    console.log('Users count:', users.rows[0].count);
    console.log('Associations count:', associations.rows[0].count);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkData();
