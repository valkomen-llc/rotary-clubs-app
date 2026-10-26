// ════════════════════════════════════════════════════════════════════════════
// Conciliación de inscripciones y traslados de un evento — v4.1250
//
// /api/event-funds/*. Dominio financiero PROPIO de Eventos: pagos de las
// inscripciones (proceso A) → traslado al beneficiario del evento (proceso B,
// Concorrotarios u otro) → comprobante PDF → envío por correo → historial.
// No crea ni exige nada en la Bóveda de Fondos.
//
// Permisos (comprobados en el SERVIDOR):
//   · Ver, registrar un traslado, adjuntar y enviar: la capacidad sensible
//     `payments` del evento (`assertEventCapability`). Un evento ajeno = 404.
//   · Confirmar, rechazar o revertir un traslado, y configurar el beneficiario
//     (datos bancarios): además, un rol que aprueba (`APPROVER_ROLES`).
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import Stripe from 'stripe';
import db from '../lib/db.js';
import { assertEventCapability } from '../lib/eventAccess.js';
import EmailService from '../services/EmailService.js';
import { ensureEventFundsSchema } from '../lib/ensureEventFundsSchema.js';
import {
    loadEventFunds, registrationHistory, recordHistory, uploadTransferPdf, signedDocumentUrl, readDocument, verifyWithStripe,
} from '../lib/eventFundsStore.js';
import { auditEventVaultRows } from '../lib/eventFundsVaultAudit.js';
import {
    validateTransfer, canTransition, checkPdf, isEmail, transferEmail, paymentOf, TRANSFER_METHODS,
    TRANSFER_STATUS_LABELS, PAID_REGISTRATION_STATUSES,
} from '../lib/eventFundsSpec.js';

console.log('[event-funds] v4.1250 — conciliación de inscripciones y traslados propia de Eventos (sin la Bóveda)');

export const APPROVER_ROLES = ['administrator', 'superadmin', 'district_admin', 'club_admin'];
const isApprover = (req) => APPROVER_ROLES.includes(String(req.user?.role || ''));
const actorOf = (req) => ({ id: req.user?.id || req.user?.userId || null, name: req.user?.name || req.user?.email || null });

const parseJson = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return fallback; }
};
const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

/** El evento, si la sesión alcanza su información financiera. Si no, 404. */
const eventOr404 = async (req, res) => {
    const event = await assertEventCapability(req, req.params.eventId, 'payments');
    if (!event) { fail(res, 404, 'Evento no encontrado'); return null; }
    await ensureEventFundsSchema();
    return event;
};

const transferOf = async (eventId, transferId) => {
    const { rows } = await db.query('SELECT * FROM "EventFundsTransfer" WHERE id = $1 AND "eventId" = $2', [transferId, eventId]);
    return rows[0] || null;
};

// ── Lectura ─────────────────────────────────────────────────────────────────

export const getEventFunds = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        const data = await loadEventFunds(event, { canSeeAccount: isApprover(req) });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ...data, methods: TRANSFER_METHODS, statusLabels: TRANSFER_STATUS_LABELS, canApprove: isApprover(req) });
    } catch (e) {
        console.error('[event-funds] getEventFunds:', e);
        return fail(res, 500, 'No se pudo cargar la conciliación del evento');
    }
};

export const getRegistrationFunds = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        const data = await loadEventFunds(event, { canSeeAccount: isApprover(req) });
        const registration = data.registrations.find(r => r.id === req.params.registrationId);
        if (!registration) return fail(res, 404, 'Inscripción no encontrada');
        const transfers = data.transfers.filter(t => t.allocations.some(a => a.registrationId === registration.id));
        const history = await registrationHistory({ eventId: event.id, registration, transferIds: transfers.map(t => t.id) });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
            event: data.event, config: data.config, registration, transfers, history,
            methods: TRANSFER_METHODS, statusLabels: TRANSFER_STATUS_LABELS, canApprove: isApprover(req),
        });
    } catch (e) {
        console.error('[event-funds] getRegistrationFunds:', e);
        return fail(res, 500, 'No se pudo cargar el detalle financiero de la inscripción');
    }
};

