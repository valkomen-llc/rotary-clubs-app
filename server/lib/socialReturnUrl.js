// ════════════════════════════════════════════════════════════════════════════
// A qué sitio vuelve el OAuth de Meta (v4.1043)
//
// ⚠️ EL CALLBACK VIVE EN EL HOST DE LA PLATAFORMA Y EL USUARIO NO. El
// `redirect_uri` que Meta exige está registrado en la Meta Developer App y es
// uno solo (`https://app.clubplatform.org/api/social/callback/meta`), así que
// el callback SIEMPRE se atiende ahí — pero quien pulsó «Conectar» estaba en
// `rotary4281.org`, y su sesión vive en ESE origen (el token está en el
// `localStorage` de su dominio).
//
// Redirigir con una ruta RELATIVA la resuelve el navegador contra el host del
// callback: la persona termina en el panel de la plataforma, sin sesión, con
// una pantalla en blanco y sin forma de saber si la conexión se guardó. Ése
// era el defecto reportado. La vuelta tiene que ser ABSOLUTA y hacia el
// origen que inició el flujo.
//
// ⚠️ Y EL ORIGEN NO SE ACEPTA A CIEGAS. Lo manda el navegador, así que sin
// comprobarlo esto sería un salto abierto: bastaría armar un enlace de
// conexión con `returnOrigin=https://sitio-ajeno` para que Meta terminara
// devolviendo a alguien —con su sesión recién usada— a un dominio que no es
// nuestro. Se admite sólo el host de la plataforma o el de un sitio REAL del
// ecosistema, comprobado contra la base.
// ════════════════════════════════════════════════════════════════════════════

import prisma from './prisma.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** El host de una dirección, sin `www.` y en minúsculas. `null` si no parsea
 *  o si el esquema no es http/https — un `javascript:` no es un origen. */
export const hostOf = (raw) => {
    const s = str(raw);
    if (!s) return null;
    try {
        const u = new URL(s.includes('://') ? s : `https://${s}`);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        return u.host.toLowerCase().replace(/^www\./, '');
    } catch {
        return null;
    }
};

/** El host de la plataforma, del que cuelga el propio callback. */
export const platformHost = (baseUrl) => hostOf(baseUrl);

/**
 * ¿Es este host un sitio real del ecosistema?
 *
 * Se comprueba contra las DOS filas que pueden llevar un dominio propio: la
 * del sitio (`Club.domain` / `Club.subdomain`) y la del distrito
 * (`District.domain` / `District.subdomain`) — el dominio propio de un
 * distrito NO vive en `Club.domain` (regla de v4.744), así que mirar sólo una
 * dejaría fuera justamente a `rotary4281.org`.
 */
export const isKnownSiteHost = async (host) => {
    const h = hostOf(host);
    if (!h) return false;
    const etiqueta = h.split('.')[0];
    try {
        const [club, distrito] = await Promise.all([
            prisma.club.findFirst({
                where: { OR: [{ domain: h }, { domain: `www.${h}` }, { subdomain: etiqueta }] },
                select: { id: true },
            }),
            prisma.district.findFirst({
                where: { OR: [{ domain: h }, { domain: `www.${h}` }, { subdomain: etiqueta }] },
                select: { id: true },
            }),
        ]);
        return !!(club || distrito);
    } catch (e) {
        console.warn('[social] isKnownSiteHost falló:', e.message);
        return false;
    }
};

/**
 * El origen al que se puede volver, ya comprobado.
 *
 * Devuelve `https://<host>` o `null`. El host de la plataforma se admite
 * siempre (es donde vive el panel del operador); cualquier otro tiene que
 * existir en la base.
 */
export const resolveReturnOrigin = async ({ candidate, baseUrl }) => {
    const h = hostOf(candidate);
    if (!h) return null;
    if (h === platformHost(baseUrl)) return `https://${h}`;
    return (await isKnownSiteHost(h)) ? `https://${h}` : null;
};

/**
 * La dirección final del callback, SIEMPRE absoluta.
 *
 * Sin origen comprobado se cae al host de la plataforma: mejor el panel del
 * operador que una ruta relativa que nadie puede predecir.
 */
export const buildReturnUrl = ({ origin, baseUrl, path = '/admin/content-studio', params = {} }) => {
    const raiz = str(origin) || str(baseUrl) || '';
    const url = new URL(path, raiz.endsWith('/') ? raiz : `${raiz}/`);
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
    }
    return url.toString();
};

export default { hostOf, platformHost, isKnownSiteHost, resolveReturnOrigin, buildReturnUrl };
