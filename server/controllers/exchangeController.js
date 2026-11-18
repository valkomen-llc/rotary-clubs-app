// ════════════════════════════════════════════════════════════════════
// EXCHANGE — traslados y conciliación financiera de la Feria — v4.1335
//
// Rutas `/api/project-fair/admin/exchange/*` (en `server/routes/project-fair.js`,
// que ya está montado en `api/index.js` y en `server/server.js`).
//
// ⚠️ LA BÓVEDA SE LEE, NO SE ESCRIBE. Registrar el traslado y revertirlo son
// del motor de la Bóveda (la barra `BulkDisbursementBar` y la reversión con
// motivo). Este controlador sólo ESCRIBE en las tablas `Exchange*`: la
// conciliación, los datos de la operación bancaria, los soportes, el
// historial, la configuración y los accesos. No toca el pago de la inscripción
// (`ProjectFairSubmission`) ni el traslado (`Disbursement`). Lo fija la prueba.
//
// Permisos (todos en el SERVIDOR, por `withAccess`):
//   exchangeView       consultar (comité con pagos y el administrador del evento)
//   exchangeDownload   descargar el comprobante
//   exchangeManage     registrar/corregir datos y adjuntar soportes (admin, finance)
//   exchangeReconcile  conciliar, marcar diferencia, reabrir (admin, finance)
//   exchangeConfig     cuentas y accesos de consulta (admin)
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import db from '../lib/db.js';
import { withAccess, actorFrom, buildFilters } from './projectFairAdminController.js';
import { ensureExchangeSchema } from '../lib/ensureExchangeSchema.js';
import {
    loadExchangeFor, loadOperations, compactExchange, editionEventIdOf, logExchangeEvent, seedInitialGrants, projectHistory, DISBURSEMENT_COLUMNS,
} from '../lib/exchangeStore.js';
import {
    canReconcile, normalizeReconData, reconDataDiff, isOperationKey, operationSlug, exchangeTotals,
    normalizeAccount, publicAccount, isEmail, isDocKind, EXCHANGE_DOC_KINDS, RECON_LABELS, csvCell,
    hasExchangeQuery, matchesExchangeFilters, EXCHANGE_FILTERS, round2,
} from '../lib/exchangeSpec.js';
import { receiptFilesOf } from '../lib/disbursements.js';
import {
    presignPrivateReceiptUpload, verifyPrivateReceipt, signedReceiptUrl,
} from '../lib/completedReceipts.js';
import { paymentStatusOf, paymentStatusLabel } from '../lib/projectFairLifecycle.js';

console.log('[exchangeController] v4.1335.0 cargado — Exchange: traslados y conciliación de la Feria sobre el motor de la Bóveda (sólo lectura), conciliación independiente del pago y del traslado, soportes privados, historial auditable y acceso de consulta del administrador del evento.');

export const EXCHANGE_PREFIX = 'private/exchange';
const MAX_RECEIPT_MB = 10;

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const rowsOf = async (sql, params) => {
    try { return (await db.query(sql, params)).rows || []; }
    catch (e) { console.warn('[exchange] consulta degradada:', e?.message); return []; }
};

// ── El alcance: a qué proyectos (y a qué edición) toca una operación ────────

/**
 * Las asignaciones de una operación y los proyectos de la Feria a los que
 * corresponden. Es lo que decide si alguien puede ver su comprobante: una
 * operación que no toca ningún proyecto de la edición «no existe» (404).
 */
export const operationScope = async (opKey) => {
    if (!isOperationKey(opKey)) return null;
    const [kind, id] = [opKey.slice(0, 1), opKey.slice(2)];
    const allocations = await rowsOf(
        `SELECT ${DISBURSEMENT_COLUMNS} FROM "Disbursement" WHERE ${kind === 'b' ? '"batchId"' : 'id'} = $1`, [id]);
    if (!allocations.length) return null;
    const batch = kind === 'b'
        ? (await rowsOf('SELECT * FROM "DisbursementBatch" WHERE id = $1', [id]))[0] || null
        : null;
    const paymentIds = [...new Set(allocations.map(a => a.paymentId))];
    const payments = await rowsOf('SELECT id, "providerRef", currency, amount, "netAmount" FROM "Payment" WHERE id = ANY($1::text[])', [paymentIds]);
    const refs = payments.map(p => p.providerRef).filter(Boolean);
    const subs = refs.length ? await rowsOf(
        `SELECT id, "publicRef", "projectName", "clubName", district, "eventId", status, metadata,
                "stripePaymentIntentId", "stripeSessionId", "amountCop", "amountUsd", "chargeCurrency", "paidAt"
           FROM "ProjectFairSubmission" WHERE "stripePaymentIntentId" = ANY($1::text[]) OR "stripeSessionId" = ANY($1::text[])`, [refs]) : [];
    const subByRef = new Map();
    for (const s of subs) {
        if (s.stripePaymentIntentId) subByRef.set(s.stripePaymentIntentId, s);
        if (s.stripeSessionId) subByRef.set(s.stripeSessionId, s);
    }
    const subByPayment = new Map(payments.map(p => [p.id, subByRef.get(p.providerRef) || null]));
    return { opKey, allocations, batch, subByPayment, submissions: [...new Set(subByPayment.values())].filter(Boolean) };
};

