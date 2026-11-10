// ════════════════════════════════════════════════════════════════════
// Confirmación MANUAL del pago de una inscripción a un evento — v4.1310
//
// Pedido del comité con la ficha delante: lo que se hizo para la Postulación
// de Proyectos (v4.1308) —confirmar a mano un pago hecho por fuera de la
// pasarela, adjuntando el comprobante— también para los inscritos al evento:
// rotarios nacionales, internacionales y CADRE.
//
// Hasta v4.1309 confirmar un pago a mano era elegir «Pago confirmado» en
// «Cambiar a» con un comentario libre: sin soporte, sin valor, sin referencia
// y sin el correo de confirmación ni el registro del pago que deja Stripe.
//
// Este archivo es el CRITERIO, puro (sin base, sin S3, sin red):
//   · qué estados se pueden confirmar a mano y por qué no los demás,
//   · la validación de lo que escribe el equipo,
//   · el prefijo privado del comprobante de ESTA inscripción,
//   · la vista del pago manual que viaja a la pantalla (sin la clave de S3).
//
// El CAMINO vive en `eventRegistrationController.confirmManualRegistrationPayment`,
// que termina en `finalizePaidRegistration`: el MISMO final que Stripe y PayPal
// (código, cuenta del participante, historial y correo).
// ════════════════════════════════════════════════════════════════════

/** Desde estos estados se puede confirmar un pago hecho por fuera. */
export const MANUAL_CONFIRMABLE_STATUSES = ['started', 'pending_payment', 'payment_failed', 'expired', 'waitlist'];

/** Por qué NO, escrito, para los demás. */
const BLOCK_REASONS = {
    draft: 'La inscripción es un borrador: el formulario no se envió y no tiene un valor que confirmar.',
    paid: 'El pago de esta inscripción ya está confirmado.',
    confirmed: 'La inscripción ya está en firme.',
    accredited: 'La inscripción ya está pagada y acreditada.',
    attended: 'La inscripción ya está pagada.',
    no_show: 'La inscripción ya está pagada.',
    cancelled: 'La inscripción está cancelada. Si el participante pagó, vuelve a ponerla en «Pendiente de pago» y confírmala.',
    refunded: 'El pago de esta inscripción fue reembolsado. Para registrar un pago nuevo, vuelve a ponerla en «Pendiente de pago».',
};

export const manualConfirmVerdict = (registration = {}) => {
    const status = String(registration?.status || '');
    if (MANUAL_CONFIRMABLE_STATUSES.includes(status)) return { ok: true };
    return { ok: false, reason: BLOCK_REASONS[status] || 'El estado actual de la inscripción no permite confirmar un pago.' };
};

export const MANUAL_PAYMENT_METHODS = [
    'Transferencia bancaria',
    'Consignación bancaria',
    'Tarjeta de crédito/débito (datáfono)',
    'Efectivo / Ventanilla',
    'COLROTARIOS / AvalPay',
    'Otro medio verificado',
];

export const MANUAL_CURRENCIES = ['COP', 'USD'];

const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

/**
 * Valida lo que escribió el equipo. `receiptAttached` dice si viene un archivo:
 * el soporte es el archivo, una referencia escrita o ambos, nunca ninguno.
 *
 * @returns {{ ok: true, value } | { ok: false, error }}
 */
export const validateManualPayment = (body = {}, { receiptAttached = false, now = Date.now() } = {}) => {
    const reference = texto(body.reference, 200);
    if (!reference) return { ok: false, error: 'La referencia o identificador de la transacción es obligatoria.' };

    const paidAt = body.paidAt ? new Date(String(body.paidAt)) : null;
    if (!paidAt || Number.isNaN(paidAt.getTime())) return { ok: false, error: 'La fecha del pago no es válida.' };
    if (paidAt.getTime() > now + 10 * 60 * 1000) return { ok: false, error: 'La fecha del pago no puede estar en el futuro.' };

    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'El valor pagado debe ser un monto positivo.' };

    const currency = texto(body.currency, 3).toUpperCase();
    if (!MANUAL_CURRENCIES.includes(currency)) return { ok: false, error: 'La moneda debe ser COP o USD.' };

    const method = texto(body.paymentMethod, 60);
    if (!method) return { ok: false, error: 'El medio de pago es obligatorio.' };

    const evidence = texto(body.evidence, 2000);
    if (!evidence && !receiptAttached) return { ok: false, error: 'Adjunta el comprobante o escribe una referencia verificable del soporte.' };

    const reason = texto(body.reason, 1000);
    if (reason.length < 5) return { ok: false, error: 'Indica el motivo de la confirmación manual (mínimo 5 caracteres).' };

    return {
        ok: true,
        value: { reference, paidAt, amount, currency, method, evidence: evidence || null, reason, notify: body.notify !== false },
    };
};

// ── El comprobante: S3 privado, por inscripción ──────────────────────
// Un prefijo PROPIO, no el de las inscripciones completadas
// (`private/event-receipts/{evento}/`): una clave de ese prefijo podría
// reclamarla un formulario COLROTARIOS del mismo evento.
export const EVENT_MANUAL_RECEIPT_PREFIX = 'private/event-manual-payments';

const idSeguro = (id) => /^[A-Za-z0-9_-]{1,80}$/.test(String(id || ''));

export const eventManualReceiptPrefix = (eventId, registrationId) =>
    (idSeguro(eventId) && idSeguro(registrationId))
        ? `${EVENT_MANUAL_RECEIPT_PREFIX}/${eventId}/${registrationId}`
        : null;

export const eventManualReceiptBelongs = (key, eventId, registrationId) => {
    const prefix = eventManualReceiptPrefix(eventId, registrationId);
    const value = String(key || '');
    return Boolean(prefix) && value.startsWith(`${prefix}/`) && !value.includes('..');
};

/**
 * Lo que viaja a la pantalla de un pago manual: todo menos la clave de S3.
 * `payload.manual` lo escribe `confirmManualRegistrationPayment`.
 */
export const manualPaymentView = (payload) => {
    let p = payload;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
    const m = p && typeof p === 'object' ? p.manual : null;
    if (!m) return null;
    return {
        reference: m.reference || null,
        paidAt: m.paidAt || null,
        method: m.method || null,
        evidence: m.evidence || null,
        reason: m.reason || null,
        by: m.by || null,
        confirmedAt: m.confirmedAt || null,
        receipt: m.receipt?.key ? { name: m.receipt.name || 'comprobante', mime: m.receipt.mime || null, bytes: m.receipt.bytes ?? null } : null,
    };
};

export default {
    MANUAL_CONFIRMABLE_STATUSES, MANUAL_PAYMENT_METHODS, MANUAL_CURRENCIES,
    manualConfirmVerdict, validateManualPayment,
    EVENT_MANUAL_RECEIPT_PREFIX, eventManualReceiptPrefix, eventManualReceiptBelongs, manualPaymentView,
};
