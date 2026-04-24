import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function testQuery() {
  try {
    const { type } = {}; // Mock query
    const condition = type ? `WHERE c.type = $1` : '';
    const params = type ? [type] : [];
    
    console.log('Running query...');
    const result = await pool.query(`
        SELECT c.*, 
            (SELECT COUNT(*) FROM "User" u WHERE u."clubId" = c.id) as "userCount",
            (SELECT COUNT(*) FROM "Project" p WHERE p."clubId" = c.id) as "projectCount",
            (SELECT COUNT(*) FROM "Post" po WHERE po."clubId" = c.id) as "postCount"
        FROM "Club" c ${condition} ORDER BY c."createdAt" DESC
    `, params);
    
    console.log('Query successful, rows:', result.rows.length);
    if (result.rows.length > 0) {
        console.log('First row keys:', Object.keys(result.rows[0]));
    }
  } catch (err) {
    console.error('Query failed:', err);
  } finally {
    await pool.end();
  }
}

testQuery();
