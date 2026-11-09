// ════════════════════════════════════════════════════════════════════
// Archivos del Directorio Distrital de Clubes — S3 — v4.1306.0
//
// Tres prefijos, cada uno con un solo propósito:
//
//   private/directorio-clubes/originales/{uuid}.{ext}  lo que subió el navegador
//                                                       (intacto, nunca público)
//   private/directorio-clubes/archivos/{uuid}.{png|jpg} la versión validada y
//                                                       limpia (sin EXIF/GPS)
//   directorio-clubes/{perfil}/{uuid}.{png|jpg}         lo PUBLICADO (aprobado
//                                                       por el distrito, o
//                                                       guardado por el club
//                                                       desde su portal)
//
// El archivo nunca pasa por el cuerpo de una petición a la función (Vercel
// corta en 4,5 MB): el navegador sube directo a S3 con una URL prefirmada y el
// servidor lee el objeto REAL desde S3. Nada se borra fuera de estos prefijos.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';

export const ORIGINALS_PREFIX = 'private/directorio-clubes/originales/';
export const FILES_PREFIX = 'private/directorio-clubes/archivos/';
export const PUBLIC_PREFIX = 'directorio-clubes/';

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

/** ¿La clave es de este módulo? Lo único que se lee, firma, copia o borra. */
export const isModuleKey = (key) => {
    const v = String(key || '');
    if (!v || v.includes('..') || v.startsWith('/')) return false;
    return v.startsWith(ORIGINALS_PREFIX) || v.startsWith(FILES_PREFIX) || v.startsWith(PUBLIC_PREFIX);
};

/** URL pública de una clave (misma forma que el resto de la plataforma). */
export const publicUrlFor = (key) => {
    const custom = process.env.AWS_ENDPOINT_URL_S3;
    const path = String(key).split('/').map(encodeURIComponent).join('/');
    if (custom) return `${custom.replace(/\/$/, '')}/${bucketName()}/${path}`;
    return `https://${bucketName()}.s3.${region()}.amazonaws.com/${path}`;
};

/** URL prefirmada de subida del ORIGINAL. Una hora: S3 valida la firma al
 *  empezar, y una foto grande desde un móvil con mala señal tarda. */
export const presignOriginalUpload = async ({ id, ext, contentType }) => {
    const { client, aws, getSignedUrl } = await getS3();
    const key = `${ORIGINALS_PREFIX}${id || randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
        client,
        new aws.PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType, CacheControl: 'no-store' }),
        { expiresIn: 3600 },
    );
    return { key, uploadUrl };
};

/** Peso REAL del objeto (o `null` si no existe). */
export const headSize = async (key) => {
    if (!isModuleKey(key)) return null;
    try {
        const { client, aws } = await getS3();
        const head = await client.send(new aws.HeadObjectCommand({ Bucket: bucketName(), Key: key }));
        return Number(head.ContentLength) || 0;
    } catch {
        return null;
    }
};

/** Lee el objeto completo (quien llama ya comprobó el peso). */
export const readObject = async (key) => {
    if (!isModuleKey(key)) throw new Error('Clave fuera del módulo.');
    const { client, aws } = await getS3();
    const r = await client.send(new aws.GetObjectCommand({ Bucket: bucketName(), Key: key }));
    return Buffer.from(await r.Body.transformToByteArray());
};

/** Escribe la versión limpia (privada) o la publicada (pública). */
export const putObject = async ({ key, body, contentType, isPublic = false }) => {
    if (!isModuleKey(key)) throw new Error('Clave fuera del módulo.');
    const { client, aws } = await getS3();
    await client.send(new aws.PutObjectCommand({
        Bucket: bucketName(),
        Key: key,
        Body: body,
        ContentType: contentType,
        // Las claves son únicas (uuid): lo publicado no cambia nunca.
        CacheControl: isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
    }));
    return isPublic ? publicUrlFor(key) : null;
};

/** Publica copiando de objeto a objeto dentro del bucket: los bytes no pasan
 *  por la función. */
export const copyToPublic = async ({ fromKey, toKey, contentType }) => {
    if (!isModuleKey(fromKey) || !String(toKey).startsWith(PUBLIC_PREFIX)) throw new Error('Clave fuera del módulo.');
    const { client, aws } = await getS3();
    await client.send(new aws.CopyObjectCommand({
        Bucket: bucketName(),
        Key: toKey,
        CopySource: `${bucketName()}/${String(fromKey).split('/').map(encodeURIComponent).join('/')}`,
        MetadataDirective: 'REPLACE',
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }));
    return publicUrlFor(toKey);
};

/** Enlace firmado de LECTURA (privado): para el formulario y el panel. */
export const signedReadUrl = async (key, { seconds = 900, downloadName = null } = {}) => {
    if (!isModuleKey(key)) return null;
    const { client, aws, getSignedUrl } = await getS3();
    const params = { Bucket: bucketName(), Key: key };
    if (downloadName) {
        const ascii = String(downloadName).replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
        params.ResponseContentDisposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
    }
    return getSignedUrl(client, new aws.GetObjectCommand(params), { expiresIn: seconds });
};

/** Borra un objeto del módulo (de mejor esfuerzo). JAMÁS fuera de él. */
export const deleteObject = async (key) => {
    if (!isModuleKey(key)) return false;
    try {
        const { client, aws } = await getS3();
        await client.send(new aws.DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
        return true;
    } catch (e) {
        console.warn('[club-media] no pude borrar', key, e?.message);
        return false;
    }
};

export default { ORIGINALS_PREFIX, FILES_PREFIX, PUBLIC_PREFIX, isModuleKey, publicUrlFor, presignOriginalUpload, headSize, readObject, putObject, copyToPublic, signedReadUrl, deleteObject };
