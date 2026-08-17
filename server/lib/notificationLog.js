// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — el registro (la I/O)
// v4.855.0 (Fase 0)
//
// Habla con la base. El CRITERIO —qué evento existe, cómo se compone la
// llave, con qué estado se queda una entrega cuando llegan dos eventos
// desordenados— vive en `notificationSpec.js`, que es puro y tiene pruebas.
// Acá no hay decisiones: si aparece una, va allá.
//
// ── NADA DE ESTO PUEDE LANZAR ───────────────────────────────────────
//
// Todo este archivo corre DENTRO del webhook de Stripe, después de que el
// cobro está acreditado. Una excepción acá tumbaría el `200` que Stripe
// espera y provocaría un reintento de un evento ya procesado. Cada función
// devuelve `{ ok, ... }` con el motivo escrito y nunca lanza — mismo criterio
// que `postDonation` en el libro mayor y que `bumpMetric` en las campañas: un
// aporte que se perdiera porque falló su bitácora sería cambiar un problema
// de auditoría por uno de dinero.
//
// Por lo mismo, si la tabla todavía no existe se degrada en silencio: la
// notificación se manda igual y lo único que falta es su rastro.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import ensureNotificationSchema from './ensureNotificationSchema.js';
import {
    normalizeDelivery, mergeDeliveryState, isKnownDeliveryState,
    isFailureState, canRetry, nextRetryDelay, summarizeDeliveries, MAX_RETRIES,
} from './notificationSpec.js';

const fallo = (reason) => ({ ok: false, reason });

/* ─── RECLAMAR EL ENVÍO ──────────────────────────────────────────────
 *
 * Se llama ANTES de mandar el correo, no después, y esa es toda la gracia:
 * el `INSERT ... ON CONFLICT (key) DO NOTHING` es lo que decide quién manda.
 * Si devuelve fila, este camino es el dueño y puede enviar; si no devuelve
 * nada, alguien más ya reclamó ese mismo (contribución, evento, destinatario)
 * y hay que salir sin mandar.
 *
 * Comprobar antes con un SELECT no serviría: entre la lectura y la escritura
 * caben dos entregas concurrentes del mismo webhook —Stripe reintenta— y el
 * resultado serían dos correos diciéndole a la misma persona que recibimos su
 * aporte. Es el mismo razonamiento que sostiene `Payment_provider_providerRef_key`
 * unas líneas más arriba en el mismo webhook.
 *
 * ── EL REINTENTO ES LA EXCEPCIÓN DECLARADA ───────────────────────
 *
 * Una fila existente cuyo estado es un fallo REINTENTABLE se puede volver a
 * tomar: para eso está `allowRetry`. Sin esa puerta, un envío que falló por
 * un tiempo agotado quedaría bloqueado para siempre por su propia bitácora.
 */
