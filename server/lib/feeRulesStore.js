// La I/O de las reglas de comisión. El criterio vive en `feeRules.js`.
//
// v4.854 — Está separado por el mismo motivo que `seoRules.js` lo está de
// `seoAudit.js`: un criterio que sólo se puede ejercitar contra una base real
// termina sin pruebas, y entonces nadie se entera de que una regla cambió de
// signo. Acá no hay ninguna decisión, sólo leer, guardar e invalidar.

import prisma from './prisma.js';
import { FEE_RULES_KEY, DEFAULT_RULES, parseRules } from './feeRules.js';

// ⚠️ ESTO CORRE EN EL CAMINO DEL COBRO. Sin caché, cada aporte pagaría un viaje
// a la base para leer un número que cambia una vez al año. El TTL es corto
// porque quien acaba de guardar la tarifa la prueba en seguida — y toda
// escritura invalida, así que el TTL es sólo la red de seguridad para las otras
// instancias de la función.
const TTL_MS = 60_000;
let cache = null;
let cacheAt = 0;
let enVuelo = null;

/**
 * Las reglas vigentes.
 *
 * NUNCA lanza. Si la base no responde se devuelve la tarifa por defecto, que es
 * exactamente lo que el código hacía antes de que esto existiera: un aporte no
 * se puede perder porque no se pudo leer una configuración.
 */
export const getFeeRules = async () => {
    const ahora = Date.now();
    if (cache && ahora - cacheAt < TTL_MS) return cache;
    // Dos cobros simultáneos tras vencer el TTL no hacen dos consultas: la
    // segunda se cuelga de la promesa en vuelo. Mismo recurso que
    // `useSiteImages` tras el diagnóstico de rendimiento de v4.659.
    if (enVuelo) return enVuelo;

    enVuelo = (async () => {
        try {
            const fila = await prisma.platformConfig.findUnique({ where: { key: FEE_RULES_KEY } });
            cache = parseRules(fila?.value);
        } catch (e) {
            console.warn(`[FEE-RULES] No se pudo leer la configuración, se usa la tarifa por defecto: ${e?.message}`);
            cache = DEFAULT_RULES;
        }
        cacheAt = Date.now();
        enVuelo = null;
        return cache;
    })();
    return enVuelo;
};

/** Guarda las reglas ya validadas y limpia la caché: quien acaba de cambiar la
 *  tarifa la prueba en seguida, no cuando venza el TTL. */
export const saveFeeRules = async (rules) => {
    const value = JSON.stringify(rules);
    await prisma.platformConfig.upsert({
        where: { key: FEE_RULES_KEY },
        update: { value },
        create: { key: FEE_RULES_KEY, value },
    });
    invalidateFeeRules();
    return rules;
};

export const invalidateFeeRules = () => { cache = null; cacheAt = 0; };

export default { getFeeRules, saveFeeRules, invalidateFeeRules };
