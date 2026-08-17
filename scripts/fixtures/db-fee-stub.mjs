// `db.js` en memoria para `test:fee-rules:route`.
//
// La Bóveda Central consulta `Payment` y `PayoutRequest` agregados. Acá no se
// mide eso —lo hace `test:wallet:central`— así que basta con devolver vacío sin
// tocar ninguna red.

const vacio = { rows: [], rowCount: 0 };

const db = {
    query: async () => vacio,
    pool: { connect: async () => null },
};

export default db;
export const query = db.query;
export const pool = db.pool;
