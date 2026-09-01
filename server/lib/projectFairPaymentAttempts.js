// ════════════════════════════════════════════════════════════════════
// Historial de intentos de pago de una inscripción — la I/O
// v4.978.0
//
// Sólo habla con la base. El criterio —qué cuenta como pago confirmado, qué
// se le dice al usuario, qué sesión se puede reutilizar— vive en
// `projectFairPayment.js`, que es puro. Acá está lo que ese criterio no puede
// hacer: escribir.
//
// ⚠️ UN INTENTO NO ES UNA INSCRIPCIÓN, y de esa distinción cuelga el módulo.
// `ProjectFairSubmission.status` es el estado GLOBAL —«¿está pagada?»— y esta
// tabla es la lista de VECES que se intentó cobrar. Confundirlos es lo que
// hacía que un rechazo pareciera un desenlace final: tres intentos declinados
// y uno aprobado dan una inscripción PAGADA, y los tres primeros se conservan
// porque son lo único que contesta «¿por qué este club llamó a soporte?».
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

/**
 * Crea la tabla. Se llama desde el `ensureTables` del módulo, con el resto.
 *
 * ⚠️ EL ÍNDICE ÚNICO ES PARCIAL: sólo puede haber UN intento `open` por
 * inscripción, y eso es lo que hace imposible el cobro duplicado por doble
 * clic o por dos pestañas —la base decide quién gana, no una comprobación
 * previa: entre un SELECT y su INSERT caben dos peticiones—. Por ser parcial,
 * todo `ON CONFLICT` contra él tiene que REPETIR su predicado o la sentencia
 * falla entera; es el error real que costó una corrección en v4.648.
 */
