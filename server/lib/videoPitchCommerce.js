// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — la capa COMERCIAL, el criterio puro (v4.1296.0)
//
// Planes, órdenes y estado comercial, separados del estado de PRODUCCIÓN
// (`videoPitchSpec.js`). Una solicitud puede estar «Pagada» y «En producción»
// a la vez: son dos campos, nunca uno.
//
//   · PLANES: lo que vende el comité (Esencial USD 99, Integral USD 135 al
//     inicio). Viven en la base y se editan desde el panel; el precio NUNCA se
//     escribe en el navegador. Cada cambio de precio o características crea
//     una VERSIÓN inmutable del plan, y cada orden apunta a la versión con la
//     que se compró: cambiar el catálogo no mueve una orden ya creada.
//   · ÓRDENES: la fotografía de la compra (plan, versión, importe, moneda) y
//     su recorrido en Stripe. El importe que se cobra sale de la orden, nunca
//     del cuerpo de la petición.
//   · ESTADO COMERCIAL de la solicitud: sin plan → plan elegido → pendiente de
//     pago → pago en proceso → pagado | fallido | cancelado | reembolsado.
//   · COMPUERTA DE PRODUCCIÓN: el comité no pasa de la revisión a preparar el
//     guion sin pago confirmado, salvo que un administrador lo autorice
//     expresamente (queda auditado).
// ════════════════════════════════════════════════════════════════════

export const COMMERCIAL_STATUSES = [
    { key: 'no_plan',         label: 'Sin plan',           tone: 'slate' },
    { key: 'plan_selected',   label: 'Plan seleccionado',  tone: 'blue' },
    { key: 'pending_payment', label: 'Pendiente de pago',  tone: 'amber' },
    { key: 'processing',      label: 'Pago en proceso',    tone: 'indigo' },
    { key: 'paid',            label: 'Pagado',             tone: 'emerald' },
    { key: 'failed',          label: 'Pago fallido',       tone: 'orange' },
    { key: 'cancelled',       label: 'Cancelado',          tone: 'slate' },
    { key: 'refunded',        label: 'Reembolsado',        tone: 'violet' },
];
export const COMMERCIAL_KEYS = COMMERCIAL_STATUSES.map(s => s.key);
export const commercialMeta = (key) => COMMERCIAL_STATUSES.find(s => s.key === key) || COMMERCIAL_STATUSES[0];
export const isCommercialStatus = (k) => COMMERCIAL_KEYS.includes(k);

/** Estados de una ORDEN (lo que pasó con un cobro concreto). */
export const ORDER_STATUSES = ['pending_payment', 'processing', 'paid', 'failed', 'cancelled', 'refunded'];
export const ORDER_LABELS = {
    pending_payment: 'Pendiente de pago', processing: 'Pago en proceso', paid: 'Pagado', failed: 'Pago fallido',
    cancelled: 'Cancelada', refunded: 'Reembolsada',
};
/** Una orden ABIERTA es la que todavía puede cobrarse. */
export const OPEN_ORDER_STATUSES = ['pending_payment', 'processing', 'failed'];

// ── Planes ───────────────────────────────────────────────────────────
export const SUPPORTED_CURRENCIES = ['USD', 'COP'];
export const DELIVERABLE_FORMATS = [
    { key: '16:9', label: 'Video horizontal 16:9' },
    { key: '9:16', label: 'Versión vertical 9:16 (Reel)' },
];

/** El catálogo inicial. Se siembra UNA vez si la tabla está vacía; después manda el panel. */
export const DEFAULT_PLANS = [
    {
        code: 'essential', name: 'Video Pitch Esencial', badge: '',
        description: 'Presentación profesional para pantallas grandes.',
        priceAmount: 99, currency: 'USD', sortOrder: 1, active: true,
        maxDurationSec: 180, revisionRounds: 3, deliverables: ['16:9'],
        features: [
            'Un video profesional horizontal, formato 16:9 para pantallas grandes.',
            'Duración máxima de 3 minutos.',
            'Guion narrativo estructurado: gancho, contexto, solución, impacto y llamado a la acción.',
            'Edición audiovisual con los materiales suministrados y recursos visuales complementarios autorizados cuando sean necesarios.',
            'Narración y subtítulos según las capacidades y condiciones definidas por el servicio.',
            'Identidad gráfica institucional autorizada.',
            'Hasta 3 rondas de ajustes sobre la propuesta entregada.',
            'Archivo final preparado para presentaciones y eventos.',
        ],
    },
    {
        code: 'integral', name: 'Video Pitch Integral', badge: 'Recomendado',
        description: 'Presentación y difusión digital del proyecto.',
        priceAmount: 135, currency: 'USD', sortOrder: 2, active: true,
        maxDurationSec: 180, revisionRounds: 3, deliverables: ['16:9', '9:16'],
        features: [
            'Todo lo del plan Esencial.',
            'Una versión vertical en formato 9:16, tipo Reel para redes sociales.',
            'Ajuste de composición, textos y encuadres para visualización móvil.',
            'Material audiovisual listo para compartir en redes del club, del distrito y de la Feria, sujeto a sus políticas editoriales.',
            'Archivos finales horizontal y vertical.',
        ],
    },
];

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const money = (v) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) ? n : NaN; };

