// ════════════════════════════════════════════════════════════════════════════
// Por qué falló un mensaje de campaña, y qué se puede hacer — v4.1363.0
//
// Caso «Ver el video de invitación de John - 002» (Feria de Proyectos,
// 2026-11-27): 51 destinatarios, 42 fallidos con «In order to maintain a
// healthy ecosystem engagement, the message failed to be delivered» (Meta,
// código 131049). Meta ACEPTA el envío y después avisa por el webhook que no lo
// entregó. El seguimiento ofrecía «Corregir número» en cada fila y
// «Reintentar fallidos» volvía a mandar a los mismos: ni el número estaba mal
// ni el reintento podía funcionar.
//
// Dos situaciones distintas detrás del mismo código:
//   · Número de Estados Unidos (+1) con una plantilla de MARKETING: Meta no
//     entrega plantillas de marketing a números de EE. UU. (pausa vigente
//     desde abril de 2025). No se arregla reintentando ni corrigiendo nada:
//     sólo con una plantilla de UTILIDAD (si el contenido lo es de verdad) o
//     respondiendo dentro de las 24 h después de que la persona escriba.
//   · Cualquier otro país: Meta limita cuántos mensajes de marketing recibe
//     una persona. Reintentar enseguida vuelve a fallar; se espera 24 h.
//
// PURO: sin base ni red. Lo usan el seguimiento, el reintento, la
// verificación previa y el informe.
// ════════════════════════════════════════════════════════════════════════════

const POLICY_RE = /131049|healthy ecosystem|ecosystem engagement|per-user marketing|frequency cap/i;
const EXPERIMENT_RE = /part of an experiment|\bexperiment\b|130472/i;
const INVALID_PHONE_RE = /número inválido|numero invalido|no reconocido como colombiano|longitud inválida|invalid phone|wrong number|131026|undeliverable|not a whatsapp|1013/i;

/** Horas que Meta pide esperar antes de volver a intentar un mensaje de marketing limitado. */
export const MARKETING_RETRY_WAIT_HOURS = 24;

const digits = (p) => String(p || '').replace(/\D/g, '');

/**
 * ¿Número de Estados Unidos? +1 de 11 dígitos, salvo que el contacto diga
 * Canadá (comparte el +1 y la pausa de Meta es sólo para EE. UU.).
 */
export const isUsNumber = (phone, country = null) => {
    const d = digits(phone);
    if (!(d.length === 11 && d.startsWith('1'))) return false;
    const c = String(country || '').trim().toUpperCase();
    return !(c === 'CA' || c === 'CANADA' || c === 'CANADÁ');
};

export const isMarketingTemplate = (category) => String(category || 'MARKETING').toUpperCase() === 'MARKETING';

/**
 * @returns {{ kind, title, explanation, action, retryable, canFixNumber }}
 *   kind: 'meta_us_marketing' | 'meta_marketing_limit' | 'meta_experiment' | 'invalid_phone' | 'other'
 */
export const classifyCampaignFailure = ({ errorMessage = '', phone = '', country = null, templateCategory = 'MARKETING', failedAt = null, now = Date.now() } = {}) => {
    const msg = String(errorMessage || '');
    if (POLICY_RE.test(msg)) {
        if (isUsNumber(phone, country) && isMarketingTemplate(templateCategory)) {
            return {
                kind: 'meta_us_marketing',
                title: 'Meta no entrega marketing a números de EE. UU. (+1)',
                explanation: 'Meta no entrega plantillas de MARKETING a números de Estados Unidos (+1) por WhatsApp. El número está bien y la campaña también: reintentar o corregir el número no cambia nada.',
                action: 'Para llegarle: una plantilla de UTILIDAD (si el contenido lo es de verdad), o esperar a que la persona escriba y responderle dentro de las 24 horas.',
                retryable: false,
                canFixNumber: false,
            };
        }
        const failedMs = failedAt ? new Date(failedAt).getTime() : NaN;
        const waitedEnough = Number.isFinite(failedMs) && (now - failedMs) >= MARKETING_RETRY_WAIT_HOURS * 3600 * 1000;
        return {
            kind: 'meta_marketing_limit',
            title: 'Meta limitó los mensajes de marketing a esta persona',
            explanation: 'Meta no entregó el mensaje para cuidar la experiencia del destinatario («healthy ecosystem engagement»): recibió muchos mensajes de marketing recientemente o no suele interactuar con ellos. El número está bien.',
            action: waitedEnough
                ? 'Ya pasaron 24 horas: se puede reintentar, aunque Meta puede volver a limitarlo.'
                : 'No reintentar antes de 24 horas: volvería a fallar. Si la persona escribe, se le puede responder dentro de las 24 horas.',
            retryable: waitedEnough,
            canFixNumber: false,
        };
    }
    if (EXPERIMENT_RE.test(msg)) {
        return {
            kind: 'meta_experiment',
            title: 'Meta dejó a este número en un grupo de control',
            explanation: 'Meta eligió este número para un experimento de mensajes de marketing y no le entrega este tipo de mensajes. No es un fallo del número ni de la campaña.',
            action: 'No se resuelve reintentando. Si la persona escribe, se le puede responder dentro de las 24 horas.',
            retryable: false,
            canFixNumber: false,
        };
    }
    if (INVALID_PHONE_RE.test(msg)) {
        return {
            kind: 'invalid_phone',
            title: 'El número no es válido o no tiene WhatsApp',
            explanation: 'El número no pasó la validación o Meta no pudo entregarle a esa cuenta de WhatsApp.',
            action: 'Revisa el número y su indicativo internacional.',
            retryable: true,
            canFixNumber: true,
        };
    }
    return {
        kind: 'other',
        title: 'Meta no entregó el mensaje',
        explanation: msg ? `Lo que respondió Meta: ${msg}` : 'No se registró el motivo del fallo.',
        action: 'Se puede reintentar. Si se repite, revisa el número del contacto.',
        retryable: true,
        canFixNumber: true,
    };
};

/** Resumen de los fallos de una campaña por tipo. */
export const summarizeFailures = (rows = [], ctx = {}) => {
    const out = { meta_us_marketing: 0, meta_marketing_limit: 0, meta_experiment: 0, invalid_phone: 0, other: 0, notRetryable: 0 };
    for (const r of rows) {
        const f = classifyCampaignFailure({ ...ctx, errorMessage: r.errorMessage, phone: r.phone, country: r.contactCountry ?? r.country, failedAt: r.failedAt });
        out[f.kind]++;
        if (!f.retryable) out.notRetryable++;
    }
    return out;
};

export default { isUsNumber, isMarketingTemplate, classifyCampaignFailure, summarizeFailures, MARKETING_RETRY_WAIT_HOURS };
