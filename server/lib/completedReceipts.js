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
export const presignReceiptUpload = async ({ eventId, contentType, filename, size }) => {
    const juicio = checkReceiptMeta({ contentType, filename, size });
    if (!juicio.ok) return { ok: false, errores: juicio.errores };

    try {
        const { client, PutObjectCommand, getSignedUrl } = await getS3();
        const ext = receiptExtensionFor(contentType, filename);
        const key = `${RECEIPT_PREFIX}/${eventId}/${randomUUID()}.${ext}`;
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
        return { ok: true, bytes, mime: head.ContentType || null };
    } catch (e) {
        return { ok: false, error: 'No encontramos el comprobante subido. Vuelve a adjuntarlo.' };
    }
};

/** Enlace de LECTURA firmado y con caducidad, para el panel. */
export const signedReceiptUrl = async (key, { seconds = 300 } = {}) => {
    try {
        if (!key) return null;
        const { client, GetObjectCommand, getSignedUrl } = await getS3();
        return await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: bucketName(), Key: key }),
            { expiresIn: seconds }
        );
    } catch (e) {
        console.error('[completed-registrations] no pude firmar el comprobante:', e?.message);
        return null;
    }
};

export default { RECEIPT_PREFIX, receiptKeyBelongs, presignReceiptUpload, headReceipt, signedReceiptUrl };
