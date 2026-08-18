// La I/O de las tasas de cambio. El criterio vive en `fxRates.js`.
//
// v4.870 — Mismo patrón que `feeRulesStore.js` y `paymentMethodsStore.js`, y
// por el mismo motivo: un criterio que sólo se puede ejercitar contra la base
// termina sin pruebas, y éste decide cuánto se le cobra a alguien.

import prisma from './prisma.js';
import { FX_RATES_KEY, parseRates, pairKey, mergeRates } from './fxRates.js';
// La TRM ya se resuelve sola desde v4.846 —cadena de proveedores, caché por
// fecha y la Superintendencia Financiera como fuente oficial— y es lo que la
// Bóveda usa para expresar en pesos la comisión que Stripe cobra en dólares.
// Escribir una segunda cadena acá daría dos fuentes que se separan en silencio.
import { trmForDate } from './trm.js';

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

// ═══════════════════════════════════════════════════════════════════
// LAS TASAS QUE DE VERDAD SE USAN (v4.871)
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ LA AUTOMÁTICA MANDA SOBRE LA ESCRITA A MANO, y es lo contrario de la regla
// habitual del sitio —«la preferencia explícita del usuario manda»—. Acá no
// aplica: una tasa de cambio no es una preferencia, es un HECHO que cambia
// todos los días. El fallo característico de la manual es quedarse vieja, que
// es exactamente lo que la automática resuelve. La escrita a mano queda como
// RESPALDO —cuando la fuente no contesta— y como única vía para un par que la
// TRM no cubre.
//
// NUNCA lanza y NUNCA inventa: si la TRM no se pudo consultar, se usa lo que
// haya escrito; si no hay nada, no se convierte y el método no se ofrece.
export const getEffectiveRates = async (when = new Date()) => {
    const manual = await getFxRates();
    const auto = {};

    try {
        // La TRM es COP por USD y es diaria: la del día en que se cobra.
        const trm = await trmForDate(when);
        if (trm && Number(trm.rate) > 0) {
            auto[pairKey('COP', 'USD')] = {
                perUnit: Number(trm.rate),
                source: `${trm.source} · TRM del ${trm.date}`,
                updatedAt: `${trm.date}T00:00:00.000Z`,
                automatic: true,
                official: !!trm.official,
            };
        }
    } catch (e) {
        // Sólo por si acaso: `trmForDate` ya se compromete a no lanzar.
        console.warn(`[FX] TRM no resuelta, se usan las tasas escritas: ${e?.message}`);
    }

    // El orden lo decide `mergeRates`, que vive en el criterio y está probado:
    // lo automático PISA lo manual.
    return mergeRates(manual, auto);
};

/** Sólo las automáticas, para que el panel las pueda mostrar como lo que son:
 *  un dato que nadie tiene que escribir. */
export const getAutoRates = async (when = new Date()) => {
    const todas = await getEffectiveRates(when);
    return Object.fromEntries(Object.entries(todas).filter(([, v]) => v.automatic));
};

export default { getFxRates, saveFxRates, invalidateFxRates, getEffectiveRates, getAutoRates };
