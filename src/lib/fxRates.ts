// ESPEJO MÍNIMO de `server/lib/fxRates.js`.
//
// v4.870 — Sólo lo que el modal de aportes necesita: convertir el importe que
// el visitante eligió a la moneda en la que PayPal va a cobrar, para poder
// DECÍRSELO antes de mandarlo allá.
//
// ⚠️ ESTÁ DUPLICADO A PROPÓSITO, como `donationCurrency.ts` y los otros seis
// espejos del sitio, y por el mismo motivo: pedirle al servidor la conversión
// en cada pulsación sería un viaje de red por tecla. Lo que lo hace seguro es
// que la prueba compara las SALIDAS de los dos módulos, no que se parezcan.
//
// Si cambia uno, cambiar el otro.

/** Decimales con los que se ESCRIBE cada moneda. Espejo de `CURRENCIES`.
 *
 *  ⚠️ NO son los de la unidad mínima del proveedor: el peso colombiano se cobra
 *  con dos decimales y se escribe sin ninguno. Confundirlas es el error caro
 *  que documenta `money.js`. */
const DECIMALES: Record<string, number> = {
    USD: 2, COP: 0, EUR: 2, MXN: 2, BRL: 2,
};

/** Monedas que el proveedor cobra sin decimales; sirve de respaldo para una
 *  que no esté en el catálogo de presentación. */
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

export interface Conversion {
    ok: boolean;
    reason?: string;
    originalAmount?: number;
    originalCurrency?: string;
    amount?: number;
    currency?: string;
    perUnit?: number;
}

/**
 * Convertir un importe con una tasa YA conocida.
 *
 * `perUnit` es cuántas unidades de la moneda origen valen UNA de la destino
 * —«4.032 pesos por dólar»—, que es como lo dice una persona y como se guarda.
 */
export const convertWithRate = (
    amount: number, from: string, to: string, perUnit: number,
): Conversion => {
    const origen = normalizeCurrency(from);
    const destino = normalizeCurrency(to);
    const monto = Number(amount);
    if (!origen || !destino) return { ok: false, reason: 'sin_moneda' };
    if (!Number.isFinite(monto) || monto <= 0) return { ok: false, reason: 'sin_importe' };
    if (!Number.isFinite(perUnit) || perUnit <= 0) return { ok: false, reason: 'sin_tasa' };

    const convertido = roundMoney(monto / perUnit, destino);
    // Un importe que se redondea a cero no es un cobro: es una tasa mal escrita.
    if (!(convertido > 0)) return { ok: false, reason: 'importe_cero' };

    return {
        ok: true,
        originalAmount: monto,
        originalCurrency: origen,
        amount: convertido,
        currency: destino,
        perUnit,
    };
};

/** El importe con su moneda, como se escribe en la pantalla. */
export const formatConverted = (amount: number, currency: string): string =>
    `${Number(amount || 0).toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimalsOf(currency),
    })} ${normalizeCurrency(currency)}`;

export default { normalizeCurrency, decimalsOf, roundMoney, convertWithRate, formatConverted };
