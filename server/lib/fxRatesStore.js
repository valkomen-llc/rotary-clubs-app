// La I/O de las tasas de cambio. El criterio vive en `fxRates.js`.
//
// v4.870 — Mismo patrón que `feeRulesStore.js` y `paymentMethodsStore.js`, y
// por el mismo motivo: un criterio que sólo se puede ejercitar contra la base
// termina sin pruebas, y éste decide cuánto se le cobra a alguien.

import prisma from './prisma.js';
import { FX_RATES_KEY, parseRates } from './fxRates.js';

// Esto se consulta al pintar el modal de aportes y otra vez al crear el pedido.
// Una tasa cambia una vez por semana como mucho.
const TTL_MS = 60_000;
let cache = null;
let cacheAt = 0;
let enVuelo = null;

/** Las tasas configuradas. NUNCA lanza: sin tasas simplemente no se convierte. */
export const getFxRates = async () => {
    const ahora = Date.now();
    if (cache && ahora - cacheAt < TTL_MS) return cache;
    if (enVuelo) return enVuelo;

    enVuelo = (async () => {
        try {
            const fila = await prisma.platformConfig.findUnique({ where: { key: FX_RATES_KEY } });
            cache = parseRates(fila?.value);
        } catch (e) {
            console.warn(`[FX] No se pudieron leer las tasas: ${e?.message}`);
            cache = {};
        }
        cacheAt = Date.now();
        enVuelo = null;
        return cache;
    })();
    return enVuelo;
};

export const saveFxRates = async (rates) => {
    const value = JSON.stringify(rates);
    await prisma.platformConfig.upsert({
        where: { key: FX_RATES_KEY },
        update: { value },
        create: { key: FX_RATES_KEY, value },
    });
    invalidateFxRates();
    return rates;
};

export const invalidateFxRates = () => { cache = null; cacheAt = 0; };

export default { getFxRates, saveFxRates, invalidateFxRates };
