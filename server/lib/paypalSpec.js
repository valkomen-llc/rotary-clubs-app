// EL CRITERIO DE PAYPAL. Puro: sin base, sin red, sin DOM.
//
// v4.866 — PayPal como segunda vía de aporte.
//
// ═════════════════════════════════════════════════════════════════════
// EL DINERO ENTRA A LA CUENTA DE LA PLATAFORMA, COMO CON STRIPE
// ═════════════════════════════════════════════════════════════════════
//
// Es la decisión que gobierna todo lo demás y la tomó el cliente: la cuenta de
// PayPal es UNA, la de Club Platform, igual que `STRIPE_SECRET_KEY`. Por eso la
// retención de la plataforma se aplica igual, el saldo de la Bóveda sigue
// siendo la verdad y el club retira por donde retira hoy.
//
// `PaymentProviderConfig` modela una cuenta de PayPal POR CLUB desde hace
// versiones y NO se usa acá: con el dinero entrando directo al club, el 2,1 %
// no se podría retener y el saldo de la Bóveda dejaría de ser real. Queda
// declarado y sin implementar, que es distinto de olvidado.
//
// ═════════════════════════════════════════════════════════════════════
// NO SE CONVIERTE NINGÚN IMPORTE. NUNCA.
// ═════════════════════════════════════════════════════════════════════
//
// Si la cuenta de PayPal no puede cobrar en la moneda que se le ofreció al
// visitante, el botón NO SE MUESTRA. No se convierte: es la misma regla que
// rige el `fx` de las inscripciones a eventos y la moneda del aporte (v4.834)
// —«sin tasa configurada no se inventa una»—, y acá sería peor, porque el
// visitante ya vio una cifra concreta en la pantalla.

import { normalizeCurrency, currencyMeta } from './money.js';

/** Las monedas que PayPal NO subdivide. El resto va con dos decimales.
 *
 *  ⚠️ NO se usa `currencyMeta().decimals` acá: aquello es cómo se ESCRIBE el
 *  importe en la plataforma —el peso colombiano se muestra sin centavos— y esto
 *  es lo que PayPal espera en el campo `value`. Son dos nociones distintas, la
 *  misma lección que `stripeDecimals` frente a los decimales de presentación.
 *  Ante la duda mandamos dos decimales, que es lo que PayPal acepta para la
 *  inmensa mayoría de las monedas. */
export const PAYPAL_ZERO_DECIMAL = new Set(['HUF', 'JPY', 'TWD']);

export const paypalDecimals = (currency) =>
    PAYPAL_ZERO_DECIMAL.has(normalizeCurrency(currency)) ? 0 : 2;

/**
 * El importe como lo quiere PayPal: una CADENA con los decimales exactos.
 *
 * Mandar un número —o una cadena con más decimales de los que la moneda
 * admite— es rechazo del proveedor, no un redondeo silencioso.
 */
