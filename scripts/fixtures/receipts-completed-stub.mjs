// ════════════════════════════════════════════════════════════════════
// S3 de los comprobantes, en memoria — v4.943.0
//
// Sustituye SÓLO la I/O de red (`presignReceiptUpload`, `headReceipt`,
// `signedReceiptUrl`): el bucket es un mapa que la prueba siembra. Lo que NO
// se sustituye es el CRITERIO — `receiptKeyBelongs` se re-exporta del módulo
// REAL (importado con `?real` para esquivar el hook), porque un doble que
// reescriba la regla que la prueba dice comprobar no comprueba nada (v4.896).
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import real from '../../server/lib/completedReceipts.js?real';
import { checkReceiptMeta, receiptExtensionFor, RECEIPT_MAX_BYTES } from '../../server/lib/completedRegistrationSpec.js';

export const receiptKeyBelongs = real.receiptKeyBelongs;
export const RECEIPT_PREFIX = real.RECEIPT_PREFIX;

/** El «bucket»: clave → { bytes, mime }. La prueba lo siembra. */
export const objetos = new Map();
export const resetObjetos = () => objetos.clear();

export const presignReceiptUpload = async ({ eventId, contentType, filename, size }) => {
    const juicio = checkReceiptMeta({ contentType, filename, size });
    if (!juicio.ok) return { ok: false, errores: juicio.errores };
    const key = `${RECEIPT_PREFIX}/${eventId}/${randomUUID()}.${receiptExtensionFor(contentType, filename)}`;
    return { ok: true, key, uploadUrl: `https://s3.example/${key}?firmada`, contentType };
};

export const headReceipt = async (key) => {
    const obj = objetos.get(key);
    if (!obj) return { ok: false, error: 'No encontramos el comprobante subido. Vuelve a adjuntarlo.' };
    if (obj.bytes > RECEIPT_MAX_BYTES) {
        return { ok: false, error: `El comprobante pesa ${(obj.bytes / 1024 / 1024).toFixed(1)} MB y el máximo es ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.` };
    }
    return { ok: true, bytes: obj.bytes, mime: obj.mime };
};

export const signedReceiptUrl = async (key) =>
    (objetos.has(key) ? `https://s3.example/${key}?lectura-firmada` : null);

export default { RECEIPT_PREFIX, receiptKeyBelongs, presignReceiptUpload, headReceipt, signedReceiptUrl };
