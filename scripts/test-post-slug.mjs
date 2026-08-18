#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA DIRECCIÓN DE UN ARTÍCULO.  npm run test:post-slug
// v4.873.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED.
//
// Lo que protege: que un artículo tenga una dirección legible en vez de su id
// —«/blog/1f6c8e2a-4b93-…», que es lo que se reportó—, que el choque de
// unicidad no salga como un error del driver, y que los dos espejos den lo
// MISMO: con dos slugify, la dirección depende de qué pantalla la generó.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    SLUG_MAX, SEO_LIMITS, SLUG_RESERVED, MOTIVOS_SLUG,
    slugify, normalizeSlug, checkSlug, freeSlug, articleUrl,
} from '../server/lib/postSlug.js';
import { LIMITS, slugify as slugifySeo } from '../server/lib/seoSpec.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

// El título REAL del reporte, no uno inventado para que la prueba pase.
const TITULO = 'El Distrito 4281 honra la memoria de Claudia Patricia Gutiérrez Barrero';

// ── 1. El caso reportado ─────────────────────────────────────────────
section('1. Un título se convierte en una dirección legible');

eq('el título del reporte', slugify(TITULO),
    'el-distrito-4281-honra-la-memoria-de-claudia-patricia-gutierrez-barrero');

// ⚠️ Se descompone el acento y se descarta la MARCA, no la letra: quitar la
// letra acentuada entera deja «gutirrez», que no se reconoce.
ok('los acentos conservan su letra', /gutierrez/.test(slugify(TITULO)));
eq('la eñe también', slugify('Niños del Ñandú'), 'ninos-del-nandu');
eq('los signos se descartan', slugify('¿Qué pasó? ¡Vamos!'), 'que-paso-vamos');

// Un título sin letras ni números no da dirección, y eso NO es «-».
eq('un título sin letras no da dirección', slugify('--- !!! ---'), '');
eq('ni una cadena vacía', slugify(''), '');
eq('ni null', slugify(null), '');

// ── 2. El largo ──────────────────────────────────────────────────────
section('2. Se corta por guion, nunca a mitad de palabra');

const largo = slugify('a'.repeat(20) + ' ' + 'b'.repeat(20) + ' ' + 'c'.repeat(60));
ok('no se pasa del máximo', largo.length <= SLUG_MAX, `${largo.length} > ${SLUG_MAX}`);
ok('y no termina en guion', !largo.endsWith('-'), largo);
eq('el máximo sale de seoSpec, no de un número suelto', SLUG_MAX, LIMITS.slug.max);

// ── 3. Lo que no sirve como dirección ────────────────────────────────
section('3. El motivo se DICE, no se contesta con un booleano');

eq('una palabra reservada', checkSlug('admin').reason, 'reservado');
eq('y con mayúsculas también', checkSlug('  Admin  ').reason, 'reservado');
eq('sólo números', checkSlug('2026').reason, 'solo_numeros');
eq('vacío', checkSlug('!!!').reason, 'vacio');
ok('los tres motivos están redactados',
    ['vacio', 'reservado', 'solo_numeros'].every(k => typeof MOTIVOS_SLUG[k] === 'string' && MOTIVOS_SLUG[k].length > 20));
ok('uno normal pasa', checkSlug('mi-articulo').ok === true);
ok('«blog» está reservado porque ya es la ruta', SLUG_RESERVED.has('blog'));

// ── 4. El choque de unicidad ─────────────────────────────────────────
section('4. Post.slug es único en TODA la plataforma');

// ⚠️ No es como el de CalendarEvent, que es único POR SITIO. Dos publicaciones
// no pueden compartirlo aunque se muestren en sitios distintos, y sin liberarlo
// el choque sale como un error del driver que no explica nada.
eq('sin choque se usa tal cual', freeSlug('hola', new Set()), 'hola');
eq('con choque, sufijo', freeSlug('hola', new Set(['hola'])), 'hola-2');
eq('y sigue subiendo', freeSlug('hola', new Set(['hola', 'hola-2', 'hola-3'])), 'hola-4');

