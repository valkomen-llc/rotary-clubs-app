// ════════════════════════════════════════════════════════════════════
// El comprobante de una CONFIRMACIÓN MANUAL de pago — Feria de Proyectos — v4.1308
//
// Pedido del comité: al confirmar a mano el pago de una postulación (una
// transferencia o consignación que no pasó por Stripe), adjuntar el soporte
// en la misma ventana, no pegar un enlace en un campo de texto.
//
// Es el MISMO recorrido que el comprobante de una inscripción completada
// (v4.943 / v4.1291), con su propio prefijo privado:
//
//   1. el panel pide una URL prefirmada (5 minutos) para ESTA postulación,
//   2. el navegador sube el archivo directo a S3 (el cuerpo de una función se
//      corta en ~4,5 MB y el comprobante admite 10),
//   3. la confirmación trae la clave, y el servidor comprueba el objeto REAL:
//      que existe, cuánto pesa y qué es por sus primeros bytes.
//
// El prefijo es `private/project-fair-receipts/{submissionId}/`, sin lectura
// pública: el panel lo abre con un enlace firmado que caduca a los 5 minutos.
// Una clave de otra postulación —u otro sitio del bucket— no se reclama ni se
// firma (`manualReceiptKeyBelongs`).
// ════════════════════════════════════════════════════════════════════
import {
    presignPrivateReceiptUpload, verifyPrivateReceipt, signedReceiptUrl,
} from './completedReceipts.js';

export const MANUAL_RECEIPT_PREFIX = 'private/project-fair-receipts';

const idSeguro = (id) => /^[A-Za-z0-9_-]{1,80}$/.test(String(id || ''));

/** ¿La clave es del prefijo de ESTA postulación? */
export const manualReceiptKeyBelongs = (key, submissionId) => {
    const value = String(key || '');
    return idSeguro(submissionId)
        && value.startsWith(`${MANUAL_RECEIPT_PREFIX}/${submissionId}/`)
        && !value.includes('..');
};

export const presignManualReceipt = async ({ submissionId, contentType, filename, size }) => {
    if (!idSeguro(submissionId)) return { ok: false, errores: ['Postulación no válida.'] };
    return presignPrivateReceiptUpload({
        prefix: `${MANUAL_RECEIPT_PREFIX}/${submissionId}`, contentType, filename, size,
    });
};

/**
 * Comprueba el comprobante que trae la confirmación. `null` si no trae
 * ninguno (el soporte también puede ser una referencia escrita).
 *
 * @returns {Promise<null | { ok: true, key, name, mime, bytes } | { ok: false, error }>}
 */
export const verifyManualReceipt = async (receipt, submissionId) => {
    if (!receipt || !receipt.key) return null;
    if (!manualReceiptKeyBelongs(receipt.key, submissionId)) {
        return { ok: false, error: 'El comprobante no corresponde a esta postulación. Vuelve a adjuntarlo.' };
    }
    // v4.1310 — El mismo verificador que los comprobantes manuales de eventos.
    return verifyPrivateReceipt(receipt, `${MANUAL_RECEIPT_PREFIX}/${submissionId}`);
};

export { signedReceiptUrl };

export default { MANUAL_RECEIPT_PREFIX, manualReceiptKeyBelongs, presignManualReceipt, verifyManualReceipt, signedReceiptUrl };
