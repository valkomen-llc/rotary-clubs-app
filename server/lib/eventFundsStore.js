// ════════════════════════════════════════════════════════════════════════════
// La I/O de la conciliación de inscripciones y traslados de un evento — v4.1250
//
// El criterio vive en `eventFundsSpec.js` (puro). Acá está lo que toca la base,
// S3 y Stripe. ⚠️ Sólo tablas del módulo de Eventos: `EventRegistration`,
// `EventRegistrationPayment` y las `EventFunds*`. Ni una consulta a la Bóveda.
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import pkg from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import db from './db.js';
import { s3 } from './storage.js';
import { ensureEventFundsSchema } from './ensureEventFundsSchema.js';
import {
    paymentOf, registrationTransferState, allocatedOf, eventFundTotals, isActiveTransfer, maskAccount,
} from './eventFundsSpec.js';

const { PutObjectCommand, GetObjectCommand } = pkg;
const bucket = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

/** La tabla de un módulo que este sitio nunca usó no es un error: es vacío. */
const safe = async (promise) => {
    try { return (await promise).rows; } catch (e) {
        if (e?.code === '42P01') return [];
        throw e;
    }
};

// ── Lectura ─────────────────────────────────────────────────────────────────

const REG_COLUMNS = `id, "eventId", "registrationCode", "publicRef", "firstName", "lastName", email, status,
    "categoryLabel", "clubName", district, country, currency, "chargeCurrency", "chargeAmount", "totalAmount",
    "baseAmount", "baseCurrency", pricing, "paidAt", "stripePaymentIntentId", "stripeSessionId", "createdAt", "submittedAt"`;

/**
 * Todo lo que el tablero del evento necesita, resuelto: cada inscripción con su
 * pago (proceso A) y el estado de su traslado (proceso B), los traslados con
 * sus asignaciones, comprobantes y envíos, la configuración y los totales.
 */
export const loadEventFunds = async (event, { canSeeAccount = false } = {}) => {
    await ensureEventFundsSchema();
    const eventId = event.id;
    const [regs, payments, checks, transfers, allocations, documents, notices, configRows] = await Promise.all([
        safe(db.query(`SELECT ${REG_COLUMNS} FROM "EventRegistration" WHERE "eventId" = $1`, [eventId])),
        safe(db.query(`SELECT * FROM "EventRegistrationPayment" WHERE "eventId" = $1`, [eventId])),
        safe(db.query(`SELECT * FROM "EventStripeCheck" WHERE "eventId" = $1`, [eventId])),
        safe(db.query(`SELECT * FROM "EventFundsTransfer" WHERE "eventId" = $1 ORDER BY "createdAt" DESC`, [eventId])),
        safe(db.query(`SELECT * FROM "EventFundsAllocation" WHERE "eventId" = $1`, [eventId])),
        safe(db.query(`SELECT id, "transferId", "fileName", mime, bytes, version, "isCurrent", notes, "uploadedByName", "uploadedAt"
                         FROM "EventFundsDocument" WHERE "eventId" = $1 ORDER BY version DESC`, [eventId])),
        safe(db.query(`SELECT id, "transferId", recipients, cc, subject, "documentId", state, "providerMessageId", error, "sentByName", "sentAt"
                         FROM "EventFundsNotice" WHERE "eventId" = $1 ORDER BY "sentAt" DESC`, [eventId])),
        safe(db.query(`SELECT * FROM "EventFundsConfig" WHERE "eventId" = $1`, [eventId])),
    ]);

    const transferById = Object.fromEntries(transfers.map(t => [t.id, t]));
    const allocsByReg = {};
    for (const a of allocations) {
        const t = transferById[a.transferId];
        (allocsByReg[a.registrationId] ||= []).push({
            ...a, amount: Number(a.amount), transferStatus: t?.status || 'pendiente',
            transferReference: t?.reference || null, transferDate: t?.transferDate || null, transferKind: t?.kind || null,
        });
    }
    const checkByReg = Object.fromEntries(checks.map(c => [c.registrationId, c]));

    const rows = regs.map(reg => {
        const payment = paymentOf(reg, payments, checkByReg[reg.id] || null);
        const allocs = allocsByReg[reg.id] || [];
        return {
            id: reg.id,
            code: reg.registrationCode || reg.publicRef || null,
            name: `${reg.firstName || ''} ${reg.lastName || ''}`.trim() || null,
            email: reg.email || null,
            status: reg.status,
            category: reg.categoryLabel || null,
            clubName: reg.clubName || null,
            district: reg.district || null,
            createdAt: reg.createdAt,
            payment,
            allocations: allocs,
            allocated: allocatedOf(allocs),
            confirmedAmount: allocs.filter(a => a.transferStatus === 'confirmado').reduce((s, a) => s + a.amount, 0),
            transferState: registrationTransferState(payment, allocs),
        };
    });

    const docsByTransfer = {};
    for (const d of documents) (docsByTransfer[d.transferId] ||= []).push(d);
    const noticesByTransfer = {};
    for (const n of notices) (noticesByTransfer[n.transferId] ||= []).push(n);
    const allocsByTransfer = {};
    for (const a of allocations) (allocsByTransfer[a.transferId] ||= []).push(a);
    const regById = Object.fromEntries(rows.map(r => [r.id, r]));

    const transfersOut = transfers.map(t => {
        const allocs = (allocsByTransfer[t.id] || []).map(a => ({
            registrationId: a.registrationId, amount: Number(a.amount), currency: a.currency,
            code: regById[a.registrationId]?.code || null, name: regById[a.registrationId]?.name || null,
        }));
        const asignado = Math.round(allocs.reduce((s, a) => s + a.amount, 0) * 100) / 100;
        const docs = docsByTransfer[t.id] || [];
        const ns = noticesByTransfer[t.id] || [];
        return {
            ...t,
            amount: Number(t.amount),
            allocations: allocs,
            allocated: asignado,
            difference: Math.round((Number(t.amount) - asignado) * 100) / 100,
            documents: docs,
            hasDocument: docs.some(d => d.isCurrent),
            notices: ns,
            noticesSent: ns.filter(n => n.state === 'enviado').length,
            active: isActiveTransfer(t),
        };
    });

    const cfg = configRows[0] || null;
    const config = cfg ? {
        ...cfg,
        accountNumber: canSeeAccount ? cfg.accountNumber : maskAccount(cfg.accountNumber),
        accountMasked: maskAccount(cfg.accountNumber),
        accountVisible: canSeeAccount,
    } : null;

    return {
        event: { id: event.id, title: event.title, slug: event.slug || null, clubId: event.clubId },
        config,
        registrations: rows,
        transfers: transfersOut,
        totals: eventFundTotals(rows, transfersOut),
    };
};

