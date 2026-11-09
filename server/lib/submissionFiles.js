// ════════════════════════════════════════════════════════════════════
// Los archivos de un aporte de contenido — S3 — v4.968.0
//
// DOS SITIOS Y UNA PUERTA ENTRE ELLOS:
//
//   staging  private/campaign-submissions/{campaignId}/…   sin lectura pública
//   ─── promover (sólo al aprobar) ──────────────────────────────────────►
//   Biblioteca  clubs/{clubId}/…  ó  platform/…            pública, fila en Media
//
// ⚠️ QUE UN ARCHIVO PÚBLICO NO SE PUBLIQUE SOLO ES ESTRUCTURAL, NO UNA REGLA
// DE PANTALLA. El objeto de staging vive en un prefijo sin lectura pública y
// el panel lo mira con un enlace firmado que caduca a los 5 minutos: aunque
// alguien conociera la clave, no hay URL que compartir. Esconder un botón no
// habría protegido nada (v4.868).
//
// PROMOVER NO RE-SUBE EL ARCHIVO. `CopyObject` va de objeto a objeto dentro
// del bucket: los bytes NUNCA pasan por la función —la misma técnica del
// recorte de un video grande (v4.936)—, así que un clip de 300 MB se promueve
// sin tocar el `/tmp` de 512 MB ni el cuerpo de la petición.
//
// El de staging se borra DESPUÉS de que la fila de `Media` existe, y es de
// mejor esfuerzo: el archivo queda en un solo sitio y, si el borrado falla, lo
// peor que pasa es un objeto de más en un prefijo con regla de ciclo de vida.
// Al revés —borrar antes— un fallo al insertar perdería el archivo.
//
// Limitación declarada, para no descubrirla después: el endpoint que prefirma
// es público y sin freno por IP, como el resto de los formularios públicos de
// la plataforma. Sólo se vuelven visibles los objetos que un envío válido
// reclama; los huérfanos se limpian con una regla de ciclo de vida sobre el
// prefijo.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { checkFileMeta, extensionFor, kindOf, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, overweightMessage } from './contentSubmissionSpec.js';
import { sniffImageBytes } from './heicImages.js';

export const STAGING_PREFIX = 'private/campaign-submissions';

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
            CopyObjectCommand: aws.CopyObjectCommand,
            getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};

/** ¿La clave pertenece al prefijo de ESTA campaña? Es lo que impide que un
 *  envío reclame —o que el panel firme— un objeto de otra parte del bucket. */
export const stagingKeyBelongs = (key, campaignId) => {
    const value = String(key || '');
    return Boolean(campaignId)
        && value.startsWith(`${STAGING_PREFIX}/${campaignId}/`)
        && !value.includes('..')
        // v4.1305 — Las versiones DERIVADAS (vista previa y miniatura de un
        // HEIC) y los objetos de trabajo viven en el mismo prefijo, pero no
        // son material de nadie: ningún envío puede reclamarlos como propios.
        && !value.includes('/_preview/')
        && !value.includes('/_analysis/');
};

/** URL prefirmada de subida (10 minutos — un video de 300 MB desde un móvil
 *  tarda). El tipo de contenido queda FIRMADO: el PUT tiene que mandarlo igual
 *  o S3 lo rechaza. */
export const presignSubmissionUpload = async ({ campaignId, contentType, filename, size }) => {
    const juicio = checkFileMeta({ contentType, filename, size });
    if (!juicio.ok) return { ok: false, errores: juicio.errores };
    try {
        const { client, PutObjectCommand, getSignedUrl } = await getS3();
        const ext = extensionFor(contentType, filename);
        const key = `${STAGING_PREFIX}/${campaignId}/${randomUUID()}.${ext}`;
        const uploadUrl = await getSignedUrl(
            client,
            new PutObjectCommand({
                Bucket: bucketName(),
                Key: key,
                ContentType: contentType || 'application/octet-stream',
                CacheControl: 'no-store',
            }),
            // Una hora (v4.1242): un video de 2 GB por una conexión lenta tarda;
            // S3 valida la firma al EMPEZAR la subida, no al terminar.
            { expiresIn: 3600 }
        );
        return { ok: true, key, uploadUrl, kind: juicio.kind, contentType: contentType || 'application/octet-stream' };
    } catch (e) {
        console.error('[submissions] no pude prefirmar la subida:', e?.message);
        return { ok: false, errores: ['No se pudo preparar la subida. Intentá de nuevo.'] };
    }
};

/** El objeto REAL: existe y cuánto pesa. Lo declarado al prefirmar no obliga a
 *  nada — es la misma comprobación que hace el comprobante de una inscripción
 *  completada (v4.943). */
