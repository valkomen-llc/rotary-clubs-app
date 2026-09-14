// ════════════════════════════════════════════════════════════════════
// La entrada ACTIVA de la barra lateral — v4.1054
//
//   npm run test:admin:menu
//
// Dos capas:
//
//   1. EL CRITERIO (`src/lib/adminMenu.ts`) — qué entrada describe la
//      dirección que se está mirando, y cuál gana cuando dos casan.
//   2. EL CABLEADO, leído de los archivos. Es lo único que ve un enlace que
//      compila y una pestaña que no carga (la lección de v4.1011): el
//      criterio puede quedar entero mientras la barra vuelve a comparar
//      `location.pathname === item.path` —y entonces la entrada con consulta
//      no se resalta NUNCA— o mientras Analytics vuelve a leer la vista una
//      sola vez al montar —y entonces pulsar la entrada del menú estando ya
//      en esa pantalla no hace nada—.
//
// El criterio pide `esbuild`; si falta, ese bloque se salta solo.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

/** El archivo SIN comentarios: se busca la LLAMADA, no la MENCIÓN (v4.840) —
 *  el comentario que explica por qué se retiró la comparación vieja tiene que
 *  poder nombrarla sin hacer fallar la comprobación que la prohíbe. */
const codigo = ruta => readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const LAYOUT = 'src/components/admin/AdminLayout.tsx';
const ANALYTICS = 'src/pages/admin/Analytics.tsx';
const CRITERIO = 'src/lib/adminMenu.ts';
const RUTA_SOCIAL = '/admin/analytics?vista=social';

let build;
try { ({ build } = await import('esbuild')); }
catch { console.log('⚠ Se omite el criterio: falta esbuild.  npm i --no-save esbuild'); }