/**
 * El historial financiero de UNA inscripción, compuesto al leer (no se migra):
 * lo que dice el propio registro de inscripciones (creada, pago) más lo que
 * registró este módulo sobre ella y sus traslados.
 */
export const registrationHistory = async ({ eventId, registration, transferIds = [] }) => {
    const [payments, history] = await Promise.all([
        safe(db.query(`SELECT status, provider, currency, amount, "refundedAmount", "paymentIntentId", "checkoutSessionId", "chargeId", "occurredAt", "createdAt"
                         FROM "EventRegistrationPayment" WHERE "registrationId" = $1 AND status <> 'created'`, [registration.id])),
        safe(db.query(`SELECT * FROM "EventFundsHistory"
                        WHERE "eventId" = $1 AND ("registrationId" = $2 OR "transferId" = ANY($3::text[]))
                        ORDER BY "occurredAt" ASC`, [eventId, registration.id, transferIds])),
    ]);
    const out = [];
    if (registration.createdAt) out.push({ at: registration.createdAt, kind: 'inscripcion', label: 'Inscripción registrada', actor: 'Sistema' });
    for (const p of payments) {
        // v4.1251 — Desde que las inscripciones cobran por PayPal, el actor
        // sale de la fila: «confirmado por Stripe» en un pago de PayPal manda
        // a buscarlo al tablero equivocado.
        const via = p.provider === 'paypal' ? 'PayPal' : 'Stripe';
        const label = p.status === 'succeeded' ? `Pago confirmado por ${via}`
            : p.status === 'refunded' ? 'Pago reembolsado' : p.status === 'failed' ? 'Pago fallido' : `Pago: ${p.status}`;
        out.push({
            at: p.occurredAt || p.createdAt, kind: `pago_${p.status}`, label, actor: via,
            reference: p.paymentIntentId || p.chargeId || p.checkoutSessionId || null,
            detail: `${Number(p.refundedAmount ?? p.amount) || 0} ${p.currency}`,
        });
    }
    for (const h of history) {
        out.push({
            at: h.occurredAt, kind: h.kind, label: HISTORY_LABELS[h.kind] || h.kind, actor: h.actorName || 'Sistema',
            fromState: h.fromState, toState: h.toState, reference: h.reference, documentId: h.documentId,
            transferId: h.transferId, detail: h.note || null,
        });
    }
    return out.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
};

export const HISTORY_LABELS = {
    traslado_registrado: 'Traslado registrado',
    traslado_estado: 'Cambio de estado del traslado',
    traslado_editado: 'Traslado corregido',
    comprobante_adjuntado: 'Comprobante PDF adjuntado',
    comprobante_reemplazado: 'Comprobante PDF reemplazado',
    comprobante_enviado: 'Comprobante enviado por correo',
    comprobante_error: 'Error al enviar el comprobante',
    beneficiario_configurado: 'Beneficiario del evento actualizado',
    stripe_verificado: 'Pago verificado con Stripe',
};

