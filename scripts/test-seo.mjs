// ════════════════════════════════════════════════════════════════════════════
// Pruebas del módulo SEO Inteligente — v4.703
//
// No necesitan base de datos ni credenciales: cubren las piezas DETERMINISTAS,
// que son justamente las que sostienen el módulo. La capa de IA sólo redacta;
// si no responde, todo esto sigue siendo cierto.
//
//   npm run test:seo
//
// El grueso de las pruebas está sobre `renderHead` y sobre el sitemap, porque
// son los dos sitios donde vivían los defectos que se corrigen en esta versión y
// porque los dos son invisibles desde el navegador: una etiqueta duplicada o una
// dirección con `#` se ven bien en pantalla y sólo fallan para un rastreador que
// nadie mira.
// ════════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { renderHead, composeTitle, buildMetaSet, stripManagedTags } = await import(path.join(ROOT, 'server/lib/seoRender.js'));
const { buildJsonLd, expectedSchemaTypes } = await import(path.join(ROOT, 'server/lib/seoSchema.js'));
const spec = await import(path.join(ROOT, 'server/lib/seoSpec.js'));
const { analyzeBody, scoreByAxis } = await import(path.join(ROOT, 'server/lib/seoRules.js'));
const { validateMeta } = await import(path.join(ROOT, 'server/lib/seoAI.js'));

let passed = 0, failed = 0;
const fails = [];

