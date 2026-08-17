// Escribir en el libro mayor. La orquestación; el criterio vive en
// `ledgerSpec.js`, que es puro y se prueba sin base y sin red.
//
// v4.847 — Fase 1: EN SOMBRA. Acá se escribe; nadie lee todavía. La Bóveda
// sigue calculando sus saldos desde `Payment` y `PayoutRequest`. Lo único que
// consume el libro es `reconcileClub`, que existe justamente para contrastar
// los dos antes de cambiar de fuente.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO: nadie paga por el libro. Toda función de
// escritura devuelve `{ ok, reason }` y NUNCA lanza. Un asiento que no se pudo
// escribir se anota en consola y el cobro sigue su camino. Al revés —un aporte
// que se pierde porque el libro falló— sería cambiar un problema de auditoría
// por uno de dinero, y el libro está en sombra: todavía no vale nada.

import crypto from 'crypto';
import db from './db.js';
import { ensureLedgerSchema } from './ensureLedgerSchema.js';
import {
    ACCOUNTS, assertBalanced, toMinor, fromMinor, compareBalances,
    buildDonationEntry, buildReleaseEntry, buildPayoutEntry, buildPayoutCancelEntry,
} from './ledgerSpec.js';
import { normalizeCurrency } from './money.js';

const id = () => crypto.randomUUID();

/**
 * La cuenta (club, tipo, moneda), creándola si falta.
 *
 * `ON CONFLICT DO NOTHING` + relectura, no `DO UPDATE`: no hay nada que
 * actualizar en una cuenta —es sólo su identidad— y `DO UPDATE` escribiría una
 * fila en cada asiento sin motivo. El índice único es COMPLETO, no parcial, así
 * que el `ON CONFLICT` no tiene que repetir ningún predicado (el error real de
 * v4.648).
 */
const accountId = async (client, clubId, kind, currency) => {
    const code = normalizeCurrency(currency);
    const nuevo = id();
    await client.query(
        `INSERT INTO "LedgerAccount" (id, "clubId", kind, currency)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("clubId", kind, currency) DO NOTHING`,
        [nuevo, clubId, kind, code]
    );
    const { rows } = await client.query(
        `SELECT id FROM "LedgerAccount" WHERE "clubId" = $1 AND kind = $2 AND currency = $3 LIMIT 1`,
        [clubId, kind, code]
    );
    return rows[0]?.id || null;
};

/**
 * Escribe un asiento.
 *
 * TODO O NADA: el asiento y sus líneas van en una transacción de base. Un
 * asiento a medias —la cabecera escrita y una línea sin escribir— es un libro
 * descuadrado que no se puede corregir, porque el libro sólo agrega.
 *
 * Idempotente por `(sourceType, sourceRef)`: si el hecho ya estaba asentado, se
 * sale sin duplicar. Es la misma protección que el índice de `Payment` y acá es
 * la ÚNICA — no hay lectura previa que sirva contra dos entregas concurrentes
 * del mismo webhook.
 */