/**
 * ¿Quien pregunta puede ver esta operación?
 *   · Toca al menos un proyecto de la Feria (si no, no es de este módulo).
 *   · Con una edición abierta en el panel, al menos uno es de esa edición.
 *   · ⚠️ El administrador del evento (sólo consulta) ve únicamente operaciones
 *     cuyos proyectos son TODOS de su edición: no le llegan datos de otra.
 */
export const scopeAllowed = (scope, { access, eventId }) => {
    if (!scope || !scope.submissions.length) return false;
    if (access?.role === 'exchange_viewer') return Boolean(eventId) && scope.submissions.every(s => s.eventId === eventId);
    if (!eventId) return true;
    return scope.submissions.some(s => !s.eventId || s.eventId === eventId);
};

const loadScoped = async (req, res, access) => {
    const opKey = clean(req.params.opKey, 90);
    if (!isOperationKey(opKey)) { res.status(400).json({ error: 'Operación no válida.' }); return null; }
    const scope = await operationScope(opKey);
    const eventId = await editionEventIdOf(req);
    if (!scopeAllowed(scope, { access, eventId })) { res.status(404).json({ error: 'No se encontró la operación.' }); return null; }
    return { opKey, scope, eventId };
};

/** La operación resuelta (estado, diferencia, comprobante), igual que en la columna. */
const resolvedOperation = async (scope) => {
    const ops = await loadOperations(scope.allocations);
    return ops[scope.opKey] || null;
};

// ── Configuración: cuentas y accesos ───────────────────────────────────────

const readConfigRow = async (eventId) => {
    if (!eventId) return null;
    await ensureExchangeSchema();
    return (await rowsOf('SELECT * FROM "ExchangeConfig" WHERE "eventId" = $1', [eventId]))[0] || null;
};

const accountsView = (cfgRow, { full = false } = {}) => ({
    origin: cfgRow?.originAccount ? publicAccount(cfgRow.originAccount, { full }) : null,
    destination: cfgRow?.destinationAccount ? publicAccount(cfgRow.destinationAccount, { full }) : null,
    maxReceiptMb: Math.min(MAX_RECEIPT_MB, Number(cfgRow?.maxReceiptMb) || MAX_RECEIPT_MB),
});

const capabilitiesOf = (access) => ({
    role: access.role,
    view: !!access.exchangeView,
    download: !!access.exchangeDownload,
    manage: !!access.exchangeManage,
    reconcile: !!access.exchangeReconcile,
    config: !!access.exchangeConfig,
    // Registrar el traslado es del motor de la Bóveda: se ofrece a quien mueve pagos.
    register: !!access.managePayments,
});

const grantView = (g) => ({
    id: g.id, email: g.email, linkedUser: Boolean(g.userId), canDownload: g.canDownload !== false, note: g.note || null,
    source: g.source, grantedByName: g.grantedByName || null, grantedAt: iso(g.grantedAt),
    revokedAt: iso(g.revokedAt), revokedByName: g.revokedByName || null, revokedReason: g.revokedReason || null,
    lastUsedAt: iso(g.lastUsedAt),
});

/** GET /admin/exchange/config */
export const getConfig = withAccess(async (req, res, { access }) => {
    const eventId = await editionEventIdOf(req);
    await seedInitialGrants(eventId);
    const cfgRow = await readConfigRow(eventId);
    const grants = access.exchangeConfig && eventId
        ? (await rowsOf('SELECT * FROM "ExchangeAccessGrant" WHERE "eventId" = $1 ORDER BY "revokedAt" NULLS FIRST, "grantedAt" DESC', [eventId])).map(grantView)
        : [];
    res.json({
        eventId,
        accounts: accountsView(cfgRow, { full: !!access.exchangeConfig }),
        history: access.exchangeConfig ? (Array.isArray(cfgRow?.history) ? cfgRow.history.slice(-30).reverse() : []) : [],
        grants,
        docKinds: EXCHANGE_DOC_KINDS,
        filters: EXCHANGE_FILTERS,
        capabilities: capabilitiesOf(access),
    });
}, 'exchangeView');