// ── Beneficiario del evento ─────────────────────────────────────────────────

export const saveConfig = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        if (!isApprover(req)) return fail(res, 403, 'Sólo un administrador del sitio puede configurar el beneficiario y sus datos bancarios.');
        const b = req.body || {};
        const nombre = clean(b.beneficiaryName, 200);
        if (!nombre) return fail(res, 400, 'Indica el nombre del beneficiario.');
        const recipients = (Array.isArray(b.recipients) ? b.recipients : [])
            .map(r => ({ name: clean(r?.name, 120), email: clean(r?.email, 200).toLowerCase(), role: clean(r?.role, 80) }))
            .filter(r => r.email);
        const malos = recipients.filter(r => !isEmail(r.email));
        if (malos.length) return fail(res, 400, `Correo no válido: ${malos.map(r => r.email).join(', ')}`);
        // La cuenta enmascarada que devuelve el panel («****4521») no pisa la real.
        const cuenta = clean(b.accountNumber, 80);
        const actor = actorOf(req);
        await db.query(
            `INSERT INTO "EventFundsConfig" ("eventId", "clubId", "beneficiaryName", "bankName", "accountNumber", "accountType",
                                             "accountCurrency", "beneficiaryTaxId", notes, recipients, "updatedBy", "updatedByName", "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
             ON CONFLICT ("eventId") DO UPDATE SET
                "beneficiaryName" = EXCLUDED."beneficiaryName", "bankName" = EXCLUDED."bankName",
                "accountNumber" = CASE WHEN EXCLUDED."accountNumber" IS NULL OR EXCLUDED."accountNumber" LIKE '****%'
                                       THEN "EventFundsConfig"."accountNumber" ELSE EXCLUDED."accountNumber" END,
                "accountType" = EXCLUDED."accountType", "accountCurrency" = EXCLUDED."accountCurrency",
                "beneficiaryTaxId" = EXCLUDED."beneficiaryTaxId", notes = EXCLUDED.notes, recipients = EXCLUDED.recipients,
                "updatedBy" = EXCLUDED."updatedBy", "updatedByName" = EXCLUDED."updatedByName", "updatedAt" = NOW()`,
            [event.id, event.clubId, nombre, clean(b.bankName, 160) || null, cuenta || null, clean(b.accountType, 60) || null,
                clean(b.accountCurrency, 3).toUpperCase() || null, clean(b.beneficiaryTaxId, 60) || null, clean(b.notes, 2000) || null,
                JSON.stringify(recipients), actor.id, actor.name]
        );
        await recordHistory({ eventId: event.id, kind: 'beneficiario_configurado', actorId: actor.id, actorName: actor.name, note: nombre });
        return res.json({ ok: true });
    } catch (e) {
        console.error('[event-funds] saveConfig:', e);
        return fail(res, 500, 'No se pudo guardar el beneficiario');
    }
};

// ── Verificación con Stripe ─────────────────────────────────────────────────

export const verifyStripe = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        if (!process.env.STRIPE_SECRET_KEY) return fail(res, 503, 'Stripe no está configurado en este entorno.');
        const pedidas = Array.isArray(req.body?.registrationIds) ? req.body.registrationIds.map(String) : null;
        const { rows } = await db.query(
            `SELECT id, "stripePaymentIntentId" FROM "EventRegistration"
              WHERE "eventId" = $1 AND status = ANY($2) AND "stripePaymentIntentId" IS NOT NULL`,
            [event.id, PAID_REGISTRATION_STATUSES]
        );
        const objetivo = pedidas ? rows.filter(r => pedidas.includes(r.id)) : rows;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 1 });
        const resumen = await verifyWithStripe({ stripe, eventId: event.id, registrations: objetivo.slice(0, 60), actor: actorOf(req) });
        return res.json({ ok: true, ...resumen, total: objetivo.length });
    } catch (e) {
        console.error('[event-funds] verifyStripe:', e);
        return fail(res, 500, 'No se pudo verificar con Stripe');
    }
};

// ── Traslados ───────────────────────────────────────────────────────────────