export const headSubmissionFile = async (key, { filename, contentType } = {}) => {
    try {
        const { client, HeadObjectCommand, GetObjectCommand } = await getS3();
        const head = await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
        const bytes = Number(head.ContentLength) || 0;
        const mime = head.ContentType || contentType || null;
        const kind = kindOf(mime, filename || key);
        if (bytes <= 0) return { ok: false, error: 'El archivo llegó vacío.' };
        if (!kind) return { ok: false, error: 'Ese tipo de archivo no se admite.' };
        const max = kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
        if (bytes > max) return { ok: false, error: overweightMessage({ filename: filename || key.split('/').pop(), size: bytes, kind }) };
        // v4.1305 — Una FOTO se juzga por su contenido, no por su extensión:
        // se leen los primeros bytes. Un archivo que no es imagen se rechaza
        // aquí, con su nombre; uno que ES HEIF aunque se llame `.jpg` (hay
        // apps que lo hacen) queda marcado `image/heic`, para que reciba su
        // vista previa JPEG en vez de llegar roto al panel.
        if (kind === 'image') {
            const head64 = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: key, Range: 'bytes=0-255' }))
                .then(r => r.Body.transformToByteArray()).then(b => Buffer.from(b)).catch(() => null);
            if (head64) {
                const real = sniffImageBytes(head64);
                const nombre = filename || key.split('/').pop();
                if (!real) return { ok: false, error: `«${nombre}» no es una fotografía válida: su contenido no corresponde a JPG, PNG, WEBP ni HEIC (puede estar dañada o incompleta).` };
                if (real === 'heif' && !/hei[cf]/i.test(String(mime))) return { ok: true, bytes, mime: 'image/heic', kind, sniffed: real };
                return { ok: true, bytes, mime, kind, sniffed: real };
            }
        }
        return { ok: true, bytes, mime, kind };
    } catch {
        return { ok: false, error: 'No encontramos el archivo subido. Volvé a adjuntarlo.' };
    }
};

/** Enlace de LECTURA firmado y con caducidad, para que el panel vea la foto o
 *  el video sin descargarlo y sin que exista una URL compartible. */
