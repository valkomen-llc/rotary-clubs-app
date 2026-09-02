// La I/O del recargo de inscripción. El criterio vive en `checkoutSurcharge.js`.
//
// v4.980 — Separado por el mismo motivo que `feeRulesStore.js` lo está de
// `feeRules.js`: un criterio que sólo se puede ejercitar contra una base real
// termina sin pruebas. Acá no hay ninguna decisión, sólo leer, guardar e
// invalidar.

import prisma from './prisma.js';
import { SURCHARGE_KEY, DEFAULT_SURCHARGE, parseSurchargeConfig } from './checkoutSurcharge.js';

// ⚠️ ESTO CORRE EN EL CAMINO DEL COBRO. Sin caché, cada inscripción pagaría un
// viaje a la base para leer dos porcentajes que cambian una vez al año. Toda
// escritura invalida, así que el TTL es sólo la red de las otras instancias.
const TTL_MS = 60_000;
let cache = null;
let cacheAt = 0;
let enVuelo = null;

/**
 * La configuración vigente.
 *
 * NUNCA lanza. Si la base no responde se devuelve la configuración por
 * defecto: una inscripción no se puede perder porque no se pudo leer un
 * porcentaje.
 */
export const getSurchargeConfig = async () => {
    const ahora = Date.now();
    if (cache && ahora - cacheAt < TTL_MS) return cache;
    if (enVuelo) return enVuelo;

    enVuelo = (async () => {
        try {
            const fila = await prisma.platformConfig.findUnique({ where: { key: SURCHARGE_KEY } });
            cache = parseSurchargeConfig(fila?.value);
        } catch (e) {
            console.warn(`[SURCHARGE] No se pudo leer la configuración, se usa la vigente: ${e?.message}`);
            cache = DEFAULT_SURCHARGE;
        }
        cacheAt = Date.now();
        enVuelo = null;
        return cache;
    })();
    return enVuelo;
};

/** Guarda la configuración ya validada y limpia la caché: quien acaba de
 *  cambiar el recargo lo prueba en seguida, no cuando venza el TTL. */
export const saveSurchargeConfig = async (config) => {
    const value = JSON.stringify(config);
    await prisma.platformConfig.upsert({
        where: { key: SURCHARGE_KEY },
        update: { value },
        create: { key: SURCHARGE_KEY, value },
    });
    invalidateSurchargeConfig();
    return config;
};

export const invalidateSurchargeConfig = () => {
    cache = null;
    cacheAt = 0;
    enVuelo = null;
};

export default { getSurchargeConfig, saveSurchargeConfig, invalidateSurchargeConfig };
