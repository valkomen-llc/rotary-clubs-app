// ════════════════════════════════════════════════════════════════════
// Programas — los archivos del formulario institucional — v4.1286.0
//
//   staging  private/programs/{programId}/intake/{intakeId}/…   sin lectura pública
//   ─── aplicar (sólo lo aprobado y autorizado) ───────────────────────────►
//   Biblioteca  clubs/{siteId}/programas/…                      versión web, fila en Media
//
// · SUBIR: el navegador sube DIRECTO a S3 (Vercel corta el cuerpo en 4,5 MB).
//   Hasta 64 MB, un PUT prefirmado; más, CARGA MULTIPARTE por partes de 16 MB:
//   cada parte se reintenta sola y, si se corta la conexión o se recarga la
//   página, `listUploadedParts` dice qué partes ya están y la carga SIGUE
//   desde ahí (mismo `uploadId`).
// · VALIDAR: el objeto REAL — peso con HeadObject y tipo por los primeros
//   512 bytes —, no lo que el navegador declaró.
// · PUBLICAR: el ORIGINAL nunca se reemplaza ni sale del prefijo privado. Para
//   una foto se genera una versión web (WebP, ≤ 2400 px, orientación aplicada)
//   que, por cómo funciona sharp, NO lleva EXIF, GPS ni datos del dispositivo.
//   Un video o audio se copia tal cual (no hay transcodificador en la
//   función): sus metadatos se avisan en la revisión.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { PROGRAM_FILE_PREFIX, programKeyBelongs } from './programFiles.js';
import { INTAKE_FORMATS, sniffIntakeFile } from './programIntakeSpec.js';

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
const region = () => process.env.AWS_REGION || 'us-east-1';

let _s3 = null;
const getS3 = async () => {
    if (!_s3) {
        const [awsMod, presignerMod] = await Promise.all([import('@aws-sdk/client-s3'), import('@aws-sdk/s3-request-presigner')]);
        const aws = awsMod.default || awsMod;
        const endpoint = process.env.AWS_ENDPOINT_URL_S3 || undefined;
        _s3 = {
            client: new aws.S3Client({
                region: region(), endpoint, forcePathStyle: Boolean(endpoint),
                credentials: {
                    accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
                },
                maxAttempts: 2,
            }),
            aws, getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};

const seg = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '');
export const intakePrefix = (programId, intakeId) => `${PROGRAM_FILE_PREFIX}/${seg(programId)}/intake/${seg(intakeId)}/`;
/** ¿La clave es de ESTE envío de ESTE programa? Separa programas y envíos. */
export const intakeKeyBelongs = (key, programId, intakeId) => {
    const v = String(key || '');
    return programKeyBelongs(v, programId) && v.startsWith(intakePrefix(programId, intakeId)) && !v.includes('..');
};

export const newIntakeKey = (programId, intakeId, ext) => `${intakePrefix(programId, intakeId)}${randomUUID()}.${ext}`;

/** PUT prefirmado (archivos de hasta 64 MB). El tipo de contenido queda firmado. */
export const presignSinglePut = async ({ key, contentType }) => {
    const { client, aws, getSignedUrl } = await getS3();
    const uploadUrl = await getSignedUrl(client, new aws.PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType, CacheControl: 'no-store' }), { expiresIn: 3600 });
    return { uploadUrl };
};

export const startMultipart = async ({ key, contentType }) => {
    const { client, aws } = await getS3();
    const r = await client.send(new aws.CreateMultipartUploadCommand({ Bucket: bucketName(), Key: key, ContentType: contentType, CacheControl: 'no-store' }));
    return { uploadId: r.UploadId };
};

/** URLs prefirmadas para un lote de partes (1-based). */
export const presignParts = async ({ key, uploadId, partNumbers }) => {
    const { client, aws, getSignedUrl } = await getS3();
    const out = [];
    for (const n of partNumbers) {
        const url = await getSignedUrl(client, new aws.UploadPartCommand({ Bucket: bucketName(), Key: key, UploadId: uploadId, PartNumber: n }), { expiresIn: 3600 });
        out.push({ partNumber: n, url });
    }
    return out;
};

/** Las partes que S3 YA tiene: es lo que permite reanudar sin volver a subir. */
export const listUploadedParts = async ({ key, uploadId }) => {
    const { client, aws } = await getS3();
    const parts = [];
    let marker;
    for (let i = 0; i < 20; i++) {
        const r = await client.send(new aws.ListPartsCommand({ Bucket: bucketName(), Key: key, UploadId: uploadId, PartNumberMarker: marker }));
        for (const p of r.Parts || []) parts.push({ partNumber: p.PartNumber, etag: p.ETag, size: Number(p.Size) || 0 });
        if (!r.IsTruncated) break;
        marker = r.NextPartNumberMarker;
    }
    return parts;
};