const pdfDe = (file) => {
    if (!file) return { ok: true, file: null };
    const juicio = checkPdf({ mime: file.mimetype, bytes: file.size || file.buffer?.length || 0, head: file.buffer?.subarray(0, 5).toString('latin1') });
    return juicio.ok ? { ok: true, file } : { ok: false, errores: juicio.errores };
};

/**
 * Registra un traslado INDIVIDUAL o CONSOLIDADO.
 *
 * ⚠️ En una transacción con un candado por evento: dos registros simultáneos
 * no pueden asignar dos veces la misma inscripción. La validación se repite
 * ADENTRO, con lo que hay en la base en ese instante.
 * ⚠️ Registrar un traslado NO mueve dinero: deja constancia de una operación
 * hecha por fuera (banco o payout de Stripe).
 */
export const createTransfer = async (req, res) => {
    try {
        return await crearTraslado(req, res);
    } catch (e) {
        console.error('[event-funds] createTransfer:', e);
        return res.headersSent ? undefined : fail(res, 500, 'No se pudo registrar el traslado');
    }
};

const crearTraslado = async (req, res) => {
    const event = await eventOr404(req, res);
    if (!event) return;
    const b = req.body || {};
    const allocations = (parseJson(b.allocations, []) || []).map(a => ({ registrationId: String(a?.registrationId || ''), amount: Number(a?.amount) }));
    const kind = b.kind === 'consolidado' ? 'consolidado' : 'individual';
    const currency = clean(b.currency, 3).toUpperCase();
    const amount = Number(b.amount);
    const estadoInicial = ['pendiente', 'registrado', 'pendiente_verificacion'].includes(b.status) ? b.status : 'pendiente';
    const pdf = pdfDe(req.file);
    if (!pdf.ok) return fail(res, 400, pdf.errores.join(' '), { errores: pdf.errores });
    const actor = actorOf(req);
    const id = crypto.randomUUID();

    const { rows: cfgRows } = await db.query('SELECT "beneficiaryName" FROM "EventFundsConfig" WHERE "eventId" = $1', [event.id]);
    const beneficiario = cfgRows[0]?.beneficiaryName || null;
    if (!beneficiario) return fail(res, 409, 'Configura primero el beneficiario del evento (pestaña «Conciliación de inscripciones» → Beneficiario).');

    // El PDF se sube ANTES de la transacción: si S3 falla no queda un traslado
    // a medias, y si la transacción falla el objeto queda huérfano pero privado.
    let s3Key = null;
    if (pdf.file) {
        try { s3Key = await uploadTransferPdf({ clubId: event.clubId, eventId: event.id, transferId: id, buffer: pdf.file.buffer }); }
        catch (e) { return fail(res, 502, `No se pudo guardar el comprobante: ${e?.message || 'error de almacenamiento'}`); }
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event-funds:${event.id}`]);
        const ids = allocations.map(a => a.registrationId).filter(Boolean);
        const [regs, pays, checks, allocs] = await Promise.all([
            client.query(`SELECT * FROM "EventRegistration" WHERE "eventId" = $1 AND id = ANY($2::text[])`, [event.id, ids]),
            client.query(`SELECT * FROM "EventRegistrationPayment" WHERE "eventId" = $1 AND "registrationId" = ANY($2::text[])`, [event.id, ids]),
            client.query(`SELECT * FROM "EventStripeCheck" WHERE "registrationId" = ANY($1::text[])`, [ids]),
            client.query(`SELECT a."registrationId", a.amount, a."transferId", t.status AS "transferStatus"
                            FROM "EventFundsAllocation" a JOIN "EventFundsTransfer" t ON t.id = a."transferId"
                           WHERE a."eventId" = $1 AND a."registrationId" = ANY($2::text[])`, [event.id, ids]),
        ]);
        const registrations = Object.fromEntries(regs.rows.map(r => [r.id, r]));
        const checkBy = Object.fromEntries(checks.rows.map(c => [c.registrationId, c]));
        const paymentsByRegistration = Object.fromEntries(regs.rows.map(r => [r.id, paymentOf(r, pays.rows, checkBy[r.id] || null)]));
        const allocationsByRegistration = {};
        for (const a of allocs.rows) (allocationsByRegistration[a.registrationId] ||= []).push(a);
        const juicio = validateTransfer({ currency, amount, allocations, kind }, { registrations, paymentsByRegistration, allocationsByRegistration });
        if (!juicio.ok) {
            await client.query('ROLLBACK');
            return fail(res, 400, juicio.errores.join(' '), { errores: juicio.errores });
        }
        await client.query(
            `INSERT INTO "EventFundsTransfer" (id, "eventId", "clubId", kind, "beneficiaryName", currency, amount, "transferDate",
                                               reference, method, notes, status, "createdBy", "createdByName")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [id, event.id, event.clubId, kind, beneficiario, currency, amount, clean(b.transferDate, 10) || null,
                clean(b.reference, 160) || null, TRANSFER_METHODS.some(m => m.id === b.method) ? b.method : null,
                clean(b.notes, 2000) || null, estadoInicial, actor.id, actor.name]
        );
        for (const a of allocations) {
            await client.query(
                `INSERT INTO "EventFundsAllocation" ("transferId", "eventId", "registrationId", amount, currency) VALUES ($1,$2,$3,$4,$5)`,
                [id, event.id, a.registrationId, a.amount, currency]
            );
        }
        let documentId = null;
        if (s3Key) {
            const d = await client.query(
                `INSERT INTO "EventFundsDocument" ("transferId", "eventId", "s3Key", "fileName", mime, bytes, version, "isCurrent", notes, "uploadedBy", "uploadedByName")
                 VALUES ($1,$2,$3,$4,'application/pdf',$5,1,true,$6,$7,$8) RETURNING id`,
                [id, event.id, s3Key, clean(pdf.file.originalname, 200) || 'comprobante.pdf', pdf.file.size || pdf.file.buffer.length,
                    clean(b.documentNotes, 1000) || null, actor.id, actor.name]
            );
            documentId = d.rows[0].id;
        }
        await client.query('COMMIT');

        await recordHistory({
            eventId: event.id, transferId: id, kind: 'traslado_registrado', toState: estadoInicial, actorId: actor.id, actorName: actor.name,
            reference: clean(b.reference, 160) || null,
            note: `${kind === 'consolidado' ? 'Traslado consolidado' : 'Traslado individual'} de ${amount} ${currency} a ${beneficiario} · ${allocations.length} inscripción(es)`
                + (Math.abs(juicio.diferencia) > 0.005 ? ` · diferencia por conciliar ${juicio.diferencia} ${currency}` : ''),
        });
        if (documentId) {
            await recordHistory({ eventId: event.id, transferId: id, kind: 'comprobante_adjuntado', actorId: actor.id, actorName: actor.name, documentId, note: clean(pdf.file.originalname, 200) });
        }
        return res.status(201).json({ ok: true, id, diferencia: juicio.diferencia });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('[event-funds] createTransfer:', e);
        return fail(res, 500, 'No se pudo registrar el traslado');
    } finally {
        client.release();
    }
};

