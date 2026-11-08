// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — la capa COMERCIAL (v4.1296.0)
//
// Planes administrables, órdenes con precio histórico, Stripe Checkout
// reutilizando la cuenta y el webhook ÚNICO de la plataforma, «guardar y
// pagar después», exoneración administrativa y limpieza de subidas huérfanas.
//
//   Participante (/mi-proyecto → «Solicitar Video Pitch»)
//     valida y guarda → elige plan (se crea la ORDEN con la fotografía del
//     precio) → «Pagar ahora» (Checkout) o «Guardar y pagar después» → vuelve
//     de Stripe: el servidor consulta la sesión y aplica el desenlace → el
//     webhook confirma, idempotente → pagado: la solicitud se ENVÍA sola.
//
// ⚠️ EL ESTADO «PAGADO» SÓLO SALE DE STRIPE. Ni el retorno del navegador ni el
// cuerpo de una petición lo deciden: `applyStripeOutcome` lee la sesión o el
// evento y escribe la orden; el webhook y la sincronización del retorno pasan
// por la misma función, y cada evento de Stripe se registra una vez
// (`VideoPitchStripeEvent`) antes de aplicarse.
//
// ⚠️ EL IMPORTE SALE DE LA ORDEN, nunca del navegador. La orden copia el precio
// de la VERSIÓN del plan en el momento de elegirlo; cambiar el catálogo no
// toca una orden existente. Cambiar de plan antes de pagar cancela la orden
// abierta (y expira su sesión) y crea otra con el precio vigente.
//
// La producción queda detrás de la compuerta comercial (`productionGate`):
// sin pago confirmado, el comité no pasa de la revisión salvo exoneración
// expresa de un administrador, que queda auditada.
// ════════════════════════════════════════════════════════════════════
import Stripe from 'stripe';
import db from '../lib/db.js';
import { readConfigForSubmission, portalLinkFor } from './projectFairController.js';
import { withAccess, actorFrom } from './projectFairAdminController.js';
import { ensureVideoPitchSchema } from '../lib/ensureVideoPitchSchema.js';
import {
    DEFAULT_PLANS, normalizePlanInput, planNeedsNewVersion, planSnapshot, OPEN_ORDER_STATUSES, ORDER_LABELS, commercialMeta,
    commercialStatusOf, canChoosePlan, toStripeAmount, fromStripeAmount, readSessionOutcome, reusableSession, formatMoney,
    DELIVERABLE_FORMATS, SUPPORTED_CURRENCIES,
} from '../lib/videoPitchCommerce.js';
import { statusMeta, validateForSubmit, normalizeAnswers, projectContextOf } from '../lib/videoPitchSpec.js';
import { deleteVideoPitchObject, videoPitchObjectExists } from '../lib/videoPitchStorage.js';
import {
    portalIdentity, participantActor, availabilityOf, loadRequest, loadSubmission, loadFiles, loadMasterAnswers, ensureDraft, logVpEvent,
    applyStatus, notifyParticipantKind, systemActor,
} from './videoPitchController.js';

console.log('[videoPitchCommerceController] v4.1296.0 cargado — planes administrables, órdenes con precio histórico, Stripe Checkout por el webhook único, pagar después, exoneración y limpieza de subidas.');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';

/**
 * El cliente de Stripe de SIEMPRE (misma clave), con una salida para las
 * pruebas: `STRIPE_API_BASE` apunta el SDK a un servidor local. En producción
 * no existe y el cliente es el normal.
 */
export const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY || 'sk_test_12345';
    const base = process.env.STRIPE_API_BASE;
    if (base) {
        const u = new URL(base);
        return new Stripe(key, { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80), protocol: u.protocol.replace(':', ''), maxNetworkRetries: 0 });
    }
    return new Stripe(key);
};

// ── Planes ───────────────────────────────────────────────────────────
const shapePlan = (p) => ({
    id: p.id, code: p.code, name: p.name, description: p.description || '', badge: p.badge || '',
    priceAmount: Number(p.priceAmount), currency: p.currency, priceLabel: formatMoney(p.priceAmount, p.currency),
    features: Array.isArray(p.features) ? p.features : [], deliverables: Array.isArray(p.deliverables) ? p.deliverables : [],
    maxDurationSec: Number(p.maxDurationSec) || 180, revisionRounds: Number(p.revisionRounds) || 0,
    sortOrder: Number(p.sortOrder) || 0, active: Boolean(p.active), currentVersionId: p.currentVersionId || null,
    updatedAt: p.updatedAt, updatedBy: p.updatedBy || null,
});

const insertVersion = async (plan, actor) => {
    const { rows } = await db.query(`
        INSERT INTO "VideoPitchPlanVersion" ("planId", "versionNumber", snapshot, "createdById", "createdByName")
        SELECT $1, COALESCE(MAX("versionNumber"), 0) + 1, $2::jsonb, $3, $4 FROM "VideoPitchPlanVersion" WHERE "planId" = $1
        RETURNING *
    `, [plan.id, JSON.stringify(planSnapshot(plan)), actor?.id || null, actor?.name || null]);
    await db.query('UPDATE "VideoPitchPlan" SET "currentVersionId" = $2 WHERE id = $1', [plan.id, rows[0].id]);
    return rows[0];
};

