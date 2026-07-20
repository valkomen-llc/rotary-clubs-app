/**
 * Hub Social — servicio de Webhooks de Meta.
 *
 * Responsabilidades:
 *   1. Verificar el handshake de suscripción (GET con hub.challenge).
 *   2. Validar la firma X-Hub-Signature-256 (HMAC-SHA256 del cuerpo crudo con
 *      el App Secret) — garantiza que el evento realmente viene de Meta.
 *   3. Normalizar el payload en una lista plana de eventos
 *      { object, field, entryId, value } fáciles de procesar.
 *
 * La verificación de firma REQUIERE el cuerpo crudo (Buffer), por eso la ruta
 * POST se monta con express.raw ANTES de express.json (igual que el webhook de
 * Stripe). Ver api/index.js.
 *
 * Env:
 *   META_WEBHOOK_VERIFY_TOKEN — token arbitrario que configurás en el panel de
 *     Meta al suscribir el webhook (debe coincidir en ambos lados).
 *   META_APP_SECRET / FB_APP_SECRET — para validar la firma.
 */

import crypto from 'crypto';

const getAppSecret = () =>
    process.env.META_APP_SECRET || process.env.FB_APP_SECRET || '';

const getVerifyToken = () =>
    process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_APP_SECRET || 'rotary-hub-social';

// GET /webhooks/meta — handshake de suscripción.
// Devuelve { ok, challenge } si el verify_token coincide.
export const verifyWebhookChallenge = (query = {}) => {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && token && token === getVerifyToken()) {
        return { ok: true, challenge };
    }
    return { ok: false, challenge: null };
};

// Valida X-Hub-Signature-256 contra el cuerpo crudo. Usa comparación en tiempo
// constante para evitar timing attacks. Si no hay app secret configurado,
// devuelve false (no confiamos en eventos sin poder verificarlos).
export const verifySignature = ({ rawBody, signatureHeader }) => {
    const appSecret = getAppSecret();
    if (!appSecret || !rawBody || !signatureHeader) return false;
    const expected =
        'sha256=' +
        crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    try {
        const a = Buffer.from(signatureHeader);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
};

// Normaliza el payload de Meta en eventos planos.
// Estructura Meta:
//   { object: "page"|"instagram", entry: [ { id, time, changes:[{field,value}], messaging:[...] } ] }
export const normalizeWebhookPayload = (body) => {
    const events = [];
    if (!body || typeof body !== 'object') return events;
    const object = body.object || null;
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
        const entryId = entry.id || null;
        // Cambios de feed/comments/mentions (formato `changes`).
        for (const change of entry.changes || []) {
            events.push({
                object,
                field: change.field || null,
                entryId,
                value: change.value || {},
                time: entry.time || null
            });
        }
        // Mensajería (Messenger / IG Direct) usa `messaging`.
        for (const msg of entry.messaging || []) {
            events.push({
                object,
                field: 'messages',
                entryId,
                value: msg,
                time: entry.time || null
            });
        }
    }
    return events;
};

export const hasWebhookConfig = () => !!getAppSecret();