/** Cambiar el estado (con sus reglas) o corregir los datos de la operación. */
export const updateTransfer = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        const t = await transferOf(event.id, req.params.transferId);
        if (!t) return fail(res, 404, 'Traslado no encontrado');
        const b = req.body || {};
        const actor = actorOf(req);

        if (b.status) {
            const to = String(b.status);
            if (['confirmado', 'rechazado', 'revertido'].includes(to) && !isApprover(req)) {
                return fail(res, 403, 'Confirmar, rechazar o revertir un traslado lo hace un administrador del sitio.');
            }
            const { rows: docs } = await db.query('SELECT 1 FROM "EventFundsDocument" WHERE "transferId" = $1 AND "isCurrent" = true LIMIT 1', [t.id]);
            const reference = b.reference !== undefined ? clean(b.reference, 160) : t.reference;
            const juicio = canTransition(t.status, to, { hasDocument: docs.length > 0, reference, reason: b.reason });
            if (!juicio.ok) return fail(res, 409, juicio.error);
            const { rowCount } = await db.query(
                `UPDATE "EventFundsTransfer"
                    SET status = $1, "statusReason" = $2, reference = $3, "updatedAt" = NOW(),
                        "confirmedBy" = CASE WHEN $1 = 'confirmado' THEN $4 ELSE "confirmedBy" END,
                        "confirmedByName" = CASE WHEN $1 = 'confirmado' THEN $5 ELSE "confirmedByName" END,
                        "confirmedAt" = CASE WHEN $1 = 'confirmado' THEN NOW() ELSE "confirmedAt" END
                  WHERE id = $6 AND status = $7`,
                [to, clean(b.reason, 1000) || null, reference || null, actor.id, actor.name, t.id, t.status]
            );
            // Otro cambio se adelantó: se dice en vez de pisarlo.
            if (!rowCount) return fail(res, 409, 'El traslado cambió mientras tanto. Vuelve a cargarlo.');
            await recordHistory({
                eventId: event.id, transferId: t.id, kind: 'traslado_estado', fromState: t.status, toState: to,
                actorId: actor.id, actorName: actor.name, reference, note: clean(b.reason, 1000) || null,
            });
            return res.json({ ok: true, status: to });
        }

        if (t.status === 'confirmado' || t.status === 'rechazado' || t.status === 'revertido') {
            return fail(res, 409, 'Un traslado confirmado o cerrado no se edita: revértelo con su motivo y registra uno nuevo.');
        }
        const cambios = {
            reference: b.reference !== undefined ? clean(b.reference, 160) || null : t.reference,
            transferDate: b.transferDate !== undefined ? clean(b.transferDate, 10) || null : t.transferDate,
            method: b.method !== undefined ? (TRANSFER_METHODS.some(m => m.id === b.method) ? b.method : null) : t.method,
            notes: b.notes !== undefined ? clean(b.notes, 2000) || null : t.notes,
        };
        await db.query(
            `UPDATE "EventFundsTransfer" SET reference = $1, "transferDate" = $2, method = $3, notes = $4, "updatedAt" = NOW() WHERE id = $5`,
            [cambios.reference, cambios.transferDate, cambios.method, cambios.notes, t.id]
        );
        await recordHistory({ eventId: event.id, transferId: t.id, kind: 'traslado_editado', actorId: actor.id, actorName: actor.name, reference: cambios.reference });
        return res.json({ ok: true });
    } catch (e) {
        console.error('[event-funds] updateTransfer:', e);
        return fail(res, 500, 'No se pudo actualizar el traslado');
    }
};

