// ════════════════════════════════════════════════════════════════════
// «Hoteles de la conferencia» — S3 — v4.1275.0
//
// El mismo bucket que el resto de las imágenes de eventos, con dos prefijos
// POR EVENTO (ver `eventHotels.js`):
//
//   · `private/event-hotels/{evento}/incoming/` — lo que sube el navegador
//     con un PUT prefirmado, ANTES de validarlo. No es público.
//   · `events/hotels/{evento}/` — lo ya validado y optimizado, público como
//     las demás imágenes de eventos.
//
// El archivo nunca pasa por el CUERPO de una petición a la función: Vercel
// corta en 4,5 MB y una diapositiva en PNG o una guía en PDF pesan más. El
// navegador sube directo a S3; el servidor lee el objeto REAL desde S3.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { hotelsIncomingPrefix, hotelsPublicPrefix } from './eventHotels.js';

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
const region = () => process.env.AWS_REGION || 'us-east-1';

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
                region: region(),
                credentials: {
                    accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
                },
                maxAttempts: 2,
            }),
            aws,
            getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};

/** URL pública de una clave (misma forma que devuelve multer-s3). */
export const publicUrlFor = (key) =>
    `https://${bucketName()}.s3.${region()}.amazonaws.com/${String(key).split('/').map(encodeURIComponent).join('/')}`;

/** URL prefirmada de subida (30 minutos), con el tipo de contenido firmado. */
export const presignIncomingUpload = async ({ eventId, ext, contentType }) => {
    const { client, aws, getSignedUrl } = await getS3();
    const storageKey = `${hotelsIncomingPrefix(eventId)}${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
        client,
        new aws.PutObjectCommand({ Bucket: bucketName(), Key: storageKey, ContentType: contentType, CacheControl: 'no-store' }),
        { expiresIn: 1800 },
    );
    return { storageKey, uploadUrl, contentType };
};

/** Peso REAL del objeto subido (o `null` si no existe). */
export const headObjectSize = async (storageKey) => {
    try {
        const { client, aws } = await getS3();
        const head = await client.send(new aws.HeadObjectCommand({ Bucket: bucketName(), Key: storageKey }));
        return Number(head.ContentLength) || 0;
    } catch {
        return null;
    }
};

/** Lee el objeto completo (el llamador ya comprobó que el peso está dentro del tope). */
export const readObject = async (storageKey) => {
    const { client, aws } = await getS3();
    const r = await client.send(new aws.GetObjectCommand({ Bucket: bucketName(), Key: storageKey }));
    return Buffer.from(await r.Body.transformToByteArray());
};

/** Escribe un archivo PÚBLICO del módulo. Las claves son únicas: caché larga e inmutable. */
export const putPublicObject = async ({ key, body, contentType, contentDisposition }) => {
    const { client, aws } = await getS3();
    await client.send(new aws.PutObjectCommand({
        Bucket: bucketName(),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    }));
    return publicUrlFor(key);
};

/**
 * Borra un objeto del módulo. JAMÁS fuera de los dos prefijos del evento:
 * una imagen de la Biblioteca o de otra sección nunca pasa por aquí.
 */
export const deleteModuleObject = async (storageKey, eventId) => {
    const v = String(storageKey || '');
    const allowed = v.startsWith(hotelsIncomingPrefix(eventId)) || v.startsWith(hotelsPublicPrefix(eventId));
    if (!allowed || v.includes('..')) return false;
    try {
        const { client, aws } = await getS3();
        await client.send(new aws.DeleteObjectCommand({ Bucket: bucketName(), Key: v }));
        return true;
    } catch (e) {
        console.warn('[event-hotels] no pude borrar', v, e?.message);
        return false;
    }
};

/** Los objetos PÚBLICOS del módulo para un evento (paginado completo, con tope). */
export const listPublicObjects = async (eventId, { max = 2000 } = {}) => {
    const { client, aws } = await getS3();
    const prefix = hotelsPublicPrefix(eventId);
    const out = [];
    let token;
    do {
        const r = await client.send(new aws.ListObjectsV2Command({
            Bucket: bucketName(), Prefix: prefix, ContinuationToken: token, MaxKeys: 1000,
        }));
        for (const o of r.Contents || []) {
            out.push({ key: o.Key, size: Number(o.Size) || 0, lastModified: o.LastModified ? new Date(o.LastModified).toISOString() : '' });
        }
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token && out.length < max);
    return out;
};

export default { publicUrlFor, presignIncomingUpload, headObjectSize, readObject, putPublicObject, deleteModuleObject, listPublicObjects };
