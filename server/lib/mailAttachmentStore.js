// ════════════════════════════════════════════════════════════════════
// Adjuntos del compositor de correo — la I/O — v4.953.0
//
// El archivo NO viaja por el cuerpo de la función (en Vercel se corta en
// ~4,5 MB y el 413 sale del borde de la plataforma, antes de Express): el
// navegador pide acá una URL prefirmada, sube DIRECTO a S3 —el mismo camino
// que la Biblioteca Multimedia y el comprobante de inscripciones (v4.943)— y
// el envío trae la CLAVE. Este módulo entonces COMPRUEBA el objeto real
// (existe, cuánto pesa, que la clave sea del prefijo de ESTE sitio) y lo baja
// para adjuntarlo al proveedor. Lo declarado al prefirmar no obliga a nada.
//
// El cliente de S3 es el COMPARTIDO de `storage.js` — un segundo camino hacia
// el bucket se separa en silencio (la regla de `sendCampaign`).
//
// Limitación declarada, para no descubrirla después: un objeto subido y nunca
// enviado queda huérfano en `private/mail-attachments/`; tras un envío
// exitoso se borra a mejor esfuerzo, y los huérfanos se limpian con una regla
// de ciclo de vida sobre el prefijo — igual que `public-tmp/` y los
// comprobantes.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { s3 } from './storage.js';
import { PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    MAIL_ATTACHMENT_PREFIX, MAX_MAIL_FILE_BYTES,
    checkMailAttachments, mailAttachmentKeyBelongs, safeMailFilename,
    inlineSizeOf, splitSendAttachments,
} from './mailAttachments.js';

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

/**
 * URL prefirmada de subida (5 minutos). El tipo de contenido queda FIRMADO:
 * el PUT tiene que mandarlo igual o S3 lo rechaza.
 */
export const presignMailAttachment = async ({ clubId, filename, contentType, size }) => {
    if (!clubId) return { ok: false, error: 'No hay un sitio asociado a tu sesión desde el cual adjuntar.' };
    const juicio = checkMailAttachments([{ filename, size }]);
    if (!juicio.ok) return { ok: false, error: juicio.errores[0] };
    try {
        const key = `${MAIL_ATTACHMENT_PREFIX}/${clubId}/${randomUUID()}-${safeMailFilename(filename)}`;
        const uploadUrl = await getSignedUrl(
            s3,
            new PutObjectCommand({
                Bucket: bucketName(),
                Key: key,
                ContentType: contentType || 'application/octet-stream',
                CacheControl: 'no-store',
            }),
            { expiresIn: 300 }
        );
        return { ok: true, key, uploadUrl, contentType: contentType || 'application/octet-stream' };
    } catch (e) {
        console.error('[mail-attachments] no pude prefirmar la subida:', e?.message);
        return { ok: false, error: 'No se pudo preparar la subida del adjunto. Intenta de nuevo.' };
    }
};

/**
 * Resuelve los adjuntos de un ENVÍO a lo que entiende `EmailService`
 * (`{ filename, content(base64), contentType }`):
 *
 * - por CLAVE (el camino nuevo): se comprueba que la clave sea del prefijo de
 *   ESTE sitio, se mide el objeto real con HEAD ANTES de bajarlo —un objeto
 *   inflado después de prefirmar no se descarga— y se baja a base64;
 * - INLINE base64 (borradores anteriores a v4.953): se valida su tamaño real
 *   decodificado y se deja pasar tal cual.
 *
 * Devuelve además las claves usadas, para el borrado a mejor esfuerzo de
 * después del envío. Todo fallo sale con su motivo en español: es lo que la
 * pantalla le muestra a quien envía.
 */
export const resolveSendAttachments = async (list, clubId) => {
    const { keyed, inline, invalid } = splitSendAttachments(list);
    if (invalid.length) {
        return { ok: false, error: 'Uno de los adjuntos llegó sin contenido ni referencia. Quítalo y vuelve a adjuntarlo.' };
    }
    if (!keyed.length && !inline.length) return { ok: true, attachments: undefined, keys: [] };

    const metas = [
        ...inline.map((a) => ({ filename: a.filename, size: inlineSizeOf(a.content) })),
    ];
    const out = inline.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType || 'application/octet-stream' }));
    const keys = [];

    for (const a of keyed) {
        if (!mailAttachmentKeyBelongs(a.key, clubId)) {
            // Para quien pregunta por un objeto ajeno, ese objeto no existe.
            return { ok: false, error: `No encontramos el adjunto «${a.filename}». Quítalo y vuelve a adjuntarlo.` };
        }
        try {
            const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName(), Key: a.key }));
            const bytes = Number(head.ContentLength) || 0;
            if (bytes <= 0) return { ok: false, error: `El adjunto «${a.filename}» llegó vacío. Vuelve a adjuntarlo.` };
            if (bytes > MAX_MAIL_FILE_BYTES) {
                return { ok: false, error: `«${a.filename}» pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo por archivo es ${MAX_MAIL_FILE_BYTES / 1024 / 1024} MB.` };
            }
            const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName(), Key: a.key }));
            const bytesArr = await obj.Body.transformToByteArray();
            out.push({
                filename: a.filename,
                content: Buffer.from(bytesArr).toString('base64'),
                contentType: a.contentType || head.ContentType || 'application/octet-stream',
            });
            metas.push({ filename: a.filename, size: bytesArr.length });
            keys.push(a.key);
        } catch (e) {
            console.warn(`[mail-attachments] no pude leer «${a.filename}» (${a.key}):`, e?.message);
            return { ok: false, error: `No encontramos el adjunto «${a.filename}». Vuelve a adjuntarlo e intenta de nuevo.` };
        }
    }

    // Los límites se juzgan sobre los TAMAÑOS REALES, no sobre lo declarado.
    const juicio = checkMailAttachments(metas);
    if (!juicio.ok) return { ok: false, error: juicio.errores.join(' ') };

    return { ok: true, attachments: out, keys };
};

/**
 * Borra los objetos de un envío YA aceptado por el proveedor. MEJOR ESFUERZO
 * y nunca lanza (regla de la Librería, v4.740): el correo ya salió con el
 * contenido embebido y un fallo acá no puede tocar ese resultado. Sólo claves
 * del prefijo propio. Se espera ANTES de responder — en Vercel la función se
 * congela al cerrar la respuesta, así que nada de fire-and-forget (v4.669).
 */
export const deleteMailAttachments = async (keys) => {
    for (const key of (Array.isArray(keys) ? keys : [])) {
        try {
            const value = String(key || '');
            if (!value.startsWith(`${MAIL_ATTACHMENT_PREFIX}/`) || value.includes('..')) continue;
            await s3.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: value }));
        } catch (e) {
            console.warn('[mail-attachments] no pude borrar el adjunto ya enviado:', e?.message);
        }
    }
};

export default { presignMailAttachment, resolveSendAttachments, deleteMailAttachments };