// ── Comprobantes ────────────────────────────────────────────────────────────

/** Adjunta o REEMPLAZA (nueva versión; la anterior queda en el historial). */
export const uploadDocument = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        const t = await transferOf(event.id, req.params.transferId);
        if (!t) return fail(res, 404, 'Traslado no encontrado');
        if (!req.file) return fail(res, 400, 'Adjunta el comprobante en PDF.');
        const pdf = pdfDe(req.file);
        if (!pdf.ok) return fail(res, 400, pdf.errores.join(' '), { errores: pdf.errores });
        const actor = actorOf(req);
        const key = await uploadTransferPdf({ clubId: event.clubId, eventId: event.id, transferId: t.id, buffer: req.file.buffer });
        const { rows: prev } = await db.query('SELECT COALESCE(MAX(version), 0)::int AS v FROM "EventFundsDocument" WHERE "transferId" = $1', [t.id]);
        const version = (prev[0]?.v || 0) + 1;
        await db.query('UPDATE "EventFundsDocument" SET "isCurrent" = false WHERE "transferId" = $1', [t.id]);
        const { rows } = await db.query(
            `INSERT INTO "EventFundsDocument" ("transferId", "eventId", "s3Key", "fileName", mime, bytes, version, "isCurrent", notes, "uploadedBy", "uploadedByName")
             VALUES ($1,$2,$3,$4,'application/pdf',$5,$6,true,$7,$8,$9) RETURNING id`,
            [t.id, event.id, key, clean(req.file.originalname, 200) || 'comprobante.pdf', req.file.size || req.file.buffer.length,
                version, clean(req.body?.notes, 1000) || null, actor.id, actor.name]
        );
        await recordHistory({
            eventId: event.id, transferId: t.id, kind: version > 1 ? 'comprobante_reemplazado' : 'comprobante_adjuntado',
            actorId: actor.id, actorName: actor.name, documentId: rows[0].id, note: `${clean(req.file.originalname, 200)} (versión ${version})`,
        });
        return res.status(201).json({ ok: true, id: rows[0].id, version });
    } catch (e) {
        console.error('[event-funds] uploadDocument:', e);
        return fail(res, 500, 'No se pudo guardar el comprobante');
    }
};

