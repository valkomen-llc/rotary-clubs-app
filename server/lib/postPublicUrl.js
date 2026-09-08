// ════════════════════════════════════════════════════════════════════════════
// La dirección pública de un artículo, resuelta por SITIO (v4.1013)
//
// ⚠️ NO SE ESCRIBE UN SEGUNDO RESOLUTOR. El host lo resuelve `publicHostFor`
// —el mismo del workflow de Solicitud → artículo, que ya sabe que el dominio
// propio de un DISTRITO vive en la fila de `District` y no en la de `Club`
// (v4.744)— y la forma de la dirección la pone `articleUrl` de `postSlug.js`,
// que es donde vive desde v4.873. Con dos criterios, el enlace del ojo del
// listado y el que se le manda a Facebook podrían apuntar a sitios distintos.
//
// ⚠️ UNA PUBLICACIÓN CENTRALIZADA NO TIENE UNA SOLA DIRECCIÓN. Es UNA fila que
// varios sitios resuelven al leer (v4.938), así que `rotary4281.org/blog/x` y
// `feria.org/blog/x` son el MISMO artículo. Cuál se devuelve lo decide desde
// QUÉ panel se está administrando — que es exactamente lo que pide el
// requisito: si estoy en el panel del Distrito 4281, el enlace es el del 4281.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { publicHostFor } from './submissionArticleEngine.js';
import { articleUrl } from './postSlug.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Los destinos declarados de una publicación centralizada. */
const targetsOf = (post) => Array.isArray(post?.targetClubIds) ? post.targetClubIds.filter(Boolean) : [];

/**
 * En qué sitio se publica ESTE artículo para quien lo está mirando.
 *
 * Devuelve `{ clubId, source }`; `source` dice de dónde salió, porque «¿por
 * qué el ojo lleva a este dominio?» tiene que poder contestarse.
 */
export const siteForPost = (post, sessionClubId = null) => {
    if (!post) return { clubId: null, source: 'sin_articulo' };
    // Propia del sitio: no hay nada que decidir.
    if (str(post.clubId)) return { clubId: str(post.clubId), source: 'propia' };

    const sesion = str(sessionClubId);
    const destinos = targetsOf(post);

    // Centralizada dirigida: el sitio de la sesión, SI está entre los destinos.
    // Si no lo está, esa publicación no se muestra en este sitio y su enlace
    // acá no llevaría a ninguna parte — se dice, en vez de componer una
    // dirección que devuelve 404.
    if (destinos.length) {
        if (sesion && destinos.includes(sesion)) return { clubId: sesion, source: 'replica' };
        if (!sesion && destinos.length === 1) return { clubId: destinos[0], source: 'destino_unico' };
        return { clubId: null, source: sesion ? 'no_dirigida_a_este_sitio' : 'varios_destinos' };
    }

    // Global heredada (sin club y sin destinos): la ve todo el ecosistema, así
    // que su dirección es la del sitio desde el que se pregunta.
    if (sesion) return { clubId: sesion, source: 'global' };
    return { clubId: null, source: 'global_sin_sesion' };
};

/** La fila del sitio, con lo que `publicHostFor` necesita. */
export const loadSite = async (clubId) => {
    if (!str(clubId)) return null;
    const { rows } = await db.query(
        `SELECT id, name, domain, subdomain, type, "districtId", district FROM "Club" WHERE id = $1`,
        [clubId]
    );
    return rows[0] || null;
};

/**
 * La dirección pública, o el motivo por el que no hay.
 *
 * ⚠️ UN BORRADOR NO TIENE DIRECCIÓN PÚBLICA, y no se compone una que devuelva
 * 404: `published` decide. La vista previa es OTRA cosa y va por su propia
 * ruta autenticada — prometer una URL pública inexistente es peor que decir
 * que todavía no la hay.
 */
export const publicUrlForPost = async (post, sessionClubId = null) => {
    const { clubId, source } = siteForPost(post, sessionClubId);
    if (!clubId) {
        return {
            url: null, host: null, clubId: null, source,
            reason: source === 'no_dirigida_a_este_sitio'
                ? 'Esta publicación no está dirigida a este sitio, así que no tiene dirección pública acá.'
                : 'No se pudo determinar en qué sitio se publica este artículo.',
        };
    }
    const site = await loadSite(clubId);
    if (!site) return { url: null, host: null, clubId, source, reason: 'El sitio de esta publicación ya no existe.' };

    const host = await publicHostFor(site);
    if (!host) {
        return {
            url: null, host: null, clubId, source, site,
            reason: `«${site.name || 'El sitio'}» no tiene dominio ni subdominio configurado, así que sus artículos no tienen dirección pública.`,
        };
    }
    // `articleUrl` devuelve null sin slug; se cae al id, que es la dirección
    // que el endpoint público acepta desde v4.420 (`id OR slug`).
    const url = articleUrl(host, post.slug || '') || (post.id ? `https://${host}/blog/${post.id}` : null);
    return { url, host, clubId, source, site, reason: url ? null : 'El artículo no tiene slug ni id.' };
};

/**
 * Las direcciones públicas de TODO un listado, en un número FIJO de consultas.
 *
 * ⚠️ NO UNA CONSULTA POR FILA. Los sitios distintos de un listado son unos
 * pocos aunque las publicaciones sean cientos: se agrupa por sitio, se cargan
 * todos de una vez y el host de cada uno se resuelve una sola vez. Con una
 * consulta por publicación, el listado sería inusable con el segundo cliente
 * grande — es el punto de escalabilidad de `getCentralOverview` (v4.853).
 *
 * DEGRADA: esto ADORNA un listado que ya funciona. Un fallo acá devuelve un
 * mapa vacío —el ojo se apaga y dice por qué— y nunca deja sin Noticias a
 * quien entró a trabajar.
 */
export const publicUrlsForPosts = async (posts = [], sessionClubId = null) => {
    const salida = {};
    if (!Array.isArray(posts) || posts.length === 0) return salida;
    try {
        const porSitio = new Map();
        for (const p of posts) {
            const { clubId } = siteForPost(p, sessionClubId);
            if (!clubId) continue;
            if (!porSitio.has(clubId)) porSitio.set(clubId, []);
            porSitio.get(clubId).push(p);
        }
        if (porSitio.size === 0) return salida;

        const { rows: sitios } = await db.query(
            `SELECT id, name, domain, subdomain, type, "districtId", district
               FROM "Club" WHERE id = ANY($1::text[])`,
            [[...porSitio.keys()]]
        );
        const byId = new Map(sitios.map(s => [s.id, s]));

        for (const [clubId, delSitio] of porSitio) {
            const site = byId.get(clubId);
            if (!site) continue;
            const host = await publicHostFor(site);   // una vez por SITIO
            if (!host) continue;
            for (const p of delSitio) {
                const url = articleUrl(host, p.slug || '') || (p.id ? `https://${host}/blog/${p.id}` : null);
                if (url) salida[p.id] = url;
            }
        }
    } catch (e) {
        console.warn('[posts] direcciones públicas del listado:', e.message);
    }
    return salida;
};

export default { siteForPost, loadSite, publicUrlForPost, publicUrlsForPosts };
