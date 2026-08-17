// v4.841 — Lo que la Bóveda necesita que exista en la base, creado en tiempo
// de ejecución. Hoy es una sola cosa: el índice único que hace REAL la
// idempotencia del webhook de donaciones.
//
// Hasta v4.840 la protección contra un aporte contado dos veces era una
// lectura previa —«¿ya existe un Payment con este providerRef?»— seguida de
// una inserción. Entre las dos caben dos entregas concurrentes del mismo
// evento, y Stripe reintenta. Sin una restricción en la base, la carrera se
// gana o se pierde según el momento.
//
// El índice se llama como lo llamaría Prisma para `@@unique([provider,
// providerRef])`, y esa declaración está TAMBIÉN en `schema.prisma`: el
// guardián de `db:push` compara TABLAS, no índices, así que uno que existiera
// sólo acá lo borraría la primera sincronización sin que nada avisara. Misma
// regla que `Media."folderId"` en v4.738.
//
// En Postgres los NULL son distintos entre sí dentro de un índice único, así
// que los pagos sin `providerRef` no chocan entre ellos. No hace falta que el
// índice sea parcial — y no debe serlo, o dejaría de coincidir con el que
// declara Prisma y `db:push` crearía un segundo.
import db from './db.js';

const INDEX_NAME = 'Payment_provider_providerRef_key';

let ensured = null;

/** Los `providerRef` repetidos que impedirían crear el índice. */
export const findDuplicatePayments = async () => {
    const { rows } = await db.query(
        `SELECT provider, "providerRef", COUNT(*)::int AS n
           FROM "Payment"
          WHERE "providerRef" IS NOT NULL
          GROUP BY provider, "providerRef"
         HAVING COUNT(*) > 1
          ORDER BY n DESC
          LIMIT 20`
    );
    return rows;
};

/**
 * Crea el índice si se puede.
 *
 * NUNCA lanza y nunca borra nada. Si ya hay duplicados en producción, el
 * índice no se puede crear: se REPORTAN y se sigue. Borrar el duplicado para
 * que el índice entre sería decidir por nuestra cuenta cuál de dos cobros
 * registrados es el bueno, y eso no se hace desde un arranque en frío.
 * Mientras el índice no exista, la lectura previa del webhook sigue siendo la
 * única protección — que es exactamente lo que había antes, así que degradar
 * no empeora nada.
 */
export const ensureWalletSchema = async () => {
    if (ensured) return ensured;
    ensured = (async () => {
        try {
            const exists = await db.query(
                `SELECT 1 FROM pg_class WHERE relname = $1 AND relkind = 'i' LIMIT 1`,
                [INDEX_NAME]
            );
            if (exists.rows.length) return { index: 'present', duplicates: [] };

            const duplicates = await findDuplicatePayments();
            if (duplicates.length) {
                console.error(
                    `[WALLET] El índice único ${INDEX_NAME} NO se pudo crear: hay ${duplicates.length} ` +
                    `providerRef repetidos en "Payment". Son aportes registrados dos veces y hay que ` +
                    `resolverlos a mano antes de que la idempotencia sea real. Muestra: ` +
                    duplicates.slice(0, 5).map(d => `${d.providerRef}×${d.n}`).join(', ')
                );
                return { index: 'blocked', duplicates };
            }

            await db.query(
                `CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX_NAME}" ON "Payment"("provider", "providerRef")`
            );
            console.log(`[WALLET] Índice único ${INDEX_NAME} creado — idempotencia del webhook garantizada por la base`);
            return { index: 'created', duplicates: [] };
        } catch (e) {
            // Un fallo acá no puede tumbar el webhook ni el panel: se avisa y
            // el módulo sigue con la protección que ya tenía.
            console.error('[WALLET] ensureWalletSchema falló (se sigue sin índice):', e?.message);
            ensured = null; // se reintenta en el próximo arranque en frío
            return { index: 'error', duplicates: [], error: e?.message };
        }
    })();
    return ensured;
};

export default ensureWalletSchema;
