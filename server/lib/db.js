import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import prisma from './prisma.js';

dotenv.config(); // Use native environment variables in production

// Singleton pattern for PG Pool to prevent connection leaks in serverless
let pool;

if (!global.pgPool) {
  global.pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10, // Limit connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}
pool = global.pgPool;

export default {
  query: (text, params) => pool.query(text, params),
  prisma,
  pool
};
