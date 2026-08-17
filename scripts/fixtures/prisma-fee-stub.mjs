// Prisma en memoria para `test:fee-rules:route`.
//
// Sólo lo que la ruta de reglas de comisión toca: `platformConfig` y
// `payoutRequest`. NO demuestra que el SQL sea válido para Postgres —eso se
// comprueba al desplegar— pero sí a qué manejador llega cada petición, que es
// lo que este defecto necesitaba.

/** Lo que se escribió, en orden. La prueba lo lee para saber si guardar guardó. */
export const guardado = [];

const prisma = {
    platformConfig: {
        findUnique: async ({ where }) => {
            const fila = [...guardado].reverse().find(f => f.key === where.key);
            return fila || null;
        },
        upsert: async ({ where, update, create }) => {
            const fila = { key: where.key, value: update?.value ?? create?.value };
            guardado.push(fila);
            return fila;
        },
    },
    payoutRequest: {
        // El manejador de retiros tiene que seguir alcanzable. Devuelve una fila
        // plausible para que la prueba distinga «llegó acá» de «no llegó».
        update: async ({ where, data }) => ({
            id: where.id, clubId: 'c1', currency: 'COP', amount: 1000, ...data,
        }),
    },
};

export default prisma;