export const claimDelivery = async (raw, { allowRetry = false } = {}) => {
    const d = normalizeDelivery(raw);
    if (!d) return fallo('faltan la contribución, el evento o el destinatario');

    try {
        await ensureNotificationSchema();
    } catch (e) {
        return fallo(`el registro de notificaciones no está disponible: ${e?.message || e}`);
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO "NotificationDelivery"
                (key, "contributionId", event, recipient, "recipientKind",
                 "clubId", "campaignId", "beneficiaryId", "profileId", "templateVersion",
                 provider, "fromAddress", subject, state)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
             ON CONFLICT (key) DO NOTHING
             RETURNING *`,
            [
                d.key, d.contributionId, d.event, d.recipient, d.recipientKind,
                d.clubId, d.campaignId, d.beneficiaryId, d.profileId, d.templateVersion,
                d.provider, d.fromAddress, d.subject,
            ]
        );

        if (rows[0]) return { ok: true, claimed: true, delivery: rows[0] };

        // Ya existía. Se mira si es un fallo del que se puede volver a
        // intentar; si no, se sale diciendo con qué estado quedó — «ya se
        // había enviado» es una respuesta, no un error.
        const previa = await db.query(
            `SELECT * FROM "NotificationDelivery" WHERE key = $1 LIMIT 1`, [d.key]
        );
        const fila = previa.rows[0] || null;
        if (!fila) return fallo('choque de llave sin fila: la base cambió a mitad');

        if (!allowRetry || !canRetry({ state: fila.state, retryCount: fila.retryCount, retryable: fila.retryable })) {
            return { ok: true, claimed: false, delivery: fila, reason: `ya registrada (${fila.state})` };
        }

        // El reintento también se RECLAMA, y sobre `retryCount`, que es un
        // entero exacto. No sobre `updatedAt`: el driver de pg trunca los
        // microsegundos del timestamp y la igualdad no casaría nunca — la
        // lección del despacho de escenas del Creador de Reels (v4.800).
        const tomada = await db.query(
            `UPDATE "NotificationDelivery"
                SET state = 'pending', "retryCount" = "retryCount" + 1,
                    "nextRetryAt" = NULL, "updatedAt" = NOW()
              WHERE key = $1 AND "retryCount" = $2
              RETURNING *`,
            [d.key, fila.retryCount]
        );
        if (!tomada.rows[0]) return { ok: true, claimed: false, delivery: fila, reason: 'otro intento la tomó primero' };
        return { ok: true, claimed: true, retry: true, delivery: tomada.rows[0] };
    } catch (e) {
        return fallo(e?.message || String(e));
    }
};

/* ─── EL DESENLACE ───────────────────────────────────────────────────
 *
 * `markSent` significa que el PROVEEDOR lo aceptó, no que llegó. Esa
 * distinción es exactamente lo que hace útil la bitácora cuando alguien dice
 * que no recibió nada: `sent` sin `delivered` es un problema del camino, no
 * de nuestro envío. La confirmación de entrega llega por webhook, en la fase
 * que la implemente.
 */
export const markSent = async (id, { providerMessageId = null, fromAddress = null, subject = null } = {}) => {
    if (!id) return fallo('falta el identificador de la entrega');
    try {
        const { rows } = await db.query(
            `UPDATE "NotificationDelivery"
                SET state = 'sent',
                    "providerMessageId" = COALESCE($2, "providerMessageId"),
                    "fromAddress" = COALESCE($3, "fromAddress"),
                    subject = COALESCE($4, subject),
                    "errorCode" = NULL, "errorMessage" = NULL,
                    "sentAt" = NOW(), "updatedAt" = NOW()
              WHERE id = $1
              RETURNING *`,
            [id, providerMessageId, fromAddress ? String(fromAddress).trim().toLowerCase() : null, subject]
        );
        return rows[0] ? { ok: true, delivery: rows[0] } : fallo('la entrega no existe');
    } catch (e) {
        return fallo(e?.message || String(e));
    }
};

/**
 * El fallo se guarda con su MOTIVO TEXTUAL. Convertirlo en «no se pudo
 * enviar» deja a quien corrige sin saber si el problema es el dominio, la
 * dirección o la credencial — es la regla que el CRM aprendió con
 * `metaCode`/`metaDetails`.
 *
 * `retryable` lo declara quien registra el fallo, no se deduce: ante la duda
 * NO se reintenta. Un aviso que no sale se ve en la ficha y se puede reenviar
 * a mano; uno que sale cinco veces ya salió.
 */
export const markFailed = async (id, { errorCode = null, errorMessage = null, retryable = false, state = 'failed' } = {}) => {
    if (!id) return fallo('falta el identificador de la entrega');
    const estado = isKnownDeliveryState(state) && isFailureState(state) ? state : 'failed';
    try {
        const actual = await db.query(`SELECT "retryCount" FROM "NotificationDelivery" WHERE id = $1 LIMIT 1`, [id]);
        const intentos = actual.rows[0]?.retryCount ?? 0;
        const proximo = retryable && canRetry({ state: estado, retryCount: intentos, retryable })
            ? `NOW() + INTERVAL '${nextRetryDelay(intentos)} minutes'`
            : 'NULL';

        const { rows } = await db.query(
            `UPDATE "NotificationDelivery"
                SET state = $2,
                    "errorCode" = $3,
                    "errorMessage" = $4,
                    retryable = $5,
                    "nextRetryAt" = ${proximo},
                    "failedAt" = NOW(), "updatedAt" = NOW()
              WHERE id = $1
              RETURNING *`,
            [id, estado, errorCode ? String(errorCode).slice(0, 80) : null,
                errorMessage ? String(errorMessage).slice(0, 500) : null, !!retryable]
        );
        return rows[0] ? { ok: true, delivery: rows[0] } : fallo('la entrega no existe');
    } catch (e) {
        return fallo(e?.message || String(e));
    }
};

/* ─── LO QUE DICE EL PROVEEDOR DESPUÉS ───────────────────────────────
 *
 * Lo consume el webhook de Resend. Se identifica por `providerMessageId`, que
 * es lo único que ese webhook trae de nuestro lado.
 *
 * El estado NUEVO no pisa al que hay: lo decide `mergeDeliveryState`, porque
 * los eventos del proveedor llegan desordenados y un `delivered` tardío no
 * puede deshacer un `opened` ya registrado.
 */
export const applyProviderEvent = async ({ providerMessageId, state, at = null }) => {
    const mid = String(providerMessageId ?? '').trim();
    if (!mid) return fallo('el evento no trae identificador de mensaje');
    if (!isKnownDeliveryState(state)) return fallo(`estado desconocido: ${state}`);

    try {
        await ensureNotificationSchema();
        const { rows } = await db.query(
            `SELECT id, state FROM "NotificationDelivery" WHERE "providerMessageId" = $1`, [mid]
        );
        if (!rows.length) return fallo('no hay ninguna entrega con ese identificador');

        const cuando = at ? new Date(at) : new Date();
        let tocadas = 0;
        for (const fila of rows) {
            const nuevo = mergeDeliveryState(fila.state, state);
            // La marca de tiempo se escribe aunque el estado no avance: saber
            // CUÁNDO se entregó sigue siendo cierto aunque ya estuviera
            // abierto. Lo que no retrocede es el estado.
            const col = state === 'delivered' ? '"deliveredAt"'
                : state === 'opened' ? '"openedAt"'
                    : isFailureState(state) ? '"failedAt"' : null;
            await db.query(
                `UPDATE "NotificationDelivery"
                    SET state = $2${col ? `, ${col} = COALESCE(${col}, $3)` : ''}, "updatedAt" = NOW()
                  WHERE id = $1`,
                col ? [fila.id, nuevo, cuando] : [fila.id, nuevo]
            );
            tocadas++;
        }
        return { ok: true, updated: tocadas };
    } catch (e) {
        return fallo(e?.message || String(e));
    }
};

/* ─── LEER ───────────────────────────────────────────────────────────
 *
 * Devuelve `[]` ante cualquier fallo, incluida una tabla que todavía no
 * exista. Esto lo consume la ficha de un aporte en la Bóveda: que la bitácora
 * no esté no puede impedir ver el aporte.
 */
export const listDeliveries = async (contributionId) => {
    const id = String(contributionId ?? '').trim();
    if (!id) return [];
    try {
        await ensureNotificationSchema();
        const { rows } = await db.query(
            `SELECT * FROM "NotificationDelivery"
              WHERE "contributionId" = $1
              ORDER BY "createdAt" DESC`,
            [id]
        );
        return rows;
    } catch {
        return [];
    }
};

/** Varias contribuciones de una vez, agrupadas por id. Es lo que necesita el
 *  listado de la Bóveda: con una consulta por aporte serían decenas por
 *  pantalla. */
export const listDeliveriesFor = async (contributionIds) => {
    const ids = (Array.isArray(contributionIds) ? contributionIds : [])
        .map(x => String(x ?? '').trim()).filter(Boolean);
    if (!ids.length) return {};
    try {
        await ensureNotificationSchema();
        const { rows } = await db.query(
            `SELECT * FROM "NotificationDelivery"
              WHERE "contributionId" = ANY($1::text[])
              ORDER BY "createdAt" DESC`,
            [ids]
        );
        const porAporte = {};
        for (const r of rows) (porAporte[r.contributionId] ||= []).push(r);
        return porAporte;
    } catch {
        return {};
    }
};

/** El resumen de una contribución, con el mismo criterio que usa la ficha.
 *  `sinRegistro` no es «no le llegó»: es que no se registró nada. */
export const deliverySummary = async (contributionId) =>
    summarizeDeliveries(await listDeliveries(contributionId));

/* ─── LOS REINTENTOS ─────────────────────────────────────────────────
 *
 * Un barrido, no un proceso: en Vercel la función se congela al cerrar la
 * respuesta, así que una cola con trabajador clásico exigiría infraestructura
 * aparte. Es el mismo criterio del Creador de Reels y del CRM.
 *
 * Sólo se toma lo que `canRetry` admite —y eso ya excluye un rebote duro y un
 * bloqueo—, y sólo cuando venció su espera. Reintentar lo definitivo es
 * escribirle otra vez a quien ya dijo que no.
 */
export const pendingRetries = async ({ limit = 20 } = {}) => {
    try {
        await ensureNotificationSchema();
        const { rows } = await db.query(
            `SELECT * FROM "NotificationDelivery"
              WHERE retryable
                AND state IN ('failed')
                AND "retryCount" < $1
                AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
              ORDER BY "nextRetryAt" ASC NULLS FIRST
              LIMIT $2`,
            [MAX_RETRIES, Math.max(1, Math.min(100, limit))]
        );
        return rows;
    } catch (e) {
        console.warn('[NOTIF-LOG] no se pudo leer la cola de reintentos:', e?.message);
        return [];
    }
};

export default {
    claimDelivery, markSent, markFailed, applyProviderEvent, pendingRetries,
    listDeliveries, listDeliveriesFor, deliverySummary,
};
