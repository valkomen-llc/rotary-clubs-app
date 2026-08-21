// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — robots.txt y sitemap.xml
//
// Reescritos en v4.703. Los dos tenían el mismo defecto de fondo: **describían
// un sitio que ya no existe**.
//
// 1. Emitían direcciones con `/#/`. La aplicación migró de HashRouter a
//    BrowserRouter hace decenas de versiones, pero el sitemap siguió publicando
//    `https://sitio.org/#/blog/xxx`. Todo buscador descarta lo que va después
//    del `#`, así que las cien direcciones del sitemap se resolvían a la misma:
//    la portada. Un sitemap que declara cien veces la portada no es un sitemap
//    incompleto, es uno que no sirve para nada.
//
// 2. `Disallow: /#/admin/` no bloquea nada, por lo mismo: el navegador nunca
//    manda el fragmento al servidor y robots.txt no puede casar contra él. El
//    panel quedaba abierto al rastreo mientras el archivo aparentaba protegerlo,
//    que es peor que no tener la regla.
//
// 3. Se servían en `/api/public/seo/robots.txt` y `/api/public/seo/sitemap.xml`.
//    Ningún rastreador mira ahí: robots.txt se pide SIEMPRE en la raíz del
//    dominio. Las direcciones de la raíz caían en el catch-all de la SPA, así
//    que pedir `/robots.txt` devolvía HTML. Ahora se montan en la raíz y estas
//    rutas se conservan como alias.
// ════════════════════════════════════════════════════════════════════════════

import { resolveClubByHost, siteOrigin, listSitePages } from '../lib/seoEntities.js';
import { readSiteConfig, listPageMeta } from '../lib/seoStore.js';
import { PRIVATE_PREFIXES } from '../lib/seoSpec.js';
import { isUnderConstruction } from '../lib/sitePublication.js';

function originFrom(req, club) {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return { host, origin: siteOrigin(club, host) };
}