/** Siembra el catálogo inicial UNA vez (tabla vacía). Después manda el panel. */
export const ensurePlansSeeded = async () => {
    await ensureVideoPitchSchema();
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM "VideoPitchPlan"');
    if (rows[0].n > 0) return false;
    for (const d of DEFAULT_PLANS) {
        const { rows: ins } = await db.query(`
            INSERT INTO "VideoPitchPlan" (code, name, description, badge, "priceAmount", currency, features, deliverables, "maxDurationSec", "revisionRounds", "sortOrder", active, "updatedBy")
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,'sistema') ON CONFLICT (code) DO NOTHING RETURNING *
        `, [d.code, d.name, d.description, d.badge, d.priceAmount, d.currency, JSON.stringify(d.features), JSON.stringify(d.deliverables), d.maxDurationSec, d.revisionRounds, d.sortOrder, d.active]);
        if (ins[0]) await insertVersion(ins[0], { name: 'sistema' });
    }
    return true;
};

export const listPlans = async ({ onlyActive = false } = {}) => {
    await ensurePlansSeeded();
    const { rows } = await db.query(`SELECT * FROM "VideoPitchPlan" ${onlyActive ? 'WHERE active = TRUE' : ''} ORDER BY "sortOrder" ASC, "priceAmount" ASC`);
    return rows.map(shapePlan);
};
const loadPlan = async (idOrCode) => {
    const { rows } = await db.query('SELECT * FROM "VideoPitchPlan" WHERE id = $1 OR code = $1 LIMIT 1', [idOrCode]);
    return rows[0] || null;
};

// ── Órdenes ──────────────────────────────────────────────────────────
export const shapeOrder = (o) => (o ? {
    id: o.id, requestId: o.requestId, planId: o.planId, planVersionId: o.planVersionId || null, planCode: o.planCode, planName: o.planName,
    snapshot: o.snapshot || {}, amount: Number(o.amount), currency: o.currency, amountLabel: formatMoney(o.amount, o.currency),
    status: o.status, statusLabel: ORDER_LABELS[o.status] || o.status,
    stripeSessionId: o.stripeSessionId || null, stripePaymentIntentId: o.stripePaymentIntentId || null, stripeChargeId: o.stripeChargeId || null,
    receiptUrl: o.receiptUrl || null, paidAt: o.paidAt, failureCode: o.failureCode || null, failureMessage: o.failureMessage || null,
    refundedAmount: o.refundedAmount === null || o.refundedAmount === undefined ? null : Number(o.refundedAmount), refundedAt: o.refundedAt,
    cancelledAt: o.cancelledAt, cancelReason: o.cancelReason || null, createdAt: o.createdAt, updatedAt: o.updatedAt,
} : null);
export const loadOrder = async (id) => { if (!id) return null; const { rows } = await db.query('SELECT * FROM "VideoPitchOrder" WHERE id = $1 LIMIT 1', [id]); return rows[0] || null; };
export const loadOrders = async (requestId) => (await db.query('SELECT * FROM "VideoPitchOrder" WHERE "requestId" = $1 ORDER BY "createdAt" DESC', [requestId])).rows;
const openOrderOf = async (requestId) => {
    const { rows } = await db.query(`SELECT * FROM "VideoPitchOrder" WHERE "requestId" = $1 AND status = ANY($2::text[]) ORDER BY "createdAt" DESC LIMIT 1`, [requestId, OPEN_ORDER_STATUSES]);
    return rows[0] || null;
};
const paidOrderOf = async (requestId) => {
    const { rows } = await db.query(`SELECT * FROM "VideoPitchOrder" WHERE "requestId" = $1 AND status IN ('paid', 'refunded') ORDER BY "paidAt" DESC NULLS LAST LIMIT 1`, [requestId]);
    return rows[0] || null;
};

/** La orden que manda: la pagada si la hay; si no, la abierta. */
export const currentOrderOf = async (request) => {
    if (request?.currentOrderId) { const o = await loadOrder(request.currentOrderId); if (o) return o; }
    return (await paidOrderOf(request.id)) || (await openOrderOf(request.id));
};

/** Recalcula y guarda el estado comercial derivado en la solicitud. */
export const refreshCommercial = async (request) => {
    const order = await currentOrderOf(request);
    const status = commercialStatusOf({ request, order });
    await db.query('UPDATE "VideoPitchRequest" SET "commercialStatus" = $2, "currentOrderId" = $3, "paidAt" = $4, "updatedAt" = NOW() WHERE id = $1',
        [request.id, status, order?.id || null, order?.status === 'paid' ? order.paidAt : null]);
    return { status, order };
};

/** Lo comercial que ve el club y el comité, resuelto. */
export const commercialViewOf = async (request) => {
    const order = await currentOrderOf(request);
    const status = commercialStatusOf({ request, order });
    const meta = commercialMeta(status);
    return {
        status, label: meta.label, tone: meta.tone,
        planId: request.planId || null, order: shapeOrder(order),
        paymentWaived: Boolean(request.paymentWaived), paymentWaivedNote: request.paymentWaivedNote || null,
        canChoosePlan: canChoosePlan({ commercialStatus: status, requestStatus: request.status }),
        canPay: Boolean(order && OPEN_ORDER_STATUSES.includes(order.status)),
    };
};

const expireSessionQuietly = async (sessionId) => {
    if (!sessionId) return;
    try { await getStripe().checkout.sessions.expire(sessionId); } catch { /* ya vencida o cobrada */ }
};

/**
 * Elegir (o cambiar) el plan: deja UNA orden abierta con la fotografía del
 * precio vigente. Si ya había una abierta con otro plan, se cancela y su
 * sesión de Stripe se expira para que no se pueda pagar un importe viejo.
 */
