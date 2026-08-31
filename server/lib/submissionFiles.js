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
// recorte de un video grande (v4.936)—, así que un clip de 200 MB se promueve
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
import { checkFileMeta, extensionFor, kindOf, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from './contentSubmissionSpec.js';

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
        && !value.includes('..');
};

/** URL prefirmada de subida (10 minutos — un video de 200 MB desde un móvil
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
            { expiresIn: 600 }
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
        const { client, HeadObjectCommand } = await getS3();
        const head = await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
        const bytes = Number(head.ContentLength) || 0;
        const mime = head.ContentType || contentType || null;
        const kind = kindOf(mime, filename || key);
        if (bytes <= 0) return { ok: false, error: 'El archivo llegó vacío.' };
        if (!kind) return { ok: false, error: 'Ese tipo de archivo no se admite.' };
        const max = kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
        if (bytes > max) return { ok: false, error: `El archivo pesa ${(bytes / 1048576).toFixed(1)} MB y el máximo es ${max / 1048576} MB.` };
        return { ok: true, bytes, mime, kind };
    } catch {
        return { ok: false, error: 'No encontramos el archivo subido. Volvé a adjuntarlo.' };
    }
};

/** Enlace de LECTURA firmado y con caducidad, para que el panel vea la foto o
 *  el video sin descargarlo y sin que exista una URL compartible. */
export const signedSubmissionUrl = async (key, { seconds = 900 } = {}) => {
    try {
        if (!key) return null;
        const { client, GetObjectCommand, getSignedUrl } = await getS3();
        return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucketName(), Key: key }), { expiresIn: seconds });
    } catch (e) {
        console.warn('[submissions] no pude firmar la lectura:', e?.message);
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
    signedSubmissionUrl, deleteStagingObject, copyToLibrary,
};
