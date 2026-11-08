// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — S3 (v4.1293.0)
//
// Los materiales del club y el video final viven en un prefijo PRIVADO
// (`private/video-pitch/{solicitud}/`), sin lectura pública, igual que la
// plantilla de presentación (`projectFairResourceStorage.js`). Nadie tiene una
// URL fija de un archivo:
//
//   · SUBIR: el navegador pide una URL prefirmada de PUT y sube directo a S3.
//     El archivo NO pasa por la función (Vercel corta el cuerpo en 4,5 MB y
//     un video pesa cientos de MB).
//   · VALIDAR: el servidor mira el objeto REAL (`HeadObject` para el peso y los
//     primeros bytes con `Range` para el tipo).
//   · VER / DESCARGAR: tras autorizar, el servidor firma una lectura corta.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';

export const VIDEO_PITCH_PREFIX = 'private/video-pitch';

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
            PutObjectCommand: aws.PutObjectCommand,
            GetObjectCommand: aws.GetObjectCommand,
            HeadObjectCommand: aws.HeadObjectCommand,
            DeleteObjectCommand: aws.DeleteObjectCommand,
            getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};

/** Segmento seguro para una clave: sólo letras, números, guion y guion bajo. */
const seg = (v) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'x';

export const requestPrefixFor = (requestId) => `${VIDEO_PITCH_PREFIX}/${seg(requestId)}/`;

/** ¿La clave es de ESTA solicitud? Impide registrar —o firmar— un objeto ajeno. */
export const storageKeyBelongs = (storageKey, requestId) => {
    const v = String(storageKey || '');
    return v.startsWith(requestPrefixFor(requestId)) && !v.includes('..');
};

/** URL prefirmada de subida (60 minutos: un video puede tardar). */
export const presignVideoPitchUpload = async ({ requestId, role, ext, contentType }) => {
    const { client, PutObjectCommand, getSignedUrl } = await getS3();
    const storageKey = `${requestPrefixFor(requestId)}${seg(role)}-${randomUUID()}.${seg(ext)}`;
    const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucketName(), Key: storageKey, ContentType: contentType, CacheControl: 'no-store' }),
        { expiresIn: 3600 }
    );
    return { storageKey, uploadUrl, contentType };
};

/** El objeto REAL: cuánto pesa y sus primeros bytes, para juzgar el tipo. */
export const inspectVideoPitchObject = async (storageKey) => {
    const { client, HeadObjectCommand, GetObjectCommand } = await getS3();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: storageKey }));
    const bytes = Number(head.ContentLength) || 0;
    if (bytes <= 0) return { bytes: 0, head: Buffer.alloc(0) };
    const r = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: storageKey, Range: 'bytes=0-63' }));
    return { bytes, head: Buffer.from(await r.Body.transformToByteArray()) };
};

export const videoPitchObjectExists = async (storageKey) => {
    try {
        const { client, HeadObjectCommand } = await getS3();
        await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: storageKey }));
        return true;
    } catch {
        return false;
    }
};

const asciiName = (name) => String(name || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');

/** Lectura firmada: `inline` para ver en el navegador, `attachment` para bajar. Caduca en 15 min. */
export const signedVideoPitchUrl = async (storageKey, { fileName, contentType, disposition = 'inline', seconds = 900 } = {}) => {
    const { client, GetObjectCommand, getSignedUrl } = await getS3();
    const safe = asciiName(fileName);
    return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucketName(),
        Key: storageKey,
        ResponseContentDisposition: `${disposition}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(String(fileName || safe))}`,
        ResponseContentType: contentType || 'application/octet-stream',
        ResponseCacheControl: 'private, max-age=0, no-store',
    }), { expiresIn: seconds });
};

/** Borra un objeto del prefijo. Mejor esfuerzo; jamás fuera del prefijo. */
export const deleteVideoPitchObject = async (storageKey) => {
    try {
        const v = String(storageKey || '');
        if (!v.startsWith(`${VIDEO_PITCH_PREFIX}/`) || v.includes('..')) return false;
        const { client, DeleteObjectCommand } = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: v }));
        return true;
    } catch (e) {
        console.warn('[video-pitch] no pude borrar el objeto:', e?.message);
        return false;
    }
};

export default {
    VIDEO_PITCH_PREFIX, requestPrefixFor, storageKeyBelongs, presignVideoPitchUpload, inspectVideoPitchObject,
    videoPitchObjectExists, signedVideoPitchUrl, deleteVideoPitchObject,
};