// El sufijo es lo que lo hace único: se recorta la BASE, no el sufijo.
const alTope = 'a'.repeat(SLUG_MAX);
const conSufijo = freeSlug(alTope, new Set([alTope]));
ok('un slug al tope deja sitio para el sufijo', conSufijo.length <= SLUG_MAX, `${conSufijo.length}`);
ok('y el sufijo sobrevive entero', conSufijo.endsWith('-2'), conSufijo);

eq('sin base no hay dirección', freeSlug('!!!', new Set()), '');

// ── 5. La dirección por sitio ────────────────────────────────────────
section('5. El slug es del ARTÍCULO; el dominio lo pone cada sitio');

// La misma publicación se muestra en varios sitios: son la MISMA fila y el
// MISMO slug, con otro anfitrión delante.
eq('con dominio propio', articleUrl('rotary4281.org', 'mi-nota'), 'https://rotary4281.org/blog/mi-nota');
eq('el esquema y el www sobran', articleUrl('https://www.rotary4281.org/', 'mi-nota'), 'https://rotary4281.org/blog/mi-nota');
eq('una ruta pegada al dominio se descarta', articleUrl('rotary4281.org/algo', 'mi-nota'), 'https://rotary4281.org/blog/mi-nota');
eq('sin dominio queda relativa', articleUrl('', 'mi-nota'), '/blog/mi-nota');
eq('sin slug no hay dirección', articleUrl('rotary4281.org', '!!!'), null);
// El slug se normaliza también acá: una dirección con mayúsculas no es la misma.
eq('la dirección normaliza el slug', articleUrl('x.org', 'Mi Nota'), 'https://x.org/blog/mi-nota');

// ── 6. No hay un segundo slugify ─────────────────────────────────────
section('6. El criterio no se duplica');

// ⚠️ `seoSpec.js` ya sabía armar un slug y declarar los anchos. Un segundo
// catálogo se separa en silencio y el panel avisaría de un límite que la
// auditoría de SEO no aplica.
const spec = readFileSync(new URL('../server/lib/postSlug.js', import.meta.url), 'utf8');
ok('postSlug delega en seoSpec', /from '\.\/seoSpec\.js'/.test(spec));
ok('y no reescribe el normalize/replace del slug',
    !/normalize\('NFD'\)/.test(spec),
    'si vuelve a aparecer, hay dos slugify');
eq('los anchos de SEO salen de LIMITS', SEO_LIMITS, { title: LIMITS.title, description: LIMITS.description });

// Para todo lo que no se recorta, los dos dan lo mismo.
let iguales = true;
for (const t of [TITULO, 'Hola mundo', 'Ñandú & Cía', '  espacios  ', 'a-b-c']) {
    if (slugify(t) !== slugifySeo(t).replace(/^-+|-+$/g, '')) { iguales = false; console.log(`    ✗ difiere: ${t}`); }
}
ok('slugify es el de seoSpec, con la limpieza final', iguales);

// ── 7. Sobre los archivos ────────────────────────────────────────────
section('7. Lo que no se ve mirando una pantalla');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ctrl = read('server/controllers/contentController.js');
const panel = read('src/pages/admin/Publicaciones.tsx');
const seccion = read('src/sections/NewsSection.tsx');

