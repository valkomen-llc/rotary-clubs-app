// ════════════════════════════════════════════════════════════════════
// Videos de proyectos — S3 (v4.1298.0)
//
// Prefijo PRIVADO `private/project-videos/{video}/`, sin lectura pública,
// igual que los materiales del Video Pitch. El archivo NUNCA pasa por la
// función: PUT prefirmado desde el navegador (hasta 2 horas, un video pesa),
// inspección por rangos para juzgar el tipo real, GET firmado corto para
// reproducir o descargar.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';

export const PROJECT_VIDEO_PREFIX = 'private/project-videos';

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
const region = () => process.env.AWS_REGION || 'us-east-1';

let _s3 = null;
const getS3 = async () => {
    if (!_s3) {
        const [awsMod, presignerMod] = await Promise.all([import('@aws-sdk/client-s3'), import('@aws-sdk/s3-request-presigner')]);
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
            PutObjectCommand: aws.PutObjectCommand, GetObjectCommand: aws.GetObjectCommand,
            HeadObjectCommand: aws.HeadObjectCommand, DeleteObjectCommand: aws.DeleteObjectCommand,
            getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};
const seg = (v) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'x';

export const videoPrefixFor = (videoId) => `${PROJECT_VIDEO_PREFIX}/${seg(videoId)}/`;
export const videoKeyBelongs = (storageKey, videoId) => { const v = String(storageKey || ''); return v.startsWith(videoPrefixFor(videoId)) && !v.includes('..'); };

export const presignProjectVideoUpload = async ({ videoId, ext, contentType }) => {
    const { client, PutObjectCommand, getSignedUrl } = await getS3();
    const storageKey = `${videoPrefixFor(videoId)}v-${randomUUID()}.${seg(ext)}`;
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucketName(), Key: storageKey, ContentType: contentType, CacheControl: 'no-store' }), { expiresIn: 7200 });
    return { storageKey, uploadUrl, contentType };
};

export const inspectProjectVideoObject = async (storageKey) => {
    const { client, HeadObjectCommand, GetObjectCommand } = await getS3();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: storageKey }));
    const bytes = Number(head.ContentLength) || 0;
    if (bytes <= 0) return { bytes: 0, head: Buffer.alloc(0) };
    const r = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: storageKey, Range: 'bytes=0-63' }));
    return { bytes, head: Buffer.from(await r.Body.transformToByteArray()) };
};

export const projectVideoObjectExists = async (storageKey) => {
    try { const { client, HeadObjectCommand } = await getS3(); await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: storageKey })); return true; }
    catch { return false; }
};

const asciiName = (name) => String(name || 'video').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');

/** Lectura firmada: `inline` para el reproductor, `attachment` para bajar. Caduca en 20 min (un video se reproduce un rato). */
export const signedProjectVideoUrl = async (storageKey, { fileName, contentType, disposition = 'inline', seconds = 1200 } = {}) => {
    const { client, GetObjectCommand, getSignedUrl } = await getS3();
    const safe = asciiName(fileName);
    return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucketName(), Key: storageKey,
        ResponseContentDisposition: `${disposition}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(String(fileName || safe))}`,
        ResponseContentType: contentType || 'video/mp4',
        ResponseCacheControl: 'private, max-age=0, no-store',
    }), { expiresIn: seconds });
};

export const deleteProjectVideoObject = async (storageKey) => {
    try {
        const v = String(storageKey || '');
        if (!v.startsWith(`${PROJECT_VIDEO_PREFIX}/`) || v.includes('..')) return false;
        const { client, DeleteObjectCommand } = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: v }));
        return true;
    } catch (e) { console.warn('[project-videos] no pude borrar el objeto:', e?.message); return false; }
};

export default { PROJECT_VIDEO_PREFIX, videoPrefixFor, videoKeyBelongs, presignProjectVideoUpload, inspectProjectVideoObject, projectVideoObjectExists, signedProjectVideoUrl, deleteProjectVideoObject };
