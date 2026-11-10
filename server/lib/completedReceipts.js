// ════════════════════════════════════════════════════════════════════
// Comprobantes de las inscripciones completadas — S3 — v4.943.0
//
// El comprobante NO viaja por el cuerpo de la función: en Vercel el cuerpo se
// corta en ~4,5 MB y el archivo admite hasta 10. El navegador pide acá una URL
// prefirmada, sube DIRECTO a S3 —el mismo camino que la Biblioteca
// Multimedia— y el envío del formulario trae la clave; el servidor entonces
// COMPRUEBA el objeto real (que existe y cuánto pesa), porque lo que el
// navegador declaró al prefirmar no obliga a nada.
//
// El prefijo es propio (`private/event-receipts/{eventId}/`) y sin lectura
// pública: el panel lo lee con un enlace firmado que caduca a los 5 minutos,
// igual que el comprobante de un desembolso (v4.885). Tenerlo aparte permite
// además ponerle su propia regla de ciclo de vida sin tocar los archivos de
// nadie.
//
// Limitación declarada, para no descubrirla después: el endpoint que prefirma
// es público y sin freno por IP —como el resto de los formularios públicos de
// la plataforma—, así que alguien con el enlace puede subir objetos al
// prefijo. Sólo se vuelven visibles los que un envío válido reclama; los
// huérfanos se limpian con una regla de ciclo de vida sobre el prefijo.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { receiptExtensionFor, checkReceiptMeta, RECEIPT_MAX_BYTES } from './completedRegistrationSpec.js';

export const RECEIPT_PREFIX = 'private/event-receipts';

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';

let _s3 = null;
const getS3 = async () => {
    if (!_s3) {
        const [awsMod, presignerMod] = await Promise.all([
            import('@aws-sdk/client-s3'),
            import('@aws-sdk/s3-request-presigner'),
        ]);
        const aws = awsMod.default || awsMod;
        _s3 = {
            client: new aws.S3Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
                },
                maxAttempts: 2,
            }),
            PutObjectCommand: aws.PutObjectCommand,
            GetObjectCommand: aws.GetObjectCommand,
            HeadObjectCommand: aws.HeadObjectCommand,
            DeleteObjectCommand: aws.DeleteObjectCommand,
            getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};

/** ¿La clave pertenece al prefijo de ESTE evento? Es lo que impide que un
 *  envío reclame —o que el panel firme— un objeto de otro sitio del bucket. */
export const receiptKeyBelongs = (key, eventId) => {
    const value = String(key || '');
    return Boolean(eventId)
        && value.startsWith(`${RECEIPT_PREFIX}/${eventId}/`)
        && !value.includes('..');
};

/**
 * URL prefirmada de subida (5 minutos). El tipo de contenido queda FIRMADO:
 * el PUT tiene que mandarlo igual o S3 lo rechaza.
 */
export const presignReceiptUpload = async ({ eventId, contentType, filename, size }) =>
    presignPrivateReceiptUpload({ prefix: `${RECEIPT_PREFIX}/${eventId}`, contentType, filename, size });

/**
 * v4.1308 — La misma subida prefirmada, bajo el prefijo PRIVADO que diga quien
 * llama (el de la confirmación manual de pagos de la Feria vive aparte). Las
 * reglas del archivo —PDF/JPG/PNG/WebP, 10 MB— son las mismas: un solo
 * criterio de qué es un comprobante.
 */
