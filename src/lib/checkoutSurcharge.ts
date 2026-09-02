// ESPEJO MÍNIMO de `server/lib/checkoutSurcharge.js`.
//
// v4.980 — Sólo lo que las pantallas de inscripción necesitan: mostrar el
// desglose del recargo mientras la persona arma su inscripción, sin pedirle al
// servidor un viaje de red por cada acompañante que agrega.
//
// ⚠️ ESTÁ DUPLICADO A PROPÓSITO, como `fxRates.ts` y los otros espejos del
// sitio, y por el mismo motivo. Lo que lo hace seguro es que la prueba compara
// las SALIDAS de los dos módulos sobre una matriz de importes y monedas, no
// que se parezcan.
//
// ⚠️ Y LO QUE SE COBRA NO SALE DE ACÁ. El importe lo calcula el SERVIDOR al
// abrir el pago, con el precio que él mismo congeló: esto sólo PINTA. Con el
// importe viajando desde el navegador, cualquiera con el endpoint elegiría
// cuánto paga.
//
// Si cambia uno, cambiar el otro.

/** Decimales con los que se ESCRIBE cada moneda. Espejo de `CURRENCIES`. */
const DECIMALES: Record<string, number> = { USD: 2, COP: 0, EUR: 2, MXN: 2, BRL: 2 };

const SIN_DECIMALES = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
    'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

export const normalizeCurrency = (code?: string | null): string =>
    String(code || '').trim().toUpperCase();

export const decimalsOf = (code?: string | null): number => {
    const c = normalizeCurrency(code);
    if (c in DECIMALES) return DECIMALES[c];
    return SIN_DECIMALES.has(c) ? 0 : 2;
};

export const roundMoney = (amount: number, currency?: string | null): number => {
    const factor = 10 ** decimalsOf(currency);
    return Math.round((Number(amount) || 0) * factor) / factor;
};

export type SurchargeLine = {
    key: string;
    label: string;
    percent: number;
    fixed: number;
    amount: number;
};

export type SurchargeQuote = {
    enabled: boolean;
    flow: string | null;
    currency: string;
    base: number;
    lines: SurchargeLine[];
    surcharge: number;
    total: number;
    percent: number;
};

/** Lo que el servidor manda en la configuración del formulario. Las TASAS, no
 *  el importe: el importe depende de lo que la persona esté armando. */
export type SurchargeRates = {
    enabled: boolean;
    lines: { key: string; label: string; percent: number; fixed: number }[];
};

const num = (v: unknown): number | null =>
    Number.isFinite(Number(v)) ? Number(v) : null;

/**
 * El recargo de un importe, desglosado. Misma aritmética que el servidor: cada
 * línea se redondea y el total es la SUMA de las líneas — si el total se
 * redondeara aparte, el desglose no cuadraría con lo que se cobra.
 */
export const computeSurcharge = (
    baseAmount: number,
    rates?: SurchargeRates | null,
    currency?: string | null,
    flow?: string | null,
): SurchargeQuote => {
    const code = normalizeCurrency(currency) || 'USD';
    const base = roundMoney(Math.max(0, num(baseAmount) ?? 0), code);
    const enabled = !!rates?.enabled;

    if (!enabled || base <= 0) {
        return { enabled, flow: flow || null, currency: code, base, lines: [], surcharge: 0, total: base, percent: 0 };
    }

    const lines = (rates?.lines || [])
        .map(rate => ({
            key: rate.key,
            label: rate.label,
            percent: Number(rate.percent) || 0,
            fixed: Number(rate.fixed) || 0,
            amount: roundMoney(base * (Number(rate.percent) || 0) + (Number(rate.fixed) || 0), code),
        }))
        .filter(line => line.amount > 0);

    const surcharge = roundMoney(lines.reduce((acc, l) => acc + l.amount, 0), code);
    return {
        enabled: true,
        flow: flow || null,
        currency: code,
        base,
        lines,
        surcharge,
        total: roundMoney(base + surcharge, code),
        percent: base > 0 ? surcharge / base : 0,
    };
};

/** El desglose como pares rótulo/importe, en el orden en que se muestra. */
export const surchargeSummary = (
    quote: SurchargeQuote | null,
    baseLabel = 'Valor de la inscripción',
    totalLabel = 'Total a pagar',
) => {
    if (!quote) return [];
    const rows: { key: string; label: string; amount: number; kind: 'base' | 'fee' | 'total'; percent?: number }[] = [
        { key: 'base', label: baseLabel, amount: quote.base, kind: 'base' },
    ];
    for (const line of quote.lines) {
        rows.push({ key: line.key, label: line.label, amount: line.amount, kind: 'fee', percent: line.percent });
    }
    rows.push({ key: 'total', label: totalLabel, amount: quote.total, kind: 'total' });
    return rows;
};

/** «2,9 %» a partir del tanto por uno, con la coma decimal del sitio. */
export const percentLabel = (percent: number): string =>
    `${(Math.round((Number(percent) || 0) * 10000) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;

export default { computeSurcharge, surchargeSummary, percentLabel, roundMoney, decimalsOf, normalizeCurrency };
