// ════════════════════════════════════════════════════════════════════════════
// Conciliación de inscripciones y traslados de un EVENTO — el criterio — v4.1250
//
// ⚠️ LOS EVENTOS SON UN DOMINIO FINANCIERO PROPIO. v4.1248–v4.1249 llevaron los
// pagos de inscripción a la Bóveda de Fondos (una fila de `Payment` por pago) y
// exigían ese movimiento para registrar un traslado o mandar un comprobante. El
// equipo lo corrigió: la Bóveda era una REFERENCIA de cómo se ve la gestión de
// comprobantes, no el destino de los pagos de los eventos. Desde v4.1250:
//
//   · Los pagos son los del propio módulo (`EventRegistration` +
//     `EventRegistrationPayment`).
//   · Los traslados al beneficiario del evento (Concorrotarios u otro, por
//     evento), sus comprobantes PDF, los envíos por correo y el historial viven
//     en tablas propias (`EventFunds*`, `ensureEventFundsSchema.js`).
//   · NADA de este módulo lee ni escribe `Payment`, `Disbursement`,
//     `DisbursementNotice` ni ninguna tabla de la Bóveda. Lo comprueba una prueba.
//
// Este archivo es PURO (sin base, sin red): lo importan el servidor y el panel.
// ════════════════════════════════════════════════════════════════════════════

/** Inscripciones cuyo cobro entró y sigue vigente: su dinero se puede trasladar. */
export const PAID_REGISTRATION_STATUSES = ['paid', 'accredited', 'attended', 'no_show'];

const TOL = 0.005;
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(num(n) * 100) / 100;
const cur = (c) => String(c || '').trim().toUpperCase().slice(0, 3);

// ── Estados del TRASLADO (proceso B) ────────────────────────────────────────

export const TRANSFER_STATUSES = ['pendiente', 'registrado', 'pendiente_verificacion', 'confirmado', 'rechazado', 'revertido'];

export const TRANSFER_STATUS_LABELS = {
    pendiente: 'Pendiente de traslado',
    registrado: 'Traslado registrado',
    pendiente_verificacion: 'Pendiente de verificación',
    confirmado: 'Traslado confirmado',
    rechazado: 'Rechazado',
    revertido: 'Revertido',
};

/** Los que ya no cuentan: liberan lo que tenían asignado. */
export const CLOSED_TRANSFER_STATUSES = ['rechazado', 'revertido'];
export const isActiveTransfer = (t) => !CLOSED_TRANSFER_STATUSES.includes(String(t?.status || ''));

/** Qué se puede pasar a qué. `confirmado` sólo desde un estado con operación. */
const TRANSITIONS = {
    pendiente: ['registrado', 'pendiente_verificacion', 'rechazado'],
    registrado: ['pendiente_verificacion', 'confirmado', 'rechazado', 'revertido'],
    pendiente_verificacion: ['confirmado', 'registrado', 'rechazado', 'revertido'],
    confirmado: ['revertido'],
    rechazado: [],
    revertido: [],
};

/**
 * ¿Se puede pasar el traslado de `from` a `to`?
 *
 * ⚠️ NO SE CONFIRMA SIN EVIDENCIA: hace falta un comprobante PDF vigente Y una
 * referencia de la operación (bancaria, de Stripe o de payout). Un pago
 * confirmado del participante no es evidencia de un traslado.
 * Rechazar o revertir exige el motivo: queda en el historial.
 */
export const canTransition = (from, to, { hasDocument = false, reference = '', reason = '' } = {}) => {
    if (!TRANSFER_STATUSES.includes(to)) return { ok: false, error: 'Estado de traslado desconocido.' };
    if (!(TRANSITIONS[from] || []).includes(to)) {
        return { ok: false, error: `No se puede pasar de «${TRANSFER_STATUS_LABELS[from] || from}» a «${TRANSFER_STATUS_LABELS[to]}».` };
    }
    if (to === 'confirmado') {
        if (!hasDocument) return { ok: false, error: 'Para confirmar el traslado adjunta primero el comprobante PDF.' };
        if (!String(reference || '').trim()) return { ok: false, error: 'Para confirmar el traslado registra la referencia de la operación.' };
    }
    if ((to === 'rechazado' || to === 'revertido') && String(reason || '').trim().length < 5) {
        return { ok: false, error: 'Indica el motivo (queda en el historial).' };
    }
    return { ok: true };
};