export const presignPrivateReceiptUpload = async ({ prefix, contentType, filename, size }) => {
    const juicio = checkReceiptMeta({ contentType, filename, size });
    if (!juicio.ok) return { ok: false, errores: juicio.errores };
    if (!String(prefix || '').startsWith('private/') || String(prefix).includes('..')) {
        return { ok: false, errores: ['Prefijo de almacenamiento no permitido.'] };
    }

    try {
        const { client, PutObjectCommand, getSignedUrl } = await getS3();
        const ext = receiptExtensionFor(contentType, filename);
        const key = `${prefix}/${randomUUID()}.${ext}`;
        const uploadUrl = await getSignedUrl(
            client,
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
        console.error('[completed-registrations] no pude prefirmar la subida:', e?.message);
        return { ok: false, errores: ['No se pudo preparar la subida del comprobante. Intenta de nuevo.'] };
    }
};

/**
 * El objeto REAL: existe y cuánto pesa. Es la comprobación que vale — lo
 * declarado al prefirmar no obliga a nada, y un objeto de más de 10 MB no se
 * reclama.
 */
export const headReceipt = async (key) => {
    try {
        const { client, HeadObjectCommand } = await getS3();
        const head = await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
        const bytes = Number(head.ContentLength) || 0;
        if (bytes <= 0) return { ok: false, error: 'El archivo llegó vacío.' };
        if (bytes > RECEIPT_MAX_BYTES) {
            return { ok: false, error: `El comprobante pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo es ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.` };
        }
        // v4.1312 — los metadatos del objeto (la huella y el registro de una
        // importación desde URL). S3 los devuelve con las claves en minúscula.
        return { ok: true, bytes, mime: head.ContentType || null, metadata: head.Metadata || {} };
    } catch (e) {
        return { ok: false, error: 'No encontramos el comprobante subido. Vuelve a adjuntarlo.' };
    }
};

/**
 * v4.1312 — Guardar un comprobante que trajo el SERVIDOR (importado desde una
 * URL externa): la clave nueva vive en el prefijo privado de ESTE evento, el
 * tipo es el que se leyó de los bytes y los metadatos llevan la huella y el
 * registro al que se destinó. Nunca lanza.
 *
 * @returns {Promise<{ ok: true, key } | { ok: false, error }>}
 */
export const putReceiptObject = async ({ eventId, body, mime, ext, metadata = {} }) => {
    try {
        if (!eventId || String(eventId).includes('/') || String(eventId).includes('..')) {
            return { ok: false, error: 'Evento no válido para guardar el comprobante.' };
        }
        const { client, PutObjectCommand } = await getS3();
        const key = `${RECEIPT_PREFIX}/${eventId}/${randomUUID()}.${ext}`;
        const meta = {};
        for (const [k, v] of Object.entries(metadata || {})) {
            // Los metadatos de S3 viajan como cabeceras: sólo ASCII imprimible.
            if (v != null) meta[k] = String(v).replace(/[^\x20-\x7e]/g, '?').slice(0, 600);
        }
        await client.send(new PutObjectCommand({
            Bucket: bucketName(),
            Key: key,
            Body: body,
            ContentType: mime,
            ContentLength: body.length,
            CacheControl: 'no-store',
            Metadata: meta,
        }));
        return { ok: true, key };
    } catch (e) {
        console.error('[completed-registrations] no pude guardar el comprobante importado:', e?.message);
        return { ok: false, error: 'No fue posible guardar el archivo en Club Platform.' };
    }
};

/**
 * v4.1312 — El contenido COMPLETO de un comprobante del prefijo, para
 * calcular su huella (¿el archivo que se quiere importar ya es el vigente?).
 * `null` si no se puede leer o pasa del máximo. Nunca lanza.
 */
export const readReceiptObject = async (key) => {
    try {
        const value = String(key || '');
        if (!value.startsWith(`${RECEIPT_PREFIX}/`) || value.includes('..')) return null;
        const { client, GetObjectCommand } = await getS3();
        const out = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: value }));
        const chunks = [];
        let total = 0;
        for await (const c of out.Body) {
            total += c.length;
            if (total > RECEIPT_MAX_BYTES) return null;
            chunks.push(Buffer.from(c));
        }
        return Buffer.concat(chunks);
    } catch (e) {
        console.warn('[completed-registrations] no pude leer el comprobante:', e?.message);
        return null;
    }
};

/**
 * v4.1308 — QUÉ ES el archivo, leído de sus primeros bytes (no de la extensión
 * ni del tipo que declaró el navegador): PDF, JPEG, PNG o WebP. Devuelve el
 * tipo real o `null` si no es ninguno. Nunca lanza.
 */
