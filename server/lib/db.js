import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
dotenv.config({ path: './server/.env' });

// Singleton pattern for PG Pool
let pool;

if (!global.pgPool) {
  global.pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Hard limit for Neon wake up
  });
}
pool = global.pgPool;

export default {
  query: (text, params) => pool.query(text, params),
  pool
};