/** Un enlace FIRMADO que caduca en diez minutos. La clave de S3 no sale nunca. */
export const getDocument = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        const { rows } = await db.query(
            'SELECT "s3Key", "fileName" FROM "EventFundsDocument" WHERE id = $1 AND "transferId" = $2 AND "eventId" = $3',
            [req.params.documentId, req.params.transferId, event.id]
        );
        if (!rows[0]) return fail(res, 404, 'Comprobante no encontrado');
        return res.json({ url: await signedDocumentUrl(rows[0].s3Key, rows[0].fileName), name: rows[0].fileName });
    } catch (e) {
        console.error('[event-funds] getDocument:', e);
        return fail(res, 500, 'No se pudo abrir el comprobante');
    }
};

// ── Envío del comprobante por correo ────────────────────────────────────────

const contextoCorreo = async (event, t) => {
    const [{ rows: cfg }, { rows: allocs }, { rows: docs }] = await Promise.all([
        db.query('SELECT "beneficiaryName", recipients FROM "EventFundsConfig" WHERE "eventId" = $1', [event.id]),
        db.query('SELECT COUNT(*)::int AS n FROM "EventFundsAllocation" WHERE "transferId" = $1', [t.id]),
        db.query('SELECT id, "fileName", version, "isCurrent" FROM "EventFundsDocument" WHERE "transferId" = $1 ORDER BY version DESC', [t.id]),
    ]);
    return { cfg: cfg[0] || {}, count: allocs[0]?.n || 0, docs };
};

export const previewNotice = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        const t = await transferOf(event.id, req.params.transferId);
        if (!t) return fail(res, 404, 'Traslado no encontrado');
        const { cfg, count, docs } = await contextoCorreo(event, t);
        const recipients = (parseJson(cfg.recipients, []) || []).filter(r => isEmail(r?.email));
        const correo = transferEmail({
            eventTitle: event.title, beneficiary: t.beneficiaryName || cfg.beneficiaryName, transfer: t,
            allocationsCount: count, recipientName: recipients[0]?.name || '',
        });
        return res.json({ ...correo, recipients, documents: docs });
    } catch (e) {
        console.error('[event-funds] previewNotice:', e);
        return fail(res, 500, 'No se pudo preparar el correo');
    }
};

/**
 * Envía el comprobante. Exige confirmación explícita (428 sin ella): manda un
 * documento financiero a un tercero. Idempotente por `operationKey` (la genera
 * el panel al abrir el formulario): un doble clic cae en el mismo envío.
 * «Enviado» = el proveedor ACEPTÓ el correo, no que llegó a la bandeja.
 */