export const RECEIPT_MAGIC = [
    { mime: 'application/pdf', test: (b) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
    { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
    { mime: 'image/png', test: (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
    { mime: 'image/webp', test: (b) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
];
export const receiptKindOf = (buf) => {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    return RECEIPT_MAGIC.find(m => m.test(b))?.mime || null;
};
export const sniffReceipt = async (key) => {
    try {
        const { client, GetObjectCommand } = await getS3();
        const out = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: key, Range: 'bytes=0-31' }));
        const chunks = [];
        for await (const c of out.Body) chunks.push(Buffer.from(c));
        return receiptKindOf(Buffer.concat(chunks));
    } catch (e) {
        console.warn('[receipts] no pude leer los primeros bytes del comprobante:', e?.message);
        return null;
    }
};

/**
 * v4.1310 — El comprobante de una CONFIRMACIÓN MANUAL de pago, sea de la
 * Feria o de un evento: la clave tiene que vivir bajo el prefijo privado de
 * ESE registro (`prefix`), el objeto tiene que existir con un peso válido y
 * sus primeros bytes tienen que ser un PDF o una imagen. Un solo verificador
 * para los dos módulos.
 *
 * @returns {Promise<null | { ok: true, key, name, mime, bytes } | { ok: false, error }>}
 *          `null` cuando no viene ningún comprobante.
 */
export const verifyPrivateReceipt = async (receipt, prefix) => {
    if (!receipt || !receipt.key) return null;
    const key = String(receipt.key).slice(0, 500);
    const base = String(prefix || '');
    if (!base.startsWith('private/') || base.includes('..') || !key.startsWith(`${base}/`) || key.includes('..')) {
        return { ok: false, error: 'El comprobante no corresponde a este registro. Vuelve a adjuntarlo.' };
    }
    const head = await headReceipt(key);
    if (!head.ok) return { ok: false, error: head.error };
    const mime = await sniffReceipt(key);
    if (!mime) return { ok: false, error: 'El archivo adjunto no es un PDF ni una imagen JPG, PNG o WebP válida.' };
    const name = String(receipt.name || 'comprobante').replace(/[\r\n]/g, ' ').trim().slice(0, 300) || 'comprobante';
    return { ok: true, key, name, mime, bytes: head.bytes };
};

/**
 * Borra el objeto del comprobante (v4.952, al eliminar un registro). Es de
 * MEJOR ESFUERZO y nunca lanza: la regla de la Librería (v4.740) — que S3
 * falle no impide quitar la fila; el usuario pidió que desaparezca del panel.
 * Sólo toca claves del prefijo propio: una clave ajena no se borra jamás.
 */
export const deleteReceiptObject = async (key) => {
    try {
        const value = String(key || '');
        if (!value.startsWith(`${RECEIPT_PREFIX}/`) || value.includes('..')) return false;
        const { client, DeleteObjectCommand } = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: value }));
        return true;
    } catch (e) {
        console.warn('[completed-registrations] no pude borrar el comprobante:', e?.message);
        return false;
    }
};

/**
 * Enlace de LECTURA firmado y con caducidad, para el panel.
 *
 * v4.1312 — Con `download` el enlace DESCARGA el archivo con su nombre
 * (`Content-Disposition: attachment`) en vez de abrirlo en el navegador.
 */
export const attachmentDisposition = (filename) => {
    const name = String(filename || 'comprobante').replace(/[\r\n"\\]/g, ' ').trim().slice(0, 150) || 'comprobante';
    const ascii = name.replace(/[^\x20-\x7e]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};
export const signedReceiptUrl = async (key, { seconds = 300, download = false, filename = null } = {}) => {
    try {
        if (!key) return null;
        const { client, GetObjectCommand, getSignedUrl } = await getS3();
        return await getSignedUrl(
            client,
            new GetObjectCommand({
                Bucket: bucketName(),
                Key: key,
                ...(download ? { ResponseContentDisposition: attachmentDisposition(filename) } : {}),
            }),
            { expiresIn: seconds }
        );
    } catch (e) {
        console.error('[completed-registrations] no pude firmar el comprobante:', e?.message);
        return null;
    }
};

export default {
    RECEIPT_PREFIX, receiptKeyBelongs, presignReceiptUpload, presignPrivateReceiptUpload, headReceipt, deleteReceiptObject,
    signedReceiptUrl, attachmentDisposition, putReceiptObject, readReceiptObject, receiptKindOf, sniffReceipt, verifyPrivateReceipt,
};