export const recordHistory = (entry) => db.query(
    `INSERT INTO "EventFundsHistory" ("eventId", "transferId", "registrationId", kind, "fromState", "toState",
                                       "actorId", "actorName", reference, "documentId", note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [entry.eventId, entry.transferId || null, entry.registrationId || null, entry.kind, entry.fromState || null,
        entry.toState || null, entry.actorId || null, entry.actorName || null, entry.reference || null,
        entry.documentId || null, entry.note || null]
).catch(e => console.error('[eventFunds] no pude registrar el historial:', e?.message));

// ── Comprobantes en S3 (privados) ───────────────────────────────────────────

/**
 * Sube un comprobante al prefijo PRIVADO del módulo de eventos, sin ACL
 * pública y con `no-store`. Se lee SIEMPRE con un enlace firmado que caduca.
 */
export const uploadTransferPdf = async ({ clubId, eventId, transferId, buffer }) => {
    const key = `private/event-funds/${clubId || 'sin-sitio'}/${eventId}/${transferId}/${crypto.randomUUID()}.pdf`;
    await s3.send(new PutObjectCommand({
        Bucket: bucket(), Key: key, Body: buffer, ContentType: 'application/pdf', CacheControl: 'no-store',
    }));
    return key;
};

export const signedDocumentUrl = (key, fileName) => getSignedUrl(s3, new GetObjectCommand({
    Bucket: bucket(), Key: key,
    ResponseContentDisposition: `inline; filename="${String(fileName || 'comprobante.pdf').replace(/[^\w.\- ]/g, '_')}"`,
}), { expiresIn: 600 });

export const readDocument = async (key) => {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await r.Body.transformToByteArray());
};

// ── Verificación con Stripe ─────────────────────────────────────────────────

/**
 * Consulta en Stripe el PaymentIntent de cada inscripción y guarda la comisión
 * REAL, el neto y la fecha en que el dinero queda libre (balance transaction).
 * Es SÓLO lectura en Stripe: no mueve dinero. Con tope de tiempo por llamada y
 * por pasada.
 */
export const verifyWithStripe = async ({ stripe, eventId, registrations, budgetMs = 45000, actor }) => {
    const t0 = Date.now();
    const out = { revisadas: 0, verificadas: 0, errores: 0, pendientes: 0 };
    for (const reg of registrations) {
        if (Date.now() - t0 > budgetMs) { out.pendientes = registrations.length - out.revisadas; break; }
        out.revisadas += 1;
        const pi = reg.stripePaymentIntentId;
        let fila;
        try {
            const intent = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge.balance_transaction'] });
            const charge = intent?.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
            const bt = charge?.balance_transaction && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
            const div = (c) => (['jpy', 'clp', 'krw', 'vnd', 'pyg'].includes(String(c || '').toLowerCase()) ? 1 : 100);
            fila = {
                chargeId: charge?.id || null,
                balanceTxId: bt?.id || null,
                status: bt?.status || intent?.status || null,
                gross: bt ? bt.amount / div(bt.currency) : (intent?.amount_received || 0) / div(intent?.currency),
                fee: bt ? bt.fee / div(bt.currency) : null,
                net: bt ? bt.net / div(bt.currency) : null,
                currency: String(bt?.currency || intent?.currency || '').toUpperCase(),
                availableOn: bt?.available_on ? new Date(bt.available_on * 1000).toISOString() : null,
                error: null,
            };
            out.verificadas += 1;
        } catch (e) {
            out.errores += 1;
            fila = { error: String(e?.message || 'No se pudo consultar Stripe').slice(0, 300) };
        }
        await db.query(
            `INSERT INTO "EventStripeCheck" ("registrationId", "eventId", "paymentIntentId", "chargeId", "balanceTxId",
                                              status, gross, fee, net, currency, "availableOn", error, "checkedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
             ON CONFLICT ("registrationId") DO UPDATE SET
                "paymentIntentId" = EXCLUDED."paymentIntentId", "chargeId" = COALESCE(EXCLUDED."chargeId", "EventStripeCheck"."chargeId"),
                "balanceTxId" = COALESCE(EXCLUDED."balanceTxId", "EventStripeCheck"."balanceTxId"), status = EXCLUDED.status,
                gross = COALESCE(EXCLUDED.gross, "EventStripeCheck".gross), fee = COALESCE(EXCLUDED.fee, "EventStripeCheck".fee),
                net = COALESCE(EXCLUDED.net, "EventStripeCheck".net), currency = COALESCE(EXCLUDED.currency, "EventStripeCheck".currency),
                "availableOn" = COALESCE(EXCLUDED."availableOn", "EventStripeCheck"."availableOn"), error = EXCLUDED.error, "checkedAt" = NOW()`,
            [reg.id, eventId, pi, fila.chargeId || null, fila.balanceTxId || null, fila.status || null,
                fila.gross ?? null, fila.fee ?? null, fila.net ?? null, fila.currency || null, fila.availableOn || null, fila.error]
        );
        if (!fila.error) {
            await recordHistory({
                eventId, registrationId: reg.id, kind: 'stripe_verificado', actorId: actor?.id, actorName: actor?.name,
                reference: fila.balanceTxId || pi, note: fila.fee != null ? `Comisión Stripe ${fila.fee} ${fila.currency} · neto ${fila.net} ${fila.currency}` : null,
            });
        }
    }
    return out;
};
