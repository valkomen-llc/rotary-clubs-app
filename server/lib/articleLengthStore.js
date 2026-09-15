// La I/O de la extensión de artículos. El criterio vive en `articleLength.js`.
//
// v4.1059 — Separado por el mismo motivo que `checkoutSurchargeStore.js` lo
// está de `checkoutSurcharge.js`: acá no hay ninguna decisión, sólo leer,
// guardar e invalidar. Todo lo que decide se prueba sin base.

import prisma from './prisma.js';
import { ARTICLE_LENGTH_KEY, DEFAULT_ARTICLE_LENGTH, parseArticleLength } from './articleLength.js';

// ⚠️ ESTO CORRE EN EL CAMINO DE LA GENERACIÓN. Sin caché, cada artículo pagaría
// un viaje a la base para leer un número que cambia una vez al año. Toda
// escritura invalida, así que el TTL es sólo la red de las otras instancias.
const TTL_MS = 60_000;
let cache = null;
let cacheAt = 0;
let enVuelo = null;

/**
 * La configuración vigente.
 *
 * NUNCA lanza: una configuración ilegible degrada a «sin objetivo» —el
 * comportamiento anterior a v4.1059—, en vez de tumbar la generación de un
 * artículo. Es la misma cautela que `getSurchargeConfig`.
 */
export const getArticleLength = async () => {
    const ahora = Date.now();
    if (cache && ahora - cacheAt < TTL_MS) return cache;
    if (enVuelo) return enVuelo;

    enVuelo = (async () => {
        try {
            const fila = await prisma.platformConfig.findUnique({ where: { key: ARTICLE_LENGTH_KEY } });
            cache = parseArticleLength(fila?.value);
        } catch (e) {
            console.warn(`[ARTICLE-LENGTH] No se pudo leer la configuración, se generan los artículos como siempre: ${e?.message}`);
            cache = { ...DEFAULT_ARTICLE_LENGTH };
        }
        cacheAt = Date.now();
        enVuelo = null;
        return cache;
    })();
    return enVuelo;
};

/** Guarda el valor YA VALIDADO y limpia la caché: quien acaba de cambiar la
 *  longitud genera un artículo en seguida para verla, no cuando venza el TTL. */
export const saveArticleLength = async ({ targetChars, actor = null, actorName = null }) => {
    const config = {
        targetChars: targetChars ?? null,
        updatedAt: new Date().toISOString(),
        updatedBy: actor || null,
        updatedByName: actorName || null,
    };
    const value = JSON.stringify(config);
    await prisma.platformConfig.upsert({
        where: { key: ARTICLE_LENGTH_KEY },
        update: { value },
        create: { key: ARTICLE_LENGTH_KEY, value },
    });
    invalidateArticleLength();
    return config;
};

export const invalidateArticleLength = () => {
    cache = null;
    cacheAt = 0;
    enVuelo = null;
};

export default { getArticleLength, saveArticleLength, invalidateArticleLength };
