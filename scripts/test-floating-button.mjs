// ════════════════════════════════════════════════════════════════════
// El botón flotante del sitio — v4.1021
//
//   npm run test:floating-button
//
// Tres cosas, y las tres hacen falta:
//
//   1. EL CRITERIO — qué se guarda, qué se pinta y qué enlace se admite. Es
//      puro y no necesita nada.
//   2. EL CABLEADO, leyendo los archivos. Es lo único que ve un ajuste que se
//      guarda y que el sitio público nunca recibe: `GET /clubs/by-domain`
//      REEMPLAZA `settings` por una lista de llaves escrita a mano, así que
//      una llave que falte ahí no da ningún error — el panel la carga vacía y
//      el siguiente guardado la borra. Es exactamente lo que le pasó a las
//      redirecciones de enlaces (v4.993), y una prueba de criterio lo habría
//      dado por bueno.
//   3. LA PANTALLA, en un navegador de verdad: que el botón esté a la
//      IZQUIERDA se pidió mirando la página, y una clase puede no llegar al
//      CSS (v4.719) o llegar y perder la cascada (v4.974). Se MIDE la caja.
//
// El bloque del criterio pide `esbuild`; el de navegador, además `playwright`.
// Cada uno se salta solo si le falta su herramienta.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** El archivo sin comentarios: una regla no puede fallar contra su propia
 *  explicación (la lección de v4.991 y de v4.1005). */
const codigo = (ruta) => readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const APP = 'src/App.tsx';
const COMPONENTE = 'src/components/FloatingSiteButton.tsx';
const PANEL = 'src/pages/admin/ClubSettings.tsx';
const RUTAS = 'server/routes/clubs.js';
const CONTROLLER = 'server/controllers/clubController.js';

// ════════════════════════════════════════════════════════════════════
let build, chromium;
try { ({ build } = await import('esbuild')); }
catch { console.log('⚠ Se omite el criterio: falta esbuild.  npm i --no-save esbuild'); }

