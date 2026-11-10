// ════════════════════════════════════════════════════════════════════
// La descarga desde URL, apuntando a un servidor HTTPS LOCAL — v4.1312
//
// Para el extremo a extremo de `test:receipt-url-import`: el controlador real
// llama a `fetchReceiptFromUrl` sin opciones, y la guarda real (con razón)
// no deja consultar 127.0.0.1. Este doble re-exporta TODO el módulo real
// (importado con `?real` para esquivar el hook) y sólo le agrega a
// `fetchReceiptFromUrl` las opciones de prueba que la prueba deja en
// `globalThis.__receiptFetchTesting`: el certificado propio, la resolución de
// `*.test` a 127.0.0.1 y el permiso para ESA dirección. El criterio —qué URL,
// qué dirección, qué redirección, qué tamaño, qué bytes— es el real.
// ════════════════════════════════════════════════════════════════════
import real from '../../server/lib/receiptUrlFetch.js?real';

export * from '../../server/lib/receiptUrlFetch.js?real';

export const fetchReceiptFromUrl = (url, opts = {}) =>
    real.fetchReceiptFromUrl(url, { ...opts, testing: globalThis.__receiptFetchTesting || null });

export default { ...real, fetchReceiptFromUrl };