function ok(name, cond, detail) {
    if (cond) { passed++; return; }
    failed++;
    fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(name, actual, expected) {
    ok(name, JSON.stringify(actual) === JSON.stringify(expected), `esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
}

// ── Datos de prueba ──────────────────────────────────────────────────────────
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const club = {
    id: 'c1', name: 'Club Rotario Valledupar',
    description: 'Servimos a la comunidad del Cesar con proyectos de agua, educación y salud.',
    logo: '/uploads/logo.png', city: 'Valledupar', country: 'Colombia', district: '4281',
    domain: 'ejemplo.org', updatedAt: new Date('2026-08-01'),
};
const origin = 'https://ejemplo.org';
const postPage = {
    path: '/blog/jornada', kind: 'post', url: `${origin}/blog/jornada`,
    found: true, indexable: true,
    title: 'Jornada de salud en el barrio La Nevada',
    description: 'Más de 300 personas atendidas en la jornada de tamizaje cardiovascular junto al hospital regional de la ciudad.',
    image: '/uploads/jornada.jpg',
    publishedAt: new Date('2026-07-20'), updatedAt: new Date('2026-07-22'),
    keywords: ['jornada de salud'], wordCount: 640,
    entity: { category: 'noticia', createdAt: new Date('2026-07-20') },
};

// ════════════════════════════════════════════════════════════════════════════
// 1. EL DEFECTO PRINCIPAL: etiquetas duplicadas
// ════════════════════════════════════════════════════════════════════════════
{
    const { html } = renderHead({ html: INDEX_HTML, page: postPage, club, origin });
    const count = (re) => (html.match(re) || []).length;

    // index.html trae og:title, og:description y og:url escritos a mano. Antes se
    // AÑADÍAN los del servidor y quedaban dos; las redes leen la PRIMERA, que era
    // la genérica de la plataforma. Es la causa exacta de que compartir cualquier
    // sitio mostrara la tarjeta de ClubPlatform.
    eq('og:title aparece una sola vez', count(/property="og:title"/g), 1);
    eq('og:description aparece una sola vez', count(/property="og:description"/g), 1);
    eq('og:url aparece una sola vez', count(/property="og:url"/g), 1);
    eq('description aparece una sola vez', count(/name="description"/g), 1);
    eq('canonical aparece una sola vez', count(/rel="canonical"/g), 1);
    eq('<title> aparece una sola vez', count(/<title>/g), 1);

    ok('el og:title es el de la página, no el de la plataforma',
        /og:title" content="Jornada de salud/.test(html),
        html.match(/<meta property="og:title"[^>]*>/)?.[0]);
    ok('la og:description NO es la genérica de la plataforma',
        !html.includes('Plataforma digital para clubes Rotarios'));

    // Ninguna dirección pública puede llevar `#`: el buscador descarta el
    // fragmento y todas las páginas colapsan en la portada.
    ok('la canonical no lleva fragmento', /rel="canonical" href="https:\/\/ejemplo\.org\/blog\/jornada"/.test(html),
        html.match(/<link rel="canonical"[^>]*>/)?.[0]);
    ok('og:url no lleva fragmento', !/og:url" content="[^"]*#/.test(html));

    ok('la imagen se sirve absoluta', /og:image" content="https:\/\/ejemplo\.org\/uploads\/jornada\.jpg"/.test(html));
    ok('se emite og:image:secure_url para WhatsApp', html.includes('og:image:secure_url'));
    ok('twitter:card va con name, no con property', /<meta name="twitter:card"/.test(html));
    ok('se emite JSON-LD', html.includes('application/ld+json'));
    ok('robots permite indexar una página pública', /name="robots" content="index, follow/.test(html));
}

// ── Escapado ─────────────────────────────────────────────────────────────────
{
    const nasty = {
        ...club,
        name: 'Club "Rotary" & Asociados',
        description: 'Comillas " y <etiquetas> que rompían el <head>',
    };
    const { html } = renderHead({
        html: INDEX_HTML,
        page: { ...postPage, title: 'Título con "comillas"', description: nasty.description },
        club: nasty, origin,
    });
    ok('las comillas del contenido no parten la etiqueta', !/content="[^"]*"[^">]*"/.test(html.match(/<meta property="og:title"[^>]*>/)[0]));
    ok('el HTML del contenido se escapa', !html.includes('<etiquetas>'));
    ok('el & se escapa', html.includes('&amp;'));
}

// ── Página no encontrada ─────────────────────────────────────────────────────
{
    const gone = { ...postPage, found: false, indexable: false, title: 'Publicación no encontrada' };
    const { html, meta } = renderHead({ html: INDEX_HTML, page: gone, club, origin });
    eq('una entidad borrada se declara noindex', meta.robots, 'noindex, follow');
    ok('una entidad borrada no publica datos estructurados', !html.includes('application/ld+json'));
}

// ── Título ───────────────────────────────────────────────────────────────────
{
    eq('el título compone con el nombre del sitio',
        composeTitle({ page: { title: 'Blog' }, siteName: 'Club X' }), 'Blog | Club X');
    eq('la portada no repite el nombre del sitio',
        composeTitle({ page: { title: 'Club X', titleTemplate: false }, siteName: 'Club X' }), 'Club X');
    eq('no se duplica el nombre si el título ya lo contiene',
        composeTitle({ page: { title: 'Historia del Club X' }, siteName: 'Club X' }), 'Historia del Club X');

    // El título de una persona NO se recorta: sólo se decide si el sufijo cabe.
    const largo = 'Jornada de salud cardiovascular en el barrio La Nevada de Valledupar';
    eq('un título largo se conserva entero y se omite el sufijo',
        composeTitle({ page: { title: largo }, siteName: 'Club Rotario Valledupar', limit: 70 }), largo);
    ok('el título nunca vuelve recortado con puntos suspensivos',
        !composeTitle({ page: { title: largo }, siteName: 'Club Rotario Valledupar', limit: 70 }).endsWith('…'));
}

// ── stripManagedTags no toca lo ajeno ────────────────────────────────────────
{
    const out = stripManagedTags(INDEX_HTML);
    ok('se conserva la precarga de tipografías', out.includes('fonts.googleapis.com'));
    ok('se conserva el viewport', out.includes('name="viewport"'));
    ok('se conserva el script de la aplicación', out.includes('/src/main.tsx'));
    ok('se retiró la description estática', !/name="description"/.test(out));
    ok('se retiró el og:title estático', !/property="og:title"/.test(out));
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Datos estructurados: no se declara lo que no se sabe
// ════════════════════════════════════════════════════════════════════════════
{
    const ld = buildJsonLd({ page: postPage, club, origin });
    const types = ld['@graph'].map(n => Array.isArray(n['@type']) ? n['@type'].join('/') : n['@type']);
    ok('el grafo incluye la organización', types.some(t => t.includes('Organization')));
    ok('el grafo incluye el sitio', types.includes('WebSite'));
    ok('una noticia declara NewsArticle', types.includes('NewsArticle'));
    ok('se emiten migas de pan', types.includes('BreadcrumbList'));

    const sinFecha = { ...postPage, kind: 'event', entity: { title: 'Asamblea' } };
    const ldEvent = buildJsonLd({ page: sinFecha, club, origin });
    ok('un evento SIN fecha no emite nodo Event',
        !ldEvent['@graph'].some(n => n['@type'] === 'Event'));

    const conFecha = { ...postPage, kind: 'event', entity: { title: 'Asamblea', startDate: new Date('2026-09-01'), location: 'Sede' } };
    const ldOk = buildJsonLd({ page: conFecha, club, origin });
    ok('un evento CON fecha sí emite nodo Event',
        ldOk['@graph'].some(n => n['@type'] === 'Event'));

    // Sin ciudad ni país no se declara dirección: una PostalAddress vacía es una
    // afirmación falsa, y Google penaliza el desajuste con la página.
    const sinLugar = buildJsonLd({ page: postPage, club: { ...club, city: null, country: null }, origin });
    const org = sinLugar['@graph'].find(n => String(n['@type']).includes('Organization'));
    ok('sin ciudad ni país no se declara dirección', !org.address);

    eq('el tipo esperado de un evento', expectedSchemaTypes('event'), ['Event']);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Utilidades del spec
// ════════════════════════════════════════════════════════════════════════════
{
    eq('normalizePath quita query y fragmento', spec.normalizePath('/blog/?a=1#x'), '/blog');
    eq('normalizePath conserva la raíz', spec.normalizePath('/'), '/');
    eq('kindOfPath reconoce una noticia', spec.kindOfPath('/blog/mi-noticia'), 'post');
    eq('kindOfPath reconoce un proyecto', spec.kindOfPath('/proyectos/agua'), 'project');
    eq('kindOfPath reconoce un producto', spec.kindOfPath('/shop/product/taza'), 'product');
    eq('el registro a un evento es privado', spec.kindOfPath('/eventos/xii/registro'), 'private');
    eq('el panel es privado', spec.kindOfPath('/admin/dashboard'), 'private');
    ok('el checkout es privado', spec.isPrivatePath('/checkout'));
    ok('/mi-proyecto es privado', spec.isPrivatePath('/mi-proyecto'));
    ok('el blog NO es privado', !spec.isPrivatePath('/blog'));

    eq('slugify quita tildes', spec.slugify('Acción Comunitaria en Valledupar'), 'accion-comunitaria-en-valledupar');
    ok('truncateAtWord no parte palabras',
        !spec.truncateAtWord('palabras que se cortan por la mitad sin cuidado', 20).replace('…', '').endsWith('mit'));
    eq('escapeAttr neutraliza comillas', spec.escapeAttr('a"b'), 'a&quot;b');
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Lectura del cuerpo
// ════════════════════════════════════════════════════════════════════════════
{
    const body = analyzeBody(`
        <h1>Título</h1><h2>Sub</h2><h4>Salto</h4>
        <p>Un texto cualquiera con varias palabras para poder medir algo.</p>
        <img src="/a.jpg" alt="Con descripción">
        <img src="/b.jpg">
        <img src="/sep.png" alt="">
        <a href="/blog">interno</a><a href="https://otro.org">externo</a>
    `);
    eq('cuenta un solo H1', body.h1Count, 1);
    eq('detecta tres encabezados', body.headings.length, 3);
    eq('cuenta tres imágenes', body.images.length, 3);
    eq('sólo una imagen carece del atributo alt', body.images.filter(i => !i.hasAttr).length, 1);
    eq('alt="" se reconoce como decorativa', body.images.filter(i => i.decorative).length, 1);
    eq('separa enlaces internos', body.links.internal.length, 1);
    eq('separa enlaces externos', body.links.external.length, 1);
    ok('cuenta palabras', body.wordCount > 5);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. La nota
// ════════════════════════════════════════════════════════════════════════════
{
    eq('sin hallazgos todos los ejes van a 100',
        scoreByAxis([], 10).metadata, 100);

    // Un crítico no puede diluirse por el tamaño del sitio: «crítico» significa
    // que algo no funciona.
    const conCritico = scoreByAxis(
        [{ axis: 'indexability', severity: 'critical' }], 500,
    );
    ok('un hallazgo crítico topa el eje en 50 aunque el sitio sea grande',
        conCritico.indexability <= 50, `obtenido ${conCritico.indexability}`);

    // El mismo número de hallazgos leves pesa más en un sitio pequeño.
    const chico = scoreByAxis(Array(5).fill({ axis: 'metadata', severity: 'medium' }), 5);
    const grande = scoreByAxis(Array(5).fill({ axis: 'metadata', severity: 'medium' }), 200);
    ok('el descuento es proporcional al tamaño del sitio',
        chico.metadata < grande.metadata, `chico=${chico.metadata} grande=${grande.metadata}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6. Validación de lo que escribe el modelo
// ════════════════════════════════════════════════════════════════════════════
{
    const bueno = {
        title: 'Jornada de salud cardiovascular en La Nevada',
        description: 'Atendimos a más de 300 vecinos en una jornada de tamizaje junto al hospital regional. Mirá cómo participar en la próxima.',
    };
    eq('un juego correcto no da errores', validateMeta(bueno, { siteName: 'Club X' }), []);

    ok('detecta un título corto', validateMeta({ ...bueno, title: 'Corto' }, {}).some(e => e.includes('al menos')));
    ok('detecta un título largo',
        validateMeta({ ...bueno, title: 'x'.repeat(80) }, {}).some(e => e.includes('máximo')));
    ok('rechaza el nombre del sitio dentro del título',
        validateMeta({ ...bueno, title: `${bueno.title} Club X` }, { siteName: 'Club X' }).some(e => e.includes('nombre de la organización')));
    ok('detecta una descripción faltante', validateMeta({ title: bueno.title }, {}).some(e => e.includes('description')));
}

// ════════════════════════════════════════════════════════════════════════════
// 7. El espejo del navegador no se separa del servidor
// ════════════════════════════════════════════════════════════════════════════
{
    const mirror = fs.readFileSync(path.join(ROOT, 'src/lib/seoSpec.ts'), 'utf8');
    for (const [key, range] of Object.entries(spec.LIMITS)) {
        if (!['title', 'description', 'ogTitle', 'ogDescription', 'altText'].includes(key)) continue;
        const re = new RegExp(`${key}:\\s*\\{[^}]*max:\\s*(\\d+)`);
        const found = mirror.match(re);
        ok(`el espejo declara el mismo máximo para ${key}`,
            found && Number(found[1]) === range.max,
            `servidor=${range.max} espejo=${found?.[1]}`);
    }
}

// ════════════════════════════════════════════════════════════════════════════
// 8. robots.txt — las reglas tienen que BLOQUEAR de verdad
// ════════════════════════════════════════════════════════════════════════════
{
    // En robots.txt la comparación es por PREFIJO. `Disallow: /login/` no cubre
    // `/login`, que es la dirección que existe. Es un error que deja la regla
    // puesta y el contenido abierto.
    for (const prefix of spec.PRIVATE_PREFIXES) {
        ok(`la ruta privada ${prefix} se declara sin barra final`, !prefix.endsWith('/'));
    }
    ok('/admin está en la lista de rutas privadas', spec.PRIVATE_PREFIXES.includes('/admin'));
    ok('/login está en la lista de rutas privadas', spec.PRIVATE_PREFIXES.includes('/login'));

    // Ninguna ruta pública puede quedar bloqueada por un prefijo privado: sería
    // sacar del buscador justo lo que se quiere posicionar.
    for (const r of spec.STATIC_ROUTES) {
        ok(`la ruta pública ${r.path} no queda bloqueada por robots`, !spec.isPrivatePath(r.path));
    }
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n  SEO Inteligente — ${passed} pruebas OK, ${failed} fallidas\n`);
if (fails.length) {
    for (const f of fails) console.error(`  ✗ ${f}`);
    console.error('');
    process.exit(1);
}