const selectPlanFor = async ({ request, submission, planCode, actor }) => {
    const plan = await loadPlan(clean(planCode, 60));
    if (!plan || !plan.active) { const e = new Error('Ese plan no está disponible.'); e.code = 404; throw e; }
    const paid = await paidOrderOf(request.id);
    if (paid) { const e = new Error('Esta solicitud ya tiene un pago confirmado.'); e.code = 409; throw e; }
    const open = await openOrderOf(request.id);
    if (open && open.planId === plan.id && Number(open.amount) === Number(plan.priceAmount) && open.currency === plan.currency && open.status !== 'failed') {
        return { order: open, changed: false, plan };
    }
    if (open) {
        await db.query(`UPDATE "VideoPitchOrder" SET status = 'cancelled', "cancelledAt" = NOW(), "cancelReason" = $2, "updatedAt" = NOW() WHERE id = $1`,
            [open.id, open.planId === plan.id ? 'Orden rehecha con el precio vigente' : `Cambio de plan a ${plan.name}`]);
        await expireSessionQuietly(open.stripeSessionId);
    }
    const version = plan.currentVersionId ? (await db.query('SELECT * FROM "VideoPitchPlanVersion" WHERE id = $1', [plan.currentVersionId])).rows[0] : null;
    const { rows } = await db.query(`
        INSERT INTO "VideoPitchOrder" ("requestId", "submissionId", "planId", "planVersionId", "planCode", "planName", snapshot, amount, currency, status, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'pending_payment', $10::jsonb) RETURNING *
    `, [request.id, submission.id, plan.id, version?.id || null, plan.code, plan.name, JSON.stringify(planSnapshot(plan)), Number(plan.priceAmount), plan.currency,
        JSON.stringify({ planVersionNumber: version?.versionNumber || null, previousOrderId: open?.id || null })]);
    const order = rows[0];
    await db.query('UPDATE "VideoPitchRequest" SET "planId" = $2, "currentOrderId" = $3, "updatedAt" = NOW() WHERE id = $1', [request.id, plan.id, order.id]);
    await logVpEvent(request.id, {
        type: open ? 'plan_changed' : 'plan_selected',
        title: open ? `Plan cambiado a «${plan.name}» (${formatMoney(plan.priceAmount, plan.currency)})` : `Plan elegido: «${plan.name}» (${formatMoney(plan.priceAmount, plan.currency)})`,
        metadata: { orderId: order.id, planId: plan.id, planCode: plan.code, amount: Number(plan.priceAmount), currency: plan.currency, previousOrderId: open?.id || null },
        actor,
    });
    await refreshCommercial(await loadRequest(request.id));
    return { order, changed: true, plan };
};

// ── Stripe: crear sesión y aplicar desenlaces ────────────────────────
const originOf = (req, submission) => {
    const fromBody = clean(req.body?.returnUrl, 400);
    if (/^https?:\/\//.test(fromBody)) { try { return new URL(fromBody).origin; } catch { /* sigue */ } }
    const origin = String(submission?.metadata?.origin || '').replace(/\/$/, '');
    return /^https?:\/\//.test(origin) ? origin : DEFAULT_FRONTEND_URL;
};

/** Crea (o reutiliza) la Checkout Session de la orden abierta. El importe sale de la ORDEN. */
const startCheckoutFor = async ({ request, submission, order, origin, cfg, actor }) => {
    const portalPath = cfg?.portal?.path || '/mi-proyecto';
    if (order.stripeSessionId) {
        try {
            const existing = await getStripe().checkout.sessions.retrieve(order.stripeSessionId);
            const outcome = readSessionOutcome(existing);
            if (outcome === 'paid') { await applyStripeOutcome(existing, 'paid', null); return { alreadyPaid: true }; }
            if (reusableSession(existing, { amount: order.amount, currency: order.currency })) {
                // Reintentar sobre la misma sesión (tarjeta rechazada): la orden vuelve a «en proceso».
                if (order.status !== 'processing') {
                    await db.query(`UPDATE "VideoPitchOrder" SET status = 'processing', "updatedAt" = NOW() WHERE id = $1 AND status IN ('pending_payment', 'failed')`, [order.id]);
                    await refreshCommercial(await loadRequest(request.id));
                }
                return { url: existing.url, sessionId: existing.id, reused: true };
            }
            if (outcome === 'open') await expireSessionQuietly(existing.id);
        } catch (e) { console.warn('[video-pitch-commerce] no pude leer la sesión anterior:', e?.message); }
    }
    const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: submission.email,
        client_reference_id: order.id,
        line_items: [{
            price_data: {
                currency: String(order.currency).toLowerCase(),
                product_data: { name: `${order.planName} — Video Pitch Profesional`.slice(0, 250), description: `Proyecto «${submission.projectName}» · ${submission.clubName} · Solicitud ${request.number || ''}`.slice(0, 500) },
                unit_amount: toStripeAmount(order.amount, order.currency),
            },
            quantity: 1,
        }],
        success_url: `${origin}${portalPath}?videoPitch=1&vp_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${portalPath}?videoPitch=1&vp_pago=cancelado`,
        payment_intent_data: { metadata: { type: 'video_pitch_order', videoPitchOrderId: order.id, videoPitchRequestId: request.id, publicRef: submission.publicRef || '' } },
        // ⚠️ Sin `submissionId` en la metadata: el webhook de la plataforma
        // enruta a la Feria todo lo que trae esa clave.
        metadata: {
            type: 'video_pitch_order', videoPitchOrderId: order.id, videoPitchRequestId: request.id,
            publicRef: submission.publicRef || '', planCode: order.planCode || '', planVersionId: order.planVersionId || '',
            amount: String(order.amount), currency: order.currency, clubName: String(submission.clubName || '').slice(0, 150),
        },
    }, { idempotencyKey: `vp-order-${order.id}-${Date.now()}` });
    await db.query(`UPDATE "VideoPitchOrder" SET "stripeSessionId" = $2, status = 'processing', "updatedAt" = NOW() WHERE id = $1`, [order.id, session.id]);
    await logVpEvent(request.id, { type: 'checkout_started', title: `Pago iniciado en Stripe (${formatMoney(order.amount, order.currency)})`, metadata: { orderId: order.id, sessionId: session.id }, actor, visibility: 'internal' });
    await refreshCommercial(await loadRequest(request.id));
    return { url: session.url, sessionId: session.id, reused: false };
};

