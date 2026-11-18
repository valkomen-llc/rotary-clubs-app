// ════════════════════════════════════════════════════════════════════
// EXCHANGE — la I/O (v4.1335)
//
// ⚠️ LA BÓVEDA SE LEE, NO SE ESCRIBE. Este archivo consulta `Payment`,
// `Disbursement` y `DisbursementBatch` sólo con SELECT: el traslado se
// registra y se revierte con el motor de la Bóveda (`BulkDisbursementBar` →
// `/financial/wallet/disbursements/bulk`, `/financial/disbursements/:id/reverse`).
// Las únicas escrituras de Exchange van a las tablas `Exchange*`. Lo fija la
// prueba leyendo este archivo y el controlador.
//
// ⚠️ POR LOTES. El listado pide N proyectos: una consulta por fuente, nunca
// una por fila (la lección de rendimiento de v4.659).
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import db from './db.js';
import { paymentsForSubmissions } from './projectFairCollections.js';
import { receiptFilesOf } from './disbursements.js';
import { ensureExchangeSchema } from './ensureExchangeSchema.js';
import {
    operationKeyOf, resolveOperation, projectExchangeState, grantMatches, isOperationKey, INITIAL_EVENT_ADMIN_GRANTS,
} from './exchangeSpec.js';

const safeRows = async (sql, params) => {
    try { return (await db.query(sql, params)).rows || []; }
    catch (e) {
        // La Bóveda puede no existir en una base nueva: sin movimientos no hay
        // traslados, y la columna dice «Pendiente» en vez de romper el listado.
        console.warn('[exchange] consulta degradada:', e?.message);
        return [];
    }
};

const iso = (v) => (v ? new Date(v).toISOString() : null);

// ⚠️ `*` y no una lista de columnas: la Bóveda AMPLÍA sus tablas en arranques
// posteriores (`receiptFiles`, v4.998, llega por un ALTER que no corre la
// primera vez). Nombrar una columna que todavía no existe tumbaría la lectura
// entera; con `*`, `receiptFilesOf` usa la que haya. Son pocas filas.
export const DISBURSEMENT_COLUMNS = '*';
const BATCH_COLUMNS = '*';

/** El proyecto cuyo pago respalda a otro (inscripción conjunta o sustitución). */
const anchorIdOf = (s) => (s?.metadata?.payment?.coveredBy ? String(s.metadata.payment.coveredBy) : null);
const isManual = (s) => String(s?.paymentConfirmationOrigin || '') === 'manual_admin';

