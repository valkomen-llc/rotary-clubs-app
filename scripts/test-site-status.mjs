// ════════════════════════════════════════════════════════════════════
// El estado «En construcción» de un sitio — v4.883
//
//   npm run test:site-status
//
// Qué se comprueba: el CRITERIO —quién ve el sitio y quién la pantalla de
// construcción—, que el espejo del servidor dé LO MISMO que el del navegador,
// y unas cuantas reglas que sólo se leen sobre los archivos: que la puerta
// esté en UN solo sitio, que el selector no vuelva a escribirse a mano en
// cada pantalla, y que un sitio en construcción no se indexe.
//
// No necesita base, credenciales ni red. El bloque del espejo pide `esbuild`
// y se salta solo si no está.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// El criterio del navegador es TypeScript: se compila al vuelo.
let S = null;
try {
    const { build } = await import('esbuild');
    const out = await build({
        entryPoints: ['src/lib/sitePublication.ts'], bundle: true, write: false,
        format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    S = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
} catch {
    console.log('⚠ Se omite todo: falta esbuild.  npm i --no-save esbuild');
    process.exit(0);
}

// ════════════════════════════════════════════════════════════════════
grupo('── Los tres estados ──────────────────────────────────────');

check('el catálogo tiene exactamente tres', S.SITE_STATUSES.length === 3);
check('están los tres que se pidieron',
    ['active', 'draft', 'inactive'].every(id => S.SITE_STATUS_IDS.includes(id)));
check('cada uno explica qué implica', S.SITE_STATUSES.every(s => s.help.length > 30));
check('cada uno trae su emoji', S.SITE_STATUSES.every(s => !!s.emoji));

// ⚠️ El valor guardado es `draft`, el que YA existía en la base y en
// `ClubContext` (`isDraft`). Inventar uno nuevo habría dejado dos verdades.
check('«En construcción» se guarda como `draft`',
    S.SITE_STATUSES.find(s => s.label === 'En construcción')?.id === 'draft');

// ⚠️ ANTE LA DUDA, ACTIVO. Lo contrario convierte un dato desconocido —o una
// columna vacía— en un sitio caído.
check('un valor desconocido cae en ACTIVO', S.normalizeSiteStatus('loquesea') === 'active');
check('vacío cae en ACTIVO', S.normalizeSiteStatus('') === 'active');
check('null cae en ACTIVO', S.normalizeSiteStatus(null) === 'active');
check('`published` sigue siendo activo (valor heredado)', S.normalizeSiteStatus('published') === 'active');
check('`suspended` es inactivo', S.normalizeSiteStatus('suspended') === 'inactive');
check('`under_construction` también es construcción', S.normalizeSiteStatus('under_construction') === 'draft');
check('no distingue mayúsculas', S.normalizeSiteStatus('  DRAFT ') === 'draft');

// ════════════════════════════════════════════════════════════════════
grupo('── Quién ve el sitio y quién la pantalla ─────────────────');

const ver = (status, path, hasSession = false) => S.publicAccessAllowed({ status, path, hasSession });

check('sitio ACTIVO: el visitante ve la portada', ver('active', '/').allowed);
check('sitio ACTIVO: y las páginas internas', ver('active', '/proyectos').allowed);
check('sitio INACTIVO: esta puerta no lo toca (reglas de siempre)', ver('inactive', '/').allowed);

check('EN CONSTRUCCIÓN: el visitante NO ve la portada', !ver('draft', '/').allowed);
// ⚠️ Es el defecto concreto que se corrigió: el corte vivía sólo en la
// portada, así que entrar directo a una página interna lo salteaba entero.
check('EN CONSTRUCCIÓN: tampoco una página interna por URL directa',
    !ver('draft', '/proyectos').allowed);
check('EN CONSTRUCCIÓN: ni una ficha profunda',
    !ver('draft', '/eventos/xii-feria-2027/registro').allowed);
check('el motivo se dice, no se decide en silencio',
    ver('draft', '/').reason === 'en-construccion');

// ⚠️ SIN ESTO, LA PUERTA SE CIERRA CON LA LLAVE ADENTRO.
check('EN CONSTRUCCIÓN: el inicio de sesión SIEMPRE pasa', ver('draft', '/login').allowed);
check('EN CONSTRUCCIÓN: el panel siempre pasa', ver('draft', '/admin/dashboard').allowed);
check('…y el motivo lo dice', ver('draft', '/login').reason === 'ruta-siempre-publica');

check('EN CONSTRUCCIÓN: con sesión se ve el sitio completo', ver('draft', '/', true).allowed);
check('…y el motivo lo dice', ver('draft', '/proyectos', true).reason === 'con-sesion');

// El prefijo se compara por SEGMENTO: `/login` no puede abrir `/loginfalso`.
check('`/loginfalso` NO es una ruta siempre pública', !ver('draft', '/loginfalso').allowed);
check('`/login/algo` sí lo es', ver('draft', '/login/recuperar').allowed);
check('la query no cambia la decisión', ver('draft', '/login?next=/x').allowed);
check('el ancla tampoco', ver('draft', '/login#x').allowed);

// ════════════════════════════════════════════════════════════════════
grupo('── El espejo del servidor da LO MISMO ────────────────────');

const V = await import('../server/lib/sitePublication.js');
const casos = ['active', 'draft', 'inactive', 'published', 'suspended', 'under_construction',
    'construction', 'disabled', 'production', '', null, undefined, '  DRAFT ', 'loquesea', 0, false];
const distintos = casos.filter(c => S.normalizeSiteStatus(c) !== V.normalizeSiteStatus(c));
check('`normalizeSiteStatus` coincide en los dos espejos', distintos.length === 0,
    `difieren: ${JSON.stringify(distintos)}`);
const distintos2 = casos.filter(c => S.isUnderConstruction(c) !== V.isUnderConstruction(c));
check('`isUnderConstruction` coincide en los dos espejos', distintos2.length === 0);

// ════════════════════════════════════════════════════════════════════
grupo('── Reglas que sólo se leen sobre los archivos ────────────');

const app = readFileSync('src/App.tsx', 'utf8');

// ⚠️ LA PUERTA VA EN UN SOLO SITIO. Con más de cien rutas, protegerlas de a
// una significa que la siguiente se olvida — y el fallo es mudo.
check('la puerta envuelve a <Routes>, no a cada ruta',
    /<ConstructionGate>/.test(app) && (app.match(/<ConstructionGate>/g) || []).length === 1);
check('el corte viejo por portada ya no existe',
    !/if \(isDraft\) return <ComingSoon/.test(app));
check('la pantalla de construcción se carga con `lazyWithRetry`',
    /lazyWithRetry\(\(\) => import\('\.\/pages\/SiteUnderConstruction'\)/.test(app));

// La decisión la toma el criterio compartido, no una condición escrita a mano
// dentro del componente.
check('la puerta usa `publicAccessAllowed`, no su propia condición',
    /publicAccessAllowed\(/.test(app));

const pantalla = readFileSync('src/pages/SiteUnderConstruction.tsx', 'utf8');
check('la pantalla ofrece iniciar sesión', /to="\/login"/.test(pantalla));
// ⚠️ Un botón que no lleva a ninguna parte es peor que ninguno (v4.650).
check('el contacto se ofrece SÓLO si el sitio tiene a dónde escribir',
    /hayContacto &&/.test(pantalla));
// ⚠️ El menú es un mapa de lo que hay dentro: no se le enseña a quien no entra.
check('no se monta la navegación del sitio',
    !/<Navbar/.test(pantalla) && !/from '\.\.\/sections\/Navbar'/.test(pantalla));
check('el nombre del sitio es un DATO, no lenguaje', /data-no-translate/.test(pantalla));

// El selector, en UN componente y no siete veces escrito a mano.
const PANTALLAS = ['Asociaciones', 'Clubs', 'Eventos', 'Ferias', 'Programas', 'Zonas'];
PANTALLAS.forEach(p => {
    const src = readFileSync(`src/pages/admin/${p}.tsx`, 'utf8');
    check(`${p} usa el selector compartido`, /<SiteStatusPicker/.test(src));
    check(`${p} ya no lo escribe a mano`, !/<option value="active">Activo<\/option>/.test(src));
});

// El SEO: un sitio que todavía no es público no se ofrece al buscador.
const seoCtrl = readFileSync('server/controllers/seoController.js', 'utf8');
const seoServe = readFileSync('server/lib/seoServe.js', 'utf8');
check('robots.txt bloquea el rastreo de un sitio en construcción',
    /isUnderConstruction\(club\?\.status\)/.test(seoCtrl) && /Disallow: \/'/.test(seoCtrl));
check('el sitemap no enumera sus páginas',
    /enConstruccion\s*\n?\s*\?\s*\{ pages: \[\]/.test(seoCtrl));
// robots.txt pide no rastrear; `noindex` es lo que impide indexar una
// dirección enlazada desde fuera. Hacen falta las dos.
check('el <head> sale con `noindex`',
    /isUnderConstruction\(club\?\.status\)\) overrides\.indexable = false/.test(seoServe));

// ⚠️ Ante un fallo, el robots PERMISIVO: un error transitorio no puede sacar
// un sitio entero de los buscadores.
check('un fallo de base NO produce `Disallow: /`',
    /Ante un fallo se sirve el archivo PERMISIVO/.test(seoCtrl));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallaron de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.`);