/** Registra un evento de Stripe UNA vez. Devuelve false si ya se había aplicado. */
const recordEvent = async (event, orderId) => {
    if (!event?.id) return true;
    try {
        const { rowCount } = await db.query(`
            INSERT INTO "VideoPitchStripeEvent" ("stripeEventId", type, "orderId", "objectId", payload)
            VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT ("stripeEventId") DO NOTHING
        `, [event.id, event.type, orderId || null, event?.data?.object?.id || null, JSON.stringify(event.data?.object || {}).slice(0, 60000)]);
        return rowCount > 0;
    } catch (e) { console.warn('[video-pitch-commerce] no pude registrar el evento de Stripe:', e?.message); return true; }
};

const orderFromStripeObject = async (object) => {
    const id = object?.metadata?.videoPitchOrderId || object?.client_reference_id || null;
    if (id) { const o = await loadOrder(id); if (o) return o; }
    const sessionId = object?.object === 'checkout.session' ? object.id : null;
    const intentId = object?.object === 'payment_intent' ? object.id : (typeof object?.payment_intent === 'string' ? object.payment_intent : object?.payment_intent?.id || null);
    const { rows } = await db.query(`SELECT * FROM "VideoPitchOrder" WHERE ($1::text IS NOT NULL AND "stripeSessionId" = $1) OR ($2::text IS NOT NULL AND "stripePaymentIntentId" = $2) LIMIT 1`, [sessionId, intentId]);
    return rows[0] || null;
};

/**
 * Aplica a la orden lo que Stripe dice. ES LA ÚNICA FUNCIÓN que escribe
 * `paid`, `failed`, `refunded` o `pending` tras un cobro. La llaman el webhook
 * (con su evento, registrado antes) y la sincronización del retorno (con la
 * sesión recién leída de Stripe, sin evento). Idempotente: una orden pagada no
 * vuelve a pagarse ni a avisar.
 */