// ── El PAGO del participante (proceso A) ────────────────────────────────────

const parse = (v) => {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v) || {}; } catch { return {}; }
};

/**
 * Lo que se sabe del pago de UNA inscripción, de los datos del propio módulo.
 *
 *   · `charged`    — lo que pagó el participante (en la moneda cobrada).
 *   · `surcharge`  — el recargo de la pasarela que se le SUMÓ al participante
 *                    (v4.980): no es del evento.
 *   · `eventAmount`— lo que le corresponde al evento: cobrado − recargo. Es lo
 *                    que se propone trasladar, y se puede ajustar al registrar.
 *   · `stripe`     — lo verificado contra Stripe (comisión real, neto, fecha de
 *                    liberación), si se verificó.
 */
export const paymentOf = (reg = {}, payments = [], stripeCheck = null) => {
    const propios = (payments || []).filter(p => p && p.registrationId === reg.id);
    const exito = propios.filter(p => p.status === 'succeeded')
        .sort((a, b) => new Date(b.occurredAt || b.createdAt || 0) - new Date(a.occurredAt || a.createdAt || 0))[0] || null;
    const reembolsos = propios.filter(p => p.status === 'refunded');
    const pricing = parse(reg.pricing);
    const currency = cur(exito?.currency || reg.chargeCurrency || pricing.chargeCurrency || reg.currency);
    const charged = round2(exito ? num(exito.amount) : num(reg.chargeAmount ?? pricing.chargeAmount ?? reg.totalAmount));
    const payload = parse(exito?.payload);
    const surcharge = round2(Math.max(0, num(payload?.surcharge?.amount ?? pricing.surchargeAmount)));
    const refunded = round2(reembolsos.reduce((a, p) => a + num(p.refundedAmount ?? p.amount), 0));
    const paid = PAID_REGISTRATION_STATUSES.includes(String(reg.status || ''));
    const status = String(reg.status || '') === 'refunded' || refunded > TOL
        ? 'reembolsado'
        : paid ? 'confirmado'
            : String(reg.status || '') === 'payment_failed' ? 'fallido' : 'pendiente';
    return {
        status,
        currency,
        charged,
        surcharge,
        eventAmount: round2(Math.max(0, charged - surcharge - refunded)),
        refunded,
        paidAt: reg.paidAt || exito?.occurredAt || null,
        paymentIntentId: reg.stripePaymentIntentId || exito?.paymentIntentId || null,
        checkoutSessionId: reg.stripeSessionId || exito?.checkoutSessionId || null,
        chargeId: exito?.chargeId || stripeCheck?.chargeId || null,
        receiptUrl: exito?.receiptUrl || null,
        // v4.1251 — Un pago por PayPal no es «vía Stripe»: no hay nada que
        // verificar contra Stripe y el botón no debe ofrecerlo.
        viaStripe: Boolean(reg.stripePaymentIntentId || reg.stripeSessionId || (exito && exito.provider !== 'paypal')),
        stripe: stripeCheck ? {
            checkedAt: stripeCheck.checkedAt || null,
            status: stripeCheck.status || null,
            fee: round2(stripeCheck.fee),
            net: round2(stripeCheck.net),
            gross: round2(stripeCheck.gross),
            currency: cur(stripeCheck.currency),
            availableOn: stripeCheck.availableOn || null,
            balanceTxId: stripeCheck.balanceTxId || null,
            error: stripeCheck.error || null,
        } : null,
    };
};

