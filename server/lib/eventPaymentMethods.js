// CON QUÉ SE PAGA UNA INSCRIPCIÓN A UN EVENTO. Puro: sin base, sin red, sin DOM.
//
// v4.1251 — Pedido del cliente: «el medio de pago de los eventos de la página
// del Distrito 4281 sea por defecto el que está conectado de PayPal en las
// pasarelas de pago, ya que aparece Stripe y debe ser el PayPal de
// COLROTARIOS».
//
// ═════════════════════════════════════════════════════════════════════
// PAYPAL POR DEFECTO, LA TARJETA COMO ALTERNATIVA
// ═════════════════════════════════════════════════════════════════════
//
// Cuando PayPal se OFRECE —credenciales cargadas y activado en Métodos de
// pago— y puede cobrar la moneda de la inscripción (directa o convertida con
// la tasa del día), es la vía por defecto. La tarjeta sigue disponible debajo:
// es la red de seguridad de quien no tiene PayPal, y quitarla dejaría sin
// inscribirse a alguien que hoy sí puede.
//
// Si PayPal NO se puede ofrecer, la inscripción se paga con tarjeta como hasta
// ahora. Nunca queda una inscripción sin vía de cobro.
//
// ⚠️ EL DINERO ENTRA A LA CUENTA DE LA PLATAFORMA en las dos vías, como en los
// aportes: el PayPal de COLROTARIOS y el Stripe de siempre. Esto decide POR
// DÓNDE se cobra, no a qué cuenta entra.

export const EVENT_PAYMENT_METHODS = ['paypal', 'card'];

/**
 * Las opciones de pago de una inscripción.
 *
 * `paypalOffered` es lo que dice Métodos de pago (configurado Y activado);
 * `plan` es lo que contestó `resolvePaypalCharge` para la moneda del cobro.
 * Las dos tienen que ser ciertas: un botón que lleva a un error del proveedor
 * es peor que ninguno (v4.650).
 */
export const resolveEventPaymentOptions = ({ paypalOffered = false, plan = null, env = null } = {}) => {
    const paypalOk = !!paypalOffered && !!plan?.ok;
    const paypal = {
        id: 'paypal',
        available: paypalOk,
        // El motivo viaja aunque no se le muestre al visitante: es lo que
        // permite diagnosticar un botón ausente sin abrir la base.
        reason: !paypalOffered ? 'no_ofrecido' : (plan?.ok ? null : (plan?.reason || 'sin_plan')),
        currency: paypalOk ? (plan.currency || null) : null,
        // ⚠️ LA CONVERSIÓN VIAJA PARA QUE LA PANTALLA LA DIGA antes de salir
        // hacia PayPal: convertir en silencio sería cambiarle el trato.
        converted: paypalOk && !!plan.converted,
        originalCurrency: paypalOk ? (plan.originalCurrency || null) : null,
        perUnit: paypalOk ? (plan.perUnit ?? null) : null,
        rateSource: paypalOk ? (plan.rateSource ?? null) : null,
        env: paypalOk ? env : null,
    };
    const card = { id: 'card', available: true, reason: null };
    return {
        defaultMethod: paypalOk ? 'paypal' : 'card',
        methods: [paypal, card],
    };
};

/**
 * Qué vía usar para ESTE cobro.
 *
 * Lo pedido manda si está disponible; si no se pidió nada —una pantalla
 * anterior a esta versión— se usa la de por defecto. Pedir PayPal cuando no se
 * puede no cae en silencio a la tarjeta: se devuelve `null` y el controlador
 * lo dice, porque cobrar por una vía distinta de la elegida es otro trato.
 */
export const pickEventPaymentMethod = (requested, options) => {
    const pedido = String(requested || '').trim().toLowerCase();
    const disponible = (id) => !!options?.methods?.find(m => m.id === id && m.available);
    if (!pedido) return disponible(options?.defaultMethod) ? options.defaultMethod : 'card';
    if (!EVENT_PAYMENT_METHODS.includes(pedido)) return null;
    return disponible(pedido) ? pedido : null;
};

/**
 * La referencia que viaja en `custom_id` del pedido de PayPal.
 *
 * Es lo que separa, en el webhook compartido, una inscripción de un aporte:
 * los aportes llevan ahí el id del sitio. Con un prefijo propio no hay forma
 * de confundirlos — y confundirlos registraría una inscripción como donación.
 */
export const PAYPAL_REGISTRATION_PREFIX = 'evreg:';

export const paypalCustomIdFor = (registrationId) =>
    `${PAYPAL_REGISTRATION_PREFIX}${String(registrationId || '').trim()}`.slice(0, 127);

export const registrationIdFromCustomId = (customId) => {
    const v = String(customId || '').trim();
    if (!v.startsWith(PAYPAL_REGISTRATION_PREFIX)) return null;
    return v.slice(PAYPAL_REGISTRATION_PREFIX.length) || null;
};

/**
 * La clave de idempotencia de una captura en `EventRegistrationPayment`.
 *
 * Va en la columna `stripeEventId`, que se sigue llamando así por historia y
 * tiene el índice único parcial: el retorno del navegador y el webhook
 * convergen en la misma captura y sólo uno de los dos confirma.
 */
export const paypalPaymentKey = (captureId) => {
    const v = String(captureId || '').trim();
    return v ? `paypal:${v}` : null;
};

export default {
    EVENT_PAYMENT_METHODS, resolveEventPaymentOptions, pickEventPaymentMethod,
    PAYPAL_REGISTRATION_PREFIX, paypalCustomIdFor, registrationIdFromCustomId, paypalPaymentKey,
};