/** Valida y normaliza lo que el panel manda para un plan. Devuelve { ok, errores, plan }. */
export const normalizePlanInput = (input = {}, { existingCode = null } = {}) => {
    const errores = [];
    const code = str(input.code ?? existingCode, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!code) errores.push('El código interno es obligatorio (letras, números, guion o guion bajo).');
    const name = str(input.name, 120);
    if (!name) errores.push('El nombre del plan es obligatorio.');
    const priceAmount = money(input.priceAmount);
    if (!Number.isFinite(priceAmount) || priceAmount < 0) errores.push('El precio debe ser un número mayor o igual a cero.');
    const currency = str(input.currency || 'USD', 3).toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(currency)) errores.push(`Moneda no admitida. Usa ${SUPPORTED_CURRENCIES.join(' o ')}.`);
    const features = (Array.isArray(input.features) ? input.features : String(input.features || '').split('\n'))
        .map(f => str(f, 300)).filter(Boolean).slice(0, 20);
    const deliverables = (Array.isArray(input.deliverables) ? input.deliverables : []).map(String).filter(d => DELIVERABLE_FORMATS.some(f => f.key === d));
    if (!deliverables.length) errores.push('Elige al menos un formato de entrega.');
    const maxDurationSec = Math.max(30, Math.min(600, Math.round(Number(input.maxDurationSec) || 180)));
    const revisionRounds = Math.max(0, Math.min(10, Math.round(Number(input.revisionRounds) || 0)));
    const sortOrder = Math.max(0, Math.min(99, Math.round(Number(input.sortOrder) || 0)));
    return {
        ok: errores.length === 0, errores,
        plan: {
            code, name, description: str(input.description, 300), badge: str(input.badge, 40),
            priceAmount, currency, features, deliverables, maxDurationSec, revisionRounds, sortOrder,
            active: input.active === undefined ? true : Boolean(input.active),
        },
    };
};

/** Lo que define una VERSIÓN: si cambia algo de esto, la compra siguiente es otra versión. */
export const VERSIONED_FIELDS = ['name', 'description', 'priceAmount', 'currency', 'features', 'deliverables', 'maxDurationSec', 'revisionRounds'];
export const planNeedsNewVersion = (before, after) =>
    !before || VERSIONED_FIELDS.some(f => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));

/** La fotografía que guarda una orden (y una versión): nunca se recalcula. */
export const planSnapshot = (plan) => ({
    code: plan.code, name: plan.name, description: plan.description || '', priceAmount: Number(plan.priceAmount), currency: plan.currency,
    features: Array.isArray(plan.features) ? plan.features : [], deliverables: Array.isArray(plan.deliverables) ? plan.deliverables : [],
    maxDurationSec: Number(plan.maxDurationSec) || 180, revisionRounds: Number(plan.revisionRounds) || 0,
});

// ── Importes ─────────────────────────────────────────────────────────
export const ZERO_DECIMAL = ['COP', 'JPY', 'KRW', 'CLP', 'PYG', 'HUF', 'ISK', 'TWD', 'UGX', 'VND', 'XAF', 'XOF'];
/** Unidad mínima de Stripe: centavos salvo monedas sin decimales (COP). */
export const toStripeAmount = (amount, currency) =>
    (ZERO_DECIMAL.includes(String(currency || 'USD').toUpperCase()) ? Math.round(Number(amount)) : Math.round(Number(amount) * 100));
export const fromStripeAmount = (units, currency) =>
    (ZERO_DECIMAL.includes(String(currency || 'USD').toUpperCase()) ? Number(units) : Number(units) / 100);
export const formatMoney = (amount, currency = 'USD') => {
    const n = Number(amount) || 0;
    if (String(currency).toUpperCase() === 'COP') return `$${Math.round(n).toLocaleString('es-CO')} COP`;
    return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

// ── Sesiones de Stripe ───────────────────────────────────────────────
/** El desenlace de una Checkout Session: se mira `payment_status` ANTES que `status`. */
export const readSessionOutcome = (session) => {
    if (!session) return 'unknown';
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') return 'paid';
    if (session.status === 'expired') return 'expired';
    if (session.status === 'open') return 'open';
    if (session.status === 'complete') return 'unpaid';
    return 'unknown';
};
export const REUSE_MARGIN_MS = 5 * 60 * 1000;
/** ¿Sirve la sesión abierta para mandar al club otra vez? Misma moneda, mismo importe, con vida. */
export const reusableSession = (session, { now = Date.now(), amount, currency } = {}) => {
    if (readSessionOutcome(session) !== 'open' || !session?.url) return false;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt - now < REUSE_MARGIN_MS) return false;
    if (String(session.currency || '').toUpperCase() !== String(currency).toUpperCase()) return false;
    return Number(session.amount_total) === toStripeAmount(amount, currency);
};

// ── Estado comercial derivado ────────────────────────────────────────
/**
 * El estado comercial de la solicitud se DERIVA de su orden vigente y de la
 * exoneración: una orden pagada = pagado; sin orden pero con plan = plan
 * elegido; etc. Derivar evita la segunda verdad.
 */
