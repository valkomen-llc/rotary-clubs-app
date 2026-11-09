// ════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones — los archivos en S3 — v4.1302.0
//
//   PÚBLICO   clubs/{siteId}/cursos/{uuid}.ext        portadas, miniaturas,
//                                                     imagen del instructor
//   PRIVADO   private/learning/courses/{courseId}/…   videos, audios,
//                                                     documentos, recursos
//
// · SUBIR: el navegador sube DIRECTO a S3 (Vercel corta el cuerpo en 4,5 MB).
//   Hasta 64 MB, un PUT prefirmado; más, CARGA MULTIPARTE por partes de 16 MB
//   reanudable: si se corta la conexión o se recarga la página, volver a
//   elegir el MISMO archivo sigue desde las partes que S3 ya tiene.
// · VALIDAR: el objeto REAL (peso con HeadObject, tipo por los primeros
//   512 bytes), no lo que el navegador declaró. Lo que no coincide se borra.
// · SERVIR: lo privado sale con enlace firmado corto (20 min para video,
//   2 min para documentos), y sólo después de que el controlador decidió el
//   acceso según la modalidad del curso. Sin transcodificación ni streaming
//   adaptativo en esta fase: el reproductor usa el archivo original (se
//   recomienda MP4 H.264 + AAC).
//
// Las primitivas de S3 (PUT prefirmado, multiparte, inspección, firma) son
// las del formulario institucional de programas: no se reescriben.
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import {
    presignSinglePut, startMultipart, presignParts, listUploadedParts, completeMultipart, abortMultipart, signedIntakeUrl,
} from './programIntakeFiles.js';
import { sniffLearningFile, LEARNING_FORMATS } from './learningSpec.js';

export { presignSinglePut, startMultipart, presignParts, listUploadedParts, completeMultipart, abortMultipart };

const bucketName = () => process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
const region = () => process.env.AWS_REGION || 'us-east-1';
const seg = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '');

let _s3 = null;
const getS3 = async () => {
    if (!_s3) {
        const awsMod = await import('@aws-sdk/client-s3');
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
            aws,
        };
    }
    return _s3;
};

export const PRIVATE_PREFIX = 'private/learning/courses';
export const privatePrefix = (courseId) => `${PRIVATE_PREFIX}/${seg(courseId)}/`;
export const publicPrefix = (siteId) => `clubs/${seg(siteId) || 'platform'}/cursos/`;

/** ¿La clave privada es de ESTE curso? Separa cursos entre sí. */
export const privateKeyBelongs = (key, courseId) => {
    const v = String(key || '');
    return Boolean(courseId) && v.startsWith(privatePrefix(courseId)) && !v.includes('..');
};
export const publicKeyBelongs = (key, siteId) => {
    const v = String(key || '');
    return v.startsWith(publicPrefix(siteId)) && !v.includes('..');
};

export const newPrivateKey = (courseId, ext) => `${privatePrefix(courseId)}${randomUUID()}.${ext}`;
export const newPublicKey = (siteId, ext) => `${publicPrefix(siteId)}${randomUUID()}.${ext}`;

export const publicUrlOf = (key) => {
    const endpoint = process.env.AWS_ENDPOINT_URL_S3;
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return endpoint ? `${endpoint.replace(/\/$/, '')}/${bucketName()}/${encoded}` : `https://${bucketName()}.s3.${region()}.amazonaws.com/${encoded}`;
};

/** PUT prefirmado para una imagen pública: queda con caché larga. */
export const presignPublicPut = async ({ key, contentType }) => {
    const { client, aws } = await getS3();
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const uploadUrl = await getSignedUrl(client, new aws.PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }), { expiresIn: 3600 });
    return { uploadUrl, cacheControl: 'public, max-age=31536000, immutable' };
};

/** El objeto REAL: peso y tipo por contenido (primeros 512 bytes). */
export const inspectObject = async (key, ext) => {
    const { client, aws } = await getS3();
    const head = await client.send(new aws.HeadObjectCommand({ Bucket: bucketName(), Key: key }));
    const bytes = Number(head.ContentLength) || 0;
    if (bytes <= 0) return { bytes: 0, format: null };
    const r = await client.send(new aws.GetObjectCommand({ Bucket: bucketName(), Key: key, Range: 'bytes=0-511' }));
    const first = Buffer.from(await r.Body.transformToByteArray());
    return { bytes, format: sniffLearningFile(first, ext), contentType: head.ContentType || LEARNING_FORMATS[ext]?.mime || null };
};

export const deleteObject = async (key) => {
    try {
        const { client, aws } = await getS3();
        await client.send(new aws.DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
        return true;
    } catch { return false; }
};

/** Enlace firmado para un archivo privado ya autorizado por el controlador. */
export const signedUrl = (key, { filename, contentType, seconds = 120, inline = true } = {}) =>
    signedIntakeUrl(key, { filename, contentType, seconds, inline });

export default {
    presignSinglePut, startMultipart, presignParts, listUploadedParts, completeMultipart, abortMultipart,
    PRIVATE_PREFIX, privatePrefix, publicPrefix, privateKeyBelongs, publicKeyBelongs, newPrivateKey, newPublicKey, publicUrlOf,
    presignPublicPut, inspectObject, deleteObject, signedUrl,
};
