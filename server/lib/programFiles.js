// ════════════════════════════════════════════════════════════════════
// Programas — archivos PRIVADOS en S3 (v4.1280.0)
//
// Comprobantes de autorización, documentos de respaldo y recursos que no se
// publican viven bajo `private/programs/{programId}/`, sin lectura pública,
// igual que la plantilla de la Feria (`projectFairResourceStorage.js`):
//   · SUBIR: URL prefirmada de PUT, el navegador sube directo (Vercel corta
//     el cuerpo en 4,5 MB).
//   · VALIDAR: el objeto REAL (peso con HeadObject, tipo por los primeros
//     bytes con Range).
//   · LEER: enlace firmado de 2 minutos, sólo para quien el controlador
//     autorizó. Nadie tiene una URL fija.
//
// Las imágenes PÚBLICAS (logo, portada, fotos autorizadas) NO pasan por acá:
// van a la Biblioteca Multimedia del sitio (`/api/media`), como todo lo que
// se muestra. Lo autorizado para difusión y su documentación de respaldo son
// dos objetos distintos en dos lugares distintos.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import { PRIVATE_FILE_FORMATS, privateFileExtension, sniffPrivateFile } from './programSpec.js';

export const PROGRAM_FILE_PREFIX = 'private/programs';

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
            PutObjectCommand: aws.PutObjectCommand, GetObjectCommand: aws.GetObjectCommand, HeadObjectCommand: aws.HeadObjectCommand,
            DeleteObjectCommand: aws.DeleteObjectCommand, getSignedUrl: presignerMod.getSignedUrl,
        };
    }
    return _s3;
};

const seg = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '');
export const programPrefixFor = (programId) => `${PROGRAM_FILE_PREFIX}/${seg(programId)}/`;

/** ¿La clave es de ESTE programa? Impide registrar o firmar un objeto ajeno. */
export const programKeyBelongs = (storageKey, programId) => {
    const v = String(storageKey || '');
    return Boolean(seg(programId)) && v.startsWith(programPrefixFor(programId)) && !v.includes('..');
};

export const presignProgramUpload = async ({ programId, filename }) => {
    const ext = privateFileExtension(filename);
    const contentType = PRIVATE_FILE_FORMATS[ext]?.mime || 'application/octet-stream';
    const { client, PutObjectCommand, getSignedUrl } = await getS3();
    const storageKey = `${programPrefixFor(programId)}${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucketName(), Key: storageKey, ContentType: contentType, CacheControl: 'no-store' }), { expiresIn: 1800 });
    return { storageKey, uploadUrl, contentType };
};

/** El objeto REAL: peso y tipo por contenido. */
export const inspectProgramObject = async (storageKey, ext) => {
    const { client, HeadObjectCommand, GetObjectCommand } = await getS3();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: storageKey }));
    const bytes = Number(head.ContentLength) || 0;
    if (bytes <= 0) return { bytes: 0, format: null };
    const r = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: storageKey, Range: 'bytes=0-15' }));
    const first = Buffer.from(await r.Body.transformToByteArray());
    return { bytes, format: sniffPrivateFile(first, ext), contentType: head.ContentType || null };
};

/** Lectura firmada, 2 minutos, con el nombre original. */
export const signedProgramDownload = async (storageKey, { filename, contentType, seconds = 120, inline = false }) => {
    const { client, GetObjectCommand, getSignedUrl } = await getS3();
    const safe = String(filename || 'archivo').replace(/[^\w. ()-]/g, '_').slice(0, 120);
    return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucketName(), Key: storageKey,
        ResponseContentDisposition: `${inline ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
        ResponseContentType: contentType || 'application/octet-stream', ResponseCacheControl: 'no-store',
    }), { expiresIn: seconds });
};

export const deleteProgramObject = async (storageKey, programId) => {
    try {
        if (!programKeyBelongs(storageKey, programId)) return false;
        const { client, DeleteObjectCommand } = await getS3();
        await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: storageKey }));
        return true;
    } catch (e) {
        console.warn('[programas] no pude borrar el objeto:', e?.message);
        return false;
    }
};

export default { PROGRAM_FILE_PREFIX, programPrefixFor, programKeyBelongs, presignProgramUpload, inspectProgramObject, signedProgramDownload, deleteProgramObject };
