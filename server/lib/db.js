// Lazy-loaded database module for Vercel serverless compatibility
// Uses dynamic import() to avoid top-level CJS/ESM conflict

let _pool = null;

const getPool = async () => {
    if (!_pool) {
        const pg = await import('pg');
        const { Pool } = pg.default;
        _pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
            max: 10, // Increased for dashboard concurrency
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000, // Fail fast to use defaults
        });
    }
    return _pool;
};

const query = async (text, params) => {
    const pool = await getPool();
    return pool.query(text, params);
};

export default { query, getPool };