export const postEntry = async (entry) => {
    const prep = await ensureLedgerSchema();
    if (prep?.state === 'error') return { ok: false, reason: 'schema' };

    try {
        assertBalanced(entry.lines);
    } catch (e) {
        // Un asiento descuadrado NO se guarda. Guardado habría que corregirlo
        // con un reverso, cuando lo que hay es un error de código.
        console.error(`[LEDGER] asiento descuadrado (${entry.sourceType}:${entry.sourceRef}):`, e.message);
        return { ok: false, reason: 'descuadre', detail: e.message };
    }

    // Una conexión dedicada del pool: `db.query` toma una distinta por llamada,
    // así que un BEGIN por ahí no envolvería a los INSERT siguientes — la
    // transacción sería decorativa. Si el pool no la da, se escribe sin
    // envoltorio y se dice: un asiento sin transacción es peor que uno con
    // ella, pero mucho mejor que ninguno mientras el libro está en sombra.
    let client = null;
    try { client = await db.pool?.connect?.(); } catch { client = null; }
    const run = client ? client.query.bind(client) : db.query.bind(db);
    if (!client) console.warn('[LEDGER] sin conexión dedicada: el asiento se escribe sin transacción');

    try {
        if (client) await run('BEGIN');

        const txId = id();
        const inserted = await run(
            `INSERT INTO "LedgerTransaction"
                (id, kind, "clubId", currency, "sourceType", "sourceRef", "reverses", "occurredAt", meta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9::jsonb)
             ON CONFLICT ("sourceType", "sourceRef") DO NOTHING
             RETURNING id`,
            [
                txId, entry.kind, entry.clubId, normalizeCurrency(entry.currency),
                entry.sourceType, String(entry.sourceRef), entry.reverses || null,
                entry.occurredAt ? new Date(entry.occurredAt).toISOString() : null,
                entry.meta ? JSON.stringify(entry.meta) : null,
            ]
        );

        if (!inserted.rows.length) {
            if (client) await run('ROLLBACK');
            return { ok: true, duplicate: true };
        }

        for (const l of entry.lines) {
            const accId = await accountId({ query: run }, entry.clubId, l.account, l.currency);
            await run(
                `INSERT INTO "LedgerLine"
                    (id, "transactionId", "accountId", "clubId", account, currency, minor, basis, meta)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
                [
                    id(), txId, accId, entry.clubId, l.account, l.currency,
                    String(l.minor), l.basis || 'real',
                    l.meta ? JSON.stringify(l.meta) : null,
                ]
            );
        }

        if (client) await run('COMMIT');
        return { ok: true, id: txId };
    } catch (e) {
        if (client) { try { await run('ROLLBACK'); } catch { /* la conexión ya se cayó */ } }
        console.error(`[LEDGER] no pude asentar ${entry.sourceType}:${entry.sourceRef}:`, e?.message);
        return { ok: false, reason: 'escritura', detail: e?.message };
    } finally {
        client?.release?.();
    }
};

// ── Los tres hechos que hoy se asientan ──────────────────────────────
//
// Cada uno recibe importes CON DECIMALES —que es como los tiene el resto de la
// plataforma— y los convierte a entero acá, en el borde. Dentro del libro no
// entra ni un decimal.

/**
 * El asiento de un aporte acreditado.
 *
 * `processorFeeMeta` es la procedencia de la comisión: cuánto era en su moneda
 * original, con qué tasa se convirtió, de qué fuente y de qué día. Es lo que
 * permite contestar «¿por qué la comisión de este aporte son 4.750 pesos?» sin
 * salir del libro.
 */
export const postDonation = async ({
    clubId, currency, gross, processorFee = 0, platformFee = 0,
    processorFeeBasis = 'real', processorFeeMeta = null,
    sourceRef, occurredAt, meta = null,
}) => {
    try {
        const entry = buildDonationEntry({
            clubId,
            currency,
            grossMinor: toMinor(gross, currency),
            processorFeeMinor: toMinor(processorFee || 0, currency),
            platformFeeMinor: toMinor(platformFee || 0, currency),
            processorFeeBasis,
            processorFeeMeta,
            sourceRef,
            occurredAt,
            meta,
        });
        return await postEntry(entry);
    } catch (e) {
        console.error('[LEDGER] no pude armar el asiento del aporte:', e?.message);
        return { ok: false, reason: 'construccion', detail: e?.message };
    }
};

/** El asiento de una liberación: el proveedor soltó el dinero. */
export const postRelease = async ({ clubId, currency, net, sourceRef, occurredAt, meta = null }) => {
    try {
        return await postEntry(buildReleaseEntry({
            clubId, currency, netMinor: toMinor(net, currency), sourceRef, occurredAt, meta,
        }));
    } catch (e) {
        console.error('[LEDGER] no pude armar el asiento de liberación:', e?.message);
        return { ok: false, reason: 'construccion', detail: e?.message };
    }
};

/** El asiento de un retiro solicitado. */
export const postPayout = async ({ clubId, currency, amount, sourceRef, occurredAt, meta = null }) => {
    try {
        return await postEntry(buildPayoutEntry({
            clubId, currency, amountMinor: toMinor(amount, currency), sourceRef, occurredAt, meta,
        }));
    } catch (e) {
        console.error('[LEDGER] no pude armar el asiento del retiro:', e?.message);
        return { ok: false, reason: 'construccion', detail: e?.message };
    }
};

/**
 * El asiento de un retiro ANULADO: el dinero vuelve a disponible.
 *
 * `sourceRef` lleva el sufijo `:anulado`, así que rechazar dos veces el mismo
 * retiro no devuelve el dinero dos veces: el segundo asiento choca con el
 * índice único y se sale.
 */
export const postPayoutCancel = async ({ clubId, currency, amount, payoutId, occurredAt, reason }) => {
    try {
        return await postEntry(buildPayoutCancelEntry({
            clubId, currency, amountMinor: toMinor(amount, currency),
            sourceRef: `${payoutId}:anulado`, occurredAt, reason,
        }));
    } catch (e) {
        console.error('[LEDGER] no pude armar el asiento de anulación:', e?.message);
        return { ok: false, reason: 'construccion', detail: e?.message };
    }
};

// ── Leer el libro ────────────────────────────────────────────────────

/**
 * Los saldos del club, por cuenta y moneda, en unidad mínima.
 *
 * Sale de un `SUM` con `GROUP BY account, currency`: no hay tabla de saldos, a
 * propósito, porque sería una segunda verdad sobre las mismas líneas.
 *
 * ⚠️ EL `GROUP BY currency` NO ES OPCIONAL. Es literalmente el defecto que abrió
 * este rediseño: un `SUM` sin agrupar por moneda produjo el «$47.507,75» que el
 * Distrito vio en pantalla.
 */
export const ledgerBalances = async (clubId) => {
    const prep = await ensureLedgerSchema();
    if (prep?.state === 'error') return null;
    try {
        const { rows } = await db.query(
            `SELECT account, currency, SUM(minor)::bigint AS minor
               FROM "LedgerLine"
              WHERE "clubId" = $1
              GROUP BY account, currency`,
            [clubId]
        );
        const out = {};
        for (const r of rows) {
            ((out[r.account] ||= {})[normalizeCurrency(r.currency)] = Number(r.minor) || 0);
        }
        return out;
    } catch (e) {
        console.error('[LEDGER] no pude leer saldos:', e?.message);
        return null;
    }
};

/**
 * Contrasta el libro con lo que hoy muestra la Bóveda.
 *
 * Es la razón de ser de una fase en sombra: sin esto, el libro nuevo sería una
 * promesa. Devuelve las dos lecturas y su diferencia, POR MONEDA y en unidad
 * mínima —comparar importes con decimales daría descuadres de un centavo que
 * son del binario y no de la contabilidad—.
 *
 * ⚠️ Lo esperable HOY es que no cuadre, y saberlo es el resultado. El libro
 * empieza vacío y sólo se asientan los hechos posteriores a v4.847: los aportes
 * anteriores no están, así que la diferencia mide cuánto historial le falta, no
 * un error. Cuando la Fase 2 los cargue hacia atrás, esta misma comparación es
 * la que dirá que se puede cambiar de fuente.
 */
export const reconcileClub = async (clubId, legacy) => {
    const balances = await ledgerBalances(clubId);
    if (!balances) return { ok: false, reason: 'sin_libro' };

    // El disponible según el libro: lo liberado menos lo transferido.
    const disponible = {};
    for (const code of new Set([
        ...Object.keys(balances.club_disponible || {}),
        ...Object.keys(balances.club_transferido || {}),
    ])) {
        disponible[code] = (balances.club_disponible?.[code] || 0);
    }

    // El neto acumulado: lo que entró menos las dos retenciones. Es lo que la
    // Bóveda llama «recaudado neto» y se compara contra `collected`.
    const neto = {};
    for (const code of new Set([
        ...Object.keys(balances.ingreso_aportes || {}),
        ...Object.keys(balances.gasto_procesador || {}),
        ...Object.keys(balances.gasto_plataforma || {}),
    ])) {
        // `ingreso_aportes` es negativo por naturaleza: se niega para leerlo
        // como un importe positivo.
        neto[code] = -(balances.ingreso_aportes?.[code] || 0)
            - (balances.gasto_procesador?.[code] || 0)
            - (balances.gasto_plataforma?.[code] || 0);
    }

    // El lado viejo llega con decimales; se pasa a unidad mínima para comparar.
    const aMinor = (mapa) => {
        const out = {};
        for (const [code, value] of Object.entries(mapa || {})) {
            try { out[normalizeCurrency(code)] = toMinor(value, code); } catch { /* fila ilegible */ }
        }
        return out;
    };

    return {
        ok: true,
        neto: compareBalances(neto, aMinor(legacy?.collected)),
        disponible: compareBalances(disponible, aMinor(legacy?.available)),
        cuentas: balances,
    };
};

/** Los saldos con su etiqueta y su importe legible, para una pantalla. No lo
 *  consume nadie todavía: es lo que la Fase 2 va a leer. */
export const readableBalances = (balances) => {
    const out = [];
    for (const [account, byCurrency] of Object.entries(balances || {})) {
        const meta = ACCOUNTS[account];
        for (const [currency, minor] of Object.entries(byCurrency || {})) {
            out.push({
                account,
                label: meta?.label || account,
                sign: meta?.sign ?? 1,
                currency,
                minor,
                amount: fromMinor(minor, currency),
            });
        }
    }
    return out;
};

export default {
    postEntry, postDonation, postRelease, postPayout, postPayoutCancel,
    ledgerBalances, reconcileClub, readableBalances,
};