export const sendNotice = async (req, res) => {
    try {
        const event = await eventOr404(req, res);
        if (!event) return;
        const t = await transferOf(event.id, req.params.transferId);
        if (!t) return fail(res, 404, 'Traslado no encontrado');
        const b = req.body || {};
        if (b.confirm !== true) return fail(res, 428, 'Falta la confirmación explícita del envío.');
        const to = [...new Set((Array.isArray(b.to) ? b.to : []).map(e => clean(e, 200).toLowerCase()).filter(Boolean))];
        const cc = [...new Set((Array.isArray(b.cc) ? b.cc : []).map(e => clean(e, 200).toLowerCase()).filter(Boolean))];
        const malos = [...to, ...cc].filter(e => !isEmail(e));
        if (!to.length) return fail(res, 400, 'Indica al menos un destinatario.');
        if (malos.length) return fail(res, 400, `Correo no válido: ${malos.join(', ')}`);
        if (to.length + cc.length > 15) return fail(res, 400, 'Máximo 15 destinatarios por envío.');

        const { cfg, count, docs } = await contextoCorreo(event, t);
        const doc = b.documentId ? docs.find(d => d.id === b.documentId) : docs.find(d => d.isCurrent);
        if (!doc) return fail(res, 409, 'Adjunta primero el comprobante PDF del traslado.');
        const plantilla = transferEmail({ eventTitle: event.title, beneficiary: t.beneficiaryName || cfg.beneficiaryName, transfer: t, allocationsCount: count });
        const subject = clean(b.subject, 250) || plantilla.subject;
        const mensaje = clean(b.message, 8000);
        const text = mensaje || plantilla.text;
        const html = mensaje
            ? `<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.55;white-space:pre-wrap">${mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
            : plantilla.html;
        const actor = actorOf(req);
        const operationKey = clean(b.operationKey, 80);

        const ins = await db.query(
            `INSERT INTO "EventFundsNotice" ("transferId", "eventId", "operationKey", recipients, cc, subject, body, "documentId", state, "sentBy", "sentByName")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'enviando',$9,$10)
             ON CONFLICT ("transferId", "operationKey") WHERE "operationKey" <> '' DO NOTHING
             RETURNING id`,
            [t.id, event.id, operationKey, JSON.stringify(to), JSON.stringify(cc), subject, text, doc.id, actor.id, actor.name]
        );
        if (!ins.rows[0]) {
            const { rows } = await db.query('SELECT id, state, error FROM "EventFundsNotice" WHERE "transferId" = $1 AND "operationKey" = $2', [t.id, operationKey]);
            return res.json({ ok: true, repetida: true, id: rows[0]?.id, state: rows[0]?.state, error: rows[0]?.error || null });
        }
        const noticeId = ins.rows[0].id;
        const { rows: docRow } = await db.query('SELECT "s3Key" FROM "EventFundsDocument" WHERE id = $1', [doc.id]);
        let resultado;
        try {
            const pdf = await readDocument(docRow[0].s3Key);
            resultado = await EmailService.sendPlatformEmail({
                to: to.join(','), cc: cc.length ? cc.join(',') : undefined, subject, html, text,
                attachments: [{ filename: doc.fileName || 'comprobante.pdf', content: pdf.toString('base64'), contentType: 'application/pdf' }],
            });
        } catch (e) {
            resultado = { success: false, error: e?.message || 'No se pudo leer el comprobante' };
        }
        const ok = resultado?.success === true;
        await db.query(
            'UPDATE "EventFundsNotice" SET state = $1, "providerMessageId" = $2, error = $3 WHERE id = $4',
            [ok ? 'enviado' : 'fallido', resultado?.messageId || resultado?.id || null, ok ? null : String(resultado?.error || 'Error del proveedor').slice(0, 500), noticeId]
        );
        await recordHistory({
            eventId: event.id, transferId: t.id, kind: ok ? 'comprobante_enviado' : 'comprobante_error', actorId: actor.id, actorName: actor.name,
            documentId: doc.id, note: ok ? `A ${[...to, ...cc].join(', ')}` : String(resultado?.error || '').slice(0, 300),
        });
        return res.json({ ok, id: noticeId, state: ok ? 'enviado' : 'fallido', error: ok ? null : resultado?.error || 'Error del proveedor' });
    } catch (e) {
        console.error('[event-funds] sendNotice:', e);
        return fail(res, 500, 'No se pudo enviar el comprobante');
    }
};

// ── Auditoría de v4.1248–v4.1249 (sólo lectura) ─────────────────────────────

export const vaultAudit = async (req, res) => {
    try {
        if (!isApprover(req)) return fail(res, 403, 'Sólo un administrador del sitio.');
        const operador = ['administrator', 'superadmin'].includes(String(req.user?.role || ''));
        const clubId = operador ? (req.query.clubId || null) : req.user?.clubId;
        const rows = await auditEventVaultRows({ clubId });
        return res.json({
            rows,
            nota: 'Movimientos que v4.1248–v4.1249 crearon en la Bóveda para pagos de inscripción. Ningún código los crea ni los lee desde v4.1250. No se borraron: revisa antes si alguno ya se giró o concilió.',
        });
    } catch (e) {
        console.error('[event-funds] vaultAudit:', e);
        return fail(res, 500, 'No se pudo auditar');
    }
};