let spec = null;
if (build) {
    const out = await build({
        entryPoints: ['src/lib/floatingButton.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    spec = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
}

const servidor = await import('../server/lib/floatingButton.js');

if (spec) {
    // ════════════════════════════════════════════════════════════════
    grupo('── Nace vacío: sin configuración no hay botón ────────────');

    // Se monta en TODAS las páginas públicas de TODOS los sitios: un valor por
    // omisión aparecería en cada club (v4.737).
    check('los valores por defecto no traen imagen ni enlace',
        eq(spec.FLOATING_BUTTON_DEFAULTS, { enabled: false, imageUrl: '', url: '', label: '' }));
    check('nace APAGADO', spec.FLOATING_BUTTON_DEFAULTS.enabled === false);
    for (const raw of [null, undefined, {}, [], 'basura', 0, false]) {
        check(`sin nada guardado no se pinta — ${JSON.stringify(raw)}`,
            spec.floatingButtonVisible(spec.normalizeFloatingButton(raw)) === false);
    }

    // ════════════════════════════════════════════════════════════════
    grupo('── El enlace termina en un `href` público ─────────────────');

    for (const bueno of [
        'https://wa.me/573001234567',
        'http://ejemplo.org',
        'HTTPS://MAYUSCULAS.ORG',
        '/proyectos',
        '/contacto?asunto=Hola',
        'mailto:hola@club.org',
        'tel:+573001234567',
    ]) check(`se admite — ${bueno}`, spec.isSafeFloatingUrl(bueno) === true);

    // ⚠️ El caso que de verdad prueba la guardia lleva HOST. `javascript:alert(1)`
    // lo rechazaría también un filtro que sólo mire el host —no tiene punto—, así
    // que la prueba pasaría sin la comprobación del esquema. Éste parsea, tiene
    // host con punto, y sólo lo detiene el esquema (la lección de v4.972).
    for (const malo of [
        'javascript:alert(1)',
        'javascript://evil.com/%0aalert(1)',
        'JavaScript:alert(1)',
        '  javascript:alert(1)  ',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        '//otrositio.com/phishing',
        '',
        '   ',
    ]) check(`se RECHAZA — ${JSON.stringify(malo)}`, spec.isSafeFloatingUrl(malo) === false);

    check('un enlace inseguro NO se guarda: se descarta al normalizar',
        spec.normalizeFloatingButton({ url: 'javascript:alert(1)' }).url === '');
    check('y la imagen se juzga con el mismo criterio',
        spec.normalizeFloatingButton({ imageUrl: 'javascript:alert(1)' }).imageUrl === '');
    check('un enlace bueno sobrevive intacto',
        spec.normalizeFloatingButton({ url: 'https://wa.me/57300' }).url === 'https://wa.me/57300');

    // `mailto:`/`tel:` abren una aplicación, no una página: con `target=_blank`
    // dejan una pestaña en blanco detrás.
    check('un mailto no va en pestaña nueva', spec.opensExternalApp('mailto:a@b.org') === true);
    check('un tel tampoco', spec.opensExternalApp('TEL:+57300') === true);
    check('un https sí', spec.opensExternalApp('https://x.org') === false);
    check('una ruta interna tampoco es aplicación externa', spec.opensExternalApp('/proyectos') === false);

    // ════════════════════════════════════════════════════════════════
    grupo('── Las tres condiciones para pintarse ────────────────────');

    const completo = { enabled: true, imageUrl: 'https://x/y.png', url: 'https://wa.me/1', label: 'Escríbenos' };
    check('con imagen, enlace y encendido, se pinta',
        spec.floatingButtonVisible(completo) === true);
    check('apagado NO se pinta, aunque esté todo lo demás',
        spec.floatingButtonVisible({ ...completo, enabled: false }) === false);
    check('sin imagen no se pinta: sería un círculo vacío',
        spec.floatingButtonVisible({ ...completo, imageUrl: '' }) === false);
    check('sin enlace no se pinta: un botón que no lleva a ninguna parte es peor que ninguno',
        spec.floatingButtonVisible({ ...completo, url: '' }) === false);

    // La cadena 'true' también enciende: el almacenamiento de ajustes ha
    // guardado booleanos como texto.
    check('la cadena "true" enciende', spec.normalizeFloatingButton({ enabled: 'true' }).enabled === true);
    check('la cadena "false" NO enciende', spec.normalizeFloatingButton({ enabled: 'false' }).enabled === false);
    for (const raw of [1, 'sí', 'on', {}, []]) {
        check(`ante la duda queda apagado — ${JSON.stringify(raw)}`,
            spec.normalizeFloatingButton({ enabled: raw }).enabled === false);
    }

    // ════════════════════════════════════════════════════════════════
    grupo('── Dónde NO se pinta, comparado por SEGMENTO ─────────────');

    for (const path of ['/admin', '/admin/', '/admin/noticias', '/admin/clubes/x', '/restablecer', '/restablecer/abc']) {
        check(`no se pinta en ${path}`, spec.floatingButtonVisible(completo, { path }) === false);
    }
    // Por prefijo de TEXTO, `/administracion` caería con `/admin` y esa página
    // se quedaría sin botón sin que nada avisara (la lección de robots.txt).
    for (const path of ['/', '/proyectos', '/administracion', '/admin-de-fincas', '/contacto', '/restablecerlo']) {
        check(`SÍ se pinta en ${path}`, spec.floatingButtonVisible(completo, { path }) === true);
    }
    check('pathIsUnder compara por segmento', spec.pathIsUnder('/admin/x', '/admin') === true);
    check('y no por texto', spec.pathIsUnder('/administracion', '/admin') === false);

    // ════════════════════════════════════════════════════════════════
    grupo('── Saneado de los textos ─────────────────────────────────');

    check('el rótulo se recorta y colapsa espacios',
        spec.normalizeFloatingButton({ label: '  Escríbenos   por  WhatsApp ' }).label === 'Escríbenos por WhatsApp');
    check('el rótulo se acota',
        spec.normalizeFloatingButton({ label: 'x'.repeat(500) }).label.length === spec.MAX_LABEL_CHARS);
    check('sin rótulo hay un nombre accesible de respaldo',
        spec.floatingButtonLabel(spec.normalizeFloatingButton({})) === spec.FLOATING_BUTTON_FALLBACK_LABEL);
    check('con rótulo se usa el suyo',
        spec.floatingButtonLabel(spec.normalizeFloatingButton({ label: 'Dona' })) === 'Dona');

    // ════════════════════════════════════════════════════════════════
    grupo('── El aviso del panel dice QUÉ falta ─────────────────────');

    const aviso = (cfg, escrito) => spec.floatingButtonNotice(spec.normalizeFloatingButton(cfg), escrito);
    check('un enlace rechazado se DICE, no se borra en silencio',
        /no se guard/i.test(aviso({ url: 'javascript:alert(1)' }, 'javascript:alert(1)') || ''));
    check('sin imagen ni enlace lo dice', /imagen/i.test(aviso({}) || ''));
    check('sin imagen lo dice', /imagen/i.test(aviso({ url: 'https://x' }) || ''));
    check('sin enlace lo dice', /enlace/i.test(aviso({ imageUrl: 'https://x' }) || ''));
    check('apagado con todo lo demás lo dice', /apagado/i.test(aviso({ imageUrl: 'https://x', url: 'https://y' }) || ''));
    check('con todo listo no hay aviso', aviso({ enabled: true, imageUrl: 'https://x', url: 'https://y' }) === null);

    // ════════════════════════════════════════════════════════════════
    grupo('── Los dos espejos, comparados por SALIDAS ───────────────');

    // Con dos saneados, el panel aceptaría un enlace que la página no dibuja —
    // o al revés—, y lo que se separaría es qué termina en un `href` público.
    const casos = [
        null, undefined, {}, 'basura', [],
        { enabled: true, url: 'https://wa.me/1', imageUrl: 'https://x/y.png', label: 'Hola' },
        { enabled: 'true', url: 'javascript:alert(1)', imageUrl: 'https://x/y.png' },
        { enabled: false, url: '//evil.com', imageUrl: 'data:text/html,x' },
        { enabled: 1, url: '  /proyectos  ', imageUrl: ' https://x/y.png ', label: '  a   b  ' },
        { url: 'mailto:a@b.org', imageUrl: 'https://x/y.png', enabled: true },
        { url: 'x'.repeat(5000), label: 'y'.repeat(500) },
    ];
    for (const c of casos) {
        check(`mismo resultado en los dos espejos — ${JSON.stringify(c)?.slice(0, 60)}`,
            eq(spec.normalizeFloatingButton(c), servidor.normalizeFloatingButton(c)));
    }
    check('el catálogo de esquemas es el MISMO en los dos',
        eq([...spec.SAFE_SCHEMES], [...servidor.SAFE_SCHEMES]));
    check('y los topes también',
        spec.MAX_LABEL_CHARS === servidor.MAX_LABEL_CHARS && spec.MAX_URL_CHARS === servidor.MAX_URL_CHARS);

    // El espejo del servidor es MÍNIMO: decide qué se GUARDA, no qué se pinta.
    check('el servidor NO trae el criterio de pintado',
        servidor.floatingButtonVisible === undefined && servidor.floatingButtonNotice === undefined);
}

// ════════════════════════════════════════════════════════════════════
grupo('── El cableado: lo que ninguna prueba de criterio ve ──────');

const rutas = codigo(RUTAS);
// ⚠️ Sin esta línea el ajuste se guarda y el sitio público NO LO VE NUNCA.
check('`by-domain` devuelve `floatingButton`',
    /floatingButton:\s*\(\(\)/.test(rutas) && rutas.includes("settings['floating_button']"));

const ctrl = codigo(CONTROLLER);
check('el guardado sanea con `normalizeFloatingButton`',
    /'floating_button':[\s\S]{0,200}normalizeFloatingButton\(floatingButton\)/.test(ctrl));
check('y el servidor lo importa de su propio módulo',
    /import\s*\{[^}]*normalizeFloatingButton[^}]*\}\s*from\s*'\.\.\/lib\/floatingButton\.js'/.test(ctrl));
// `undefined` es «no lo toques»: un guardado de otro campo no puede borrarlo.
check('sin el campo en el cuerpo, el ajuste NO se escribe',
    /floatingButton !== undefined/.test(ctrl));

const app = codigo(APP);
check('el botón se monta en App.tsx', app.includes('<FloatingSiteButton />'));
check('una sola vez', (app.match(/<FloatingSiteButton\s*\/>/g) || []).length === 1);
// Dentro del Router: lee la ruta para no pintarse sobre el panel.
// Dentro de ConstructionGate: un sitio que no se anuncia no anuncia su botón.
const dentroDeLaPuerta = app.slice(app.indexOf('<ConstructionGate>'), app.indexOf('</ConstructionGate>'));
check('va DENTRO de `ConstructionGate`', dentroDeLaPuerta.includes('<FloatingSiteButton />'));
const dentroDelRouter = app.slice(app.indexOf('<Router>'), app.indexOf('</Router>'));
check('y DENTRO del `Router`, o `useLocation` no funcionaría',
    dentroDelRouter.includes('<FloatingSiteButton />'));

const comp = codigo(COMPONENTE);
check('el componente NO trae imagen ni enlace escritos: nace vacío',
    !/https?:\/\/(?!localhost)/.test(comp));
check('el destino lo resuelve `ctaTarget`, no una comprobación propia',
    comp.includes('ctaTarget') && !/https?:\\\/\\\//.test(comp));
check('el nombre accesible sale del criterio',
    comp.includes('floatingButtonLabel') && comp.includes('aria-label'));
// La izquierda es suya y la derecha del chatbot: puestos del mismo lado se
// taparían justo en el móvil.
check('está fijo a la IZQUIERDA', /fixed[^'"`]*\bleft-/.test(comp) && !/\bright-\d/.test(comp));
const chat = codigo('src/components/ChatBot.tsx');
check('el chatbot sigue a la DERECHA', /fixed bottom-6 right-/.test(chat));

const panel = codigo(PANEL);
// La regla de v4.700: toda casilla de imagen ofrece las DOS vías.
check('el panel ofrece SUBIR la imagen',
    /handleFileUpload\(e, 'floating-button', 'floatingButton\.imageUrl'\)/.test(panel));
check('y ELEGIRLA de la Biblioteca',
    /setPickerField\('floatingButton\.imageUrl'\)/.test(panel));
// Sin la notación de punto, la imagen se sube y la casilla no cambia: mudo.
check('la Biblioteca sabe escribir en un campo anidado',
    /setImageField\(pickerField, chosen\.url\)/.test(panel));
check('y la subida también', /setImageField\(fieldName, data\.url\)/.test(panel));
check('el panel dice qué falta para que el botón se vea',
    panel.includes('floatingButtonNotice'));
check('el panel normaliza al LEER lo guardado',
    /floatingButton:\s*\(\(\)[\s\S]{0,400}normalizeFloatingButton\(saved\)/.test(panel));

// ════════════════════════════════════════════════════════════════════
if (!build || !existsSync('node_modules/playwright')) {
    console.log('\n⊘ Se omite la pantalla: falta playwright.  npm i --no-save playwright');
} else {
    ({ chromium } = await import('playwright'));
    grupo('── La pantalla, medida en un navegador ───────────────────');

    const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FloatingSiteButton from '../src/components/FloatingSiteButton';

window.pintar = (sitio, ruta) => {
    window.__sitio = sitio;
    createRoot(document.getElementById('root')).render(
        React.createElement(MemoryRouter, { initialEntries: [ruta || '/'] },
            React.createElement(FloatingSiteButton)));
};
`;
    // Se sustituye SÓLO el contexto del sitio: el componente es el de producción.
    const bundle = await build({
        stdin: { contents: ENTRY, resolveDir: 'scripts', loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        logLevel: 'silent',
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [{
            name: 'contexto-sustituido',
            setup(b) {
                const stub = resolve('scripts/fixtures/floating-button-context-stub.tsx');
                b.onResolve({ filter: /contexts\/ClubContext$/ }, () => ({ path: stub }));
            },
        }],
    });

    // ⚠️ SIN EL CSS COMPILADO, la página se monta con todo en `display:block` y
    // las medidas no son las de la maquetación real: la prueba pasaría por los
    // motivos equivocados (v4.851).
    const css = existsSync('dist/assets')
        ? (await import('node:fs')).readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f))
        : null;
    if (!css) {
        console.log('  ⊘ Se omite: falta `dist/` compilado (npm run build).');
    } else {
        const hoja = readFileSync(`dist/assets/${css}`, 'utf8');
        const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
            .find(p => existsSync(p));
        const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

        const pintar = async (sitio, ruta = '/') => {
            const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
            const fallos = [];
            page.on('pageerror', e => fallos.push(e.message));
            await page.route('http://localhost/', r => r.fulfill({
                contentType: 'text/html',
                body: `<!doctype html><html><head><style>${hoja}</style></head><body><div id="root"></div></body></html>`,
            }));
            // Las imágenes no existen: se responden en blanco para no ensuciar
            // la consola con fallos de red que no dicen nada del componente.
            await page.route('**/*.png', r => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
            await page.goto('http://localhost/');
            await page.addScriptTag({ content: bundle.outputFiles[0].text });
            await page.evaluate(([s, r]) => window.pintar(s, r), [sitio, ruta]);
            await page.waitForTimeout(150);
            return { page, fallos };
        };

        const CONFIGURADO = {
            id: 'c1',
            floatingButton: { enabled: true, imageUrl: 'https://cdn.test/logo.png', url: 'https://wa.me/573001234567', label: 'Escríbenos' },
        };

        { // Un sitio que no lo configuró no puede notar que existe.
            const { page, fallos } = await pintar({ id: 'c1' });
            check('sin configurar, no se dibuja NADA',
                (await page.locator('#root a').count()) === 0);
            check('ni siquiera un contenedor vacío',
                (await page.evaluate(() => document.getElementById('root').innerHTML.trim())) === '');
            check('sin errores', fallos.length === 0, fallos.join(' | '));
            await page.close();
        }

        { // El caso pedido: el botón, a la izquierda.
            const { page, fallos } = await pintar(CONFIGURADO);
            const a = page.locator('#root a');
            check('configurado, aparece el botón', (await a.count()) === 1);

            const caja = await a.boundingBox();
            const ancho = 1280;
            check('está en la mitad IZQUIERDA de la pantalla',
                caja && caja.x + caja.width / 2 < ancho / 2, JSON.stringify(caja));
            check('pegado al borde izquierdo, no en el centro',
                caja && caja.x < 60, `x=${caja?.x}`);
            check('abajo, a la altura del botón del chat',
                caja && caja.y + caja.height > 800 - 120, `y=${caja?.y}`);
            check('mide lo mismo que el botón del chat (70px)',
                caja && Math.round(caja.width) === 70 && Math.round(caja.height) === 70,
                `${caja?.width}×${caja?.height}`);
            check('es redondo',
                (await a.evaluate(el => getComputedStyle(el).borderRadius)).includes('9999px'));
            // El `fixed` vive en el CONTENEDOR, no en el enlace —que es
            // `relative` para su propio contenido—: se mira el que manda.
            check('está fijo, no se va con el desplazamiento',
                (await a.evaluate(el => getComputedStyle(el.parentElement).position)) === 'fixed');

            check('lleva la imagen configurada',
                (await page.locator('#root a img').getAttribute('src')) === 'https://cdn.test/logo.png');
            check('el enlace es el configurado',
                (await a.getAttribute('href')) === 'https://wa.me/573001234567');
            check('se abre en pestaña nueva, con rel seguro',
                (await a.getAttribute('target')) === '_blank' &&
                (await a.getAttribute('rel'))?.includes('noopener'));
            // Un botón que es sólo imagen sin nombre hace que el lector de
            // pantalla lea la dirección del enlace.
            check('tiene nombre accesible', (await a.getAttribute('aria-label')) === 'Escríbenos');
            check('la imagen no repite ese nombre',
                (await page.locator('#root a img').getAttribute('alt')) === '');
            check('sin errores', fallos.length === 0, fallos.join(' | '));
            await page.close();
        }

        { // No es una herramienta del panel: ahí choca con la barra lateral.
            const { page } = await pintar(CONFIGURADO, '/admin/noticias');
            check('no se dibuja dentro del panel', (await page.locator('#root a').count()) === 0);
            await page.close();
        }

        { // La guardia del esquema, ejercitada de punta a punta.
            const { page } = await pintar({
                id: 'c1',
                floatingButton: { enabled: true, imageUrl: 'https://cdn.test/logo.png', url: 'javascript:alert(1)' },
            });
            check('un `javascript:` guardado antes NO llega al href: no se pinta',
                (await page.locator('#root a').count()) === 0);
            await page.close();
        }

        { // Un enlace del propio sitio no recarga la página entera.
            const { page } = await pintar({
                id: 'c1',
                floatingButton: { enabled: true, imageUrl: 'https://cdn.test/logo.png', url: '/proyectos', label: 'Proyectos' },
            });
            const a = page.locator('#root a');
            check('un enlace interno queda en la misma pestaña',
                (await a.getAttribute('target')) === null);
            check('y apunta a la ruta interna', (await a.getAttribute('href')) === '/proyectos');
            await page.close();
        }

        { // Sin rótulo, el respaldo. No es contenido inventado: es un nombre
          // funcional, como «Abrir chat» en el botón del chatbot.
            const { page } = await pintar({
                id: 'c1',
                floatingButton: { enabled: true, imageUrl: 'https://cdn.test/logo.png', url: 'https://x.org' },
            });
            check('sin rótulo, el nombre accesible no queda vacío',
                ((await page.locator('#root a').getAttribute('aria-label')) || '').length > 0);
            await page.close();
        }

        await browser.close();
    }
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.\n`);
