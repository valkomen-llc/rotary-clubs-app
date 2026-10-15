// ════════════════════════════════════════════════════════════════════
// LA CACHÉ DE `GET /clubs/by-domain`, compartida — v4.1204
//
// Vivía como una constante dentro de `routes/clubs.js` (v4.1180), así que
// nadie más podía vaciarla: guardar un sitio desde el panel dejaba la
// configuración vieja servida hasta que vencieran sus 20 s. Para un cambio de
// suscripción eso significa que un sitio recién renovado sigue pintando la
// barra de vencimiento en la visita siguiente.
//
// ⚠️ Es una caché EN MEMORIA, por instancia de la función. `invalidateSiteConfig`
// vacía la de la instancia que atendió el guardado; las demás la renuevan
// solas al vencer el TTL. Por eso el panel, además, vuelve a pedir con
// `fresh=1`, que se salta lo fresco en cualquier instancia.
// ════════════════════════════════════════════════════════════════════

import { createSwrCache } from './resilience.js';
import { SITE_CONFIG_BUDGET } from './documentBudget.js';

export const siteConfigCache = createSwrCache({
    ttlMs: SITE_CONFIG_BUDGET.cacheTtlMs,
    staleMs: SITE_CONFIG_BUDGET.cacheStaleMs,
    max: SITE_CONFIG_BUDGET.cacheMax,
});

/**
 * Vacía la configuración cacheada de los sitios. Nunca lanza: corre después
 * de un guardado que ya ocurrió, y un fallo acá no puede convertirlo en error.
 *
 * Se vacía ENTERA y no por clave: un sitio se sirve bajo varios dominios
 * (propio, subdominio, el del distrito) y reconstruir todas sus claves exigiría
 * repetir la resolución de `by-domain`. Vaciarla cuesta, como mucho, un
 * recálculo por dominio activo.
 */
export const invalidateSiteConfig = () => {
    try { siteConfigCache.clear(); } catch { /* sin efecto */ }
};