// ── robots.txt ───────────────────────────────────────────────────────────────
export const getRobotsTxt = async (req, res) => {
    let body;
    try {
        const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
        const club = await resolveClubByHost(hostHeader);
        const { origin } = originFrom(req, club);
        const config = club?.id ? await readSiteConfig(club.id).catch(() => ({})) : {};

        // Las reglas salen de la MISMA lista que usa el resto del módulo para
        // decidir qué no se indexa. Con dos listas, la del archivo y la del
        // código, se separan en silencio y el sitemap acaba publicando lo que
        // robots.txt bloquea.
        //
        // Van SIN barra final a propósito. En robots.txt la comparación es por
        // PREFIJO: `Disallow: /login` cubre `/login`, `/login/` y cualquier cosa
        // que empiece así, mientras que `Disallow: /login/` deja fuera
        // justamente `/login`, que es la dirección que existe. Es el error de
        // bulto que hace que una regla parezca puesta y no proteja nada.
        // ⚠️ UN SITIO EN CONSTRUCCIÓN NO SE INDEXA, Y ESTO NO ES UN EXTRA.
        // La puerta del navegador tapa lo que se PINTA; un rastreador no pide
        // páginas, pide direcciones, y sin esta regla Google indexaría el
        // sitio que todavía no se quiere anunciar. Cuando pase a «Activo», la
        // regla desaparece sola en la petición siguiente: `robots.txt` se
        // compone en cada visita, no se guarda.
        if (isUnderConstruction(club?.status)) {
            body = [
                `# ${club?.name || 'Club Platform'} — sitio en construcción`,
                '# Todavía no es público: no se ofrece nada al rastreo.',
                '',
                'User-agent: *',
                'Disallow: /',
                '',
            ].join('\n');
        } else {

        const disallow = ['/api/', ...PRIVATE_PREFIXES];

        const lines = [
            `# ${club?.name || 'Rotary ClubPlatform'} — directivas de rastreo`,
            `# Generado por SEO Inteligente. No editar a mano: se regenera en cada petición.`,
            '',
            'User-agent: *',
            'Allow: /',
            ...disallow.map(d => `Disallow: ${d}`),
            // Los parámetros de seguimiento crean direcciones distintas con el
            // mismo contenido. Bloquearlas evita que el buscador las trate como
            // páginas separadas.
            'Disallow: /*?utm_',
            'Disallow: /*?fbclid=',
            '',
            // Un rastreador de SEO comercial puede pedir cientos de páginas por
            // minuto a una función serverless que se cobra por invocación. No se
            // les prohíbe el paso —son útiles para auditar— pero se les pone
            // freno.
            'User-agent: AhrefsBot',
            'Crawl-delay: 10',
            '',
            'User-agent: SemrushBot',
            'Crawl-delay: 10',
            '',
            'User-agent: MJ12bot',
            'Crawl-delay: 10',
            '',
            `Sitemap: ${origin}/sitemap.xml`,
        ];

        if (config?.robotsExtra) {
            lines.push('', '# Reglas añadidas desde el panel', String(config.robotsExtra).trim());
        }
        body = lines.join('\n') + '\n';
        }
    } catch (e) {
        console.error('[seo] robots.txt:', e.message);
        // Ante un fallo se sirve el archivo PERMISIVO, nunca `Disallow: /`.
        // Un error transitorio de base no puede sacar un sitio entero de los
        // buscadores: el rastreador guarda robots.txt en caché durante horas.
        body = 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n';
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Vary', 'Host');
    res.status(200).send(body);
};

// ── sitemap.xml ──────────────────────────────────────────────────────────────
const xmlEscape = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Una dirección de sitemap tiene que ser absoluta y estar codificada. Un título
// con espacios o acentos en el slug rompe el archivo entero si no se escapa.
function locFor(origin, path) {
    const encoded = path.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
    return xmlEscape(origin + (encoded === '' ? '/' : encoded));
}

export const getSitemap = async (req, res) => {
    try {
        const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
        const club = await resolveClubByHost(hostHeader);
        const { origin } = originFrom(req, club);

        // ⚠️ UN SITIO EN CONSTRUCCIÓN PUBLICA UN SITEMAP VACÍO, no un 404.
        // El archivo tiene que existir —`robots.txt` lo referencia y un 404 en
        // esa referencia es un error de configuración a ojos del buscador—,
        // pero no puede enumerar las páginas que el sitio todavía no muestra:
        // sería darle a Google el índice completo de lo que la puerta tapa.
        const enConstruccion = isUnderConstruction(club?.status);

        const { pages, notes, truncated } = enConstruccion
            ? { pages: [], notes: ['El sitio está en construcción: todavía no se publica ninguna dirección.'], truncated: false }
            : await listSitePages(club);

        // Los ajustes por página pueden marcar una dirección como no indexable o
        // cambiarle la prioridad. El sitemap TIENE que respetarlo: publicar una
        // página que a la vez se declara `noindex` es mandarle señales opuestas
        // al buscador sobre el mismo contenido.
        const overrides = club?.id ? await listPageMeta(club.id).catch(() => []) : [];
        const byPath = new Map(overrides.map(o => [o.path, o]));

        const entries = [];
        for (const p of pages) {
            const o = byPath.get(p.path);
            if (o?.indexable === false) continue;
            entries.push({
                loc: locFor(origin, p.path),
                lastmod: p.lastmod ? new Date(p.lastmod).toISOString().split('T')[0] : null,
                changefreq: o?.changefreq || p.changefreq,
                priority: (o?.priority != null ? Number(o.priority) : p.priority).toFixed(1),
            });
        }

        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            ...(notes.length || truncated
                ? [`<!-- ${xmlEscape([...notes, truncated ? 'El sitio supera el límite de este sitemap.' : ''].filter(Boolean).join(' '))} -->`]
                : []),
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            ...entries.map(e => [
                '  <url>',
                `    <loc>${e.loc}</loc>`,
                e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
                e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
                `    <priority>${e.priority}</priority>`,
                '  </url>',
            ].filter(Boolean).join('\n')),
            '</urlset>',
        ].join('\n');

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=1800');
        res.setHeader('Vary', 'Host');
        res.status(200).send(xml);
    } catch (e) {
        console.error('[seo] sitemap:', e.message);
        // Un sitemap vacío es preferible a un 500: el rastreador reintenta y no
        // marca el archivo como roto en Search Console.
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
};

export default { getRobotsTxt, getSitemap };
