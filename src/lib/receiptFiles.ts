/**
 * Los comprobantes de un desembolso, del lado del navegador (v4.998).
 *
 * El CRITERIO —qué tipos, cuánto pesa cada uno, cuántos— vive en el servidor
 * (`checkReceipts` en `walletLifecycle.js`) y es quien decide. Esto es el
 * espejo MÍNIMO que hace falta para avisar ANTES de gastar la subida: un PDF
 * de 30 MB rechazado después de subirlo es media transferencia perdida y un
 * mensaje que llega tarde. Los números tienen que coincidir con los del
 * servidor; lo fija una prueba que lee los dos archivos.
 *
 * ⚠️ PURO. Sin React, sin `File` del DOM más allá de sus tres campos.
 */
export const RECEIPT_MAX_FILES = 5;
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png';
const RECEIPT_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const RECEIPT_EXTS = ['pdf', 'jpg', 'jpeg', 'png'];

export interface ReceiptLike { name: string; size: number; type: string }

const extensionDe = (nombre: string) => {
    const i = String(nombre || '').lastIndexOf('.');
    return i > 0 ? String(nombre).slice(i + 1).toLowerCase() : '';
};

/**
 * ¿Este archivo se puede adjuntar? Devuelve el motivo, nombrando el archivo.
 *
 * El TIPO se mira por MIME **y** por extensión: varios navegadores de móvil
 * mandan el tipo vacío al elegir del carrete (la lección del HEIC, v4.739), y
 * rechazar una captura por eso sería rechazar justo el caso para el que se
 * pidió esto.
 */
export const juzgarComprobante = (f: ReceiptLike): string | null => {
    const tipo = String(f?.type || '').toLowerCase();
    const ext = extensionDe(f?.name);
    const tipoOk = tipo ? RECEIPT_MIMES.includes(tipo) : RECEIPT_EXTS.includes(ext);
    if (!tipoOk) return `«${f.name}»: sólo se admiten PDF, JPG y PNG.`;
    if (!(f.size > 0)) return `«${f.name}»: el archivo está vacío.`;
    if (f.size > RECEIPT_MAX_BYTES) {
        return `«${f.name}» pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo por archivo es ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.`;
    }
    return null;
};

/**
 * Suma lo elegido a lo que ya había, con el tope y sin repetir.
 *
 * Se SUMA, no se reemplaza: quien eligió el PDF y después vuelve al selector
 * por la captura espera tener los dos. Un mismo archivo elegido dos veces
 * —mismo nombre y mismo peso— entra una sola vez. Lo que no entra se
 * devuelve con su motivo: un descarte silencioso deja al usuario creyendo que
 * la captura va adjunta.
 */
export const agregarComprobantes = <T extends ReceiptLike>(actuales: T[], nuevos: T[]) => {
    const lista = [...actuales];
    const rechazados: string[] = [];
    for (const f of nuevos) {
        const motivo = juzgarComprobante(f);
        if (motivo) { rechazados.push(motivo); continue; }
        if (lista.some(x => x.name === f.name && x.size === f.size)) continue;
        if (lista.length >= RECEIPT_MAX_FILES) {
            rechazados.push(`«${f.name}»: se pueden adjuntar hasta ${RECEIPT_MAX_FILES} comprobantes.`);
            continue;
        }
        lista.push(f);
    }
    return { files: lista, rechazados };
};

/** «a.pdf y b.png» / «a.pdf, b.png y c.jpg»: para la confirmación. */
export const nombrarComprobantes = (files: ReceiptLike[]): string => {
    const n = files.map(f => f.name);
    if (n.length <= 1) return n[0] || '';
    return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
};