/** PUT /admin/exchange/config — las cuentas de origen y destino de la edición. */
export const saveConfig = withAccess(async (req, res, { access }) => {
    const eventId = await editionEventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Abre una edición de la feria para configurar sus cuentas.' });
    const prev = await readConfigRow(eventId);
    const origin = normalizeAccount(req.body?.origin || {}, prev?.originAccount || {});
    const destination = normalizeAccount(req.body?.destination || {}, prev?.destinationAccount || {});
    const mb = req.body?.maxReceiptMb === undefined ? (prev?.maxReceiptMb ?? null) : Number(req.body.maxReceiptMb);
    if (mb !== null && (!Number.isInteger(mb) || mb < 1 || mb > MAX_RECEIPT_MB)) {
        return res.status(400).json({ error: `El tamaño máximo del comprobante va de 1 a ${MAX_RECEIPT_MB} MB.` });
    }
    const actor = actorFrom(req, access);
    const entry = {
        at: new Date().toISOString(), by: actor.name,
        // La bitácora NO guarda números de cuenta completos.
        origin: publicAccount(origin), destination: publicAccount(destination), maxReceiptMb: mb,
    };
    await db.query(
        `INSERT INTO "ExchangeConfig" ("eventId", "originAccount", "destinationAccount", "maxReceiptMb", history, "updatedBy", "updatedByName", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
         ON CONFLICT ("eventId") DO UPDATE SET "originAccount" = EXCLUDED."originAccount", "destinationAccount" = EXCLUDED."destinationAccount",
             "maxReceiptMb" = EXCLUDED."maxReceiptMb",
             history = (COALESCE("ExchangeConfig".history, '[]'::jsonb) || EXCLUDED.history),
             "updatedBy" = EXCLUDED."updatedBy", "updatedByName" = EXCLUDED."updatedByName", "updatedAt" = NOW()`,
        [eventId, JSON.stringify(origin), JSON.stringify(destination), mb, JSON.stringify([entry]), actor.id, actor.name]);
    await logExchangeEvent(null, { eventId, action: 'configuracion_actualizada', actor, payload: entry });
    const cfgRow = await readConfigRow(eventId);
    res.json({ ok: true, accounts: accountsView(cfgRow, { full: true }) });
}, 'exchangeConfig');

/** POST /admin/exchange/accesos — conceder acceso de CONSULTA a esta edición. */
export const grantAccess = withAccess(async (req, res, { access }) => {
    const eventId = await editionEventIdOf(req);
    if (!eventId) return res.status(400).json({ error: 'Abre una edición de la feria para conceder accesos.' });
    const email = clean(req.body?.email, 200).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
    await ensureExchangeSchema();
    const user = (await rowsOf('SELECT id FROM "User" WHERE lower(email) = $1 LIMIT 1', [email]))[0] || null;
    const actor = actorFrom(req, access);
    const id = randomUUID();
    const { rowCount } = await db.query(
        `INSERT INTO "ExchangeAccessGrant" (id, "eventId", "userId", email, "canDownload", note, source, "grantedBy", "grantedByName")
         VALUES ($1,$2,$3,$4,$5,$6,'panel',$7,$8)
         ON CONFLICT ("eventId", lower(email)) WHERE "revokedAt" IS NULL DO NOTHING`,
        [id, eventId, user?.id || null, email, req.body?.canDownload !== false, clean(req.body?.note, 300) || null, actor.id, actor.name]);
    if (!rowCount) return res.status(409).json({ error: 'Ese correo ya tiene un acceso vigente en esta edición.' });
    await logExchangeEvent(null, { eventId, action: 'acceso_concedido', actor, reference: email, payload: { grantId: id, canDownload: req.body?.canDownload !== false, linkedUser: Boolean(user) } });
    res.status(201).json({ ok: true, linkedUser: Boolean(user) });
}, 'exchangeConfig');

/** POST /admin/exchange/accesos/:grantId/revocar — el acceso deja de valer al instante. */
export const revokeAccess = withAccess(async (req, res, { access }) => {
    const eventId = await editionEventIdOf(req);
    const reason = clean(req.body?.reason, 300);
    if (reason.length < 5) return res.status(400).json({ error: 'Indica el motivo (queda en el historial).' });
    const actor = actorFrom(req, access);
    await ensureExchangeSchema();
    const { rows } = await db.query(
        `UPDATE "ExchangeAccessGrant" SET "revokedAt" = NOW(), "revokedBy" = $3, "revokedByName" = $4, "revokedReason" = $5
          WHERE id = $1 AND "eventId" = $2 AND "revokedAt" IS NULL RETURNING email`,
        [clean(req.params.grantId, 80), eventId, actor.id, actor.name, reason]);
    if (!rows.length) return res.status(404).json({ error: 'No hay un acceso vigente con ese identificador.' });
    await logExchangeEvent(null, { eventId, action: 'acceso_revocado', actor, reference: rows[0].email, payload: { grantId: req.params.grantId, reason } });
    res.json({ ok: true });
}, 'exchangeConfig');

// ── Resumen (KPIs) ─────────────────────────────────────────────────────────

/** GET /admin/exchange/resumen — los indicadores sobre los filtros activos. */
export const getSummary = withAccess(async (req, res, { access }) => {
    const { clause, params } = buildFilters(req.query);
    const { rows } = await db.query(`SELECT * FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" DESC LIMIT 5000`, params);
    const ex = await loadExchangeFor(rows);
    const projects = rows.map(r => ({ id: r.id, exchange: ex.byId.get(String(r.id)) || null, anchor: ex.byId.get(String(r.id))?.anchor !== false }));
    // Cada operación UNA vez, aunque cubra varios proyectos de la vista.
    const counted = new Set(projects.flatMap(p => (p.anchor ? p.exchange?.operationKeys || [] : [])));
    const totals = exchangeTotals(projects, ex.operations, { counted: [...counted] });
    const porEstado = {};
    for (const p of projects) {
        const st = p.exchange?.state || 'no_aplica';
        porEstado[st] = (porEstado[st] || 0) + 1;
    }
    porEstado.comprobante = projects.filter(p => p.exchange?.hasReceipt).length;
    res.json({ totals, porEstado, proyectos: rows.length, capabilities: capabilitiesOf(access) });
}, 'exchangeView');

