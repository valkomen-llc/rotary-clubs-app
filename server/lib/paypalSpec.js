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
// NO SE INVENTA UNA TASA. CONVERTIR A LA VISTA SÍ SE PUEDE (v4.870)
// ═════════════════════════════════════════════════════════════════════
//
// Hasta v4.869 acá no se convertía NUNCA y el botón sencillamente no se
// mostraba. El motivo era bueno —«el visitante ya vio una cifra concreta»— y la
// consecuencia, inaceptable: PayPal no procesa pesos colombianos, así que en el
// sitio de un distrito colombiano el botón no aparecía jamás, que es donde vive
// la mayoría de los aportes.
//
// La regla real del sitio nunca fue «no se convierte»: es «NO SE INVENTA UNA
// TASA». Es la del `fx` de las inscripciones a eventos —`currency` es lo que se
// publica, `settlementCurrency` lo que cobra la pasarela, y si difieren se
// convierte con una tasa CONFIGURADA guardando los tres datos—. Eso sigue
// intacto: sin tasa configurada no se convierte y el botón no se muestra.
//
// ⚠️ Y LA CONVERSIÓN SE DICE ANTES DE COBRAR. Es la mitad que la hace legítima:
// quien eligió «$ 100.000» tiene que leer «se te cobrarán US$ 24,80» antes de
// salir hacia PayPal. Convertir EN SILENCIO sería cambiarle el trato a mitad de
// camino; convertir A LA VISTA es otra cosa.

import { normalizeCurrency, currencyMeta } from './money.js';
import { convertAmount, rateFor, MOTIVOS_FX } from './fxRates.js';

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
    moneda_distinta: 'La cuenta de PayPal no cobra en la moneda de este aporte y no hay una tasa de cambio configurada para convertirlo.',
    ...MOTIVOS_FX,
};

/**
 * QUÉ SE LE VA A COBRAR A ESTE VISITANTE POR PAYPAL.
 *
 * Un solo punto de decisión, y por eso lo usan las DOS puntas: la consulta de
 * disponibilidad —que pinta o no el botón— y la creación del pedido —que cobra—.
 * Con dos criterios, el modal podría prometer una cifra y el cobro salir por
 * otra, que es exactamente el defecto que no se puede tener acá.
 *
 * `amount` es OPCIONAL: al abrir el modal todavía no hay importe elegido y hace
 * falta saber igual si el botón se puede pintar.
 *
 * Tres desenlaces:
 *   - la cuenta cobra en esa moneda           → se cobra tal cual
 *   - no la cobra y HAY tasa configurada      → se convierte, y se DICE
 *   - no la cobra y no hay tasa               → no se ofrece, con su motivo
 */
export const resolvePaypalCharge = ({ amount = null, currency, settlement, rates, ahora = new Date() } = {}) => {
    const base = paypalCurrencyOk(currency, settlement);

    // Se cobra en la moneda que el visitante vio: no hay nada que convertir.
    if (base.ok) {
        return {
            ok: true,
            converted: false,
            currency: base.currency,
            originalCurrency: base.currency,
            amount: amount === null ? null : Number(amount),
            originalAmount: amount === null ? null : Number(amount),
            reason: base.reason,
        };
    }
    if (base.reason !== 'moneda_distinta') return { ...base, converted: false };

    const destino = normalizeCurrency(settlement);
    const origen = normalizeCurrency(currency);

    // Sin importe todavía: alcanza con saber si existe la tasa.
    if (amount === null) {
        const tasa = rateFor(rates, origen, destino);
        if (!tasa) return { ok: false, converted: false, reason: 'sin_tasa', puede: destino, quiere: origen };
        return {
            ok: true,
            converted: true,
            currency: destino,
            originalCurrency: origen,
            amount: null,
            originalAmount: null,
            perUnit: tasa.perUnit,
            rateSource: tasa.source,
            rateUpdatedAt: tasa.updatedAt,
            reason: 'convertido',
        };
    }

    const conv = convertAmount(amount, origen, destino, rates, ahora);
    if (!conv.ok) return { ...conv, converted: false, puede: destino, quiere: origen };
    return { ...conv, ok: true, converted: true, reason: 'convertido' };
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
    paypalCurrencyOk, resolvePaypalCharge, MOTIVOS_MONEDA, parseCapture, paypalAvailability,
    approvalUrl, paypalRef,
};
