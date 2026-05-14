import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import prisma from './prisma.js';

dotenv.config();

let pool;

if (!global.pgPool) {
  global.pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}
pool = global.pgPool;

export default {
  query: (text, params) => pool.query(text, params),
  prisma,
  pool
};
