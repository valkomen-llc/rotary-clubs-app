// ════════════════════════════════════════════════════════════════════
// Las redirecciones de un sitio: de dónde salen.
//
// La I/O vive acá y el CRITERIO en `linkRedirects.js`, que es puro y probado.
// Mismo reparto que `seoRules.js` frente a `seoAudit.js`.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { canonicalDomain, domainCandidates, subdomainLabel } from './domains.js';
import { DISTRICT_SITE_SQL, districtSiteParams, pickDistrictSite } from './districtSite.js';
import { sanitizeRules } from './linkRedirects.js';

export const SETTING_KEY = 'link_redirects';

// Esto se consulta en el catch-all, o sea en CADA página pública. Sin caché
// serían dos consultas por visita para una lista que casi siempre está vacía.
// El TTL es corto a propósito: quien acaba de guardar una redirección espera
// probarla en seguida, no dentro de diez minutos.
const CACHE_TTL_MS = 60_000;
const cache = new Map();

/**
 * El sitio al que pertenece un dominio.
 *
 * Repite el camino de `GET /clubs/by-domain` —club por dominio, y si no,
 * distrito y de ahí a su sitio— y NO el de `resolveClubByHost` del módulo de
 * SEO, que sólo mira `Club.domain`. La diferencia importa: el dominio propio de
 * un distrito vive en la fila de `District` (v4.744), así que con el atajo del
 * SEO `rotary4281.org` no encontraría sitio y sus redirecciones no existirían.
 */
async function resolveSiteId(host) {
    const clean = canonicalDomain(host);
    if (!clean) return null;

    const candidates = domainCandidates(clean);
    const label = subdomainLabel(clean);

    const club = await db.query(
        `SELECT id FROM "Club"
          WHERE lower(coalesce(domain, '')) = ANY($1::text[])
             OR ($2 <> '' AND lower(coalesce(subdomain, '')) = $2)
          LIMIT 1`,
        [candidates, label]
    );
    if (club.rows[0]) return club.rows[0].id;

    const district = await db.query(
        `SELECT id, number, subdomain FROM "District"
          WHERE lower(coalesce(domain, '')) = ANY($1::text[])
             OR ($2 <> '' AND lower(coalesce(subdomain, '')) = $2)
          LIMIT 1`,
        [candidates, label]
    );
    if (!district.rows[0]) return null;

    const row = district.rows[0];
    const { rows } = await db.query(DISTRICT_SITE_SQL, districtSiteParams(row));
    return pickDistrictSite(row, rows)?.id || null;
}

/**
 * Las redirecciones vigentes de un dominio. Devuelve `[]` ante cualquier
 * problema: una consulta que falla no puede tumbar la página pública, que es lo
 * que este módulo interrumpe.
 */
export async function readRedirectsForHost(host) {
    const key = canonicalDomain(host);
    if (!key) return [];

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rules;

    let rules = [];
    try {
        const siteId = await resolveSiteId(key);
        if (siteId) {
            const { rows } = await db.query(
                `SELECT value FROM "Setting" WHERE "clubId" = $1 AND key = $2 LIMIT 1`,
                [siteId, SETTING_KEY]
            );
            if (rows[0]?.value) {
                const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
                rules = sanitizeRules(parsed);
            }
        }
    } catch (e) {
        console.error('[redirects] no se pudieron leer:', e.message);
        return [];
    }

    cache.set(key, { rules, at: Date.now() });
    return rules;
}

/** Se llama al guardar desde el panel: probar la redirección no debe esperar al TTL. */
export function invalidateRedirectCache(host) {
    if (host) cache.delete(canonicalDomain(host));
    else cache.clear();
}

export default { SETTING_KEY, readRedirectsForHost, invalidateRedirectCache };