//
// v4.1305 — `download`: el nombre con el que se DESCARGA (el original de una
// foto HEIC, por ejemplo). Va firmado como `response-content-disposition`, así
// que el navegador lo guarda con su nombre en vez de intentar dibujarlo.
export const signedSubmissionUrl = async (key, { seconds = 900, download = null } = {}) => {
    try {
        if (!key) return null;
        const { client, GetObjectCommand, getSignedUrl } = await getS3();
        const params = { Bucket: bucketName(), Key: key };
        if (download) {
            const name = String(download).replace(/["\\\r\n]/g, '').slice(0, 180) || 'archivo';
            params.ResponseContentDisposition = `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
        }
        return await getSignedUrl(client, new GetObjectCommand(params), { expiresIn: seconds });
    } catch (e) {
        console.warn('[submissions] no pude firmar la lectura:', e?.message);
        return null;
    }
};

/**
 * Los BYTES de un objeto del prefijo propio, para medirlo con sharp (v4.1000,
 * el análisis de portada del workflow de artículos). Sólo dentro del prefijo
 * de staging —una clave de fuera del prefijo no se lee por acá— y acotado en
 * peso: una foto de móvil entra; un video no se lee entero para nada.
 */
// El tope de lectura acompaña al de la foto (v4.1242): con 30 MB fijos, una
// foto de 40 MB se subía bien y después el artículo no la podía analizar.
export const readStagingObject = async (key, { maxBytes = IMAGE_MAX_BYTES + 1024 * 1024 } = {}) => {
    try {
        const value = String(key || '');
        if (!value.startsWith(`${STAGING_PREFIX}/`) || value.includes('..')) return null;
        const { client, GetObjectCommand } = await getS3();
        const r = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: value }));
        if (Number(r.ContentLength) > maxBytes) return null;
        const bytes = await r.Body.transformToByteArray();
        return Buffer.from(bytes);
    } catch (e) {
        console.warn('[submissions] no pude leer el objeto de staging:', e?.message);
        return null;
    }
};

/**
 * v4.1305 — Lee un objeto del prefijo propio diciendo POR QUÉ no se pudo
 * (`missing`, `too_large`, `storage`): la recuperación de las fotos HEIC tiene
 * que poder distinguir «no existe» de «pesa demasiado» de «S3 no respondió»,
 * porque cada uno se resuelve distinto. `readStagingObject` devuelve `null`
 * para los tres y se queda así: tiene otros llamadores.
 */
export const readStagingObjectDetailed = async (key, { maxBytes = IMAGE_MAX_BYTES + 1024 * 1024 } = {}) => {
    const value = String(key || '');
    if (!value.startsWith(`${STAGING_PREFIX}/`) || value.includes('..')) return { ok: false, reason: 'outside', error: 'La clave no pertenece al almacenamiento de aportes.' };
    try {
        const { client, GetObjectCommand } = await getS3();
        const r = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: value }));
        const length = Number(r.ContentLength) || 0;
        if (length > maxBytes) {
            try { r.Body?.destroy?.(); } catch { /* noop */ }
            return { ok: false, reason: 'too_large', bytes: length, error: `El archivo pesa ${(length / 1048576).toFixed(1)} MB y el tope para procesarlo es ${(maxBytes / 1048576).toFixed(0)} MB.` };
        }
        const bytes = Buffer.from(await r.Body.transformToByteArray());
        return { ok: true, buffer: bytes, bytes: bytes.length, contentType: r.ContentType || null };
    } catch (e) {
        const missing = e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
        return { ok: false, reason: missing ? 'missing' : 'storage', error: missing ? 'El archivo original ya no está en el almacenamiento.' : `El almacenamiento no respondió: ${String(e?.message || e).slice(0, 160)}` };
    }
};

/**
 * v4.1305 — Guarda una versión DERIVADA (vista previa o miniatura) de un
 * archivo de staging. Sólo dentro de `…/_preview/`: esta función no puede
 * escribir sobre un original aunque se le pase su clave.
 */
export const putStagingDerivative = async ({ key, body, contentType = 'image/jpeg' }) => {
    const value = String(key || '');
    if (!value.startsWith(`${STAGING_PREFIX}/`) || value.includes('..') || !value.includes('/_preview/')) {
        throw new Error('Una versión derivada sólo se guarda en la carpeta _preview del almacenamiento de aportes.');
    }
    const { client, PutObjectCommand } = await getS3();
    await client.send(new PutObjectCommand({ Bucket: bucketName(), Key: value, Body: body, ContentType: contentType, CacheControl: 'private, max-age=86400' }));
    return value;
};

/**
 * Guarda un objeto de TRABAJO en el prefijo de staging de una campaña (la hoja
 * de contacto que se le enseña al modelo de visión). Comparte la regla de
 * ciclo de vida del prefijo y nunca tiene lectura pública: se mira con un
 * enlace firmado que caduca.
 */
export const putStagingObject = async ({ campaignId, name, body, contentType = 'image/jpeg' }) => {
    try {
        if (!campaignId || !body) return null;
        const { client, PutObjectCommand } = await getS3();
        const key = `${STAGING_PREFIX}/${campaignId}/_analysis/${String(name || randomUUID()).replace(/[^a-zA-Z0-9._-]/g, '')}`;
        await client.send(new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: body, ContentType: contentType, CacheControl: 'no-store' }));
        return key;
    } catch (e) {
        console.warn('[submissions] no pude guardar el objeto de trabajo:', e?.message);
        return null;
    }
};

/** Borra un objeto del prefijo propio. Mejor esfuerzo, nunca lanza, y JAMÁS
 *  toca una clave de fuera del prefijo (regla de la Librería, v4.740). */
export const deleteStagingObject = async (key) => {
    try {
        const value = String(key || '');
        if (!value.startsWith(`${STAGING_PREFIX}/`) || value.includes('..')) return false;
        const { client, DeleteObjectCommand } = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: value }));
        return true;
    } catch (e) {
        console.warn('[submissions] no pude borrar el objeto de staging:', e?.message);
        return false;
    }
};

/**
 * Mueve el objeto de staging al prefijo público de la Biblioteca.
 *
 * Devuelve la clave nueva y su URL pública; NO crea la fila de `Media` —eso lo
 * hace el store, que es quien sabe a qué sitio y a qué carpeta va—. Separarlo
 * es lo que permite que un fallo al insertar deje el objeto copiado y
 * reintentable en vez de perder el archivo.
 */
export const copyToLibrary = async ({ key, clubId, filename, contentType }) => {
    try {
        const { client, CopyObjectCommand } = await getS3();
        const bucket = bucketName();
        const ext = String(key).split('.').pop();
        const base = clubId ? `clubs/${clubId}` : 'platform';
        const destino = `${base}/aportes/${randomUUID()}.${ext}`;
        await client.send(new CopyObjectCommand({
            Bucket: bucket,
            // CopySource va con el bucket delante y CODIFICADO: una clave con
            // espacios o acentos rompe la copia con un 404 que no explica nada.
            CopySource: encodeURI(`${bucket}/${key}`),
            Key: destino,
            // ⚠️ REPLACE, no COPY. Con `MetadataDirective: 'COPY'` S3 IGNORA
            // las cabeceras nuevas y el objeto llegaría a la Biblioteca con el
            // `no-store` con el que se subió a staging — servido en cada
            // tarjeta, sin caché, para siempre. Con REPLACE hay que volver a
            // declarar el tipo de contenido o se pierde y el navegador se lo
            // descarga en vez de mostrarlo.
            MetadataDirective: 'REPLACE',
            ContentType: contentType || 'application/octet-stream',
            CacheControl: 'public, max-age=31536000, immutable',
        }));
        const encoded = destino.split('/').map(encodeURIComponent).join('/');
        return {
            ok: true,
            key: destino,
            url: `https://${bucket}.s3.${region()}.amazonaws.com/${encoded}`,
            bucket,
            filename: filename || destino.split('/').pop(),
        };
    } catch (e) {
        console.error('[submissions] no pude copiar a la Biblioteca:', e?.message);
        return { ok: false, error: e?.message || 'No se pudo copiar el archivo a la Biblioteca.' };
    }
};

export default {
    STAGING_PREFIX, stagingKeyBelongs, presignSubmissionUpload, headSubmissionFile,
    signedSubmissionUrl, deleteStagingObject, copyToLibrary, readStagingObject, putStagingObject,
    readStagingObjectDetailed, putStagingDerivative,
};