const mapRecon = (r) => (r ? {
    ...r,
    transferDate: iso(r.transferDate),
    reconciledAt: iso(r.reconciledAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
} : null);

/**
 * Las operaciones (lotes y desembolsos sueltos) que tocan estos desembolsos,
 * COMPLETAS: con las asignaciones de OTROS proyectos del mismo lote, para que
 * el total de una operación compartida sea el de la operación y no el de la
 * fila que se está mirando.
 */
export const loadOperations = async (disbursements = []) => {
    const batchIds = [...new Set(disbursements.map(d => d.batchId).filter(Boolean))];
    const sueltos = disbursements.filter(d => !d.batchId);
    const [batchRows, batchAllocs] = batchIds.length
        ? await Promise.all([
            safeRows(`SELECT ${BATCH_COLUMNS} FROM "DisbursementBatch" WHERE id = ANY($1::text[])`, [batchIds]),
            safeRows(`SELECT ${DISBURSEMENT_COLUMNS} FROM "Disbursement" WHERE "batchId" = ANY($1::text[])`, [batchIds]),
        ])
        : [[], []];
    const byKey = new Map();
    for (const d of [...batchAllocs, ...sueltos]) {
        const key = operationKeyOf(d);
        if (!byKey.has(key)) byKey.set(key, []);
        if (!byKey.get(key).some(x => x.id === d.id)) byKey.get(key).push(d);
    }
    const batches = new Map(batchRows.map(b => [`b:${b.id}`, b]));
    const keys = [...byKey.keys()];
    await ensureExchangeSchema();
    const [recons, docs] = keys.length ? await Promise.all([
        safeRows('SELECT * FROM "ExchangeReconciliation" WHERE "operationKey" = ANY($1::text[])', [keys]),
        safeRows(`SELECT "operationKey", COUNT(*)::int AS n FROM "ExchangeDocument"
                   WHERE "operationKey" = ANY($1::text[]) AND "retiredAt" IS NULL GROUP BY 1`, [keys]),
    ]) : [[], []];
    const reconBy = new Map(recons.map(r => [r.operationKey, mapRecon(r)]));
    const docsBy = new Map(docs.map(r => [r.operationKey, r.n]));
    const operations = {};
    for (const key of keys) {
        const batch = batches.get(key) || null;
        const allocations = byKey.get(key).map(d => ({ ...d, hasReceipt: receiptFilesOf(d).length > 0 }));
        operations[key] = {
            ...resolveOperation({
                key,
                allocations,
                batch: batch ? { ...batch, hasReceipt: receiptFilesOf(batch).length > 0 } : null,
                recon: reconBy.get(key) || null,
                exchangeDocs: docsBy.get(key) || 0,
            }),
            _allocations: allocations,
            _batch: batch,
            _recon: reconBy.get(key) || null,
        };
    }
    return operations;
};

/**
 * EL ESTADO EXCHANGE DE N PROYECTOS, por lotes.
 *
 * @returns {Promise<{ byId: Map<string, object>, operations: object, refsById: Map<string, string[]> }>}
 */
export const loadExchangeFor = async (submissions = []) => {
    const rows = submissions.filter(Boolean);
    // Los proyectos cubiertos por el pago de otro siguen a su ANCLA.
    const faltan = [...new Set(rows.map(anchorIdOf).filter(Boolean))].filter(id => !rows.some(r => String(r.id) === id));
    const anclasExtra = faltan.length
        ? await safeRows('SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[])', [faltan])
        : [];
    const todas = [...rows, ...anclasExtra];
    const byIdRow = new Map(todas.map(r => [String(r.id), r]));
    const anclas = todas.filter(r => !anchorIdOf(r));

    const movimientos = await paymentsForSubmissions(anclas.filter(r => String(r.status) === 'paid'));
    const paymentIds = [...new Set([...movimientos.values()].map(p => p.id))];
    const propios = paymentIds.length
        ? await safeRows(`SELECT ${DISBURSEMENT_COLUMNS} FROM "Disbursement" WHERE "paymentId" = ANY($1::text[])`, [paymentIds])
        : [];
    const operations = await loadOperations(propios);

    const subByPayment = new Map();
    for (const [subId, p] of movimientos.entries()) subByPayment.set(p.id, subId);

    const stateOfAnchor = new Map();
    const refsOfAnchor = new Map();
    for (const a of anclas) {
        const id = String(a.id);
        const movement = movimientos.get(id) || null;
        const allocations = movement
            ? propios.filter(d => d.paymentId === movement.id).map(d => ({ ...d, operationKey: operationKeyOf(d), submissionId: id }))
            : [];
        const x = projectExchangeState({ paid: String(a.status) === 'paid', manual: isManual(a), movement, allocations, operations });
        // Para el listado y las exportaciones: referencias, última conciliación y
        // quién registró (sin claves de S3 ni datos de cuentas).
        const ops = x.operationKeys.map(k => operations[k]).filter(Boolean);
        x.references = [...new Set(ops.map(o => o.reference).filter(Boolean))];
        x.lastReconciledAt = ops.map(o => o.reconciledAt).filter(Boolean).sort().pop() || null;
        x.registeredBy = [...new Set(ops.map(o => (o._batch || o._allocations[0] || {}).createdByName).filter(Boolean))];
        stateOfAnchor.set(id, x);
        refsOfAnchor.set(id, x.operationKeys.map(k => operations[k]?.reference).filter(Boolean));
    }

    const byId = new Map();
    const refsById = new Map();
    for (const r of rows) {
        const id = String(r.id);
        const ancla = anchorIdOf(r);
        if (ancla) {
            const x = stateOfAnchor.get(ancla);
            const anchorRow = byIdRow.get(ancla);
            byId.set(id, x
                ? { ...x, anchor: false, via: { id: ancla, publicRef: anchorRow?.publicRef || r.metadata?.payment?.coveredByRef || null } }
                : { ...projectExchangeState({ paid: false }), anchor: false });
            refsById.set(id, refsOfAnchor.get(ancla) || []);
        } else {
            byId.set(id, { ...stateOfAnchor.get(id), anchor: true, via: null });
            refsById.set(id, refsOfAnchor.get(id) || []);
        }
    }
    return { byId, operations, refsById, subByPayment, movimientos };
};

/** Lo que viaja en cada fila del listado: compacto y sin claves de S3. */
export const compactExchange = (x) => (x ? {
    state: x.state, label: x.label, tone: x.tone, help: x.help,
    expected: x.expected, allocated: x.allocated, confirmedAmount: x.confirmedAmount, currency: x.currency,
    hasReceipt: x.hasReceipt, operations: x.operationKeys.length, lastTransferDate: x.lastTransferDate,
    needsMovement: x.needsMovement, anchor: x.anchor !== false, via: x.via || null,
    references: x.references || [], lastReconciledAt: x.lastReconciledAt || null, registeredBy: x.registeredBy || [],
} : null);

// ── La edición y el acceso ─────────────────────────────────────────────────

/** El evento de la edición abierta en el panel (o la abierta por defecto). */
export const editionEventIdOf = async (req) => {
    const pedido = String(req?.query?.evento || '').trim().slice(0, 60);
    if (pedido) return pedido;
    const rows = await safeRows(`SELECT "eventId" FROM "ProjectFairConfig"
                                  ORDER BY (config->>'enabled' IS DISTINCT FROM 'false') DESC, "updatedAt" DESC LIMIT 1`, []);
    return rows[0]?.eventId || null;
};

/**
 * El acceso de CONSULTA vigente de este usuario sobre esta edición, si lo hay.
 * Al enlazar por correo por primera vez, se fija el `userId` (ver `grantMatches`).
 */
export const findAccessGrant = async (user, eventId) => {
    if (!user || !eventId) return null;
    await ensureExchangeSchema();
    await seedInitialGrants(eventId);
    const rows = await safeRows(
        `SELECT * FROM "ExchangeAccessGrant" WHERE "eventId" = $1 AND "revokedAt" IS NULL
           AND ("userId" = $2 OR ("userId" IS NULL AND lower(email) = lower($3)))`,
        [eventId, String(user.id || ''), String(user.email || '')]);
    const grant = rows.find(g => grantMatches(g, user)) || null;
    if (grant) {
        await safeRows(`UPDATE "ExchangeAccessGrant" SET "lastUsedAt" = NOW(),
                          "userId" = COALESCE("userId", $2) WHERE id = $1`, [grant.id, user.id ? String(user.id) : null]);
    }
    return grant;
};

/**
 * Siembra UNA VEZ los accesos pedidos al estrenar Exchange (ver
 * `INITIAL_EVENT_ADMIN_GRANTS`), sólo en la edición ABIERTA. La marca
 * `acceso_sembrado` en el historial impide volver a sembrar lo que alguien
 * revocó. Nunca lanza.
 */
const _seeded = new Set();
export const seedInitialGrants = async (eventId) => {
    if (!eventId || _seeded.has(eventId)) return;
    _seeded.add(eventId);
    try {
        const abierta = await editionEventIdOf({ query: {} });
        if (abierta !== eventId) return;
        await ensureExchangeSchema();
        for (const g of INITIAL_EVENT_ADMIN_GRANTS) {
            const email = String(g.email).toLowerCase();
            const marca = await safeRows(`SELECT 1 FROM "ExchangeEvent" WHERE "eventId" = $1 AND action = 'acceso_sembrado' AND reference = $2 LIMIT 1`, [eventId, email]);
            if (marca.length) continue;
            const user = (await safeRows('SELECT id FROM "User" WHERE lower(email) = $1 LIMIT 1', [email]))[0] || null;
            await db.query(
                `INSERT INTO "ExchangeAccessGrant" (id, "eventId", "userId", email, "canDownload", note, source, "grantedByName")
                 VALUES ($1,$2,$3,$4,$5,$6,'siembra_v4.1335','Pedido del comité (v4.1335)')
                 ON CONFLICT ("eventId", lower(email)) WHERE "revokedAt" IS NULL DO NOTHING`,
                [randomUUID(), eventId, user?.id || null, email, g.canDownload !== false, g.note || null]);
            await logExchangeEvent(null, { eventId, action: 'acceso_sembrado', reference: email, actor: { name: 'Sistema (v4.1335)' }, payload: { canDownload: g.canDownload !== false } });
        }
    } catch (e) {
        _seeded.delete(eventId);
        console.warn('[exchange] no pude sembrar los accesos iniciales:', e?.message);
    }
};

// ── Historial ──────────────────────────────────────────────────────────────

export const logExchangeEvent = async (client, {
    eventId = null, operationKey = null, submissionId = null, action, fromState = null, toState = null,
    reference = null, actor = {}, payload = null,
}) => {
    const q = client || db;
    await q.query(
        `INSERT INTO "ExchangeEvent" (id, "eventId", "operationKey", "submissionId", action, "fromState", "toState",
                                      reference, "actorId", "actorName", "actorRole", payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [randomUUID(), eventId, operationKey, submissionId, String(action).slice(0, 60), fromState, toState,
            reference ? String(reference).slice(0, 200) : null, actor?.id || null, actor?.name || null, actor?.role || null,
            payload ? JSON.stringify(payload) : null]);
};

/**
 * El historial de un proyecto, COMPUESTO al leer: el pago (de la propia
 * postulación), cada traslado y reversión (de la Bóveda), cada comprobante, y
 * lo que Exchange registró sobre sus operaciones.
 */
export const projectHistory = async (submission, operations = {}, operationKeys = []) => {
    const out = [];
    if (submission?.paidAt) {
        out.push({ at: iso(submission.paidAt), action: 'pago_recibido', label: 'Pago de inscripción confirmado',
            actorName: isManual(submission) ? 'Confirmación manual' : 'Stripe', toState: 'paid', reference: submission.publicRef });
    }
    for (const key of operationKeys) {
        const op = operations[key];
        if (!op) continue;
        const first = op._batch || op._allocations[0] || {};
        out.push({ at: iso(first.createdAt || first.disbursedAt), action: 'traslado_registrado', label: `Transferencia registrada (${op.kind})`,
            actorName: first.createdByName || null, operationKey: key, reference: op.reference || null, toState: 'en_conciliacion' });
        if (op.bovedaReceipt) {
            out.push({ at: iso(first.createdAt || first.disbursedAt), action: 'comprobante_cargado', label: 'Comprobante del traslado cargado',
                actorName: first.createdByName || null, operationKey: key });
        }
        for (const d of op._allocations) {
            if (d.reversedAt) {
                out.push({ at: iso(d.reversedAt), action: 'traslado_revertido', label: 'Traslado revertido en la Bóveda',
                    actorName: d.reversedBy || null, operationKey: key, note: d.reversedReason || null, fromState: 'confirmado', toState: 'reversado' });
            }
        }
    }
    const keys = operationKeys.filter(isOperationKey);
    if (keys.length) {
        const rows = await safeRows(`SELECT * FROM "ExchangeEvent" WHERE "operationKey" = ANY($1::text[]) OR "submissionId" = $2
                                      ORDER BY "createdAt" ASC`, [keys, String(submission?.id || '')]);
        for (const r of rows) {
            out.push({ at: iso(r.createdAt), action: r.action, label: EVENT_LABELS[r.action] || r.action, actorName: r.actorName,
                actorRole: r.actorRole, operationKey: r.operationKey, fromState: r.fromState, toState: r.toState,
                reference: r.reference, payload: r.payload || null });
        }
    }
    return out.filter(e => e.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
};

export const EVENT_LABELS = {
    datos_registrados: 'Datos de la transferencia registrados',
    datos_corregidos: 'Datos de la transferencia corregidos',
    documento_cargado: 'Soporte adjuntado',
    documento_retirado: 'Soporte retirado',
    estado_cambiado: 'Estado de conciliación cambiado',
    conciliacion_confirmada: 'Conciliación confirmada',
    conciliacion_reabierta: 'Conciliación reabierta',
    diferencia_registrada: 'Diferencia registrada',
    comprobante_consultado: 'Comprobante consultado',
    comprobante_descargado: 'Comprobante descargado',
};

export default {
    loadExchangeFor, loadOperations, compactExchange, editionEventIdOf, findAccessGrant, seedInitialGrants, logExchangeEvent, projectHistory, EVENT_LABELS,
};