export const completeMultipart = async ({ key, uploadId }) => {
    const { client, aws } = await getS3();
    // Las ETag se leen de S3, no del navegador: no hay que confiar en lo que mande.
    const parts = await listUploadedParts({ key, uploadId });
    if (!parts.length) throw new Error('No hay partes subidas.');
    await client.send(new aws.CompleteMultipartUploadCommand({
        Bucket: bucketName(), Key: key, UploadId: uploadId,
        MultipartUpload: { Parts: parts.sort((a, b) => a.partNumber - b.partNumber).map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }));
    return { parts: parts.length };
};

export const abortMultipart = async ({ key, uploadId }) => {
    try {
        const { client, aws } = await getS3();
        await client.send(new aws.AbortMultipartUploadCommand({ Bucket: bucketName(), Key: key, UploadId: uploadId }));
        return true;
    } catch { return false; }
};

/** El objeto REAL: peso y tipo por contenido (primeros 512 bytes). */
export const inspectIntakeObject = async (key, ext) => {
    const { client, aws } = await getS3();
    const head = await client.send(new aws.HeadObjectCommand({ Bucket: bucketName(), Key: key }));
    const bytes = Number(head.ContentLength) || 0;
    if (bytes <= 0) return { bytes: 0, format: null };
    const r = await client.send(new aws.GetObjectCommand({ Bucket: bucketName(), Key: key, Range: 'bytes=0-511' }));
    const first = Buffer.from(await r.Body.transformToByteArray());
    return { bytes, format: sniffIntakeFile(first, ext), contentType: head.ContentType || INTAKE_FORMATS[ext]?.mime || null };
};

/** Lectura firmada y corta (2 minutos), para quien el controlador autorizó. */
export const signedIntakeUrl = async (key, { filename, contentType, seconds = 120, inline = true } = {}) => {
    const { client, aws, getSignedUrl } = await getS3();
    const safe = String(filename || 'archivo').replace(/[^\w. ()-]/g, '_').slice(0, 120);
    return getSignedUrl(client, new aws.GetObjectCommand({
        Bucket: bucketName(), Key: key,
        ResponseContentDisposition: `${inline ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
        ResponseContentType: contentType || 'application/octet-stream', ResponseCacheControl: 'no-store',
    }), { expiresIn: seconds });
};

export const deleteIntakeObject = async (key, programId, intakeId) => {
    try {
        if (!intakeKeyBelongs(key, programId, intakeId)) return false;
        const { client, aws } = await getS3();
        await client.send(new aws.DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
        return true;
    } catch { return false; }
};

const publicUrlOf = (key) => {
    const endpoint = process.env.AWS_ENDPOINT_URL_S3;
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return endpoint ? `${endpoint.replace(/\/$/, '')}/${bucketName()}/${encoded}` : `https://${bucketName()}.s3.${region()}.amazonaws.com/${encoded}`;
};

const IMAGE_MAX_DECODE = 120 * 1024 * 1024;

/**
 * La versión PÚBLICA de un archivo aprobado. Una foto → WebP optimizado (sin
 * EXIF/GPS); un video/audio/documento → copia de objeto a objeto. El
 * original NO se toca. Devuelve `{ ok, key, url, bytes, contentType, optimized }`.
 */
export const publishIntakeObject = async ({ key, siteId, ext, kind, bytes }) => {
    const { client, aws } = await getS3();
    const bucket = bucketName();
    const base = siteId ? `clubs/${seg(siteId)}/programas` : 'platform/programas';
    if (kind === 'image' && ext !== 'svg') {
        if (Number(bytes) > IMAGE_MAX_DECODE) return { ok: false, error: 'La foto es demasiado grande para generar la versión web en el servidor: súbela de nuevo en menor resolución o publícala desde la Biblioteca.' };
        try {
            const sharp = (await import('sharp')).default;
            const r = await client.send(new aws.GetObjectCommand({ Bucket: bucket, Key: key }));
            const input = Buffer.from(await r.Body.transformToByteArray());
            // `.rotate()` aplica la orientación EXIF; sin `.withMetadata()` sharp
            // NO copia EXIF, GPS ni XMP a la salida. La forma no se deforma: se
            // limita el lado mayor y se conserva la proporción.
            const out = await sharp(input, { failOn: 'none', limitInputPixels: 268402689 }).rotate()
                .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 82 }).toBuffer();
            const dest = `${base}/${randomUUID()}.webp`;
            await client.send(new aws.PutObjectCommand({ Bucket: bucket, Key: dest, Body: out, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
            return { ok: true, key: dest, url: publicUrlOf(dest), bytes: out.length, contentType: 'image/webp', optimized: true };
        } catch (e) {
            // HEIC sin decodificador u otra rareza: se dice, no se publica el original con sus metadatos.
            return { ok: false, error: `No se pudo generar la versión web de la foto (${String(e?.message || e).slice(0, 120)}). El original queda guardado y privado.` };
        }
    }
    const fmt = INTAKE_FORMATS[ext];
    const dest = `${base}/${randomUUID()}.${ext}`;
    try {
        await client.send(new aws.CopyObjectCommand({
            Bucket: bucket, CopySource: encodeURI(`${bucket}/${key}`), Key: dest, MetadataDirective: 'REPLACE',
            ContentType: fmt?.mime || 'application/octet-stream', CacheControl: 'public, max-age=31536000, immutable',
        }));
        return { ok: true, key: dest, url: publicUrlOf(dest), bytes: Number(bytes) || 0, contentType: fmt?.mime || null, optimized: false };
    } catch (e) {
        return { ok: false, error: e?.message || 'No se pudo copiar el archivo a la Biblioteca.' };
    }
};

export default {
    intakePrefix, intakeKeyBelongs, newIntakeKey, presignSinglePut, startMultipart, presignParts, listUploadedParts, completeMultipart,
    abortMultipart, inspectIntakeObject, signedIntakeUrl, deleteIntakeObject, publishIntakeObject,
};