let spec = null;
if (build) {
    const out = await build({
        entryPoints: [CRITERIO],
        bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    spec = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
}

if (spec) {
    const { splitMenuPath, menuItemMatches, activeMenuPath } = spec;

    grupo('1 · La entrada se parte en ruta y consulta');

    check('una ruta a secas no tiene consulta',
        splitMenuPath('/admin/analytics').pathname === '/admin/analytics'
        && splitMenuPath('/admin/analytics').query === '');
    check('una entrada con consulta la conserva',
        splitMenuPath(RUTA_SOCIAL).pathname === '/admin/analytics'
        && splitMenuPath(RUTA_SOCIAL).query === 'vista=social');
    check('el ancla se descarta: el navegador nunca la manda al servidor',
        splitMenuPath('/admin/analytics?vista=social#tope').query === 'vista=social');

    grupo('2 · ⚠️ UNA ENTRADA CON CONSULTA NO CASA CONTRA EL PATHNAME');

    check('la entrada de redes NO casa con la pantalla a secas',
        !menuItemMatches(RUTA_SOCIAL, '/admin/analytics', ''));
    check('…y sí casa cuando la vista está pedida',
        menuItemMatches(RUTA_SOCIAL, '/admin/analytics', '?vista=social'));
    check('la entrada sin consulta casa por ruta',
        menuItemMatches('/admin/analytics', '/admin/analytics', '?vista=social'));
    check('una ruta distinta no casa nunca',
        !menuItemMatches(RUTA_SOCIAL, '/admin/seo', '?vista=social'));
    check('un valor distinto del mismo parámetro no casa',
        !menuItemMatches(RUTA_SOCIAL, '/admin/analytics', '?vista=web'));
    // Un filtro o un `utm_` de más no pueden apagar el resaltado: la entrada
    // exige lo que DECLARA, no que la dirección sea exactamente ésa.
    check('lo que la entrada no declara no le importa',
        menuItemMatches(RUTA_SOCIAL, '/admin/analytics', '?vista=social&rango=90'));

    grupo('3 · ⚠️ GANA LA MÁS ESPECÍFICA, Y SÓLO UNA');

    const MENU = ['/admin/analytics', RUTA_SOCIAL, '/admin/seo',
        '/admin/configuracion', '/admin/configuracion?tab=avanzado'];

    check('sobre la pantalla a secas manda la entrada sin consulta',
        activeMenuPath(MENU, '/admin/analytics', '') === '/admin/analytics');
    check('⚠️ con la vista pedida manda la de redes, no las dos',
        activeMenuPath(MENU, '/admin/analytics', '?vista=social') === RUTA_SOCIAL);
    check('…y la otra deja de estar activa',
        !menuItemMatches(RUTA_SOCIAL, '/admin/analytics', '')
        && activeMenuPath(MENU, '/admin/analytics', '?vista=social') !== '/admin/analytics');
    // El mismo criterio arregla de paso las dos entradas que ya enlazaban una
    // vista y nunca se resaltaban.
    check('«Dominio y Publicación» se resalta con su pestaña',
        activeMenuPath(MENU, '/admin/configuracion', '?tab=avanzado') === '/admin/configuracion?tab=avanzado');
    check('…y la configuración a secas cuando no hay pestaña pedida',
        activeMenuPath(MENU, '/admin/configuracion', '') === '/admin/configuracion');
    check('una pantalla que no está en el menú no activa nada',
        activeMenuPath(MENU, '/admin/perfil', '') === null);
    // A igualdad manda la primera declarada: el resaltado no puede depender de
    // en qué orden se recorra la lista.
    check('a igualdad manda el orden del menú',
        activeMenuPath(['/admin/email', '/admin/email'], '/admin/email', '') === '/admin/email');
}

grupo('4 · La entrada existe, y va DEBAJO de Analytics');

const layout = codigo(LAYOUT);
check('la barra lateral declara la entrada de redes sociales',
    layout.includes(`path: '${RUTA_SOCIAL}'`));
check('con el rótulo que la distingue del Hub Social',
    /label: 'Analítica de Redes Sociales'/.test(layout));
check('⚠️ y se declara DESPUÉS de Analytics, que es donde se pidió',
    layout.indexOf(`path: '/admin/analytics'`) > -1
    && layout.indexOf(`path: '${RUTA_SOCIAL}'`) > layout.indexOf(`path: '/admin/analytics'`));
check('va en la misma categoría, o quedaría en otro bloque del menú',
    new RegExp(`path: '${RUTA_SOCIAL.replace('?', '\\?')}', category: 'General'`).test(layout));
// La entrada no se acota por rol: quien ve Analytics ve su pestaña de redes.
// Lo que cada cuenta alcanza lo sigue decidiendo el filtro de permisos, que
// resuelve `/admin/analytics?vista=social` al MISMO módulo (`test:institutional-menu`).
check('no se le cuelga una condición de rol propia',
    !/isSuperAdmin[\s\S]{0,120}vista=social/.test(layout));

grupo('5 · ⚠️ EL RESALTADO SALE DEL CRITERIO, NO DEL PATHNAME');

check('la barra importa `activeMenuPath`',
    /import \{ activeMenuPath \} from '\.\.\/\.\.\/lib\/adminMenu'/.test(layout));
check('⚠️ y ya nadie compara la entrada con `location.pathname`',
    !/location\.pathname === item\.path/.test(layout));
check('el resaltado de cada entrada sale de la ruta activa',
    /const isActive = item\.path === rutaActiva/.test(layout));
check('…y el título de la pantalla también, o serían dos verdades',
    /menuItems\.find\(item => item\.path === rutaActiva\)/.test(layout));
check('la ruta activa mira la consulta, no sólo la ruta',
    /activeMenuPath\(menuItems\.map\(item => item\.path\), location\.pathname, location\.search\)/.test(layout));

grupo('6 · ⚠️ LA PESTAÑA SE LEE DE LA DIRECCIÓN, EN VIVO');

const analytics = codigo(ANALYTICS);
check('Analytics deriva la vista de la dirección del router',
    /useLocation/.test(analytics)
    && /new URLSearchParams\(location\.search\)\.get\('vista'\)/.test(analytics));
check('⚠️ y NO la lee una sola vez de `window.location` al montar',
    !/window\.location\.search[\s\S]{0,80}vista/.test(analytics));
check('⚠️ no queda un estado propio que la barra no pueda ver',
    !/setVista/.test(analytics));
check('las pestañas ESCRIBEN la dirección',
    /navigate\(v === 'social' \? '\/admin\/analytics\?vista=social' : '\/admin\/analytics'/.test(analytics));
check('…sin llenar el historial con cada ida y vuelta',
    /\{ replace: true \}/.test(analytics));
// No hay una segunda pantalla: la entrada enlaza la pestaña de la que ya
// existe. Con dos, la de redes se quedaría atrás en cada mejora de la otra.
check('⚠️ la analítica de redes sigue siendo una pestaña, no una pantalla nueva',
    /<SocialAnalytics \/>/.test(analytics)
    && !/path="\/admin\/analytics\/redes/.test(codigo('src/App.tsx')));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.\n`);
