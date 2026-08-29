// ════════════════════════════════════════════════════════════════════
// Adjuntos del compositor de correo — el CRITERIO — v4.953.0
//
// PURO: sin base, sin red, sin S3. Lo consumen el endpoint que prefirma la
// subida, el envío (`sendCommunication`) y —espejado en
// `src/lib/mailAttachments.ts`— la pantalla del compositor, que valida ANTES
// de enviar con estos MISMOS números y estas MISMAS frases.
//
// ⚠️ POR QUÉ EXISTE. Hasta v4.952 los adjuntos viajaban como base64 dentro
// del JSON de `POST /api/communications/send`. En Vercel el cuerpo de una
// función se corta en ~4,5 MB (`413 FUNCTION_PAYLOAD_TOO_LARGE`, en el borde
// de la plataforma, ANTES de Express — cuyo límite de 25 MB nunca se
// alcanzaba): dos adjuntos de 3,0 y 2,0 MB → ~6,7 MB en base64 → 413 crudo en
// la pantalla. El tope del cliente (8 MB) era MAYOR que lo que la
// infraestructura permitía, así que codificaba el fallo. Es la misma lección
// del comprobante de inscripciones (v4.943): el archivo NO viaja por el
// cuerpo de la función — sube DIRECTO a S3 con URL prefirmada y por el JSON
// viaja la CLAVE.
//
// LÍMITES, con su porqué (no son un número al azar):
// - 10 MB por archivo — el mismo orden que el comprobante (v4.943).
// - 15 MB en total — Gmail y Outlook rechazan mensajes MIME de más de
//   ~25 MB: 15 MB crudos ≈ 20 MB en base64 + cuerpo HTML < 25 MB, así que el
//   tope garantiza que el mensaje ENTRE en el buzón del destinatario. Resend
//   acepta hasta 40 MB, o sea que el proveedor no es la cota.
//
// Al cambiar un límite, cambiar TAMBIÉN el espejo — la paridad la comprueba
// `npm run test:mail-attachments` comparando SALIDAS.
// ════════════════════════════════════════════════════════════════════

export const MAIL_ATTACHMENT_PREFIX = 'private/mail-attachments';
export const MAX_MAIL_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MAIL_TOTAL_BYTES = 15 * 1024 * 1024;

const fmtMB = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * Valida un conjunto de adjuntos `{ filename, size }` contra los dos límites.
 * Devuelve TODOS los problemas, no sólo el primero: «configuración inválida»
 * a secas obliga a probar archivo por archivo.
 */
export const checkMailAttachments = (list) => {
    const errores = [];
    const items = Array.isArray(list) ? list : [];
    let total = 0;
    for (const a of items) {
        const name = String(a?.filename || '').trim();
        const size = Number(a?.size) || 0;
        if (!name) {
            errores.push('Un adjunto no tiene nombre de archivo.');
            continue;
        }
        if (size <= 0) {
            errores.push(`«${name}» llegó vacío.`);
            continue;
        }
        if (size > MAX_MAIL_FILE_BYTES) {
            errores.push(`«${name}» pesa ${fmtMB(size)} y el máximo por archivo es ${fmtMB(MAX_MAIL_FILE_BYTES)}.`);
            continue;
        }
        total += size;
    }
    if (total > MAX_MAIL_TOTAL_BYTES) {
        errores.push(`Los adjuntos suman ${fmtMB(total)} y el máximo del mensaje es ${fmtMB(MAX_MAIL_TOTAL_BYTES)}. Quita o comprime alguno.`);
    }
    return { ok: errores.length === 0, errores, totalBytes: total };
};

/**
 * ¿La clave pertenece al prefijo de adjuntos de ESTE sitio? Es lo que impide
 * que un envío adjunte —leyéndolo de S3— un objeto de otro sitio del bucket.
 * Mismo criterio que `receiptKeyBelongs` (v4.943).
 */
export const mailAttachmentKeyBelongs = (key, clubId) => {
    const value = String(key || '');
    return Boolean(clubId)
        && value.startsWith(`${MAIL_ATTACHMENT_PREFIX}/${clubId}/`)
        && !value.includes('..');
};

/** Nombre seguro para la clave de S3 (el `filename` original viaja aparte). */
export const safeMailFilename = (name) =>
    String(name || 'adjunto').replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 120) || 'adjunto';

/** Bytes reales (aprox.) de un contenido base64 — para validar lo inline. */
export const inlineSizeOf = (content) => {
    const s = String(content || '');
    if (!s) return 0;
    const padding = s.endsWith('==') ? 2 : (s.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
};

/**
 * Separa lo que llega en el envío: adjuntos por CLAVE de S3 (el camino
 * nuevo), adjuntos INLINE base64 (borradores guardados antes de v4.953 — se
 * conservan porque un borrador viejo tiene que poder enviarse) y lo que no es
 * ni una cosa ni la otra.
 */
export const splitSendAttachments = (list) => {
    const keyed = [];
    const inline = [];
    const invalid = [];
    for (const a of (Array.isArray(list) ? list : [])) {
        if (!a || !a.filename) { invalid.push(a); continue; }
        if (typeof a.key === 'string' && a.key) { keyed.push(a); continue; }
        if (typeof a.content === 'string' && a.content) { inline.push(a); continue; }
        invalid.push(a);
    }
    return { keyed, inline, invalid };
};

export default {
    MAIL_ATTACHMENT_PREFIX,
    MAX_MAIL_FILE_BYTES,
    MAX_MAIL_TOTAL_BYTES,
    checkMailAttachments,
    mailAttachmentKeyBelongs,
    safeMailFilename,
    inlineSizeOf,
    splitSendAttachments,
};