export const ensurePaymentAttemptTable = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ProjectFairPaymentAttempt" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "submissionId" TEXT NOT NULL,
            "sessionId" TEXT,
            "paymentIntentId" TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            "amountCop" NUMERIC(14,2),
            "amountUsd" NUMERIC(14,2),
            currency VARCHAR(3),
            "failureCode" VARCHAR(80),
            "failureMessage" TEXT,
            "startedAt" TIMESTAMPTZ DEFAULT NOW(),
            "resolvedAt" TIMESTAMPTZ,
            metadata JSONB DEFAULT '{}'
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairPaymentAttempt_open_uidx" ON "ProjectFairPaymentAttempt" ("submissionId") WHERE status = 'open';`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairPaymentAttempt_submission_idx" ON "ProjectFairPaymentAttempt" ("submissionId", "startedAt");`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairPaymentAttempt_session_idx" ON "ProjectFairPaymentAttempt" ("sessionId");`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "ProjectFairPaymentAttempt_intent_idx" ON "ProjectFairPaymentAttempt" ("paymentIntentId");`).catch(() => {});
};

/** Los intentos de una inscripción, del más viejo al más nuevo. Nunca lanza. */
export const listAttempts = async (submissionId) => {
    try {
        const { rows } = await db.query(
            `SELECT * FROM "ProjectFairPaymentAttempt" WHERE "submissionId" = $1 ORDER BY "startedAt" ASC, id ASC`,
            [submissionId]
        );
        return rows;
    } catch {
        // Degrada: el panel se pinta igual sin historial. Un módulo de pagos
        // que se cae porque no puede leer su bitácora es peor que uno sin ella.
        return [];
    }
};

/** El intento abierto, si lo hay. Como mucho uno: lo garantiza el índice. */
export const openAttemptOf = async (submissionId) => {
    try {
        const { rows } = await db.query(
            `SELECT * FROM "ProjectFairPaymentAttempt" WHERE "submissionId" = $1 AND status = 'open' LIMIT 1`,
            [submissionId]
        );
        return rows[0] || null;
    } catch {
        return null;
    }
};

/**
 * RECLAMA el intento: abre uno nuevo y devuelve la fila sólo si ganó.
 *
 * ⚠️ Devuelve `null` cuando otro ya tenía el suyo abierto. Ese `null` NO es un
 * error: es la carrera resuelta, y quien lo recibe debe usar el intento del
 * ganador en vez de crear un segundo cobro. Es la mitad que impide el pago
 * duplicado; la otra es que el llamador expire la sesión que alcanzó a crear.
 */
export const claimAttempt = async (submissionId, { sessionId = null, paymentIntentId = null, amountCop = null, amountUsd = null, currency = null, metadata = {} } = {}) => {
    const { rows } = await db.query(`
        INSERT INTO "ProjectFairPaymentAttempt"
            ("submissionId", "sessionId", "paymentIntentId", status, "amountCop", "amountUsd", currency, metadata)
        VALUES ($1,$2,$3,'open',$4,$5,$6,$7::jsonb)
        ON CONFLICT ("submissionId") WHERE status = 'open' DO NOTHING
        RETURNING *
    `, [submissionId, sessionId, paymentIntentId, amountCop, amountUsd, currency, JSON.stringify(metadata || {})]);
    return rows[0] || null;
};

/**
 * Cierra un intento con su desenlace. El UPDATE es CONDICIONAL sobre
 * `status = 'open'`: dos webhooks del mismo pago —Stripe reintenta— no
 * reescriben un desenlace ya asentado, y un evento que llega fuera de orden no
 * degrada un intento aprobado. Es el mismo criterio que `mergeDeliveryState`.
 */
export const resolveAttempt = async (attemptId, status, { failureCode = null, failureMessage = null, paymentIntentId = null } = {}) => {
    if (!attemptId) return null;
    try {
        const { rows } = await db.query(`
            UPDATE "ProjectFairPaymentAttempt"
            SET status = $1,
                "failureCode" = COALESCE($2, "failureCode"),
                "failureMessage" = COALESCE($3, "failureMessage"),
                "paymentIntentId" = COALESCE($4, "paymentIntentId"),
                "resolvedAt" = NOW()
            WHERE id = $5 AND status = 'open'
            RETURNING *
        `, [status, failureCode, failureMessage ? String(failureMessage).slice(0, 900) : null, paymentIntentId, attemptId]);
        return rows[0] || null;
    } catch {
        return null;
    }
};

/**
 * Cierra el intento abierto de una inscripción, se conozca o no su id. Es lo
 * que usan los webhooks: llegan con la sesión o con el PaymentIntent, no con
 * nuestro identificador.
 */
export const resolveOpenAttemptFor = async (submissionId, status, opts = {}) => {
    const open = await openAttemptOf(submissionId);
    if (!open) return null;
    return resolveAttempt(open.id, status, opts);
};

/**
 * Cierra el intento que corresponde a un desenlace del proveedor.
 *
 * Busca primero por la sesión y por el PaymentIntent —que es lo que traen los
 * webhooks— y sólo entonces cae al intento abierto. El orden importa: cerrar
 * «el abierto» sin mirar identificadores marcaría el intento equivocado si el
 * evento llega tarde, cuando el club ya empezó otro.
 */
export const resolveAttemptFor = async (submissionId, status, { sessionId = null, paymentIntentId = null, failureCode = null, failureMessage = null } = {}) => {
    try {
        for (const [column, value] of [['sessionId', sessionId], ['paymentIntentId', paymentIntentId]]) {
            if (!value) continue;
            const { rows } = await db.query(
                `SELECT * FROM "ProjectFairPaymentAttempt" WHERE "${column}" = $1 AND status = 'open' LIMIT 1`,
                [value]
            );
            if (rows[0]) return resolveAttempt(rows[0].id, status, { failureCode, failureMessage, paymentIntentId });
        }
    } catch { /* se intenta con el abierto */ }
    return resolveOpenAttemptFor(submissionId, status, { failureCode, failureMessage, paymentIntentId });
};
