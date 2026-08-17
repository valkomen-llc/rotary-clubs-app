// `db.js` en memoria para `test:platform-revenue`.
//
// El endpoint de estadísticas dispara trece consultas; acá sólo importan dos:
// la de la utilidad de la plataforma y que las demás no revienten. Por eso el
// valor por defecto es un `count` en cero y no una lista vacía — con `rows: []`
// el `rows[0].count` del endpoint lanzaría y la prueba culparía al cambio.

/** Lo que la consulta de utilidad va a devolver. La prueba lo pone. */
export const utilidad = [];
/** Las consultas que se ejecutaron, para poder afirmar que una NO ocurrió. */
export const consultas = [];

const db = {
    query: async (sql, args = []) => {
        consultas.push(sql.replace(/\s+/g, ' ').trim());
        if (/SUM\("applicationFee"\)/.test(sql)) return { rows: utilidad, rowCount: utilidad.length };
        if (/SUM\("netAmount"\)|SUM\(amount\)/.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT name, city/.test(sql)) return { rows: [], rowCount: 0 };
        return { rows: [{ count: '0' }], rowCount: 1 };
    },
    pool: { connect: async () => null },
};

export default db;
export const query = db.query;
export const pool = db.pool;
