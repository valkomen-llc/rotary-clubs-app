// LA I/O DE PAYPAL. El criterio vive en `paypalSpec.js`.
//
// v4.866 — Está separado por el mismo motivo que `feeRulesStore.js` lo está de
// `feeRules.js`: un criterio que sólo se puede ejercitar contra la API de un
// tercero termina sin pruebas.

import { paypalAmount, approvalUrl } from './paypalSpec.js';

const LIVE = 'https://api-m.paypal.com';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

/** Sandbox salvo que se diga expresamente lo contrario.
 *
 *  ⚠️ El valor por defecto es el SEGURO: una variable mal escrita deja los
 *  cobros en sandbox —donde no se mueve dinero real— en vez de mandarlos a
 *  producción por descuido. */
export const paypalEnv = () =>
    String(process.env.PAYPAL_ENV || '').trim().toLowerCase() === 'live' ? 'live' : 'sandbox';

export const paypalBase = () => (paypalEnv() === 'live' ? LIVE : SANDBOX);

/**
 * Las credenciales, SIN espacios ni saltos de línea.
 *
 * ⚠️ El `.trim()` no es cosmético: al pegar el secreto en el panel de variables
 * de entorno es fácil arrastrar un salto de línea o un espacio final, y PayPal
 * responde `invalid_client` —«Client Authentication failed»— sin decir que
 * sobra un carácter. Es una de las dos causas habituales de ese error y la
 * única que se puede corregir desde acá.
 */
export const paypalCredentials = () => ({
    id: String(process.env.PAYPAL_CLIENT_ID || '').trim(),
    secret: String(process.env.PAYPAL_CLIENT_SECRET || '').trim(),
});

/** ¿Está configurado? Sin las dos credenciales el botón NO se muestra: uno que
 *  lleva a un error del proveedor es peor que ninguno (v4.650). */
export const paypalConfigured = () => {
    const { id, secret } = paypalCredentials();
    return !!(id && secret);
};

// El token dura horas y esto corre en el camino del cobro: pedirlo en cada
// aporte sería un viaje de red de más antes de poder cobrar. Se guarda con su
// vencimiento y un margen, igual que la caché de dominios verificados.
let token = null;
let tokenExp = 0;

