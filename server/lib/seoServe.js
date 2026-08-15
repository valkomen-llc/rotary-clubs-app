// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — SERVIDO DEL DOCUMENTO PÚBLICO
//
// Es el único punto donde se decide qué <head> lleva una página. Lo llama el
// catch-all de `api/index.js`, que es por donde pasan TODAS las peticiones que
// no son de API (`vercel.json` reescribe `/((?!api/).*)` a la función).
//
// Que exista ese catch-all es lo que hace posible este módulo. La aplicación es
// una SPA: sin esta capa, el HTML que recibe un rastreador es el `index.html`
// crudo, con las etiquetas genéricas de la plataforma. Google ejecuta
// JavaScript y acabaría viendo el contenido, pero **los rastreadores de las
// redes sociales no lo ejecutan**: WhatsApp, Facebook, LinkedIn, Slack y
// Telegram leen el HTML tal cual llega. Por eso las etiquetas se resuelven acá
// y no en `useSEO`, que corre demasiado tarde para ellos.
//
// PRESUPUESTO: esto corre delante de cada visita. El coste está acotado a dos
// consultas cacheadas (sitio y configuración) más una por la entidad de la
// página. Nada de auditorías, nada de IA y nada de red: la generación de
// contenido vive en el barrido, no en el camino del visitante.
// ════════════════════════════════════════════════════════════════════════════

import { resolveClubByHost, siteOrigin, resolvePage } from './seoEntities.js';
import { readSiteConfig, readPageMeta } from './seoStore.js';
import { renderHead } from './seoRender.js';
import { normalizePath } from './seoSpec.js';

/**
 * Resuelve el documento de una dirección pública.
 *
 * Devuelve `{ html, status, meta }`. El `status` importa: una dirección que
 * encaja con un patrón dinámico pero cuya fila ya no existe —una noticia
 * borrada, un evento de otro sitio— tiene que responder **404**, no 200.
 *
 * Por qué: un 200 con el texto "no encontrado" es un *soft 404*. El buscador lo
 * indexa como página válida, la acumula, y acaba diluyendo el sitio con decenas
 * de direcciones vacías que además compiten con las buenas. Es uno de los
 * errores que la propia auditoría del módulo reporta, así que no puede
 * cometerlo el módulo.
 */
export async function renderPublicDocument({ html, host, path, protocol = 'https' }) {
    const pathname = normalizePath(path);

    const club = await resolveClubByHost(host);
    const origin = siteOrigin(club, host);

    const page = await resolvePage({ club, pathname, host });

    // La configuración y los ajustes por página sólo se consultan si hay sitio.
    // Sin club —un dominio que todavía no apunta a ninguna organización— se
    // sirve la ficha de la plataforma, que es lo correcto y no cuesta nada.
    let config = {};
    let override = null;
    if (club?.id) {
        [config, override] = await Promise.all([
            readSiteConfig(club.id).catch(() => ({})),
            readPageMeta(club.id, pathname).catch(() => null),
        ]);
    }

    // Lo guardado en `SeoPageMeta` MANDA sobre lo deducido de la entidad: es
    // donde vive tanto la edición manual del administrador como la propuesta
    // que la IA ya dejó aprobada.
    const overrides = override ? {
        title: override.title || undefined,
        description: override.description || undefined,
        image: override.image || undefined,
        canonical: override.canonical || undefined,
        keywords: override.keywords?.length ? override.keywords : undefined,
        indexable: override.indexable ?? undefined,
    } : {};

    // v4.807 — Campaña de Contribución activa: su tarjeta social manda sobre
    // la ficha genérica del sitio en /maneras-de-contribuir. Va en el
    // SERVIDOR porque los rastreadores de WhatsApp y las redes no ejecutan
    // JavaScript (regla v4.702): compuesta en el navegador no la ve nadie.
    // Lo escrito A MANO en SeoPageMeta sigue mandando sobre la campaña —
    // misma regla que `putAuto` con las traducciones corregidas.
    if (club?.id && pathname === '/maneras-de-contribuir') {
        try {
            const { campaignSeoFor } = await import('../controllers/contributionCampaignController.js');
            const campaignSeo = await campaignSeoFor(club.id);
            if (campaignSeo) {
                if (!overrides.title && campaignSeo.title) overrides.title = campaignSeo.title;
                if (!overrides.description && campaignSeo.description) overrides.description = campaignSeo.description;
                if (!overrides.image && campaignSeo.image) overrides.image = campaignSeo.image;
            }
        } catch {
            // Esto corre en el catch-all de toda página pública: degradar.
        }
    }

    const { html: out, meta, jsonLd } = renderHead({
        html, page, club, origin, config, overrides,
    });

    return {
        html: out,
        status: page.found === false ? 404 : 200,
        meta,
        jsonLd,
        club,
        page,
    };
}

export default { renderPublicDocument };