export const paypalAmount = (amount, currency) => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Importe inválido para PayPal: ${amount}`);
    return n.toFixed(paypalDecimals(currency));
};

/**
 * ¿Se puede cobrar por PayPal en esta moneda?
 *
 * `configurada` es lo que declare el entorno (`PAYPAL_CURRENCY`), es decir la
 * moneda que la cuenta de PayPal puede recibir. VACÍA significa «la que venga»:
 * es el valor por defecto y hace que el botón se comporte como el de Stripe.
 *
 * Devuelve el MOTIVO cuando no se puede: un botón que desaparece sin
 * explicación es indistinguible de uno roto.
 */
export const paypalCurrencyOk = (deseada, configurada) => {
    const quiere = normalizeCurrency(deseada);
    const puede = normalizeCurrency(configurada);
    if (!quiere) return { ok: false, reason: 'sin_moneda' };
    if (!puede) return { ok: true, currency: quiere, reason: 'cualquiera' };
    if (puede === quiere) return { ok: true, currency: quiere, reason: 'coincide' };
    // ⚠️ ACÁ NO SE CONVIERTE. El visitante ya vio «$ 100.000» en la pantalla;
    // cobrarle otra cifra en otra moneda sería cambiarle el trato.
    return { ok: false, reason: 'moneda_distinta', puede, quiere };
};

export const MOTIVOS_MONEDA = {
    sin_moneda: 'No se resolvió la moneda del aporte.',
    moneda_distinta: 'La cuenta de PayPal no cobra en la moneda de este aporte, y los importes no se convierten.',
};

/**
 * Lo que hay que leer de la respuesta de CAPTURA.
 *
 * PayPal entrega la comisión en `seller_receivable_breakdown`, así que el costo
 * del procesador queda MEDIDO —no estimado— igual que el balance transaction de
 * Stripe. La Bóveda ya distingue las dos cosas desde v4.850.
 */
export const parseCapture = (order) => {
    const unidad = order?.purchase_units?.[0];
    const captura = unidad?.payments?.captures?.[0];
    if (!captura) return { ok: false, reason: 'sin_captura' };

    const desglose = captura.seller_receivable_breakdown || {};
    const moneda = normalizeCurrency(captura.amount?.currency_code || desglose.gross_amount?.currency_code);
    const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const bruto = num(captura.amount?.value ?? desglose.gross_amount?.value);
    if (bruto === null || bruto <= 0) return { ok: false, reason: 'sin_importe' };

    // ⚠️ La comisión se toma SÓLO si viene en la misma moneda del cobro. PayPal
    // puede denominarla en la moneda de la cuenta cuando difieren, y restar una
    // moneda de otra es exactamente el defecto que costó la v4.845 con Stripe.
    const monedaComision = normalizeCurrency(desglose.paypal_fee?.currency_code);
    const comisionCruda = num(desglose.paypal_fee?.value);
    const comisionMedida = comisionCruda !== null && monedaComision === moneda;

    return {
        ok: true,
        captureId: captura.id,
        status: captura.status || null,
        currency: moneda,
        gross: bruto,
        // `null` es «no se sabe», NO cero: sin dato se estima con la regla y se
        // declara como estimada. Un cero afirmaría que PayPal no cobró nada.
        processorFee: comisionMedida ? comisionCruda : null,
        feeCurrency: monedaComision || null,
        basis: comisionMedida ? 'medida' : 'estimada',
        // Con qué se pagó, para la ficha del aportante.
        payer: {
            email: order?.payer?.email_address || null,
            name: [order?.payer?.name?.given_name, order?.payer?.name?.surname].filter(Boolean).join(' ') || null,
            payerId: order?.payer?.payer_id || null,
        },
    };
};

/**
 * Cuándo puede el club retirar este dinero.
 *
 * ⚠️ PayPal NO tiene `available_on`: al capturar, el dinero ya está en el saldo
 * de la cuenta. No hay tránsito del proveedor que esperar, así que
 * `availableOn` es el momento de la captura y sólo corre el margen operativo de
 * la plataforma — el MISMO que con Stripe, para que dos aportes del mismo día
 * no tengan reglas distintas según por dónde entraron.
 */
export const paypalAvailability = (capturadoEl, holdingDays) => {
    const base = capturadoEl ? new Date(capturadoEl) : new Date();
    const dias = Number.isFinite(Number(holdingDays)) ? Number(holdingDays) : 6;
    return {
        availableOn: base,
        clubAvailableOn: new Date(base.getTime() + dias * 24 * 60 * 60 * 1000),
    };
};

/** El enlace al que hay que mandar al donante para que apruebe. PayPal lo
 *  nombra `payer-action` en los pedidos nuevos y `approve` en los clásicos; se
 *  aceptan los dos porque cuál llega depende de cómo se creó el pedido. */
export const approvalUrl = (order) =>
    (order?.links || []).find(l => l?.rel === 'payer-action' || l?.rel === 'approve')?.href || null;

/** El `providerRef` de un aporte de PayPal.
 *
 *  Es el id de la CAPTURA y no el del pedido: el pedido puede existir sin que
 *  nadie haya pagado, y lo que la Bóveda registra es dinero cobrado. El índice
 *  único es `(provider, providerRef)`, así que una referencia de PayPal no
 *  choca con una de Stripe. */
export const paypalRef = (captureId) => String(captureId || '').trim() || null;

export default {
    PAYPAL_ZERO_DECIMAL, paypalDecimals, paypalAmount,
    paypalCurrencyOk, MOTIVOS_MONEDA, parseCapture, paypalAvailability,
    approvalUrl, paypalRef,
};