export const paypalToken = async () => {
    if (token && Date.now() < tokenExp) return token;
    if (!paypalConfigured()) throw new Error('PayPal no está configurado (falta PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET).');

    const { id, secret } = paypalCredentials();
    const basic = Buffer.from(`${id}:${secret}`).toString('base64');
    const r = await fetch(`${paypalBase()}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.access_token) {
        // El error del proveedor se propaga TEXTUAL: convertirlo en «no se pudo
        // conectar» deja a quien corrige sin saber si es la credencial, el
        // entorno o el permiso. Es la regla que el CRM aprendió con `metaCode`.
        //
        // ⚠️ Y SE DICE EL ENTORNO. «Client Authentication failed» a secas no
        // distingue la causa más frecuente —credenciales de Sandbox contra el
        // servidor Live, o al revés— de un secreto mal pegado. El entorno es el
        // dato que parte el diagnóstico en dos, y no estaba.
        const motivo = data?.error_description || data?.error || `HTTP ${r.status}`;
        const err = new Error(`PayPal rechazó las credenciales (entorno ${paypalEnv()}): ${motivo}`);
        err.paypalEnv = paypalEnv();
        err.paypalError = data?.error || null;
        err.status = r.status;
        throw err;
    }
    token = data.access_token;
    // Margen de 60 s: un token que vence entre que se lee y se usa da un 401
    // que parece un problema de credenciales y no lo es.
    tokenExp = Date.now() + Math.max(0, (Number(data.expires_in) || 0) - 60) * 1000;
    return token;
};

/** Se vacía al cambiar de entorno o credenciales; lo usan las pruebas. */
export const resetPaypalToken = () => { token = null; tokenExp = 0; };

const call = async (metodo, ruta, cuerpo, extraHeaders = {}) => {
    const t = await paypalToken();
    const r = await fetch(`${paypalBase()}${ruta}`, {
        method: metodo,
        headers: {
            Authorization: `Bearer ${t}`,
            'Content-Type': 'application/json',
            ...extraHeaders,
        },
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        const detalle = data?.details?.[0]?.description || data?.message || `HTTP ${r.status}`;
        const err = new Error(`PayPal: ${detalle}`);
        err.paypal = data;
        err.status = r.status;
        throw err;
    }
    return data;
};

/**
 * Crea el pedido. NO cobra nada todavía: devuelve la dirección a la que hay que
 * mandar al donante para que apruebe.
 *
 * `custom_id` lleva nuestra referencia y `invoice_id` no se usa: PayPal exige
 * que `invoice_id` sea único por cuenta y un reintento legítimo del donante lo
 * haría chocar.
 */
export const createPaypalOrder = async ({
    amount, currency, description, returnUrl, cancelUrl, customId, requestId,
}) => {
    const order = await call('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{
            amount: { currency_code: currency, value: paypalAmount(amount, currency) },
            description: String(description || 'Aporte').slice(0, 127),
            custom_id: String(customId || '').slice(0, 127),
        }],
        payment_source: {
            paypal: {
                experience_context: {
                    return_url: returnUrl,
                    cancel_url: cancelUrl,
                    user_action: 'PAY_NOW',
                    shipping_preference: 'NO_SHIPPING',
                },
            },
        },
    }, requestId ? { 'PayPal-Request-Id': String(requestId) } : {});

    return { id: order?.id, status: order?.status, approveUrl: approvalUrl(order), raw: order };
};

/**
 * Cobra el pedido aprobado.
 *
 * ⚠️ `PayPal-Request-Id` con el id del pedido hace la captura IDEMPOTENTE del
 * lado de PayPal: dos vueltas simultáneas —el retorno del navegador y el
 * webhook— no cobran dos veces. Del lado nuestro la protección es el índice
 * único `(provider, providerRef)`, igual que con Stripe: son dos barreras y las
 * dos hacen falta.
 */
export const capturePaypalOrder = async (orderId) =>
    call('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, {
        'PayPal-Request-Id': `capture-${orderId}`,
    });

export const getPaypalOrder = async (orderId) =>
    call('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);

/**
 * ¿El webhook lo mandó PayPal de verdad?
 *
 * Devuelve `true` / `false` / `null`. **`null` es «no se pudo comprobar», que
 * NO es lo mismo que «firma inválida»**: decir que una firma es falsa sin
 * haberla verificado manda a buscar un problema de seguridad inexistente. Es la
 * regla que el CRM dejó escrita con `verifySignature`.
 */
export const verifyPaypalWebhook = async (headers, event) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return null;
    const h = (k) => headers?.[k] || headers?.[k.toLowerCase()] || null;
    const payload = {
        transmission_id: h('paypal-transmission-id'),
        transmission_time: h('paypal-transmission-time'),
        cert_url: h('paypal-cert-url'),
        auth_algo: h('paypal-auth-algo'),
        transmission_sig: h('paypal-transmission-sig'),
        webhook_id: webhookId,
        webhook_event: event,
    };
    if (Object.values(payload).some(v => v === null || v === undefined)) return null;
    try {
        const data = await call('POST', '/v1/notifications/verify-webhook-signature', payload);
        return data?.verification_status === 'SUCCESS';
    } catch (e) {
        console.warn('[PAYPAL] No se pudo verificar la firma del webhook:', e?.message);
        return null;
    }
};

export default {
    paypalEnv, paypalBase, paypalConfigured, paypalToken, resetPaypalToken,
    createPaypalOrder, capturePaypalOrder, getPaypalOrder, verifyPaypalWebhook,
};
