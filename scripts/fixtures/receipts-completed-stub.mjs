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
// v4.1312 — lo PURO del módulo real (qué es un archivo por sus bytes; la
// cabecera de descarga). v4.1310 ya importaba `presignPrivateReceiptUpload` y
// `verifyPrivateReceipt` y este doble no los tenía: cargar el router con el
// doble fallaba al enlazar el módulo.
export const receiptKindOf = real.receiptKindOf;
export const attachmentDisposition = real.attachmentDisposition;

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
    return { ok: true, bytes: obj.bytes, mime: obj.mime, metadata: obj.metadata || {} };
};

export const signedReceiptUrl = async (key, { download = false } = {}) =>
    (objetos.has(key) ? `https://s3.example/${key}?lectura-firmada${download ? '&descarga' : ''}` : null);

// v4.1312 — Guardar lo que trajo el servidor (importación desde URL). La
// prueba puede hacer fallar el próximo guardado con `fallarGuardado`.
export const guardados = [];
let fallarProximo = false;
export const fallarGuardado = () => { fallarProximo = true; };
export const putReceiptObject = async ({ eventId, body, mime, ext, metadata = {} }) => {
    if (fallarProximo) { fallarProximo = false; return { ok: false, error: 'No fue posible guardar el archivo en Club Platform.' }; }
    const key = `${RECEIPT_PREFIX}/${eventId}/${randomUUID()}.${ext}`;
    objetos.set(key, { bytes: body.length, mime, body: Buffer.from(body), metadata: { ...metadata } });
    guardados.push(key);
    return { ok: true, key };
};
export const readReceiptObject = async (key) => objetos.get(key)?.body || null;

export const presignPrivateReceiptUpload = async ({ prefix, contentType, filename, size }) => {
    const juicio = checkReceiptMeta({ contentType, filename, size });
    if (!juicio.ok) return { ok: false, errores: juicio.errores };
    const key = `${prefix}/${randomUUID()}.${receiptExtensionFor(contentType, filename)}`;
    return { ok: true, key, uploadUrl: `https://s3.example/${key}?firmada`, contentType };
};
export const verifyPrivateReceipt = async (receipt, prefix) => {
    if (!receipt || !receipt.key) return null;
    const key = String(receipt.key);
    if (!key.startsWith(`${prefix}/`) || key.includes('..')) return { ok: false, error: 'El comprobante no corresponde a este registro. Vuelve a adjuntarlo.' };
    const head = await headReceipt(key);
    if (!head.ok) return { ok: false, error: head.error };
    return { ok: true, key, name: String(receipt.name || 'comprobante'), mime: head.mime, bytes: head.bytes };
};

// v4.952 — el borrado del comprobante al eliminar un registro. Mejor esfuerzo,
// como el real: nunca lanza, y la prueba puede mirar qué claves se quitaron.
export const eliminados = [];
export const deleteReceiptObject = async (key) => {
    const value = String(key || '');
    if (!value.startsWith(`${RECEIPT_PREFIX}/`)) return false;
    objetos.delete(value);
    eliminados.push(value);
    return true;
};

export default {
    RECEIPT_PREFIX, receiptKeyBelongs, presignReceiptUpload, headReceipt, deleteReceiptObject, signedReceiptUrl,
    receiptKindOf, attachmentDisposition, putReceiptObject, readReceiptObject, presignPrivateReceiptUpload, verifyPrivateReceipt,
};
