import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import prisma from './prisma.js';

// Load environment variables with fallback
dotenv.config();
dotenv.config({ path: './server/.env' });

// Singleton pattern for PG Pool to prevent connection leaks in serverless
let pool;

if (!global.pgPool) {
  global.pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // Slightly longer timeout for cold starts
  });
}
pool = global.pgPool;

export default {
  query: (text, params) => pool.query(text, params),
  prisma,
  pool
};
