// `db.js` en memoria para las pruebas de ruta de comisiones.
//
// La Bóveda Central consulta agregados que acá no se miden —eso lo hace
// `test:wallet:central`—; lo que SÍ se modela es el recálculo de la retención,
// porque su prueba necesita ver qué se escribió.

/** Los aportes que el SELECT del recálculo va a devolver. La prueba los pone. */
export const aportes = [];
/** Los UPDATE que se ejecutaron, en orden. */
export const escrituras = [];

const vacio = { rows: [], rowCount: 0 };

const db = {
    query: async (sql, args = []) => {
        if (/FROM "Payment" p/.test(sql)) {
            // Se respeta el límite del WHERE: sólo lo que todavía no es
            // retirable. Es la condición que la prueba tiene que ver actuar.
            const ahora = new Date(args[0]);
            return { rows: aportes.filter(a =>
                a.status === 'succeeded' && a.isPlatformCollection !== false
                && a.clubAvailableOn && new Date(a.clubAvailableOn) > ahora
            ), rowCount: 0 };
        }
        if (/^\s*UPDATE "Payment"/.test(sql)) {
            const [id, fee, neto, payload, feeAntes] = args;
            const fila = aportes.find(a => a.id === id);
            // El candado optimista: si la retención ya no es la que se leyó,
            // otra vuelta llegó primero y ésta no escribe.
            if (!fila || Number(fila.applicationFee) !== Number(feeAntes)) return { rows: [], rowCount: 0 };
            fila.applicationFee = fee;
            fila.netAmount = neto;
            fila.rawPayload = payload;
            escrituras.push({ id, fee, neto, payload });
            return { rows: [{ id }], rowCount: 1 };
        }
        return vacio;
    },
    pool: { connect: async () => null },
};

export default db;
export const query = db.query;
export const pool = db.pool;