// ⚠️ LOS CUATRO caminos que escriben `Post.slug`: la noticia por club
// (createPost/updatePost) y la publicación centralizada. `Post.slug` es único
// en TODA la plataforma, así que una noticia de club puede chocar con una
// publicación y el error saldría del driver.
ok('los cuatro caminos resuelven el slug',
    (ctrl.match(/await resolvePostSlug\(/g) || []).length === 4,
    `encontrados ${(ctrl.match(/await resolvePostSlug\(/g) || []).length}`);
ok('y ninguno confía en el slug del cliente',
    !/slug: slug \|\| undefined/.test(ctrl) && !/slug: slug \|\| existing\.slug/.test(ctrl),
    'escribir el slug tal como llega deja pasar reservados y choca con el índice único');

// ⚠️ Un slug que cambia en silencio manda a buscar el artículo donde no está.
ok('el cambio de dirección se DICE', /slugNotice/.test(ctrl) && /slugNotice/.test(panel));

// El panel usa el criterio compartido, no uno propio.
ok('el panel importa el criterio', /from '\.\.\/\.\.\/lib\/postSlug'/.test(panel));
ok('y ya no tiene su propio slugify',
    !/const slugify = \(s: string\)/.test(panel),
    'el que había no acotaba el largo y dejaba «-» para un título sin letras');

// Lo que se pidió: ver a dónde va a quedar en cada sitio.
ok('la pantalla enseña la dirección por sitio', /vistaPreviaUrls/.test(panel));
ok('y dice cuántos sitios no tienen dominio todavía', /sitiosSinDominio/.test(panel));

// ⚠️ LA VÍA POR LA QUE SE VEÍAN LOS «CARACTERES RAROS». La portada enlazaba
// sólo por id aunque el artículo tuviera slug.
ok('la portada enlaza por slug con respaldo al id',
    /\/blog\/\$\{\(article as any\)\.slug \|\| article\.id\}/.test(seccion));

// Y ninguna dirección pública se compone con «#»: la aplicación dejó
// BrowserRouter hace decenas de versiones.
ok('no queda ninguna vista previa con /#/blog',
    !/\/#\/blog/.test(read('src/pages/admin/News.tsx')));

// ── 8. Paridad de los dos espejos ────────────────────────────────────
section('8. El navegador y el servidor dan la MISMA dirección');

let paridad = false;
try {
    const { build } = await import('esbuild');
    const r = await build({
        entryPoints: ['src/lib/postSlug.ts'], bundle: true, write: false,
        format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'silent',
    });
    const esp = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
    paridad = true;

    // ⚠️ Con dos slugify, la dirección depende de qué pantalla la generó: el
    // panel enseñaría una y el servidor guardaría otra.
    let iguales = true;
    const titulos = [
        TITULO, 'Hola mundo', 'Ñandú & Cía', '  espacios  ', 'a-b-c', '--- !!! ---', '',
        'Reunión del 15 de agosto: ¡balance!', 'A'.repeat(120),
        'Día del Niño — Distrito 4281', '2026', 'ADMIN',
    ];
    for (const t of titulos) {
        if (slugify(t) !== esp.slugify(t)) {
            iguales = false;
            console.log(`    ✗ difiere «${t.slice(0, 40)}»: ${slugify(t)} vs ${esp.slugify(t)}`);
        }
    }
    ok('los dos espejos arman el mismo slug', iguales);

    let mismosMotivos = true;
    for (const t of ['admin', '2026', '!!!', 'mi-nota']) {
        const a = checkSlug(t), b = esp.checkSlug(t);
        if (a.ok !== b.ok || a.reason !== b.reason) {
            mismosMotivos = false;
            console.log(`    ✗ difiere el veredicto de «${t}»: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
        }
    }
    ok('y el mismo veredicto', mismosMotivos);

    eq('y la misma dirección', esp.articleUrl('https://www.x.org/', 'Mi Nota'), articleUrl('https://www.x.org/', 'Mi Nota'));
    eq('el máximo es el mismo', esp.SLUG_MAX, SLUG_MAX);

    // Un sitio sin dominio propio se nombra por su subdominio; sin ninguno de
    // los dos NO se inventa un anfitrión.
    eq('con dominio propio manda el dominio', esp.siteHost({ domain: 'rotary4281.org', subdomain: 'd4281' }), 'rotary4281.org');
    eq('sin dominio, el subdominio', esp.siteHost({ subdomain: 'd4281' }), 'd4281.clubplatform.org');
    eq('sin ninguno, nada', esp.siteHost({}), null);
} catch (e) {
    if (!paridad) console.log(`  (paridad no comprobada: ${e?.message})`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (!paridad) console.log('  (el bloque de paridad no corrió: instalá esbuild con `npm i --no-save esbuild`)');
if (fail) process.exit(1);
console.log('Un artículo tiene dirección propia, y es la misma en todos sus sitios.');