// ── El estado del traslado DE UNA INSCRIPCIÓN ───────────────────────────────

export const REGISTRATION_TRANSFER_LABELS = {
    no_aplica: '—',
    sin_traslado: 'Pendiente de traslado',
    pendiente: 'Traslado pendiente',
    registrado: 'Traslado registrado',
    pendiente_verificacion: 'Pendiente de verificación',
    parcial: 'Traslado parcial',
    confirmado: 'Traslado confirmado',
};

/**
 * En qué punto está el dinero de una inscripción, a partir de sus asignaciones
 * en traslados ACTIVOS. Confirmado sólo cuando lo confirmado cubre lo que le
 * corresponde al evento.
 */
export const registrationTransferState = (payment, allocations = []) => {
    if (!payment || payment.status !== 'confirmado') return 'no_aplica';
    const activas = (allocations || []).filter(a => isActiveTransfer({ status: a.transferStatus }));
    if (!activas.length) return 'sin_traslado';
    const confirmado = activas.filter(a => a.transferStatus === 'confirmado').reduce((s, a) => s + num(a.amount), 0);
    if (confirmado + TOL >= payment.eventAmount && confirmado > 0) return 'confirmado';
    if (confirmado > TOL) return 'parcial';
    const orden = ['pendiente_verificacion', 'registrado', 'pendiente'];
    return orden.find(s => activas.some(a => a.transferStatus === s)) || 'pendiente';
};

/** Cuánto de una inscripción ya está asignado en traslados activos. */
export const allocatedOf = (allocations = [], { exceptTransferId = null } = {}) =>
    round2((allocations || [])
        .filter(a => isActiveTransfer({ status: a.transferStatus }) && a.transferId !== exceptTransferId)
        .reduce((s, a) => s + num(a.amount), 0));

// ── Validar un traslado antes de guardarlo ──────────────────────────────────

export const TRANSFER_METHODS = [
    { id: 'transferencia_bancaria', label: 'Transferencia bancaria' },
    { id: 'payout_stripe', label: 'Payout de Stripe' },
    { id: 'transferencia_internacional', label: 'Transferencia internacional' },
    { id: 'otro', label: 'Otro' },
];

/**
 * Valida un traslado individual o consolidado.
 *
 *   · Cada inscripción tiene que ser del evento, estar pagada y estar en la
 *     moneda del traslado (COP y USD no se mezclan).
 *   · ⚠️ NINGUNA INSCRIPCIÓN SE TRASLADA DOS VECES: lo asignado en traslados
 *     activos más lo nuevo no puede pasar de lo que le corresponde al evento.
 *   · El valor del traslado puede diferir de la suma asignada (costos bancarios,
 *     redondeos): se guarda y se muestra como «diferencia por conciliar».
 */
