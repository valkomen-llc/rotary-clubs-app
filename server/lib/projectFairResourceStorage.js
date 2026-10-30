// ════════════════════════════════════════════════════════════════════
// Recursos del proyecto — S3 (v4.1264.0)
//
// La plantilla vive en un prefijo PRIVADO (`private/project-fair-resources/`),
// sin lectura pública, igual que el staging de los aportes de contenido
// (`submissionFiles.js`). Nadie tiene una URL fija del archivo:
//
//   · SUBIR: el panel pide una URL prefirmada de PUT y el navegador sube
//     directo a S3. El archivo NO pasa por la función —Vercel corta el cuerpo
//     de una petición en 4,5 MB y una plantilla con imágenes pesa más—.
//   · VALIDAR: el servidor mira el objeto REAL (`HeadObject` para el peso, y
//     los primeros y últimos bytes con `Range` para el tipo).
//   · DESCARGAR: tras autorizar y registrar, el servidor firma una lectura que
//     caduca en 2 minutos y fuerza la descarga con su nombre.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { contentDisposition, extensionOf, RESOURCE_FORMATS } from './projectFairResourceSpec.js';

export const RESOURCE_PREFIX = 'private/project-fair-resources';

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

export const resourcePrefixFor = (scope, key) => `${RESOURCE_PREFIX}/${seg(scope)}/${seg(key)}/`;

/** ¿La clave es de ESTE recurso? Impide registrar —o firmar— un objeto de otra parte del bucket. */
export const resourceKeyBelongs = (storageKey, scope, key) => {
    const v = String(storageKey || '');
    return v.startsWith(resourcePrefixFor(scope, key)) && !v.includes('..');
};

/** URL prefirmada de subida (30 minutos). El tipo de contenido queda firmado. */
export const presignResourceUpload = async ({ scope, key, filename }) => {
    const ext = extensionOf(filename);
    const contentType = RESOURCE_FORMATS[ext]?.mime || 'application/octet-stream';
    const { client, PutObjectCommand, getSignedUrl } = await getS3();
    const storageKey = `${resourcePrefixFor(scope, key)}${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucketName(), Key: storageKey, ContentType: contentType, CacheControl: 'no-store' }),
        { expiresIn: 1800 }
    );
    return { storageKey, uploadUrl, contentType };
};

/**
 * El objeto REAL: cuánto pesa y sus primeros y últimos bytes, para juzgar el
 * tipo por el contenido. Dos lecturas por rango —nunca el archivo entero—.
 */
export const inspectResourceObject = async (storageKey) => {
    const { client, HeadObjectCommand, GetObjectCommand } = await getS3();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: storageKey }));
    const bytes = Number(head.ContentLength) || 0;
    const read = async (range) => {
        const r = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: storageKey, Range: range }));
        return Buffer.from(await r.Body.transformToByteArray());
    };
    if (bytes <= 0) return { bytes: 0, head: Buffer.alloc(0), tail: Buffer.alloc(0) };
    const first = await read('bytes=0-4095');
    const tail = bytes > 4096 ? await read(`bytes=-${Math.min(65536, bytes)}`) : Buffer.alloc(0);
    return { bytes, head: first, tail };
};

/** ¿El objeto sigue existiendo? Se pregunta antes de entregar un enlace. */
export const resourceObjectExists = async (storageKey) => {
    try {
        const { client, HeadObjectCommand } = await getS3();
        await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: storageKey }));
        return true;
    } catch {
        return false;
    }
};

/** Lectura firmada que fuerza la descarga con su nombre. Caduca en 2 minutos. */
export const signedResourceDownload = async (storageKey, { fileName, contentType, seconds = 120 }) => {
    const { client, GetObjectCommand, getSignedUrl } = await getS3();
    return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucketName(),
        Key: storageKey,
        ResponseContentDisposition: contentDisposition(fileName),
        ResponseContentType: contentType || 'application/octet-stream',
        ResponseCacheControl: 'no-store',
    }), { expiresIn: seconds });
};

/** Borra un objeto RECHAZADO al validar. Mejor esfuerzo; jamás fuera del prefijo. */
export const deleteRejectedObject = async (storageKey) => {
    try {
        const v = String(storageKey || '');
        if (!v.startsWith(`${RESOURCE_PREFIX}/`) || v.includes('..')) return false;
        const { client, DeleteObjectCommand } = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: v }));
        return true;
    } catch (e) {
        console.warn('[project-fair-resources] no pude borrar el objeto rechazado:', e?.message);
        return false;
    }
};

export default {
    RESOURCE_PREFIX, resourcePrefixFor, resourceKeyBelongs, presignResourceUpload, inspectResourceObject,
    resourceObjectExists, signedResourceDownload, deleteRejectedObject,
};
