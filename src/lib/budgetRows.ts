// ════════════════════════════════════════════════════════════════════
// Filas de «total» en un desglose con dinero (v4.1353–v4.1354).
//
// Caso Paula Cruz (Pereira del Café): agregó el total del proyecto como un
// rubro más del «Desglose del presupuesto» del FDD y la ficha lo sumaba dos
// veces (US$ 273.116). Después borró la palabra «total» pero dejó el monto, y
// la fila vacía con US$ 136.558 seguía sumando. Un mismo criterio lo usan el
// formulario (que avisa) y la ficha en PDF (que no lo suma).
// ════════════════════════════════════════════════════════════════════

/** «Total», «TOTAL:», «Total general», «Subtotal», «Total presupuesto», «Gran total», «Total (USD)»… */
export const TOTAL_ROW_RE = /^(gran\s+)?(sub)?total(es)?(\s+(general|del\s+proyecto|presupuesto|del\s+presupuesto|proyecto|us\$?|usd))?$/;

/** Un rótulo comparable: sin tildes, en minúsculas y sin puntuación. */
export const normLabel = (v: unknown): string => String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9$]+/g, ' ').trim();

export const toAmount = (v: unknown): number | null => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
};

/**
 * Qué filas de un desglose son un TOTAL escrito por el club y no un rubro:
 * - las tituladas «Total» (y sus variantes), tengan o no monto;
 * - una fila SIN concepto cuyo monto es exactamente la suma de las demás
 *   (con al menos dos rubros más): el «total» al que sólo se le borró el
 *   nombre.
 * Devuelve los índices (en `rows`) de esas filas.
 */
export const totalRowIndexes = (rows: any[], labelKey: string | undefined, amountKey: string | undefined): Set<number> => {
    const out = new Set<number>();
    if (!labelKey) return out;
    rows.forEach((r, i) => { if (TOTAL_ROW_RE.test(normLabel(r?.[labelKey]))) out.add(i); });
    if (!amountKey) return out;
    rows.forEach((r, i) => {
        if (out.has(i) || normLabel(r?.[labelKey]) !== '') return;
        const n = toAmount(r?.[amountKey]);
        if (n === null || n <= 0) return;
        const others = rows.filter((_, j) => j !== i && !out.has(j)).map(x => toAmount(x?.[amountKey])).filter((x): x is number => x !== null);
        if (others.length < 2) return;
        const sum = others.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - n) < 0.5) out.add(i);
    });
    return out;
};