export const validateTransfer = ({ currency, amount, allocations = [], kind = 'individual' } = {}, {
    registrations = {}, paymentsByRegistration = {}, allocationsByRegistration = {}, exceptTransferId = null,
} = {}) => {
    const errores = [];
    const moneda = cur(currency);
    if (!/^[A-Z]{3}$/.test(moneda)) errores.push('Indica la moneda del traslado.');
    if (!(num(amount) > 0)) errores.push('El valor del traslado tiene que ser mayor que cero.');
    if (!['individual', 'consolidado'].includes(kind)) errores.push('Tipo de traslado desconocido.');
    if (!Array.isArray(allocations) || allocations.length === 0) errores.push('Elige al menos una inscripción.');
    if (kind === 'individual' && allocations.length > 1) errores.push('Un traslado individual cubre una sola inscripción; usa uno consolidado.');
    const vistas = new Set();
    for (const a of allocations || []) {
        const reg = registrations[a.registrationId];
        if (!reg) { errores.push('Una de las inscripciones no es de este evento.'); continue; }
        const nombre = reg.registrationCode || reg.publicRef || reg.id;
        if (vistas.has(a.registrationId)) { errores.push(`${nombre} está repetida.`); continue; }
        vistas.add(a.registrationId);
        const pago = paymentsByRegistration[a.registrationId];
        if (!pago || pago.status !== 'confirmado') { errores.push(`${nombre} no tiene un pago confirmado.`); continue; }
        if (pago.currency !== moneda) { errores.push(`${nombre} se cobró en ${pago.currency}, no en ${moneda}.`); continue; }
        if (!(num(a.amount) > 0)) { errores.push(`El valor asignado a ${nombre} tiene que ser mayor que cero.`); continue; }
        const ya = allocatedOf(allocationsByRegistration[a.registrationId], { exceptTransferId });
        if (ya + num(a.amount) > pago.eventAmount + TOL) {
            errores.push(`${nombre}: ya hay ${ya.toFixed(2)} ${moneda} asignados en otro traslado; el máximo es ${pago.eventAmount.toFixed(2)} ${moneda}.`);
        }
    }
    const asignado = round2((allocations || []).reduce((s, a) => s + num(a.amount), 0));
    return { ok: errores.length === 0, errores, asignado, diferencia: round2(num(amount) - asignado) };
};

// ── Comprobantes PDF ────────────────────────────────────────────────────────

export const PDF_MAX_BYTES = 10 * 1024 * 1024;

/** Un PDF de verdad: tipo declarado, tamaño y la firma `%PDF-` al inicio. */
export const checkPdf = ({ mime = '', bytes = 0, head = '' } = {}) => {
    const errores = [];
    if (String(mime).toLowerCase() !== 'application/pdf') errores.push('El comprobante tiene que ser un PDF.');
    if (!(bytes > 0)) errores.push('El archivo está vacío.');
    if (bytes > PDF_MAX_BYTES) errores.push('El PDF supera los 10 MB.');
    if (head && !String(head).startsWith('%PDF-')) errores.push('El archivo no es un PDF válido.');
    return { ok: errores.length === 0, errores };
};

// ── Datos bancarios del beneficiario ────────────────────────────────────────