export const commercialStatusOf = ({ request, order }) => {
    if (!order) return request?.planId ? 'plan_selected' : 'no_plan';
    if (order.status === 'paid') return 'paid';
    if (order.status === 'refunded') return 'refunded';
    if (order.status === 'processing') return 'processing';
    if (order.status === 'failed') return 'failed';
    if (order.status === 'cancelled') return request?.planId ? 'plan_selected' : 'no_plan';
    return 'pending_payment';
};

/** ¿Está la parte comercial resuelta para producir? Pagado o exonerado por un administrador. */
export const commerciallyCleared = ({ commercialStatus, paymentWaived = false }) => commercialStatus === 'paid' || Boolean(paymentWaived);

/** Estados de producción que exigen la compuerta comercial. */
export const GATED_PRODUCTION_STATUSES = ['script_in_progress', 'script_pending_approval', 'script_approved', 'in_production', 'video_in_review', 'finished', 'delivered'];
export const productionGate = (to, ctx) => {
    if (!GATED_PRODUCTION_STATUSES.includes(to)) return null;
    if (commerciallyCleared(ctx)) return null;
    return 'La producción empieza con el pago confirmado (o con la autorización expresa de un administrador).';
};

/** ¿El club puede elegir o cambiar de plan? Sólo mientras no haya pagado ni esté cancelada la solicitud. */
export const canChoosePlan = ({ commercialStatus, requestStatus }) =>
    !['paid', 'refunded'].includes(commercialStatus) && requestStatus !== 'cancelled';

// ── La tarjeta del participante ──────────────────────────────────────
/** Qué dice la tarjeta y qué botones ofrece, según producción + comercio (casos A–E del pedido). */
export const cardCopyOf = ({ exists, requestStatus, commercialStatus, available }) => {
    if (!available) return { headline: null, actions: [] };
    if (!exists || requestStatus === 'not_requested') return { headline: null, actions: [{ key: 'start', label: 'Solicitar Video Pitch' }] };
    if (requestStatus === 'draft') {
        if (['pending_payment', 'failed', 'processing', 'plan_selected'].includes(commercialStatus)) {
            return {
                headline: 'Tu solicitud y materiales están guardados. Solo falta completar el pago.',
                actions: [
                    { key: 'pay', label: commercialStatus === 'processing' ? 'Continuar el pago' : 'Pagar Video Pitch' },
                    { key: 'open', label: 'Completar información' },
                    { key: 'plan', label: 'Cambiar plan' },
                ],
            };
        }
        return { headline: 'Tu solicitud está guardada. Puedes continuar cuando quieras.', actions: [{ key: 'open', label: 'Continuar solicitud' }] };
    }
    if (requestStatus === 'delivered') return { headline: 'Tu Video Pitch está disponible.', actions: [{ key: 'open', label: 'Ver video' }] };
    if (['in_production', 'video_in_review', 'finished', 'script_approved'].includes(requestStatus)) {
        return { headline: 'Tu Video Pitch está en proceso de producción.', actions: [{ key: 'open', label: 'Consultar estado' }] };
    }
    if (requestStatus === 'info_required') return { headline: 'El comité necesita información adicional.', actions: [{ key: 'open', label: 'Completar información' }] };
    if (requestStatus === 'script_pending_approval') return { headline: 'El guion está listo para tu aprobación.', actions: [{ key: 'open', label: 'Revisar guion' }] };
    if (requestStatus === 'cancelled') return { headline: 'La solicitud fue cancelada.', actions: [{ key: 'open', label: 'Ver solicitud' }] };
    if (commercialStatus === 'paid') return { headline: 'Pago confirmado. Estamos revisando la información de tu proyecto.', actions: [{ key: 'open', label: 'Ver seguimiento' }] };
    if (['pending_payment', 'failed', 'processing'].includes(commercialStatus)) {
        return { headline: 'Tu solicitud fue recibida. Solo falta completar el pago para iniciar la producción.', actions: [{ key: 'pay', label: 'Pagar Video Pitch' }, { key: 'open', label: 'Ver seguimiento' }] };
    }
    return { headline: 'Tu solicitud fue recibida y está en revisión.', actions: [{ key: 'open', label: 'Ver seguimiento' }] };
};

export default {
    COMMERCIAL_STATUSES, COMMERCIAL_KEYS, commercialMeta, isCommercialStatus, ORDER_STATUSES, ORDER_LABELS, OPEN_ORDER_STATUSES,
    SUPPORTED_CURRENCIES, DELIVERABLE_FORMATS, DEFAULT_PLANS, normalizePlanInput, VERSIONED_FIELDS, planNeedsNewVersion, planSnapshot,
    ZERO_DECIMAL, toStripeAmount, fromStripeAmount, formatMoney, readSessionOutcome, REUSE_MARGIN_MS, reusableSession,
    commercialStatusOf, commerciallyCleared, GATED_PRODUCTION_STATUSES, productionGate, canChoosePlan, cardCopyOf,
};
