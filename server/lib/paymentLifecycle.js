// La I/O del ciclo de vida de un aporte: escribir la traza y leerla.
//
// v4.885 — El CRITERIO vive en `walletLifecycle.js` y es puro; acá está lo que
// toca la base. La separación es la misma de `seoRules` / `seoAudit` y
// `ledgerSpec` / `ledger`, y acá tiene un motivo extra: este módulo corre
// DENTRO del webhook de Stripe y dentro de un cron, así que su propiedad más
// importante no es lo que hace bien sino lo que NO puede hacer mal.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ NADIE PAGA POR LA TRAZA. NINGUNA FUNCIÓN DE ACÁ LANZA.
// ═════════════════════════════════════════════════════════════════════
//
// Toda escritura devuelve `{ ok, reason }` y toda lectura degrada a vacío.
// Un aporte que se perdiera porque no se pudo anotar su historial sería
// cambiar un problema de auditoría por uno de dinero. Es la misma regla que
// `notificationLog.js` (v4.855) y que `bumpMetric` en las campañas — y acá,
// además, la tabla puede sencillamente no existir todavía.

import crypto from 'crypto';
import db from './db.js';
import { ensureDisbursementSchema } from './ensureDisbursementSchema.js';
import { buildTimeline, isState } from './walletLifecycle.js';

const nuevoId = () => crypto.randomUUID();

/** ¿Están las tablas? Se pregunta una vez por arranque en frío. */
const listo = async () => {
    const r = await ensureDisbursementSchema();
    return !!r?.ok;
};

/* ─── ESCRIBIR UN EVENTO ─────────────────────────────────────────────
 *
 * ⚠️ LA IDEMPOTENCIA ES DE LA BASE, NO DE UNA LECTURA PREVIA.
 *
 * El barrido corre cada quince minutos y el webhook puede reentregar: entre un
 * `SELECT` que comprueba «¿ya está anotado?» y el `INSERT` caben dos vueltas
 * concurrentes, y el resultado sería la misma línea de tiempo con el evento
 * repetido. `ON CONFLICT DO NOTHING` sobre `(paymentId, kind, toState)` lo
 * decide en la base, que es el único sitio donde no hay carrera. Es el mismo
 * razonamiento que sostiene `Payment_provider_providerRef_key` (v4.841) y la
 * llave de `NotificationDelivery` (v4.855).
 *
 * El valor de retorno DISTINGUE los dos casos: `created: false` significa «ya
 * estaba», que no es un error y no se registra como tal.
 */