export const applyStripeOutcome = async (object, kind, event = null) => {
    await ensureVideoPitchSchema();
    const order = await orderFromStripeObject(object);
    if (!order) return { applied: false, reason: 'orden no encontrada' };
    if (event && !(await recordEvent(event, order.id))) return { applied: false, reason: 'evento ya procesado' };
    const request = await loadRequest(order.requestId);
    const submission = request ? await loadSubmission(request.submissionId) : null;
    const actor = systemActor('Stripe');
    const intentId = object?.object === 'payment_intent' ? object.id : (typeof object?.payment_intent === 'string' ? object.payment_intent : object?.payment_intent?.id || null);

    if (kind === 'paid') {
        if (order.status === 'paid') return { applied: false, reason: 'ya pagada' };
        // Seguridad extra: el importe cobrado tiene que ser el de la orden.
        const charged = object?.amount_total ?? object?.amount_received ?? object?.amount;
        const currency = String(object?.currency || order.currency).toUpperCase();
        if (charged !== undefined && charged !== null && (Number(charged) !== toStripeAmount(order.amount, order.currency) || currency !== String(order.currency).toUpperCase())) {
            await logVpEvent(order.requestId, { type: 'payment_mismatch', title: 'Stripe reportó un importe distinto al de la orden', detail: `Cobrado ${fromStripeAmount(charged, currency)} ${currency}; orden ${order.amount} ${order.currency}`, metadata: { orderId: order.id, objectId: object?.id }, actor, visibility: 'internal' });
        }
        let receiptUrl = null, chargeId = null;
        try {
            if (intentId) {
                const pi = await getStripe().paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
                chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id || null;
                receiptUrl = pi.latest_charge?.receipt_url || null;
            }
        } catch (e) { console.warn('[video-pitch-commerce] no pude leer el PaymentIntent:', e?.message); }
        const { rowCount } = await db.query(`
            UPDATE "VideoPitchOrder" SET status = 'paid', "paidAt" = COALESCE("paidAt", NOW()), "stripePaymentIntentId" = COALESCE($2, "stripePaymentIntentId"),
                   "stripeChargeId" = COALESCE($3, "stripeChargeId"), "receiptUrl" = COALESCE($4, "receiptUrl"), "stripeSessionId" = COALESCE("stripeSessionId", $5), "failureCode" = NULL, "failureMessage" = NULL, "updatedAt" = NOW()
            WHERE id = $1 AND status <> 'paid'
        `, [order.id, intentId, chargeId, receiptUrl, object?.object === 'checkout.session' ? object.id : null]);
        if (!rowCount) return { applied: false, reason: 'ya pagada' };
        await db.query('UPDATE "VideoPitchRequest" SET "currentOrderId" = $2, "updatedAt" = NOW() WHERE id = $1', [order.requestId, order.id]);
        await logVpEvent(order.requestId, { type: 'payment_confirmed', title: `Pago confirmado: ${order.planName} (${formatMoney(order.amount, order.currency)})`, metadata: { orderId: order.id, paymentIntentId: intentId, chargeId, source: event ? 'webhook' : 'return_sync' }, actor });
        if (request) {
            await refreshCommercial(request);
            const cfg = await readConfigForSubmission(submission?.eventId || null);
            await notifyParticipantKind({ request: await loadRequest(request.id), submission, cfg, kind: 'payment_confirmed', eventKey: `paid:${order.id}` });
            // Pagado: si la solicitud seguía en borrador, se ENVÍA sola (el número y los avisos de siempre).
            const fresh = await loadRequest(request.id);
            if (fresh.status === 'draft') {
                try { await applyStatus({ request: fresh, submission, cfg, to: 'submitted', actor, actorKind: 'participant', note: 'Enviada automáticamente al confirmarse el pago.', metadata: { orderId: order.id } }); }
                catch (e) { console.warn('[video-pitch-commerce] no pude enviar la solicitud tras el pago:', e?.message); }
            }
        }
        return { applied: true, status: 'paid' };
    }
    if (kind === 'failed') {
        if (order.status === 'paid') return { applied: false, reason: 'pagada: un fallo posterior no la toca' };
        const err = object?.last_payment_error || {};
        await db.query(`UPDATE "VideoPitchOrder" SET status = 'failed', "stripePaymentIntentId" = COALESCE($2, "stripePaymentIntentId"), "failureCode" = $3, "failureMessage" = $4, "updatedAt" = NOW() WHERE id = $1`,
            [order.id, intentId, clean(err.decline_code || err.code, 80) || null, clean(err.message, 300) || null]);
        await logVpEvent(order.requestId, { type: 'payment_failed', title: 'El pago no se completó', detail: clean(err.message, 300) || null, metadata: { orderId: order.id, code: err.decline_code || err.code || null }, actor });
        if (request) {
            await refreshCommercial(request);
            const cfg = await readConfigForSubmission(submission?.eventId || null);
            await notifyParticipantKind({ request: await loadRequest(request.id), submission, cfg, kind: 'payment_failed', eventKey: `failed:${order.id}:${object?.id || ''}` });
        }
        return { applied: true, status: 'failed' };
    }
    if (kind === 'expired') {
        if (order.status !== 'processing') return { applied: false, reason: 'sin sesión en proceso' };
        await db.query(`UPDATE "VideoPitchOrder" SET status = 'pending_payment', "updatedAt" = NOW() WHERE id = $1 AND status = 'processing'`, [order.id]);
        await logVpEvent(order.requestId, { type: 'checkout_expired', title: 'La sesión de pago venció sin completarse', metadata: { orderId: order.id }, actor, visibility: 'internal' });
        if (request) await refreshCommercial(request);
        return { applied: true, status: 'pending_payment' };
    }
    if (kind === 'refunded') {
        if (order.status !== 'paid' && order.status !== 'refunded') return { applied: false, reason: 'no estaba pagada' };
        const refunded = fromStripeAmount(object?.amount_refunded ?? object?.amount ?? 0, object?.currency || order.currency);
        await db.query(`UPDATE "VideoPitchOrder" SET status = 'refunded', "refundedAmount" = $2, "refundedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`, [order.id, refunded]);
        await logVpEvent(order.requestId, { type: 'payment_refunded', title: `Pago reembolsado (${formatMoney(refunded, order.currency)})`, metadata: { orderId: order.id, chargeId: object?.id }, actor });
        if (request) await refreshCommercial(request);
        return { applied: true, status: 'refunded' };
    }
    return { applied: false, reason: 'desenlace desconocido' };
};

/**
 * Enrutador para el webhook ÚNICO de la plataforma (`paymentController`):
 * sólo atiende objetos con `metadata.type = 'video_pitch_order'` (o un
 * reembolso cuyo cargo pertenezca a una orden nuestra).
 */
export const routeVideoPitchStripeEvent = async (event, kind) => {
    const object = event?.data?.object || {};
    const isOurs = object?.metadata?.type === 'video_pitch_order' || Boolean(object?.metadata?.videoPitchOrderId);
    if (!isOurs && kind !== 'refunded') return { applied: false, reason: 'no es del Video Pitch' };
    if (kind === 'refunded' && !isOurs) {
        // charge.refunded no trae nuestra metadata: se resuelve por el PaymentIntent.
        const intentId = typeof object?.payment_intent === 'string' ? object.payment_intent : object?.payment_intent?.id || null;
        if (!intentId) return { applied: false, reason: 'sin intent' };
        const { rows } = await db.query('SELECT 1 FROM "VideoPitchOrder" WHERE "stripePaymentIntentId" = $1 LIMIT 1', [intentId]).catch(() => ({ rows: [] }));
        if (!rows[0]) return { applied: false, reason: 'no es del Video Pitch' };
    }
    if (kind === 'paid' && readSessionOutcome(object) !== 'paid' && object?.object === 'checkout.session') return { applied: false, reason: 'sesión completa pero no pagada' };
    return applyStripeOutcome(object, kind, event);
};