/** «****4521»: lo que ve quien no puede ver la cuenta completa. */
export const maskAccount = (value) => {
    const s = String(value || '').replace(/\s+/g, '');
    if (!s) return '';
    return s.length <= 4 ? '****' : `****${s.slice(-4)}`;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

// ── El correo del comprobante ───────────────────────────────────────────────

const fmtMoney = (n, c) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c, minimumFractionDigits: c === 'COP' ? 0 : 2, maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(num(n));
    } catch { return `${round2(n)} ${c}`; }
};
const fmtDate = (d) => {
    if (!d) return 'sin fecha registrada';
    try { return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
    catch { return String(d); }
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * El correo del comprobante de traslado.
 *
 * ⚠️ SÓLO DICE «REALIZADO» CON EL TRASLADO CONFIRMADO. En cualquier otro estado
 * el mismo correo dice «registro del traslado» y su estado: un documento que
 * afirma una transferencia que todavía no se verificó es un documento falso.
 */
export const transferEmail = ({ eventTitle, beneficiary, transfer, allocationsCount = 0, recipientName = '' } = {}) => {
    const confirmado = transfer?.status === 'confirmado';
    const estado = TRANSFER_STATUS_LABELS[transfer?.status] || transfer?.status || '';
    const subject = `Comprobante de traslado de fondos — ${eventTitle || 'Evento'}`;
    const intro = confirmado
        ? `Adjuntamos el comprobante correspondiente al traslado de fondos realizado a favor de ${beneficiary || 'el beneficiario del evento'}, asociado al evento ${eventTitle || ''}.`
        : `Adjuntamos el soporte del registro del traslado de fondos a favor de ${beneficiary || 'el beneficiario del evento'}, asociado al evento ${eventTitle || ''}. El traslado se encuentra en estado «${estado}» y todavía no ha sido confirmado.`;
    const filas = [
        ['Evento', eventTitle || '—'],
        ['Beneficiario', beneficiary || '—'],
        ['Fecha del traslado', fmtDate(transfer?.transferDate)],
        ['Valor', fmtMoney(transfer?.amount, cur(transfer?.currency))],
        ['Referencia', transfer?.reference || '—'],
        ['Inscripciones asociadas', String(allocationsCount)],
        ['Estado', estado],
    ];
    const saludo = `Estimado/a ${recipientName || ''}`.trim() + ':';
    const cierre = 'El documento se remite para efectos de control, conciliación y trazabilidad financiera.';
    const text = [
        saludo, '', 'Reciba un cordial saludo de Rotary Distrito 4281.', '', intro, '', 'Detalle del movimiento:',
        ...filas.map(([k, v]) => `- ${k}: ${v}`), '', cierre, '', 'Cordialmente,', 'Rotary Distrito 4281',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.55">
<p>${esc(saludo)}</p><p>Reciba un cordial saludo de Rotary Distrito 4281.</p><p>${esc(intro)}</p>
<p><strong>Detalle del movimiento:</strong></p>
<table style="border-collapse:collapse">${filas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
<p>${esc(cierre)}</p><p>Cordialmente,<br/>Rotary Distrito 4281</p></div>`;
    return { subject, text, html, confirmado };
};

// ── Totales del evento por moneda ───────────────────────────────────────────

/**
 * Los indicadores del tablero, UNA tarjeta por moneda: COP y USD nunca se suman.
 * Recibe las inscripciones ya resueltas (`payment`, `transferState`, `allocated`).
 */
export const eventFundTotals = (rows = [], transfers = []) => {
    const out = {};
    const t = (c) => out[c] || (out[c] = {
        currency: c, pagosConfirmados: 0, pagosPendientes: 0, cobrado: 0, recargos: 0, valorEvento: 0,
        reembolsado: 0, comisionStripe: 0, verificados: 0,
        trasladoRegistrado: 0, trasladoConfirmado: 0, pendienteTraslado: 0,
        traslados: 0, trasladosConfirmados: 0, comprobantesAdjuntos: 0, comprobantesEnviados: 0, diferencias: 0,
    });
    for (const r of rows || []) {
        const p = r.payment;
        if (!p) continue;
        const x = t(p.currency || 'USD');
        if (p.status === 'pendiente') { x.pagosPendientes += 1; continue; }
        if (p.status === 'reembolsado') { x.reembolsado += p.refunded || p.charged; continue; }
        if (p.status !== 'confirmado') continue;
        x.pagosConfirmados += 1;
        x.cobrado += p.charged;
        x.recargos += p.surcharge;
        x.valorEvento += p.eventAmount;
        if (p.stripe && !p.stripe.error) { x.verificados += 1; x.comisionStripe += p.stripe.fee || 0; }
        const asignado = num(r.allocated);
        const confirmado = num(r.confirmedAmount);
        x.trasladoRegistrado += asignado;
        x.trasladoConfirmado += confirmado;
        x.pendienteTraslado += Math.max(0, p.eventAmount - asignado);
    }
    for (const tr of transfers || []) {
        if (!isActiveTransfer(tr)) continue;
        const x = t(cur(tr.currency) || 'USD');
        x.traslados += 1;
        if (tr.status === 'confirmado') x.trasladosConfirmados += 1;
        if (tr.hasDocument) x.comprobantesAdjuntos += 1;
        if (tr.noticesSent > 0) x.comprobantesEnviados += 1;
        if (Math.abs(num(tr.difference)) > TOL) x.diferencias += 1;
    }
    for (const x of Object.values(out)) {
        for (const k of ['cobrado', 'recargos', 'valorEvento', 'reembolsado', 'comisionStripe', 'trasladoRegistrado', 'trasladoConfirmado', 'pendienteTraslado']) x[k] = round2(x[k]);
    }
    return Object.values(out);
};