export const recordEvent = async ({
    paymentId, clubId, kind,
    fromState = null, toState = null,
    actorKind = 'system', actorId = null, actorLabel = null,
    reference = null, note = null, meta = null,
    occurredAt = null,
} = {}) => {
    try {
        if (!paymentId || !clubId || !kind) return { ok: false, reason: 'faltan_datos' };
        if (!(await listo())) return { ok: false, reason: 'sin_tabla' };

        const cuando = occurredAt ? new Date(occurredAt) : new Date();
        const { rows } = await db.query(
            `INSERT INTO "PaymentLifecycleEvent"
                 (id, "paymentId", "clubId", kind, "fromState", "toState",
                  "actorKind", "actorId", "actorLabel", reference, note, meta, "occurredAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT ("paymentId", kind, "toState") DO NOTHING
             RETURNING id`,
            [
                nuevoId(), paymentId, clubId, kind,
                isState(fromState) ? fromState : null,
                isState(toState) ? toState : null,
                actorKind, actorId, actorLabel,
                reference, note,
                meta ? JSON.stringify(meta) : null,
                Number.isNaN(cuando.getTime()) ? new Date() : cuando,
            ]
        );
        return { ok: true, created: rows.length > 0, id: rows[0]?.id || null };
    } catch (e) {
        console.warn('[WALLET] recordEvent falló:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/**
 * Un evento que SÍ puede repetirse, porque cada ocurrencia es un hecho
 * distinto: una notificación enviada dos veces son dos envíos, y un desembolso
 * parcial tras otro son dos traslados.
 *
 * Se escribe sin `toState` para que el índice único no los funda —en Postgres
 * NULL es distinto de NULL— y con la referencia del hecho concreto, que es lo
 * que los distingue en la línea de tiempo.
 */
export const recordFact = async (args = {}) =>
    recordEvent({ ...args, toState: null });

/* ─── LEER LA TRAZA ──────────────────────────────────────────────────
 *
 * Degradan a vacío, siempre. Que falte el historial no puede impedir ver el
 * dinero — la misma regla que `listDeliveriesFor` en las notificaciones.
 */

/** La línea de tiempo de UN aporte, ordenada y rotulada. */
export const timelineFor = async (paymentId) => {
    try {
        if (!paymentId || !(await listo())) return [];
        const { rows } = await db.query(
            `SELECT kind, "fromState", "toState", "actorKind", "actorId", "actorLabel",
                    reference, note, "occurredAt", "createdAt"
               FROM "PaymentLifecycleEvent"
              WHERE "paymentId" = $1
              ORDER BY "occurredAt" ASC`,
            [paymentId]
        );
        return buildTimeline(rows);
    } catch (e) {
        console.warn('[WALLET] timelineFor falló:', e?.message);
        return [];
    }
};

/**
 * Las líneas de tiempo de VARIOS aportes, en un solo viaje.
 *
 * Con una consulta por aporte serían decenas por pantalla — es la lección de
 * `listDeliveriesFor` (v4.858). Devuelve `{}` cuando no hay tabla: la Bóveda
 * se pinta igual, sin historial.
 */
export const timelinesFor = async (paymentIds = []) => {
    try {
        const ids = (paymentIds || []).filter(Boolean);
        if (!ids.length || !(await listo())) return {};
        const { rows } = await db.query(
            `SELECT "paymentId", kind, "fromState", "toState", "actorKind", "actorId",
                    "actorLabel", reference, note, "occurredAt", "createdAt"
               FROM "PaymentLifecycleEvent"
              WHERE "paymentId" = ANY($1::text[])
              ORDER BY "occurredAt" ASC`,
            [ids]
        );
        const porPago = {};
        for (const r of rows) (porPago[r.paymentId] ||= []).push(r);
        const salida = {};
        for (const [id, evs] of Object.entries(porPago)) salida[id] = buildTimeline(evs);
        return salida;
    } catch (e) {
        console.warn('[WALLET] timelinesFor falló:', e?.message);
        return {};
    }
};

/**
 * El último estado ANOTADO de cada pago. Es lo que `planFor` compara contra lo
 * que dicen las fechas para saber si hay algo que anotar.
 *
 * ⚠️ Se toma el de mayor `occurredAt` y NO el último insertado: un evento
 * reconciliado hacia atrás se inserta hoy y ocurrió hace un mes, así que
 * ordenar por inserción daría por vigente un estado viejo.
 */
export const lastStatesFor = async (paymentIds = []) => {
    try {
        const ids = (paymentIds || []).filter(Boolean);
        if (!ids.length || !(await listo())) return {};
        const { rows } = await db.query(
            `SELECT DISTINCT ON ("paymentId") "paymentId", "toState", "occurredAt"
               FROM "PaymentLifecycleEvent"
              WHERE "paymentId" = ANY($1::text[]) AND "toState" IS NOT NULL
              ORDER BY "paymentId", "occurredAt" DESC, "createdAt" DESC`,
            [ids]
        );
        const salida = {};
        for (const r of rows) salida[r.paymentId] = r.toState;
        return salida;
    } catch (e) {
        console.warn('[WALLET] lastStatesFor falló:', e?.message);
        return {};
    }
};

export default { recordEvent, recordFact, timelineFor, timelinesFor, lastStatesFor };