/** Vuelve de Stripe: lee la sesión del servidor y aplica (nunca confía en la URL). */
export const syncOrderFromSession = async ({ request, sessionId }) => {
    const target = clean(sessionId, 200);
    const order = target ? (await db.query('SELECT * FROM "VideoPitchOrder" WHERE "stripeSessionId" = $1 AND "requestId" = $2 LIMIT 1', [target, request.id])).rows[0] : await openOrderOf(request.id);
    if (!order?.stripeSessionId) return { outcome: 'none' };
    if (order.status === 'paid') return { outcome: 'paid' };
    try {
        const session = await getStripe().checkout.sessions.retrieve(order.stripeSessionId, { expand: ['payment_intent'] });
        const outcome = readSessionOutcome(session);
        if (outcome === 'paid') await applyStripeOutcome(session, 'paid', null);
        else if (outcome === 'expired') await applyStripeOutcome(session, 'expired', null);
        else if (outcome === 'unpaid' && session.payment_intent && typeof session.payment_intent === 'object' && session.payment_intent.last_payment_error) await applyStripeOutcome(session.payment_intent, 'failed', null);
        return { outcome };
    } catch (e) {
        console.warn('[video-pitch-commerce] no pude sincronizar la sesión:', e?.message);
        return { outcome: 'unknown' };
    }
};

// ════════════════════════════════════════════════════════════════════
// PORTAL
// ════════════════════════════════════════════════════════════════════
const portalCtx = async (req, res) => {
    await ensurePlansSeeded();
    const { submission, account } = await portalIdentity(req);
    if (!submission) { res.status(404).json({ error: 'No encontramos tu inscripción.' }); return null; }
    const availability = availabilityOf(submission);
    if (!availability.available) { res.status(403).json({ error: availability.reason }); return null; }
    return { submission, account };
};

// POST /portal/video-pitch/plan — { planCode, answers? } elegir o cambiar el plan («guardar y pagar después» incluido).
export const portalSelectPlan = async (req, res) => {
    try {
        const ctx = await portalCtx(req, res); if (!ctx) return;
        const { submission, account } = ctx;
        const request = await ensureDraft({ submission, account });
        const commercial = await commercialViewOf(request);
        if (!commercial.canChoosePlan) return res.status(409).json({ error: 'Esta solicitud ya tiene un pago confirmado o está cancelada: no se puede cambiar el plan.' });
        // Si el club manda sus respuestas, se guardan ANTES de todo (la compra nunca pierde lo escrito).
        if (req.body?.answers !== undefined && ['draft', 'info_required'].includes(request.status)) {
            const answers = normalizeAnswers(req.body.answers);
            const files = await loadFiles(request.id);
            const verdict = validateForSubmit(answers, { fileCount: files.filter(f => f.role === 'material').length, hasProjectContext: projectContextOf({ submission, masterAnswers: await loadMasterAnswers(submission.id) }).hasProjectContext });
            await db.query('UPDATE "VideoPitchRequest" SET answers = $2::jsonb, "lastEditedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1', [request.id, JSON.stringify(answers)]);
            if (!verdict.ok) return res.status(400).json({ error: 'Faltan datos para solicitar el video.', errors: verdict.errors });
        }
        const { order, changed, plan } = await selectPlanFor({ request: await loadRequest(request.id), submission, planCode: req.body?.planCode, actor: participantActor(account, submission) });
        if (changed) {
            const cfg = await readConfigForSubmission(submission.eventId || null);
            await notifyParticipantKind({ request: await loadRequest(request.id), submission, cfg, kind: 'pending_payment', eventKey: `pending:${order.id}` });
        }
        res.json({ ok: true, order: shapeOrder(order), plan: shapePlan(plan), commercial: await commercialViewOf(await loadRequest(request.id)) });
    } catch (error) {
        if (error?.code === 404 || error?.code === 409) return res.status(error.code).json({ error: error.message });
        console.error('[video-pitch-commerce] portalSelectPlan:', error);
        res.status(500).json({ error: 'No pudimos guardar el plan elegido.' });
    }
};

// POST /portal/video-pitch/checkout — { returnUrl? } crea o retoma la sesión de pago de la orden abierta.
export const portalCheckout = async (req, res) => {
    try {
        const ctx = await portalCtx(req, res); if (!ctx) return;
        const { submission, account } = ctx;
        const request = await loadRequest((await ensureDraft({ submission, account })).id);
        const paid = await paidOrderOf(request.id);
        if (paid) return res.json({ alreadyPaid: true, commercial: await commercialViewOf(request) });
        const order = await openOrderOf(request.id);
        if (!order) return res.status(409).json({ error: 'Elige primero un plan.', code: 'no_plan' });
        const cfg = await readConfigForSubmission(submission.eventId || null);
        const result = await startCheckoutFor({ request, submission, order, origin: originOf(req, submission), cfg, actor: participantActor(account, submission) });
        if (result.alreadyPaid) return res.json({ alreadyPaid: true, commercial: await commercialViewOf(await loadRequest(request.id)) });
        res.json({ url: result.url, sessionId: result.sessionId, reused: result.reused });
    } catch (error) {
        console.error('[video-pitch-commerce] portalCheckout:', error);
        res.status(502).json({ error: 'No pudimos iniciar el pago. Inténtalo de nuevo en unos minutos.' });
    }
};

