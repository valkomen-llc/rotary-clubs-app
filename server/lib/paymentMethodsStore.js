// La I/O de los métodos de pago. El criterio vive en `paymentMethods.js`.
//
// v4.868 — Mismo patrón que `feeRulesStore.js`, y por el mismo motivo: un
// criterio que sólo se puede ejercitar contra la base termina sin pruebas.

import prisma from './prisma.js';
import { PAYMENT_METHODS_KEY, parseMethods, defaultConfig } from './paymentMethods.js';

// Esto se consulta al pintar el modal de aportes. Sin caché, cada visitante
// pagaría un viaje a la base para leer dos booleanos que cambian una vez al mes.
const TTL_MS = 60_000;
let cache = null;
let cacheAt = 0;
let enVuelo = null;

/** Lo activado. NUNCA lanza: sin esto no habría cómo aportar. */
export const getPaymentMethods = async () => {
    const ahora = Date.now();
    if (cache && ahora - cacheAt < TTL_MS) return cache;
    if (enVuelo) return enVuelo;

    enVuelo = (async () => {
        try {
            const fila = await prisma.platformConfig.findUnique({ where: { key: PAYMENT_METHODS_KEY } });
            cache = parseMethods(fila?.value);
        } catch (e) {
            console.warn(`[PAYMENT-METHODS] No se pudo leer la configuración: ${e?.message}`);
            cache = defaultConfig();
        }
        cacheAt = Date.now();
        enVuelo = null;
        return cache;
    })();
    return enVuelo;
};

export const savePaymentMethods = async (methods) => {
    const value = JSON.stringify(methods);
    await prisma.platformConfig.upsert({
        where: { key: PAYMENT_METHODS_KEY },
        update: { value },
        create: { key: PAYMENT_METHODS_KEY, value },
    });
    invalidatePaymentMethods();
    return methods;
};

export const invalidatePaymentMethods = () => { cache = null; cacheAt = 0; };

export default { getPaymentMethods, savePaymentMethods, invalidatePaymentMethods };