// ── El detalle de un proyecto (el visor) ────────────────────────────────────

const projectLabel = (s) => (s ? { id: s.id, publicRef: s.publicRef, projectName: s.projectName, clubName: s.clubName } : null);

/** GET /admin/exchange/postulaciones/:id */
export const getProjectExchange = withAccess(async (req, res, { access }) => {
    await ensureExchangeSchema();
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [clean(req.params.id, 80)]);
    const row = rows[0];
    const eventId = await editionEventIdOf(req);
    // ⚠️ Fuera de la edición, el proyecto «no existe» (no se confirma que exista).
    if (!row || (access.role === 'exchange_viewer' ? row.eventId !== eventId : (eventId && row.eventId && row.eventId !== eventId))) {
        return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    const ex = await loadExchangeFor([row]);
    const x = ex.byId.get(String(row.id));
    const anchorId = x?.via?.id || row.id;
    const anchorRow = anchorId === row.id ? row : (await rowsOf('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [anchorId]))[0] || row;
    const cfgRow = await readConfigRow(eventId);

    const operations = [];
    for (const key of x?.operationKeys || []) {
        const op = ex.operations[key];
        if (!op) continue;
        const scope = await operationScope(key);
        // El administrador del evento no ve una operación que toque otra edición.
        if (!scopeAllowed(scope, { access, eventId })) continue;
        const recon = op._recon;
        const docs = await rowsOf(`SELECT id, kind, "fileName", mime, bytes, note, "uploadedByName", "uploadedAt", "retiredAt", "retiredReason"
                                     FROM "ExchangeDocument" WHERE "operationKey" = $1 ORDER BY "uploadedAt" ASC`, [key]);
        const bovedaFiles = receiptFilesOf(op._batch && receiptFilesOf(op._batch).length ? op._batch : (op._allocations.find(a => receiptFilesOf(a).length) || {}))
            .map((f, index) => ({ index, name: f.name, mime: f.mime, bytes: f.bytes }));
        const first = op._batch || op._allocations[0] || {};
        operations.push({
            key, kind: op.kind, status: op.status, statusLabel: op.statusLabel, reversed: op.reversed,
            currency: op.currency, allocated: op.allocated, allocationsCount: op.allocationsCount, projectsCount: op.projectsCount,
            hasReceipt: op.hasReceipt, reference: op.reference, transferDate: op.transferDate,
            received: op.received, receivedCurrency: op.receivedCurrency, difference: op.difference,
            reconciledAt: op.reconciledAt, reconciledByName: op.reconciledByName, statusNote: recon?.statusNote || null,
            beneficiary: first.beneficiary || null, method: first.method || null,
            registeredAt: iso(first.createdAt || first.disbursedAt), registeredByName: first.createdByName || null,
            bovedaNotes: access.exchangeManage ? (first.notes || null) : null,
            data: recon ? {
                sentAmount: recon.sentAmount, sentCurrency: recon.sentCurrency, receivedAmount: recon.receivedAmount,
                receivedCurrency: recon.receivedCurrency, exchangeRate: recon.exchangeRate, rateSource: recon.rateSource,
                feeAmount: recon.feeAmount, feeCurrency: recon.feeCurrency, bankReference: recon.bankReference,
                transferDate: recon.transferDate, notes: recon.notes, version: recon.version,
                updatedByName: recon.updatedByName || recon.createdByName || null, updatedAt: recon.updatedAt,
            } : null,
            accounts: {
                origin: recon?.originAccount ? publicAccount(recon.originAccount, { full: !!access.exchangeConfig }) : accountsView(cfgRow, { full: !!access.exchangeConfig }).origin,
                destination: recon?.destinationAccount ? publicAccount(recon.destinationAccount, { full: !!access.exchangeConfig }) : accountsView(cfgRow, { full: !!access.exchangeConfig }).destination,
            },
            // Las asignaciones de la operación a cada proyecto: un comprobante
            // compartido aparece aquí UNA vez con todos sus proyectos.
            allocations: op._allocations.map(a => ({
                id: a.id, amount: round2(a.amount), currency: String(a.currency || '').toUpperCase(),
                status: a.status === 'reversado' ? 'reversado' : 'activa', reversedReason: a.reversedReason || null,
                project: projectLabel(scope?.subByPayment.get(a.paymentId)),
                isThis: scope?.subByPayment.get(a.paymentId)?.id === anchorRow.id,
            })),
            bovedaFiles,
            documents: docs.map(d => ({ ...d, uploadedAt: iso(d.uploadedAt), retiredAt: iso(d.retiredAt), kindLabel: EXCHANGE_DOC_KINDS.find(k => k.key === d.kind)?.label || d.kind })),
        });
    }

    res.json({
        project: {
            id: row.id, publicRef: row.publicRef, projectName: row.projectName, clubName: row.clubName, district: row.district,
            paymentStatus: row.status, paymentView: paymentStatusLabel(paymentStatusOf(row)), paidAt: iso(row.paidAt),
            paymentOrigin: row.paymentConfirmationOrigin || null,
            coveredBy: x?.via ? { id: x.via.id, publicRef: x.via.publicRef } : null,
            anchorRef: anchorRow.publicRef,
        },
        exchange: compactExchange(x),
        operations,
        history: await projectHistory(anchorRow, ex.operations, (x?.operationKeys || []).filter(k => operations.some(o => o.key === k))),
        reconLabels: RECON_LABELS,
        docKinds: EXCHANGE_DOC_KINDS,
        accounts: accountsView(cfgRow, { full: !!access.exchangeConfig }),
        capabilities: capabilitiesOf(access),
    });
}, 'exchangeView');

// ── El comprobante: enlace firmado, auditado ───────────────────────────────

/**
 * GET /admin/exchange/operaciones/:opKey/archivo?fuente=boveda&indice=0
 *     GET …?fuente=exchange&doc=<id>  [&descargar=1]
 *
 * ⚠️ Nunca viaja la clave de S3: un enlace firmado de 5 minutos, pedido otra
 * vez cada vez (y cada vez vuelve a pasar por el permiso). Cada consulta y
 * cada descarga quedan en el historial.
 */
export const getOperationFile = withAccess(async (req, res, { access }) => {
    const ctx = await loadScoped(req, res, access);
    if (!ctx) return;
    const download = String(req.query?.descargar || '') === '1';
    if (download && !access.exchangeDownload) return res.status(403).json({ error: 'Tu acceso permite consultar el comprobante, no descargarlo.' });
    let file = null;
    if (String(req.query?.fuente) === 'exchange') {
        const doc = (await rowsOf('SELECT * FROM "ExchangeDocument" WHERE id = $1 AND "operationKey" = $2', [clean(req.query?.doc, 80), ctx.opKey]))[0];
        if (doc) file = { key: doc.storageKey, name: doc.fileName, mime: doc.mime, bytes: doc.bytes };
    } else {
        const fuente = ctx.scope.batch && receiptFilesOf(ctx.scope.batch).length ? ctx.scope.batch : ctx.scope.allocations.find(a => receiptFilesOf(a).length);
        const files = fuente ? receiptFilesOf(fuente) : [];
        file = files[Math.max(0, Number(req.query?.indice) || 0)] || null;
    }
    if (!file) return res.status(404).json({ error: 'Esta operación no tiene ese comprobante.' });
    const url = await signedReceiptUrl(file.key, { seconds: 300, download, filename: file.name });
    if (!url) return res.status(503).json({ error: 'No se pudo firmar el enlace del comprobante. Intenta de nuevo.' });
    await logExchangeEvent(null, {
        eventId: ctx.eventId, operationKey: ctx.opKey, action: download ? 'comprobante_descargado' : 'comprobante_consultado',
        actor: actorFrom(req, access), reference: file.name,
    }).catch(() => {});
    res.json({ url, name: file.name, mime: file.mime, bytes: file.bytes, expiresInSeconds: 300 });
}, 'exchangeView');

// ── Soportes propios de Exchange ───────────────────────────────────────────

/** POST /admin/exchange/operaciones/:opKey/documentos/url — subida prefirmada (privada). */
export const presignDocument = withAccess(async (req, res, { access }) => {
    const ctx = await loadScoped(req, res, access);
    if (!ctx) return;
    const cfgRow = await readConfigRow(ctx.eventId);
    const maxMb = accountsView(cfgRow).maxReceiptMb;
    if (Number(req.body?.size) > maxMb * 1024 * 1024) return res.status(413).json({ error: `El soporte supera el máximo de ${maxMb} MB.` });
    const r = await presignPrivateReceiptUpload({
        prefix: `${EXCHANGE_PREFIX}/${operationSlug(ctx.opKey)}`,
        contentType: clean(req.body?.contentType, 100), filename: clean(req.body?.filename, 200), size: Number(req.body?.size) || 0,
    });
    if (!r.ok) return res.status(400).json({ error: r.errores?.[0] || 'No se pudo preparar la subida.' });
    res.json({ key: r.key, uploadUrl: r.uploadUrl, contentType: r.contentType });
}, 'exchangeManage');

/** POST /admin/exchange/operaciones/:opKey/documentos — reclama el objeto subido (validado por sus bytes). */
export const attachDocument = withAccess(async (req, res, { access }) => {
    const ctx = await loadScoped(req, res, access);
    if (!ctx) return;
    const kind = isDocKind(req.body?.kind) ? req.body.kind : 'otro';
    const verified = await verifyPrivateReceipt({ key: req.body?.key, name: req.body?.name }, `${EXCHANGE_PREFIX}/${operationSlug(ctx.opKey)}`);
    if (!verified) return res.status(400).json({ error: 'Adjunta el archivo.' });
    if (!verified.ok) return res.status(422).json({ error: verified.error });
    const cfgRow = await readConfigRow(ctx.eventId);
    const maxMb = accountsView(cfgRow).maxReceiptMb;
    if (verified.bytes > maxMb * 1024 * 1024) return res.status(413).json({ error: `El soporte supera el máximo de ${maxMb} MB.` });
    const actor = actorFrom(req, access);
    const id = randomUUID();
    const { rowCount } = await db.query(
        `INSERT INTO "ExchangeDocument" (id, "operationKey", "eventId", kind, "storageKey", "fileName", mime, bytes, note, "uploadedBy", "uploadedByName")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT ("storageKey") DO NOTHING`,
        [id, ctx.opKey, ctx.eventId, kind, verified.key, verified.name, verified.mime, verified.bytes, clean(req.body?.note, 500) || null, actor.id, actor.name]);
    if (!rowCount) return res.status(409).json({ error: 'Ese archivo ya está adjunto.' });
    await logExchangeEvent(null, { eventId: ctx.eventId, operationKey: ctx.opKey, action: 'documento_cargado', actor, reference: verified.name, payload: { docId: id, kind, mime: verified.mime, bytes: verified.bytes } });
    res.status(201).json({ ok: true, id });
}, 'exchangeManage');

/** POST /admin/exchange/documentos/:docId/retirar — no se borra: se retira con motivo. */
export const retireDocument = withAccess(async (req, res, { access }) => {
    const reason = clean(req.body?.reason, 300);
    if (reason.length < 5) return res.status(400).json({ error: 'Indica el motivo (queda en el historial).' });
    const doc = (await rowsOf('SELECT * FROM "ExchangeDocument" WHERE id = $1 AND "retiredAt" IS NULL', [clean(req.params.docId, 80)]))[0];
    if (!doc) return res.status(404).json({ error: 'No se encontró el soporte.' });
    req.params.opKey = doc.operationKey;
    const ctx = await loadScoped(req, res, access);
    if (!ctx) return;
    const recon = (await rowsOf('SELECT status FROM "ExchangeReconciliation" WHERE "operationKey" = $1', [ctx.opKey]))[0];
    if (recon?.status === 'conciliado') return res.status(409).json({ error: 'La operación está conciliada: reabre la conciliación antes de retirar un soporte.' });
    const actor = actorFrom(req, access);
    await db.query(`UPDATE "ExchangeDocument" SET "retiredAt" = NOW(), "retiredBy" = $2, "retiredReason" = $3 WHERE id = $1 AND "retiredAt" IS NULL`, [doc.id, actor.name, reason]);
    await logExchangeEvent(null, { eventId: ctx.eventId, operationKey: ctx.opKey, action: 'documento_retirado', actor, reference: doc.fileName, payload: { docId: doc.id, reason } });
    res.json({ ok: true });
}, 'exchangeManage');

// ── Datos de la operación bancaria ─────────────────────────────────────────

/** La fila de conciliación, creándola vacía (en conciliación) si no existía. */
const ensureReconRow = async (opKey, eventId, actor, cfgRow) => {
    await db.query(
        `INSERT INTO "ExchangeReconciliation" ("operationKey", "eventId", "originAccount", "destinationAccount", "createdBy", "createdByName")
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("operationKey") DO NOTHING`,
        [opKey, eventId, cfgRow?.originAccount ? JSON.stringify(cfgRow.originAccount) : null,
            cfgRow?.destinationAccount ? JSON.stringify(cfgRow.destinationAccount) : null, actor.id, actor.name]);
    return (await db.query('SELECT * FROM "ExchangeReconciliation" WHERE "operationKey" = $1', [opKey])).rows[0];
};

const dataOf = (r = {}) => ({
    sentAmount: r.sentAmount ?? null, sentCurrency: r.sentCurrency ?? null, receivedAmount: r.receivedAmount ?? null,
    receivedCurrency: r.receivedCurrency ?? null, exchangeRate: r.exchangeRate ?? null, rateSource: r.rateSource ?? null,
    feeAmount: r.feeAmount ?? null, feeCurrency: r.feeCurrency ?? null, bankReference: r.bankReference ?? null,
    transferDate: r.transferDate ? new Date(r.transferDate).toISOString() : null, notes: r.notes ?? null,
});

/**
 * PUT /admin/exchange/operaciones/:opKey/datos
 *
 * ⚠️ UNA OPERACIÓN CONCILIADA NO SE EDITA (409): se reabre con su motivo y el
 * registro original queda en el historial. Cada cambio guarda antes/después.
 * `version` evita pisar el cambio de otra persona (409).
 */
export const saveOperationData = withAccess(async (req, res, { access }) => {
    const ctx = await loadScoped(req, res, access);
    if (!ctx) return;
    const norm = normalizeReconData(req.body || {});
    if (!norm.ok) return res.status(400).json({ error: norm.errores[0], errores: norm.errores });
    const actor = actorFrom(req, access);
    const cfgRow = await readConfigRow(ctx.eventId);
    const prev = await ensureReconRow(ctx.opKey, ctx.eventId, actor, cfgRow);
    if (prev.status === 'conciliado') return res.status(409).json({ error: 'La operación está conciliada: reabre la conciliación (con su motivo) para corregir sus datos.' });
    const expected = req.body?.version === undefined ? prev.version : Number(req.body.version);
    if (expected !== prev.version) return res.status(409).json({ error: 'Otra persona cambió estos datos mientras los editabas. Vuelve a abrir la operación.', code: 'STALE' });
    const cambios = reconDataDiff(dataOf(prev), norm.data);
    if (!cambios.length) return res.json({ ok: true, unchanged: true, version: prev.version });
    const d = norm.data;
    const { rowCount } = await db.query(
        `UPDATE "ExchangeReconciliation" SET "sentAmount"=$2, "sentCurrency"=$3, "receivedAmount"=$4, "receivedCurrency"=$5,
             "exchangeRate"=$6, "rateSource"=$7, "feeAmount"=$8, "feeCurrency"=$9, "bankReference"=$10, "transferDate"=$11,
             notes=$12, version = version + 1, "updatedBy"=$13, "updatedByName"=$14, "updatedAt"=NOW()
          WHERE "operationKey" = $1 AND version = $15 AND status <> 'conciliado'`,
        [ctx.opKey, d.sentAmount, d.sentCurrency, d.receivedAmount, d.receivedCurrency, d.exchangeRate, d.rateSource,
            d.feeAmount, d.feeCurrency, d.bankReference, d.transferDate, d.notes, actor.id, actor.name, prev.version]);
    if (!rowCount) return res.status(409).json({ error: 'Otra persona cambió estos datos mientras los editabas. Vuelve a abrir la operación.', code: 'STALE' });
    const primera = !Object.values(dataOf(prev)).some(v => v !== null);
    await logExchangeEvent(null, {
        eventId: ctx.eventId, operationKey: ctx.opKey, action: primera ? 'datos_registrados' : 'datos_corregidos',
        actor, reference: d.bankReference, payload: { cambios },
    });
    res.json({ ok: true, version: prev.version + 1, cambios: cambios.length });
}, 'exchangeManage');

// ── La conciliación ────────────────────────────────────────────────────────

/**
 * POST /admin/exchange/operaciones/:opKey/estado  { to, note }
 *
 * ⚠️ ADJUNTAR NO ES CONCILIAR: «Conciliado» lo marca un perfil con
 * `exchangeReconcile`, con comprobante y referencia, y con la explicación de
 * cualquier diferencia medible. El cambio es CONDICIONAL al estado leído
 * (dos clics no concilian dos veces). Reabrir guarda la conciliación anterior
 * completa en el historial: el registro original no se pierde.
 */
export const changeOperationStatus = withAccess(async (req, res, { access }) => {
    const ctx = await loadScoped(req, res, access);
    if (!ctx) return;
    const op = await resolvedOperation(ctx.scope);
    if (!op) return res.status(404).json({ error: 'No se encontró la operación.' });
    if (op.reversed) return res.status(409).json({ error: 'El traslado fue revertido en la Bóveda: ya no hay nada que conciliar.' });
    const actor = actorFrom(req, access);
    const cfgRow = await readConfigRow(ctx.eventId);
    const prev = await ensureReconRow(ctx.opKey, ctx.eventId, actor, cfgRow);
    const to = clean(req.body?.to, 30);
    const note = clean(req.body?.note, 1000);
    const verdict = canReconcile(prev.status, to, { hasReceipt: op.hasReceipt, reference: op.reference, note, difference: op.difference });
    if (!verdict.ok) return res.status(409).json({ error: verdict.error });
    const conciliado = to === 'conciliado';
    const { rowCount } = await db.query(
        `UPDATE "ExchangeReconciliation" SET status = $2, "statusNote" = $3,
             "reconciledAt" = ${conciliado ? 'NOW()' : 'NULL'}, "reconciledBy" = $4, "reconciledByName" = $5,
             version = version + 1, "updatedBy" = $6, "updatedByName" = $7, "updatedAt" = NOW()
          WHERE "operationKey" = $1 AND status = $8`,
        [ctx.opKey, to, note || null, conciliado ? actor.id : null, conciliado ? actor.name : null, actor.id, actor.name, prev.status]);
    if (!rowCount) return res.status(409).json({ error: 'El estado cambió mientras decidías. Vuelve a abrir la operación.', code: 'STALE' });
    const action = conciliado ? 'conciliacion_confirmada'
        : prev.status === 'conciliado' ? 'conciliacion_reabierta'
            : to === 'con_diferencia' ? 'diferencia_registrada' : 'estado_cambiado';
    await logExchangeEvent(null, {
        eventId: ctx.eventId, operationKey: ctx.opKey, action, fromState: prev.status, toState: to, actor, reference: op.reference,
        payload: {
            note: note || null, allocated: op.allocated, currency: op.currency, received: op.received, difference: op.difference,
            // Reabrir conserva la conciliación anterior COMPLETA.
            ...(prev.status === 'conciliado' ? { previous: { ...dataOf(prev), reconciledAt: iso(prev.reconciledAt), reconciledByName: prev.reconciledByName, statusNote: prev.statusNote } } : {}),
        },
    });
    res.json({ ok: true, status: to });
}, 'exchangeReconcile');

// ── Reportes ───────────────────────────────────────────────────────────────

/**
 * GET /admin/exchange/export.csv?vista=operaciones|asignaciones
 *
 * ⚠️ SIN DUPLICAR EL TOTAL DE UNA OPERACIÓN. «operaciones» = una fila por
 * operación bancaria (su total una vez); «asignaciones» = una fila por
 * proyecto dentro de cada operación (su parte, con la clave de la operación,
 * SIN repetir el total). Los comprobantes no viajan como enlace: se consultan
 * en el panel con su permiso.
 */
export const exportExchangeCsv = withAccess(async (req, res, { access }) => {
    const { clause, params } = buildFilters(req.query);
    const { rows } = await db.query(`SELECT * FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" DESC LIMIT 5000`, params);
    const ex = await loadExchangeFor(rows);
    let lista = rows;
    if (hasExchangeQuery(req.query)) {
        lista = rows.filter(r => matchesExchangeFilters(ex.byId.get(String(r.id)), req.query, { refs: ex.refsById.get(String(r.id)) || [] }));
    }
    const keys = [...new Set(lista.flatMap(r => {
        const x = ex.byId.get(String(r.id));
        return x?.anchor === false ? [] : (x?.operationKeys || []);
    }))];
    const eventId = await editionEventIdOf(req);
    const vista = String(req.query?.vista) === 'asignaciones' ? 'asignaciones' : 'operaciones';
    const lines = [];
    if (vista === 'operaciones') {
        lines.push(['Operación', 'Tipo', 'Fecha del traslado', 'Referencia bancaria', 'Moneda', 'Total asignado', 'Proyectos',
            'Importe enviado', 'Moneda enviada', 'Importe recibido', 'Moneda recibida', 'Tasa registrada', 'Fuente de la tasa',
            'Comisión', 'Moneda comisión', 'Diferencia', 'Comprobante', 'Estado de conciliación', 'Fecha de conciliación',
            'Conciliado por', 'Registrado por'].map(csvCell).join(';'));
        for (const k of keys) {
            const o = ex.operations[k];
            if (!o) continue;
            const scope = access.role === 'exchange_viewer' ? await operationScope(k) : null;
            if (scope && !scopeAllowed(scope, { access, eventId })) continue;
            const r = o._recon || {};
            const first = o._batch || o._allocations[0] || {};
            lines.push([k, o.kind, o.transferDate ? String(o.transferDate).slice(0, 10) : '', o.reference, o.currency, o.allocated, o.projectsCount,
                r.sentAmount, r.sentCurrency, r.receivedAmount, r.receivedCurrency, r.exchangeRate, r.rateSource, r.feeAmount, r.feeCurrency,
                o.difference ?? '', o.hasReceipt ? 'Sí' : 'No', o.statusLabel, o.reconciledAt ? String(o.reconciledAt).slice(0, 10) : '',
                o.reconciledByName || '', first.createdByName || ''].map(csvCell).join(';'));
        }
    } else {
        lines.push(['Operación', 'Proyecto', 'Club', 'Referencia de postulación', 'Estado del pago', 'Valor recibido',
            'Valor asignado', 'Moneda', 'Fecha del traslado', 'Referencia bancaria', 'Estado de la asignación',
            'Estado de conciliación', 'Fecha de conciliación', 'Registrado por'].map(csvCell).join(';'));
        for (const k of keys) {
            const o = ex.operations[k];
            if (!o) continue;
            const scope = await operationScope(k);
            if (!scopeAllowed(scope, { access, eventId })) continue;
            const first = o._batch || o._allocations[0] || {};
            for (const a of o._allocations) {
                const s = scope?.subByPayment.get(a.paymentId);
                const x = s ? ex.byId.get(String(s.id)) : null;
                lines.push([k, s?.projectName || '', s?.clubName || '', s?.publicRef || '', s ? paymentStatusLabel(paymentStatusOf(s)) : '',
                    x ? x.expected : '', round2(a.amount), String(a.currency || '').toUpperCase(),
                    o.transferDate ? String(o.transferDate).slice(0, 10) : '', o.reference,
                    a.status === 'reversado' ? 'Revertida' : 'Activa', o.statusLabel,
                    o.reconciledAt ? String(o.reconciledAt).slice(0, 10) : '', first.createdByName || ''].map(csvCell).join(';'));
            }
        }
    }
    await logExchangeEvent(null, { eventId, action: 'reporte_exportado', actor: actorFrom(req, access), reference: vista, payload: { filas: lines.length - 1 } }).catch(() => {});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="exchange-${vista}.csv"`);
    res.send('﻿' + lines.join('\n'));
}, 'exchangeView');

export default {
    getConfig, saveConfig, grantAccess, revokeAccess, getSummary, getProjectExchange, getOperationFile,
    presignDocument, attachDocument, retireDocument, saveOperationData, changeOperationStatus, exportExchangeCsv,
};