// POST /portal/video-pitch/checkout/sync — { sessionId } al volver de Stripe.
export const portalSyncCheckout = async (req, res) => {
    try {
        await ensureVideoPitchSchema();
        const { submission } = await portalIdentity(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const { rows } = await db.query('SELECT * FROM "VideoPitchRequest" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
        const request = rows[0];
        if (!request) return res.status(404).json({ error: 'No hay solicitud.' });
        const { outcome } = await syncOrderFromSession({ request, sessionId: req.body?.sessionId });
        res.json({ outcome, commercial: await commercialViewOf(await loadRequest(request.id)) });
    } catch (error) {
        console.error('[video-pitch-commerce] portalSyncCheckout:', error);
        res.status(500).json({ error: 'No pudimos verificar el pago.' });
    }
};

// GET /portal/video-pitch/plans — el catálogo activo (los precios salen de acá, nunca del navegador).
export const portalPlans = async (_req, res) => {
    try { res.json({ plans: await listPlans({ onlyActive: true }), formats: DELIVERABLE_FORMATS }); }
    catch (error) { console.error('[video-pitch-commerce] portalPlans:', error); res.status(500).json({ error: 'No pudimos cargar los planes.' }); }
};

// ════════════════════════════════════════════════════════════════════
// ADMINISTRACIÓN
// ════════════════════════════════════════════════════════════════════
const withSchema = (handler, capability) => withAccess(async (req, res, ctx) => { await ensurePlansSeeded(); return handler(req, res, ctx); }, capability);

// GET /admin/video-pitch/plans
export const adminListPlans = withSchema(async (req, res, { access }) => {
    const plans = await listPlans();
    const versions = (await db.query('SELECT id, "planId", "versionNumber", snapshot, "createdAt", "createdByName" FROM "VideoPitchPlanVersion" ORDER BY "createdAt" DESC LIMIT 200')).rows;
    const usage = (await db.query(`SELECT "planId", COUNT(*)::int AS orders, COUNT(*) FILTER (WHERE status = 'paid')::int AS paid FROM "VideoPitchOrder" GROUP BY "planId"`)).rows;
    res.json({
        plans: plans.map(p => ({ ...p, versions: versions.filter(v => v.planId === p.id), orders: usage.find(u => u.planId === p.id)?.orders || 0, paidOrders: usage.find(u => u.planId === p.id)?.paid || 0 })),
        formats: DELIVERABLE_FORMATS, currencies: SUPPORTED_CURRENCIES,
        access: { config: !!access.config },
    });
}, 'view');

// POST /admin/video-pitch/plans — crear
export const adminCreatePlan = withSchema(async (req, res, { access }) => {
    const juicio = normalizePlanInput(req.body || {});
    if (!juicio.ok) return res.status(400).json({ error: juicio.errores.join(' ') });
    const actor = actorFrom(req, access);
    const p = juicio.plan;
    try {
        const { rows } = await db.query(`
            INSERT INTO "VideoPitchPlan" (code, name, description, badge, "priceAmount", currency, features, deliverables, "maxDurationSec", "revisionRounds", "sortOrder", active, "updatedBy")
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13) RETURNING *
        `, [p.code, p.name, p.description, p.badge, p.priceAmount, p.currency, JSON.stringify(p.features), JSON.stringify(p.deliverables), p.maxDurationSec, p.revisionRounds, p.sortOrder, p.active, actor.name]);
        await insertVersion(rows[0], actor);
        await db.query(`INSERT INTO "VideoPitchEvent" ("requestId", type, title, detail, metadata, "actorId", "actorName", "actorRole", visibility) VALUES ('catalog', 'plan_created', $1, NULL, $2::jsonb, $3, $4, $5, 'internal')`,
            [`Plan creado: ${p.name} (${formatMoney(p.priceAmount, p.currency)})`, JSON.stringify({ planId: rows[0].id, code: p.code }), actor.id, actor.name, actor.role]);
        res.status(201).json({ plan: shapePlan(rows[0]) });
    } catch (e) {
        if (e?.code === '23505') return res.status(409).json({ error: 'Ya existe un plan con ese código.' });
        throw e;
    }
}, 'config');

// PUT /admin/video-pitch/plans/:planId — editar; un cambio de precio o características crea una VERSIÓN nueva.
export const adminUpdatePlan = withSchema(async (req, res, { access }) => {
    const before = await loadPlan(clean(req.params.planId, 60));
    if (!before) return res.status(404).json({ error: 'Plan no encontrado.' });
    const merged = { ...shapePlan(before), ...(req.body || {}) };
    const juicio = normalizePlanInput(merged, { existingCode: before.code });
    if (!juicio.ok) return res.status(400).json({ error: juicio.errores.join(' ') });
    const actor = actorFrom(req, access);
    const p = juicio.plan;
    const { rows } = await db.query(`
        UPDATE "VideoPitchPlan" SET name = $2, description = $3, badge = $4, "priceAmount" = $5, currency = $6, features = $7::jsonb, deliverables = $8::jsonb,
               "maxDurationSec" = $9, "revisionRounds" = $10, "sortOrder" = $11, active = $12, "updatedAt" = NOW(), "updatedBy" = $13
        WHERE id = $1 RETURNING *
    `, [before.id, p.name, p.description, p.badge, p.priceAmount, p.currency, JSON.stringify(p.features), JSON.stringify(p.deliverables), p.maxDurationSec, p.revisionRounds, p.sortOrder, p.active, actor.name]);
    const after = rows[0];
    const newVersion = planNeedsNewVersion(planSnapshot(before), planSnapshot(after));
    if (newVersion) await insertVersion(after, actor);
    const priceChanged = Number(before.priceAmount) !== Number(after.priceAmount) || before.currency !== after.currency;
    await db.query(`INSERT INTO "VideoPitchEvent" ("requestId", type, title, detail, metadata, "actorId", "actorName", "actorRole", visibility) VALUES ('catalog', $1, $2, NULL, $3::jsonb, $4, $5, $6, 'internal')`,
        [priceChanged ? 'plan_price_changed' : 'plan_updated',
            priceChanged ? `Precio de «${after.name}»: ${formatMoney(before.priceAmount, before.currency)} → ${formatMoney(after.priceAmount, after.currency)}` : `Plan «${after.name}» actualizado${before.active !== after.active ? (after.active ? ' (activado)' : ' (desactivado)') : ''}`,
            JSON.stringify({ planId: after.id, before: planSnapshot(before), after: planSnapshot(after), newVersion, active: after.active }), actor.id, actor.name, actor.role]);
    res.json({ plan: shapePlan(after), newVersion });
}, 'config');

// GET /admin/video-pitch/plans/history — la bitácora del catálogo.
export const adminPlanHistory = withSchema(async (_req, res) => {
    const { rows } = await db.query(`SELECT id, type, title, metadata, "actorName", "createdAt" FROM "VideoPitchEvent" WHERE "requestId" = 'catalog' ORDER BY "createdAt" DESC LIMIT 100`);
    res.json({ history: rows });
}, 'view');

// POST /admin/video-pitch/:id/payment/waive — { note } autoriza producir sin pago (auditado) y envía la solicitud si era borrador.
export const adminWaivePayment = withSchema(async (req, res, { access }) => {
    const request = await loadRequest(clean(req.params.id, 60));
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
    const note = clean(req.body?.note, 1000);
    if (!note) return res.status(400).json({ error: 'Indica el motivo de la autorización sin pago: queda en el historial.' });
    const actor = actorFrom(req, access);
    await db.query('UPDATE "VideoPitchRequest" SET "paymentWaived" = TRUE, "paymentWaivedBy" = $2, "paymentWaivedNote" = $3, "paymentWaivedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1', [request.id, actor.name, note]);
    await logVpEvent(request.id, { type: 'payment_waived', title: 'Producción autorizada sin pago confirmado', detail: note, metadata: { by: actor.name }, actor, visibility: 'internal' });
    const submission = await loadSubmission(request.submissionId);
    const fresh = await loadRequest(request.id);
    if (fresh.status === 'draft' && submission) {
        const cfg = await readConfigForSubmission(submission.eventId || null);
        try { await applyStatus({ request: fresh, submission, cfg, to: 'submitted', actor, actorKind: 'participant', note: 'Enviada por el comité con autorización sin pago.' }); } catch (e) { return res.status(409).json({ error: e.message }); }
    }
    res.json({ ok: true, commercial: await commercialViewOf(await loadRequest(request.id)) });
}, 'changeStatus');

// POST /admin/video-pitch/:id/payment/sync — vuelve a preguntar a Stripe por la orden abierta.
export const adminSyncPayment = withSchema(async (req, res) => {
    const request = await loadRequest(clean(req.params.id, 60));
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
    const { outcome } = await syncOrderFromSession({ request, sessionId: null });
    res.json({ outcome, commercial: await commercialViewOf(await loadRequest(request.id)), orders: (await loadOrders(request.id)).map(shapeOrder) });
}, 'changeStatus');

// POST /admin/video-pitch/maintenance/cleanup — { confirm, hours } borra subidas que nunca se registraron (política configurable).
export const adminCleanupUploads = withSchema(async (req, res, { access }) => {
    const hours = Math.max(6, Math.min(24 * 30, Number(req.body?.hours) || Number(process.env.VIDEO_PITCH_UPLOAD_RETENTION_HOURS) || 48));
    const { rows } = await db.query(`
        SELECT i.* FROM "VideoPitchUploadIntent" i
        WHERE i.registered = FALSE AND i."cleanedAt" IS NULL AND i."createdAt" < NOW() - ($1 || ' hours')::interval
          AND NOT EXISTS (SELECT 1 FROM "VideoPitchFile" f WHERE f."storageKey" = i."storageKey")
        ORDER BY i."createdAt" ASC LIMIT 200
    `, [String(hours)]);
    if (req.body?.confirm !== true) return res.json({ planned: true, hours, candidates: rows.length });
    let deleted = 0, missing = 0;
    for (const i of rows) {
        const exists = await videoPitchObjectExists(i.storageKey);
        if (exists) { if (await deleteVideoPitchObject(i.storageKey)) deleted++; } else missing++;
        await db.query('UPDATE "VideoPitchUploadIntent" SET "cleanedAt" = NOW() WHERE id = $1', [i.id]);
    }
    await db.query(`INSERT INTO "VideoPitchEvent" ("requestId", type, title, detail, metadata, "actorId", "actorName", "actorRole", visibility) VALUES ('catalog', 'uploads_cleaned', $1, NULL, $2::jsonb, $3, $4, $5, 'internal')`,
        [`Limpieza de subidas huérfanas: ${deleted} borradas, ${missing} ya no existían`, JSON.stringify({ hours, candidates: rows.length }), actorFrom(req, access).id, actorFrom(req, access).name, actorFrom(req, access).role]);
    res.json({ planned: false, hours, candidates: rows.length, deleted, missing });
}, 'config');

export default {
    getStripe, ensurePlansSeeded, listPlans, shapeOrder, loadOrder, loadOrders, currentOrderOf, refreshCommercial, commercialViewOf,
    applyStripeOutcome, routeVideoPitchStripeEvent, syncOrderFromSession,
    portalSelectPlan, portalCheckout, portalSyncCheckout, portalPlans,
    adminListPlans, adminCreatePlan, adminUpdatePlan, adminPlanHistory, adminWaivePayment, adminSyncPayment, adminCleanupUploads,
};
