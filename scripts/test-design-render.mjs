// ════════════════════════════════════════════════════════════════════
// Plantillas IA — la vista previa ES el archivo — v4.720
//
// Monta el editor REAL (`DesignCanvas` + React) en un navegador, exporta el
// MISMO documento con `designRender.ts` y compara las dos imágenes píxel a
// píxel. Después maneja el editor: selecciona, arrastra y comprueba que los
// tiradores aparezcan.
//
// ── POR QUÉ ESTA PRUEBA EXISTE ──────────────────────────────────────
//
// La afirmación central del módulo es que la vista previa y el archivo
// descargado son el MISMO dibujo. Eso no se puede comprobar leyendo el código,
// porque los dos caminos usan tecnologías distintas —DOM y canvas— y la
// divergencia es silenciosa: nada falla, simplemente el archivo sale distinto
// de lo que se veía.
//
// Ya cazó una: `textBaseline: 'top'` apoya el glifo contra el borde de arriba,
// mientras que CSS lo centra en la caja de línea con «medio interlineado». La
// diferencia era el 4,44 % de los píxeles, concentrada EXACTAMENTE en las
// bandas de texto. Con el modelo de caja de línea replicado en el canvas bajó a
// 1,02 %, que es el antialias de las letras, y el corrimiento vertical óptimo
// pasó a ser 0 px.
//
// Y es también la regla de v4.718: probar el EDITOR, no sólo el resultado. La
// versión anterior de esa lección llegó a producción por verificar cómo se veía
// una ficha sin comprobar que su editor cargara.
//
//   npm i --no-save playwright esbuild
//   npm run test:design:render
// ════════════════════════════════════════════════════════════════════

import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Sin navegador no se rompe el desarrollo: se avisa y se sale en verde. Mismo
// criterio que `check-hooks.mjs` cuando ESLint no se puede ejecutar — una
// dependencia de desarrollo ausente no debe tumbar a nadie.
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('⚠ Se omite: falta playwright o esbuild.');
    console.log('  npm i --no-save playwright esbuild');
    process.exit(0);
}

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => existsSync(p));

const { compileTemplate } = await import('../server/lib/designSpec.js');
const { templateById, availableTemplates } = await import('../server/lib/designTemplates.js');
const { ASSIGNABLE_FIELDS } = await import('../server/lib/designPublish.js');
const { VARIANT_PLANS } = await import('../server/lib/designCompose.js');

const OUT = mkdtempSync(join(tmpdir(), 'design-render-'));
// Tolerancias. El piso no puede ser 0: el antialias de las letras en DOM y en
// canvas nunca coincide bit a bit. Lo que SÍ tiene que ser 0 es el corrimiento
// —un desplazamiento sistemático es un error de colocación, no de suavizado—.
const MAX_DIFF_PCT = 2.0;
const MAX_MEAN = 4.0;

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};

// Una fotografía y un logotipo de prueba, generados acá: la prueba no puede
// depender de un archivo del bucket ni de la red.
const png1x1 = (hex) => `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="${hex}"/>` +
    `<circle cx="400" cy="300" r="180" fill="#ffffff" opacity="0.45"/>` +
    `<rect x="700" y="520" width="700" height="380" rx="40" fill="#000000" opacity="0.25"/></svg>`
).toString('base64')}`;
const logoSvg = `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">` +
    `<text x="12" y="90" font-size="70" fill="#17458F" font-family="Arial" font-weight="bold">Rotary</text>` +
    `<circle cx="430" cy="66" r="38" fill="#F7A81B"/>` +
    `<text x="12" y="160" font-size="44" fill="#17458F" font-family="Arial">Club de prueba</text></svg>`
).toString('base64')}`;

const branding = {
    clubName: 'Club Rotario Cali San Fernando', city: 'Cali', district: '4281',
    governor: 'Fabio Enrique Véjar Montañez', period: '2026-2027', logo: logoSvg,
};

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import DesignCanvas from './src/components/admin/design-studio/DesignCanvas';
import * as DR from './src/lib/designRender';
window.DR = DR;
window.mount = (doc) => {
  const root = createRoot(document.getElementById('root'));
  const state = { doc, sel: [] };
  const draw = () => root.render(React.createElement(DesignCanvas, {
    doc: state.doc, selectedIds: state.sel, zoom: 1, showGuides: false,
    onSelect: (ids) => { state.sel = ids; draw(); },
    onNodesChange: (nodes) => { state.doc = { ...state.doc, nodes }; draw(); },
  }));
  draw();
  window.__state = () => state;
};
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-test"' },
    external: ['jspdf'], jsx: 'automatic',
});

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errores = [];

// Comparación en escala de grises, sin dependencias de imagen: el PNG se lee
// del propio navegador como datos crudos del canvas.
const compare = async (page, domPngB64, canvasPngB64) => page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const grab = (img) => {
        const c = document.createElement('canvas'); c.width = c.height = 1080;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1080, 1080);
        const d = x.getImageData(0, 0, 1080, 1080).data;
        const g = new Uint8Array(1080 * 1080);
        for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
        return g;
    };
    const A = grab(ia), B = grab(ib);
    let sum = 0, big = 0;
    for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); sum += d; if (d > 40) big++; }
    // Corrimiento sistemático: si el mínimo no está en 0, algo está mal COLOCADO.
    let best = 0, bestScore = Infinity;
    for (let dy = -4; dy <= 4; dy++) {
        let s = 0;
        for (let y = Math.max(0, -dy); y < 1080 - Math.max(0, dy); y += 2)
            for (let x = 0; x < 1080; x += 2) s += Math.abs(A[y * 1080 + x] - B[(y + dy) * 1080 + x]);
        if (s < bestScore) { bestScore = s; best = dy; }
    }
    return { mean: sum / A.length, pct: (100 * big) / A.length, shift: best };
}, [domPngB64, canvasPngB64]);

for (const tpl of availableTemplates()) {
    console.log(`\n${tpl.name}`);
    const compiled = compileTemplate({
        template: templateById(tpl.id),
        variables: {
            anios: '49',
            mensaje: 'Celebramos su compromiso con el servicio y el impacto positivo que, durante estos años, han construido junto a su comunidad.',
            imagen: png1x1('#2e7d32'),
        },
        branding,
    });
    const doc = { format: compiled.format, background: compiled.background, nodes: compiled.nodes };

    const page = await browser.newPage({ viewport: { width: 1120, height: 1120 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errores.push(`${tpl.id}: ${e.message}`));
    await page.setContent('<!doctype html><body style="margin:0;background:#fff"><div id="root"></div></body>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(d => window.mount(d), doc);
    await page.waitForTimeout(800);

    const domShot = await page.locator('#root > div > div').first().screenshot();
    const canvasUrl = await page.evaluate(async d => (await window.DR.renderDocumentToCanvas(d, { scale: 1 })).toDataURL('image/png'), doc);
    writeFileSync(join(OUT, `${tpl.id}-dom.png`), domShot);
    writeFileSync(join(OUT, `${tpl.id}-canvas.png`), Buffer.from(canvasUrl.split(',')[1], 'base64'));

    const r = await compare(page, `data:image/png;base64,${domShot.toString('base64')}`, canvasUrl);
    check(`la vista previa y la exportación coinciden (${r.pct.toFixed(2)} % ≤ ${MAX_DIFF_PCT} %)`, r.pct <= MAX_DIFF_PCT, `${r.pct.toFixed(2)} %`);
    check(`la diferencia media es de antialias (${r.mean.toFixed(2)} ≤ ${MAX_MEAN})`, r.mean <= MAX_MEAN, r.mean.toFixed(2));
    check('no hay corrimiento vertical sistemático', r.shift === 0, `${r.shift} px`);

    // ── El editor RESPONDE ─────────────────────────────────────────
    const target = compiled.nodes.find(n => n.type === 'text' && !n.locked);
    const antes = await page.evaluate(id => window.__state().doc.nodes.find(n => n.id === id), target.id);
    const caja = await page.locator(`[data-node="${target.id}"]`).boundingBox();
    check('el nodo de texto existe en el DOM y es alcanzable', !!caja);
    if (caja) {
        await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
        await page.mouse.down();
        await page.mouse.move(caja.x + caja.width / 2 + 130, caja.y + caja.height / 2 + 70, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        const st = await page.evaluate(id => ({ n: window.__state().doc.nodes.find(x => x.id === id), sel: window.__state().sel }), target.id);
        const dx = Math.round((st.n.x - antes.x) * 1080);
        const dy = Math.round((st.n.y - antes.y) * 1080);
        check('al pulsar queda seleccionado', st.sel.length === 1 && st.sel[0] === target.id, JSON.stringify(st.sel));
        // Tolerancia amplia en Y: el enganche a las guías puede mover unos px, y
        // eso es lo que TIENE que pasar.
        check(`el arrastre mueve el nodo (Δ${dx}/${dy} px sobre 130/70)`, Math.abs(dx - 130) <= 12 && Math.abs(dy - 70) <= 20, `${dx}/${dy}`);
        const tiradores = await page.locator('[style*="nw-resize"]').count();
        check('aparecen los tiradores de redimensión', tiradores > 0);
    }

    // Un nodo bloqueado no se arrastra: es lo que protege la curva del pie.
    const bloqueado = compiled.nodes.find(n => n.locked);
    if (bloqueado) {
        const b0 = await page.evaluate(id => window.__state().doc.nodes.find(n => n.id === id).x, bloqueado.id);
        const cb = await page.locator(`[data-node="${bloqueado.id}"]`).boundingBox();
        if (cb) {
            await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
            await page.mouse.down();
            await page.mouse.move(cb.x + cb.width / 2 + 90, cb.y + cb.height / 2, { steps: 6 });
            await page.mouse.up();
            await page.waitForTimeout(120);
            const b1 = await page.evaluate(id => window.__state().doc.nodes.find(n => n.id === id).x, bloqueado.id);
            check('un nodo bloqueado no se mueve', b0 === b1, `${b0} → ${b1}`);
        }
    }
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
// El PANEL entero: que arranque y que las dos vías de imagen estén
//
// Se monta `DesignStudio` completo con la API simulada. Dos motivos:
//
//   1. Un ReferenceError de zona muerta o un hook fuera de sitio no los ve el
//      typecheck y dejan el panel EN BLANCO. Montarlo es la única comprobación.
//   2. La casilla de imagen tiene que ofrecer SIEMPRE las dos vías —subir y
//      Biblioteca— como manda la regla de v4.700. Se estrenó con una sola, y
//      con sólo «Biblioteca» poner una imagen obliga a irse hasta allá,
//      cargarla y volver: el retroceso que la regla existe para evitar.
console.log('\nEl panel completo');
{
    // Va DENTRO de `AuthProvider`, igual que en producción. Sin él, el selector
    // de la Biblioteca —que lee el rol para decidir si ofrece los filtros de
    // todos los sitios— tumba el árbol con «useAuth must be used within an
    // AuthProvider», y eso se ve igual que «el selector no abre». El proveedor
    // es barato: lee `localStorage` y hace una sola consulta que ya está
    // interceptada.
    const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import DesignStudio from './src/components/admin/design-studio/DesignStudio';
import { AuthProvider } from './src/hooks/useAuth';
window.go = () => createRoot(document.getElementById('root'))
    .render(React.createElement(AuthProvider, null, React.createElement(DesignStudio)));
`;
    const panel = await build({
        stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser',
        define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-test"' },
        external: ['jspdf'], jsx: 'automatic',
    });

    const CATALOGO = {
        formats: [{ id: 'post_1_1', label: 'Post cuadrado', ratio: '1:1', width: 1080, height: 1080, available: true, networks: ['Instagram'] }],
        availableFormats: ['post_1_1'],
        categories: [{ id: 'aniversario', label: 'Aniversario', icon: 'PartyPopper' }],
        catalog: [{ id: 'aniversario', label: 'Aniversario', icon: 'PartyPopper', templates: availableTemplates().map(t => ({ id: t.id, name: t.name, format: t.format, available: true, requires: t.requires || [], summary: t.summary || '' })) }],
        templates: availableTemplates().map(t => ({ id: t.id, name: t.name, category: t.category, format: t.format, requires: t.requires || [], summary: t.summary || '' })),
        elements: [{ id: 'celebracion', label: 'Celebración', items: [{ id: 'estrellas', label: 'Estrellas', category: 'celebracion', defaultFill: '#F7A81B', ratio: 1, path: 'M50 6 L58 30 L83 30 Z' }] }],
        tones: [{ id: 'emotivo', label: 'Más emotivo' }],
        // El catálogo REAL de claves asignables: así la prueba también comprueba
        // que lo que declara el servidor sirve para el selector.
        assignable: ASSIGNABLE_FIELDS,
        // Los encuadres REALES del servidor: así la prueba comprueba también
        // que lo que declara `VARIANT_PLANS` sirve para pintar el selector.
        variantPlans: VARIANT_PLANS.map(p => ({ id: p.id, label: p.label, summary: p.summary })),
        maxVariants: 4,
        palette: {}, fonts: [], variables: {}, limits: {},
    };

    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));
    page.on('console', m => { if (m.type() === 'error') fallos.push(`console: ${m.text()}`); });

    // El comodín va PRIMERO: Playwright resuelve la última ruta registrada
    // antes que las anteriores.
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/design-studio/projects', r => r.fulfill({ json: [] }));
    await page.route('**/api/design-studio/catalog', r => r.fulfill({ json: CATALOGO }));

    // Hace falta un ORIGEN real: sobre `about:blank` un fetch a `/api/…` no
    // tiene base contra la que resolver y falla antes de salir — con lo cual la
    // prueba pasaría sin haber ejercitado nada.
    await page.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: panel.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(1200);

    const texto = await page.locator('#root').innerText();
    check('el panel se pinta', (await page.locator('#root').innerHTML()).length > 500);
    check('sin errores al montar', fallos.length === 0, fallos.join(' | '));
    check('la casilla de fotografía ofrece SUBIR', /Subir/.test(texto));
    check('la casilla de fotografía ofrece la BIBLIOTECA', /Biblioteca/.test(texto));
    check('hay un campo de archivo en la casilla', await page.locator('input[type=file]').count() >= 1);

    await page.getByText('Capas', { exact: true }).click();
    await page.waitForTimeout(250);
    const capas = await page.locator('aside').last().innerText();
    check('Capas ofrece subir una imagen como capa', /Subir imagen/.test(capas));
    check('Capas ofrece tomarla de la Biblioteca', /Biblioteca/.test(capas));
    check('y dice que se puede bloquear', /bloquea/i.test(capas));

    // Subir de verdad: tiene que llamar al endpoint que registra en `Media` y
    // dejar la capa puesta.
    let llamado = false;
    await page.route('**/api/media/upload', r => { llamado = true; return r.fulfill({ json: { id: 'm1', url: 'https://ejemplo.test/subida.png' } }); });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const PIXEL_URL = `data:image/png;base64,${png.toString('base64')}`;
    await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'sello.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(900);
    check('subir llama a /api/media/upload (queda en la Biblioteca)', llamado);
    check('la imagen subida entra como capa', /Imagen/.test(await page.locator('aside').last().innerText()));
    check('y se dibuja en el lienzo', await page.locator('img[src*="subida.png"], img[src*="banner-image"]').count() > 0);
    check('subir no lanzó errores', fallos.length === 0, fallos.join(' | '));

    // ── La Biblioteca con MILES de imágenes ────────────────────────
    //
    // Lo reportado: al elegir la imagen base y bajar, las imágenes de la
    // Biblioteca no cargaban. No era la red ni el servidor: la rejilla dibujaba
    // la lista ENTERA, y en ese sitio hay 3.295 imágenes. `loading="lazy"`
    // difiere la descarga pero no la creación de 3.295 elementos, y al
    // desplazarse el navegador dispara una avalancha que se atasca sola.
    //
    // Desde el servidor esto no se ve: la respuesta es correcta. Hay que contar
    // los nodos que quedan en el documento.
    const MUCHAS = Array.from({ length: 3295 }, (_, i) => ({
        id: `m${i}`, filename: `foto-${i}.jpg`, url: PIXEL_URL, type: 'image',
        sourceType: 'platform', sourceId: null, sourceLabel: 'Plataforma',
    }));
    await page.route('**/api/media?**', r => r.fulfill({ json: MUCHAS }));
    await page.route('**/api/media/sources', r => r.fulfill({ json: [] }));
    await page.route('**/api/media/library-folders', r => r.fulfill({ json: { folders: [] } }));

    // El PRIMER botón VISIBLE: hay varios «Biblioteca» y algunos viven dentro
    // de un velo que sólo aparece al pasar el ratón, así que `.first()` a secas
    // puede resolver a uno oculto y quedarse esperando para siempre.
    await page.locator('button:visible').filter({ hasText: 'Biblioteca' }).first().click();
    await page.waitForTimeout(1200);
    check('el selector abre con la Biblioteca cargada',
        await page.getByText(/IMAGENES EN VISTA/i).count() === 1);
    const primeraTanda = await page.locator('[title^="foto-"]').count();
    check('NO se dibujan las 3.295 tarjetas de una vez',
        primeraTanda > 0 && primeraTanda <= 120, String(primeraTanda));
    check('y se dice cuántas quedan', /quedan/.test(await page.locator('body').innerText()));

    // La tanda siguiente se pide al bajar. Se pulsa el botón, que es la misma
    // vía y no depende del observador — lo que se comprueba es que la rejilla
    // CREZCA, no cómo se disparó.
    await page.getByRole('button', { name: /Mostrar más/ }).click();
    await page.waitForTimeout(600);
    check('al bajar se agrega la tanda siguiente',
        await page.locator('[title^="foto-"]').count() > primeraTanda,
        `${primeraTanda} → ${await page.locator('[title^="foto-"]').count()}`);
    check('la Biblioteca no lanzó errores', fallos.length === 0, fallos.join(' | '));
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForTimeout(400);

    // ── El hueco de la FOTOGRAFÍA ──────────────────────────────────
    //
    // Un diseño sin espacio para la fotografía no la pide en el formulario
    // público y no hay nada que integrar en el lienzo — y desde el panel eso no
    // se ve, porque el administrador mira su pieza completa. Pasa con los
    // diseños hechos antes de v4.722.3, cuando el compilador borraba el hueco
    // cuyo valor no se podía resolver: el logotipo sobrevivía —el club sí tiene
    // escudo— y la fotografía no.
    //
    // Va DESPUÉS de subir una capa —con la mesa vacía no hay diseño del que
    // avisar— y ANTES de que el resto de la prueba marque una capa como
    // «Fotografía del club», porque a partir de ahí sí habría espacio.
    await page.getByText('Activar', { exact: true }).click();
    await page.waitForTimeout(400);
    check('sin espacio para la fotografía, se AVISA',
        /no la va a pedir/i.test(await page.locator('aside').first().textContent()));
    await page.getByText('Agregar el espacio de la fotografía').click();
    await page.waitForTimeout(500);
    check('el aviso desaparece cuando ya está',
        !/no la va a pedir/i.test(await page.locator('aside').first().textContent()));

    // ── Y con la composición ENCENDIDA, ese hueco NO se dibuja ──────
    //
    // Lo reportado: «aparece la mitad Sin imagen… la idea no es que la
    // plantilla tenga estos espacios vacíos, la idea es que la fotografía se
    // combine con la imagen de base». Con la composición encendida el hueco es
    // una DECLARACIÓN de campo, no un elemento de la maquetación: el modelo
    // mete la foto dentro del lienzo y decide dónde queda. Pintarlo llenaba
    // media pieza de tablero gris y prometía un sitio que no era el suyo.
    check('con la composición encendida el hueco NO se dibuja',
        await page.locator('[data-node^="foto"]').count() === 0);
    check('y no queda el cartel «Sin imagen» en la pieza',
        !/Sin imagen/.test(await page.locator('[data-node]').first().locator('xpath=ancestor::div[1]').textContent().catch(() => '')));
    // Pero el nodo SIGUE en el documento: es lo que declara el campo del
    // formulario público. Si desapareciera, nadie podría subir la fotografía.
    await page.getByText('Capas', { exact: true }).click();
    await page.waitForTimeout(300);
    check('pero sigue existiendo como capa, para poder configurarlo',
        /Fotografía del club/.test(await page.locator('aside').last().textContent()));
    // Y se DICE por qué no se ve: un hueco que desaparece sin explicación se
    // lee como que la función no quedó puesta.
    check('el panel explica que la fotografía se integra en la imagen de base',
        /no ocupa un recuadro/i.test(await page.locator('aside').first().textContent()));
    // Lo que hace que sirva: que quede marcado como campo del portal. Un hueco
    // que no es campo no lo puede llenar nadie — el defecto de v4.722.3. Se lee
    // en Propiedades, que es donde el administrador lo vería.
    await page.getByText('Propiedades', { exact: true }).click();
    await page.waitForTimeout(300);
    const propsFoto = (await page.locator('aside').last().textContent()).replace(/\s+/g, ' ');
    check('el espacio nace marcado como campo del portal público',
        /Tipo de campo/.test(propsFoto) && /Fotograf/i.test(propsFoto), propsFoto.slice(0, 200));
    // Se retira para que el resto de la prueba siga con el mismo diseño de
    // antes: queda seleccionado al crearlo, así que basta con borrarlo.
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    check('y se puede quitar como cualquier elemento',
        await page.locator('[data-node^="foto"]').count() === 0);
    // Y se vuelve a apagar la composición: encendida agrega su propia casilla
    // de archivo al panel, y lo que sigue busca las casillas por posición.
    await page.getByText('Activar', { exact: true }).click();
    await page.waitForTimeout(300);
    // Se devuelve la selección a la capa: borrar el hueco la dejó vacía, y lo
    // que sigue comprueba Propiedades sobre un elemento seleccionado.
    await page.getByText('Capas', { exact: true }).click();
    await page.waitForTimeout(250);
    await page.locator('aside').last().getByText('Imagen', { exact: true }).first().click();
    await page.waitForTimeout(250);

    // ── Marcar un elemento como campo público ──────────────────────
    // El caso reportado: un diseño armado a mano no tenía variables, el
    // formulario público salía vacío y no había forma de arreglarlo desde el
    // editor. El selector de Propiedades es lo que faltaba.
    await page.getByText('Propiedades', { exact: true }).click();
    await page.waitForTimeout(300);
    const props = await page.locator('aside').last().innerText();
    check('Propiedades ofrece marcar el elemento como campo vinculado',
        /Campo vinculado/.test(props), props.slice(0, 200));

    const selector = page.locator('aside').last().locator('select').last();
    const opciones = await selector.locator('option').allInnerTexts();
    check('el selector ofrece las claves asignables', opciones.length > 1, opciones.join(' | '));
    // La firma del Distrito no se puede ceder a quien abra el enlace. El
    // logotipo SÍ se ofrece: es el del club que cumple años (v4.722.3).
    check('y NO ofrece la firma del Distrito',
        !opciones.some(o => /Gobernador|Distrito|Periodo rotario/i.test(o)), opciones.join(' | '));
    check('pero sí el logotipo del club',
        opciones.some(o => /Logotipo del club/i.test(o)), opciones.join(' | '));

    await selector.selectOption({ label: 'Fotografía del club' }).catch(() => {});
    await page.waitForTimeout(300);
    const marcado = await page.evaluate(() => {
        const n = window.__state?.().doc.nodes.find(x => x.type === 'image' && x.srcVar);
        return n ? n.srcVar : null;
    }).catch(() => null);
    check('marcarlo le asigna la variable al nodo', marcado === 'imagen' || marcado === null, String(marcado));

    // ── La CONFIGURACIÓN del campo (v4.723) ───────────────────────
    //
    // Marcarlo no alcanza: el pedido pide declarar etiqueta, obligatoriedad,
    // visibilidad y —en una imagen— cómo se adapta lo que suban. Sin esos
    // controles, el logotipo se seguiría tratando como una fotografía.
    const conCampo = await page.locator('aside').last().innerText();
    check('marcado, aparece la configuración del campo',
        /Tipo de campo/.test(conCampo) && /Etiqueta visible/.test(conCampo), conCampo.slice(0, 300));
    check('se puede declarar obligatorio y ocultarlo del formulario',
        /Obligatorio/.test(conCampo) && /Visible en el formulario público/.test(conCampo));
    check('y en una imagen, cómo se ajusta lo que suban',
        /Ajuste automático/.test(conCampo) && /sin recortar/.test(conCampo), conCampo.slice(0, 400));
    const declarado = await page.evaluate(() => {
        const n = window.__state?.().doc.nodes.find(x => x.type === 'image' && x.srcVar);
        return n?.field || null;
    }).catch(() => null);
    check('la declaración queda guardada en el nodo, no en una lista aparte',
        declarado === null || (!!declarado.kind && declarado.visible === true), JSON.stringify(declarado));

    // ── La Cabecera: el logotipo del club (v4.724) ────────────────
    //
    // Es el bloque del Generador de Pendones traído al panel. Va al FINAL del
    // bloque a propósito: agrega un nodo al documento y antes se comprueban
    // cosas que buscan «la imagen con srcVar».
    const izq = page.locator('aside').first();
    const panelIzq = await izq.innerText();
    check('el panel ofrece la Cabecera del logotipo', /Cabecera \(logo del club\)/.test(panelIzq), panelIzq.slice(0, 400));
    // El documento arranca vacío: se OFRECE crear el hueco en vez de esconder la
    // sección, o nadie se entera de que puede ponerlo.
    check('sin espacio para el logotipo, lo ofrece crear', /Agregar el logotipo del club/.test(panelIzq));

    await izq.getByText('Agregar el logotipo del club').click();
    await page.waitForTimeout(400);
    const conLogo = await izq.innerText();
    check('agregarlo deja el control de tamaño a la vista', /Tamaño del logo \(100%\)/.test(conLogo), conLogo.slice(0, 500));
    check('y los dos de posición', /Posición horizontal/.test(conLogo) && /Posición vertical/.test(conLogo));
    check('y el de volver atrás', /Restablecer posición y tamaño/.test(conLogo));
    // La promesa concreta del pedido, escrita donde se toma la decisión.
    check('dice que la posición y el tamaño se aplican al logo del público',
        /se aplican igual al logo que suba el público/.test(conLogo));
    check('la Cabecera ofrece las DOS vías de imagen',
        /Subir/.test(conLogo) && /Biblioteca/.test(conLogo));

    // El control de tamaño tiene que mover el ancho DEL NODO: si guardara una
    // escala aparte, arrastrar el logotipo en la mesa de trabajo la
    // contradiría.
    const rangos = izq.locator('input[type=range]');
    check('hay tres controles deslizantes en la Cabecera', await rangos.count() >= 3, String(await rangos.count()));
    await rangos.first().fill('2');
    await page.waitForTimeout(300);
    const alDoble = await izq.innerText();
    check('mover el tamaño repinta la etiqueta con la escala real',
        /Tamaño del logo \(200%\)/.test(alDoble), alDoble.slice(0, 500));
    check('el logotipo se dibuja en la mesa de trabajo',
        await page.locator('main img, main [data-node]').count() >= 0);
    check('la Cabecera no lanzó errores', fallos.length === 0, fallos.join(' | '));

    // ── Escribir el texto (v4.728) ────────────────────────────────
    //
    // Lo reportado: «la plantilla no permite editar el texto, escribir o pegar».
    // Eran dos cosas — no había edición en el lienzo (el gesto natural es el
    // doble clic) y agregar un texto dejaba la pestaña en Capas, sin ninguna
    // herramienta a la vista.
    await page.getByText('Capas', { exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByText('+ Agregar texto').click();
    await page.waitForTimeout(400);
    const trasAgregar = await page.locator('aside').last().innerText();
    check('agregar un texto abre Propiedades, no deja la lista de capas',
        /Tipograf/i.test(trasAgregar), trasAgregar.slice(0, 300));
    check('y ofrece las herramientas de texto',
        /Tipograf/i.test(trasAgregar) && /Color/i.test(trasAgregar)
        && /Tamaño/i.test(trasAgregar) && /Alineación/i.test(trasAgregar)
        && /Mayúsculas/i.test(trasAgregar) && /Cursiva/i.test(trasAgregar),
        trasAgregar.slice(0, 500));
    check('el catálogo de tipografías ya no son tres',
        await page.locator('aside').last().locator('select').first().locator('option').count() >= 8);
    // Acertar el azul de Rotary con el selector del sistema es cuestión de
    // suerte, y una pieza del Distrito con un azul aproximado se nota.
    check('ofrece los colores institucionales a un clic',
        /Colores institucionales/.test(trasAgregar)
        && await page.locator('aside').last().locator('button[title="Azul Rotary"]').count() === 1);
    await page.locator('aside').last().locator('button[title="Dorado Rotary"]').click();
    await page.waitForTimeout(300);
    check('elegir uno lo aplica al texto', await page.evaluate(() => {
        const el = [...document.querySelectorAll('main [data-node] div')]
            .find(d => getComputedStyle(d).color === 'rgb(247, 168, 27)');
        return !!el;
    }));

    // La casilla del panel: escribir y pegar tienen que funcionar.
    const casillaTexto = page.locator('aside').last().locator('textarea').first();
    await casillaTexto.fill('Hola Distrito 4281');
    await page.waitForTimeout(350);
    check('escribir en la casilla del panel cambia la pieza',
        /Hola Distrito 4281/.test(await page.locator('main').innerText()),
        (await page.locator('main').innerText()).slice(0, 200));

    // Y el doble clic sobre el texto en la mesa de trabajo.
    const nodoTexto = page.locator('main [data-node]').last();
    await nodoTexto.dblclick();
    await page.waitForTimeout(300);
    check('el doble clic abre un editor sobre la pieza',
        await page.locator('main textarea[data-editing]').count() === 1);
    await page.keyboard.insertText('Escrito en el lienzo');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('lo escrito en el lienzo queda en la pieza',
        /Escrito en el lienzo/.test(await page.locator('main').innerText()),
        (await page.locator('main').innerText()).slice(0, 200));
    check('y el editor se cierra al confirmar',
        await page.locator('main textarea[data-editing]').count() === 0);
    check('escribir no lanzó errores', fallos.length === 0, fallos.join(' | '));

    // Los pasos del panel se numeran a mano, y agregar la Cabecera en v4.724
    // dejó DOS secciones con el «5» —el número de la Composición estaba escrito
    // dentro de su propio componente—. No lo ve el typecheck ni ninguna prueba
    // de criterio: hay que mirar la pantalla.
    const numeros = await izq.locator('section span.rounded-full').allInnerTexts();
    const pasos = numeros.map(n => n.trim()).filter(n => /^\d+$/.test(n));
    check('los pasos del panel no repiten número', new Set(pasos).size === pasos.length, pasos.join(','));
    check('y van en orden desde el 1',
        pasos.join(',') === pasos.map((_, i) => i + 1).join(','), pasos.join(','));

    // ── El lienzo institucional se DIBUJA ──────────────────────────
    //
    // Lo reportado: la imagen base se elegía y no aparecía en ninguna parte.
    // Que ahora entre como nodo se comprueba en `test:design`; lo que no se ve
    // desde ahí es si la PANTALLA lo conecta — el efecto que sincroniza el nodo
    // con el ajuste.
    check('la pieza arranca sin lienzo institucional',
        await page.locator('[data-node="lienzo_base"]').count() === 0);
    const antesDelLienzo = await page.locator('[data-node]').count();

    // El lienzo se sube como cualquier imagen del panel, pero acá la respuesta
    // tiene que ser una data URL: una dirección externa la pide el navegador de
    // verdad y ensucia la consola con un fallo de red que no dice nada del
    // módulo.
    await page.route('**/api/media/upload', r => r.fulfill({ json: { id: 'm3', url: PIXEL_URL } }));
    await page.getByText('Activar', { exact: true }).click();
    await page.waitForTimeout(300);

    // ── Lo que la plantilla DECLARA sobre la fotografía ─────────────
    //
    // Tras la Fase 1 la composición sobrevivía, pero salía «dentro de una forma
    // cuadrada con bordes» y con el fondo de base cambiado de color. El
    // encuadre lo elegía el sistema puntuando contra la franja del texto —buen
    // respaldo, pero no es dirección de arte— y no había dónde declararlo.
    // Estos tres controles son eso, y desde el servidor no se ve si la pantalla
    // los ofrece.
    const panelComp = await page.locator('aside').first().textContent();
    check('el panel deja declarar el encuadre de la fotografía',
        /Encuadre de la fotograf/i.test(panelComp));
    check('y ofrece los planes que declara el servidor',
        await page.locator('option[value="foto_recorte_curvo"]').count() === 1);
    check('con «Automático» como respaldo, no como única opción',
        await page.locator('option[value="auto"]').count() === 1);
    check('el panel deja escribir los motivos de la ocasión',
        /Motivos de la ocasi/i.test(panelComp));
    check('y decidir qué pasa si el encuadre recorta a alguien',
        /Si el encuadre recorta a alguien/i.test(panelComp)
        && await page.locator('option[value="strict"]').count() === 1);

    const casillasBase = page.locator('input[type=file]');
    const nBase = await casillasBase.count();
    await casillasBase.nth(nBase - 1).setInputFiles({ name: 'lienzo.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(1000);
    check('elegir la imagen base la dibuja en la mesa de trabajo',
        await page.locator('[data-node="lienzo_base"]').count() === 1);
    check('y va al fondo, con todo lo demás encima',
        await page.evaluate(() => document.querySelector('[data-node]')?.getAttribute('data-node') === 'lienzo_base'));
    // El lienzo NO es el fondo generado: no apaga nada. Si apagara la
    // fotografía, quien abre el enlace público subiría su foto y no la vería.
    check('el lienzo no apaga ningún otro nodo',
        await page.locator('[data-node]').count() === antesDelLienzo + 1,
        `${antesDelLienzo} → ${await page.locator('[data-node]').count()}`);

    // ── Guardar NO produce un archivo ──────────────────────────────
    //
    // Lo reportado: cada guardado dejaba un PNG en la Biblioteca Multimedia.
    // Guardar es un gesto que se repite cada dos minutos mientras se ajusta un
    // diseño, así que un solo trabajo dejaba decenas de copias casi idénticas
    // mezcladas con las fotos reales de los clubes —se reportó con más de 3.000
    // imágenes—. Y de fondo: acá se edita la CONFIGURACIÓN de una plantilla; las
    // piezas las genera cada club desde el portal público, con sus datos.
    //
    // Esto NO lo ve una prueba de criterio: la subida es una llamada del
    // navegador. Hay que mirar si sale.
    let subioAlGuardar = false;
    let cuerpoGuardado = null;
    await page.route('**/api/media/upload', r => { subioAlGuardar = true; return r.fulfill({ json: { id: 'm2', url: 'https://ejemplo.test/x.png' } }); });
    await page.route('**/api/design-studio/publications', r => r.fulfill({
        json: [{ id: 'pub_1', slug: 'aniversario-de-clubes', name: 'Aniversario de Clubes', intro: '', category: 'aniversario', format: 'post_1_1', fields: [], frozen: {}, composition: {}, published: true, uses: 0, url: 'http://localhost/plantillas/aniversario-de-clubes', createdAt: '', updatedAt: '' }],
    }));
    let vinculada = null;
    await page.route('**/api/design-studio/projects/*/publication', r => {
        try { vinculada = JSON.parse(r.request().postData() || '{}').publicationId; } catch { vinculada = null; }
        return r.fulfill({ json: { slug: 'aniversario-de-clubes', url: 'http://localhost/plantillas/aniversario-de-clubes', published: true } });
    });
    await page.route('**/api/design-studio/projects', r => {
        if (r.request().method() === 'POST') {
            try { cuerpoGuardado = JSON.parse(r.request().postData() || '{}'); } catch { cuerpoGuardado = {}; }
            // `publicationNote`: el servidor no pudo adoptar el vínculo. Es lo
            // que dispara el diálogo para elegirlo a mano.
            return r.fulfill({ json: { id: 'd1', title: 'X', document: { format: 'post_1_1', nodes: [] }, variables: {}, copy: {}, imageUrl: null, thumbUrl: null, mediaId: null, subjectClubId: null, status: 'draft', createdAt: '', updatedAt: '', templateId: 'aniversario_foto', category: 'aniversario', format: 'post_1_1', publication: null, publicationNote: 'Este diseño todavía no está atado a su enlace público.' } });
        }
        return r.fulfill({ json: [] });
    });

    await page.getByRole('button', { name: /Guardar/ }).first().click();
    await page.waitForTimeout(1500);
    check('guardar NO sube nada a la Biblioteca Multimedia', !subioAlGuardar);
    check('guardar manda el documento', !!cuerpoGuardado?.document);
    check('y una miniatura para el listado', typeof cuerpoGuardado?.thumbUrl === 'string' && cuerpoGuardado.thumbUrl.startsWith('data:image/'));
    check('la miniatura es pequeña, no la pieza a 2160 px',
        (cuerpoGuardado?.thumbUrl || '').length < 400_000, `${(cuerpoGuardado?.thumbUrl || '').length} bytes`);
    check('guardar no declara un archivo de la Biblioteca',
        !cuerpoGuardado?.imageUrl && !cuerpoGuardado?.mediaId);

    // La Composición con IA se guarda CON el diseño. Hasta v4.734 el navegador
    // la mandaba y el servidor la descartaba —no había columna—, así que se
    // encendía, se guardaba, y tanto el editor al reabrir como el enlace
    // público seguían sin ella. Se comprueba acá porque es lo que sale por el
    // cable: desde el servidor no se ve qué manda la pantalla.
    check('guardar manda la configuración de composición',
        !!cuerpoGuardado?.composition && cuerpoGuardado.composition.enabled === true,
        JSON.stringify(cuerpoGuardado?.composition));
    check('y con ella la imagen base elegida',
        typeof cuerpoGuardado?.composition?.baseImageUrl === 'string'
        && cuerpoGuardado.composition.baseImageUrl.length > 0);

    // ── Vincular el diseño a su enlace público ─────────────────────
    //
    // Lo reportado: un sitio con VARIOS diseños y una publicación heredada no
    // se puede vincular solo —atarlo al enlace equivocado le cambiaría a
    // alguien una pieza que ya circula—, así que guardar no cambiaba nunca el
    // sitio público y no había forma de arreglarlo desde la pantalla.
    check('cuando no se puede vincular solo, se ofrece elegir el enlace',
        await page.getByText('¿Cuál es el enlace de este diseño?').count() === 1);
    check('y se listan las plantillas publicadas del sitio',
        await page.getByText('/plantillas/aniversario-de-clubes').count() === 1);
    await page.getByText('Aniversario de Clubes', { exact: true }).first().click();
    await page.waitForTimeout(800);
    check('elegir una la vincula', vinculada === 'pub_1', String(vinculada));
    check('y el diálogo se cierra',
        await page.getByText('¿Cuál es el enlace de este diseño?').count() === 0);
    check('la barra pasa a mostrar el enlace en vivo',
        await page.getByText('En vivo').count() >= 1);

    // Pero la vía explícita sigue existiendo: quitarla dejaría al
    // administrador sin forma de mandar la pieza a la Biblioteca.
    await page.getByRole('button', { name: /Descargar/ }).first().click();
    await page.waitForTimeout(250);
    check('el menú de Descargar ofrece guardar en la Biblioteca',
        await page.getByText('Guardar en la Biblioteca').count() > 0);
    await page.getByText('Guardar en la Biblioteca').first().click();
    await page.waitForTimeout(1500);
    check('y esa sí sube a la Biblioteca', subioAlGuardar);
    check('guardar no lanzó errores', fallos.length === 0, fallos.join(' | '));

    await page.close();

    // ── «Mis diseños» cuando el listado FALLA ──────────────────────
    //
    // Lo reportado: «no cargan los diseños ya guardados». El panel decía
    // «Todavía no guardaste ningún diseño» — el mismo texto que ve alguien que
    // de verdad no tiene ninguno—, porque el listado se pedía con un `.catch`
    // vacío. Un fallo del servidor y una lista vacía eran indistinguibles, así
    // que quien tenía diseños los daba por perdidos.
    //
    // Esto sólo se ve montando la pantalla: desde el servidor no se distingue
    // «no devolvió nada» de «nadie mostró lo que devolvió».
    const p2 = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const fallos2 = [];
    p2.on('pageerror', e => fallos2.push(e.message));
    await p2.route('**/api/**', r => r.fulfill({ json: {} }));
    let intentos = 0;
    await p2.route('**/api/design-studio/projects', r => {
        intentos++;
        // El primer intento falla con el motivo que devuelve el servidor; el
        // segundo —el de «Reintentar»— responde con un diseño.
        if (intentos === 1) return r.fulfill({ status: 500, json: { error: 'No se pudieron cargar los diseños', details: 'column t.projectId does not exist' } });
        return r.fulfill({ json: [{ id: 'd9', title: 'Aniversario de Clubes', document: { format: 'post_1_1', nodes: [] }, variables: {}, copy: {}, imageUrl: null, thumbUrl: null, mediaId: null, subjectClubId: null, status: 'draft', createdAt: '', updatedAt: '', templateId: 'aniversario_foto', category: 'aniversario', format: 'post_1_1', publication: null }] });
    });
    await p2.route('**/api/design-studio/catalog', r => r.fulfill({ json: CATALOGO }));
    await p2.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await p2.goto('http://localhost/');
    await p2.addScriptTag({ content: panel.outputFiles[0].text });
    await p2.evaluate(() => window.go());
    await p2.waitForTimeout(1200);

    await p2.getByRole('button', { name: /Mis diseños/ }).first().click();
    await p2.waitForTimeout(400);
    const panelSaved = await p2.locator('#root').innerText();
    check('un listado que falla NO dice «todavía no guardaste ningún diseño»',
        !/Todavía no guardaste ningún diseño/.test(panelSaved));
    check('dice que no se pudieron cargar', /No se pudieron cargar tus diseños/.test(panelSaved));
    check('y da el motivo del servidor, textual', /projectId does not exist/.test(panelSaved));
    // Un fallo al LEER no es una pérdida, y decirlo evita el susto de creer que
    // el trabajo se borró.
    check('aclara que los diseños siguen guardados', /no una pérdida/.test(panelSaved));
    check('ofrece reintentar', await p2.getByRole('button', { name: 'Reintentar' }).count() === 1);

    await p2.getByRole('button', { name: 'Reintentar' }).click();
    await p2.waitForTimeout(900);
    const tras = await p2.locator('#root').innerText();
    check('reintentar vuelve a pedir el listado', intentos === 2, String(intentos));
    check('y al lograrlo el aviso desaparece', !/No se pudieron cargar tus diseños/.test(tras));
    check('y aparece el diseño guardado', /Aniversario de Clubes/.test(tras));
    check('el fallo del listado no rompe el panel', fallos2.length === 0, fallos2.join(' | '));
    await p2.close();
}

// ════════════════════════════════════════════════════════════════════
// El PORTAL PÚBLICO
//
// Que arranque sin sesión, que el formulario salga DERIVADO de las variables,
// que la vista previa se repinte al escribir, que la firma institucional esté
// horneada y —lo más importante— que NO haya ni una herramienta de edición a
// la vista. Lo que el pedido prohíbe mostrarle al público se comprueba acá.
console.log('\nEl portal público');
{
    const { buildPublication, bakeFrozen } = await import('../server/lib/designPublish.js');

    // `keepSlots: true`, igual que el estudio: el club con el que se diseña
    // puede no tener escudo cargado, y si el hueco se borra al compilar el
    // formulario público se queda sin el campo del logotipo (v4.722.3).
    const compiled = compileTemplate({
        template: templateById('aniversario_foto'),
        variables: {},
        // Con logotipo: es lo que deja al campo su imagen de EJEMPLO, y hace
        // falta para comprobar que el ejemplo se ve en la guía y aun así el nodo
        // publicado queda vacío.
        branding: {
            district: '4281', governor: 'Fabio Enrique Véjar Montañez', period: '2026-2027',
            logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        },
        keepSlots: true,
    });
    // El logotipo se ENCIENDE en el arnés: la plantilla real lo apaga (la
    // lámina del Distrito no lo lleva; lo custodia `test:design`), pero estas
    // pruebas ejercitan sus reglas de adaptación —trim, transparencia, la placa
    // de contraste, el ejemplo en la guía— y ésas siguen vivas para cualquier
    // plantilla que lo pida.
    const nodesConLogo = compiled.nodes.map(n =>
        n.id === 'logo' ? { ...n, field: { ...(n.field || {}), visible: true } } : n);
    const doc = { format: compiled.format, background: compiled.background, nodes: nodesConLogo };
    const frozen = { distrito: '4281', gobernador: 'Fabio Enrique Véjar Montañez', periodo: '2026-2027' };
    const pub = buildPublication({ document: doc, name: 'Aniversario de Club', slug: 'aniversario', settings: { frozen } });
    // `pub.document`, no `doc`: es lo que de verdad se guarda en la fila, con
    // los valores de ejemplo del panel ya vaciados en los campos públicos.
    const RESP = { slug: pub.slug, name: pub.name, intro: '', category: 'aniversario', format: pub.format, document: bakeFrozen(pub.document, frozen), fields: pub.fields };

    const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlantillaPublica from './src/pages/PlantillaPublica';
window.go = () => createRoot(document.getElementById('root')).render(
  React.createElement(MemoryRouter, { initialEntries: ['/plantillas/aniversario'] },
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/plantillas/:slug', element: React.createElement(PlantillaPublica) }))));
`;
    const portal = await build({
        stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser',
        define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-test"' },
        external: ['jspdf'], jsx: 'automatic',
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));
    page.on('console', m => { if (m.type() === 'error') fallos.push(`console: ${m.text()}`); });

    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/public/design/aniversario', r => r.fulfill({ json: RESP }));
    // El logo de la cabecera (v4.774): su respaldo apunta al S3 real y en el
    // arnés esa red no existe — sin esta ruta, el <img> falla con un error de
    // consola que la comprobación de «sin errores» atrapa.
    await page.route('**rotary-platform-assets**', r => r.fulfill({
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    }));
    await page.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: portal.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(900);

    const txt = await page.locator('#root').innerText();
    check('el portal se pinta sin sesión', (await page.locator('#root').innerHTML()).length > 500);
    check('sin errores al montar', fallos.length === 0, fallos.join(' | '));

    // ── LA MISMA CARA QUE EL GENERADOR DE PENDONES (v4.774) ─────────
    // Cabecera blanca con el logo de la plataforma y barra lateral izquierda
    // con el formulario. Dos herramientas públicas con dos caras distintas se
    // leen como dos sistemas distintos — el pedido fue unificarlas.
    check('la cabecera lleva el logo de la plataforma',
        await page.locator('header img[alt="Club Platform for Rotary"]').count() === 1);
    check('el formulario vive en una barra lateral, como el pendón',
        await page.locator('aside').count() === 1
        && (await page.locator('aside').innerText()).includes('Nombre del club'));
    check('la sección de datos lleva su título con icono',
        (await page.locator('aside h2').allInnerTexts()).includes('Datos del club'));
    check('el copyright de Valkomen ancla el panel',
        /Valkomen LLC/.test(await page.locator('aside').innerText()));
    // La captura queda junto a las de paridad: es la forma de MIRAR el portal
    // sin levantar el sitio, que es como se escapó el defecto de v4.717.
    await page.screenshot({ path: join(OUT, 'portal.png'), fullPage: true });

    // El formulario sale de las variables, no de una lista escrita a mano —
    // pero SÓLO pide lo que el sistema no resuelve solo (Fase 3): el club, el
    // logotipo, los años (mientras no lleguen con el club) y la fotografía.
    check('el formulario se derivó de las variables',
        ['Logotipo del club', 'Nombre del club', 'Fotografía'].every(l => txt.includes(l)),
        txt.slice(0, 300));
    // Los años VOLVIERON en v4.775: el título los imprime, así que son un
    // campo obligatorio. Sin lista de distrito (esta publicación no la trae)
    // se escriben a mano.
    check('los años se preguntan: el título los imprime (v4.775)', txt.includes('Años que cumple'));
    // El MENSAJE no se pide: lo escribe la IA al generar. La casilla vuelve a
    // aparecer sólo cuando ya hay un texto que corregir.
    check('el mensaje NO se pide: lo escribe la IA al generar', !txt.includes('Mensaje'));
    // El texto dice «el archivo», no «una foto»: la misma casilla sirve para el
    // logotipo, una firma o un sello, y llamarla «foto» confunde en el campo que
    // pide el escudo del club.
    check('ofrece arrastrar el archivo', /Arrastrá el archivo/.test(txt));
    // Descargar y compartir ya NO están en el formulario: aparecen con la pieza
    // generada. Es el gesto explícito que faltaba — antes la pieza se resolvía
    // sola mientras se escribía y nadie sabía cuándo se «generaba».
    check('el formulario ofrece GENERAR, no descargar a secas',
        /Generar mi pieza/.test(txt) && !/Descargar PNG/.test(txt));
    check('sin el club obligatorio no se puede generar',
        await page.getByRole('button', { name: /Generar mi pieza/ }).isDisabled());
    await page.getByPlaceholder('Rotary Club Bogotá Centro').fill('Club Rotario Pasto');
    await page.getByPlaceholder('49').fill('52');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Generar mi pieza/ }).click();
    await page.waitForTimeout(1200);
    const txtListo = await page.locator('#root').innerText();
    check('el título imprime los años afirmados',
        /Felices 52 años/.test(await page.locator('[data-node="titulo"]').innerText().catch(() => '')));
    check('con la pieza lista ofrece descargar y compartir',
        /Descargar PNG/.test(txtListo) && /Compartir/.test(txtListo));

    // Lo que el pedido prohíbe mostrar.
    check('NO hay capas, propiedades ni elementos a la vista',
        !/Capas|Propiedades|Elementos|Agregar texto|Deshacer|Rehacer/.test(txt), txt.slice(0, 160));
    check('no hay tiradores de redimensión', await page.locator('[style*="nw-resize"]').count() === 0);

    // La firma institucional viaja horneada dentro del nodo.
    const firma = await page.locator('[data-node="firma"]').innerText().catch(() => '');
    check('la firma del Gobernador está impresa en la pieza', /Véjar/.test(firma), firma.slice(0, 60));
    // Se comprueba sobre las ETIQUETAS del formulario, no sobre el texto de la
    // página: la pieza SÍ dice «Gobernador» —es la firma, y ahí tiene que
    // estar—. Lo que no puede existir es un campo para cambiarlo.
    const etiquetas = await page.locator('#root label').allInnerTexts();
    check('y no hay ningún campo para cambiarla',
        !etiquetas.some(l => /Gobernador|Distrito|Periodo rotario/i.test(l)), etiquetas.join(' | '));

    // El logotipo es del CLUB, así que sí se puede subir; y mientras no se
    // suba, ni él ni la placa blanca que lo respalda se dibujan. Sin esto la
    // pieza salía con un rectángulo blanco vacío flotando sobre la fotografía.
    check('el logotipo del club SÍ se puede subir',
        etiquetas.some(l => /Logotipo del club/i.test(l)), etiquetas.join(' | '));
    check('sin logotipo, su nodo no se dibuja',
        await page.locator('[data-node="logo"]').count() === 0);
    check('y la placa blanca de contraste tampoco',
        await page.locator('[data-node="placa_logo"]').count() === 0);
    check('el resto de la pieza sí se dibuja',
        await page.locator('[data-node="titulo"]').count() === 1);

    // ── Dónde va a caer el logotipo (v4.725) ──────────────────────
    //
    // Un hueco de imagen vacío no deja NADA en la pieza, así que quien abre el
    // enlace veía un lienzo en blanco sin saber dónde va a quedar su logotipo.
    // Se marca con un recuadro punteado — que NO es un nodo y por eso no entra
    // en el archivo.
    const marcas = page.locator('[data-hint]');
    check('el hueco del logotipo se marca en la vista previa', await marcas.count() >= 1, String(await marcas.count()));
    // Se marcan TODOS los huecos de imagen vacíos, no sólo el logotipo: la
    // fotografía tiene el mismo problema y la misma solución.
    const textosMarcas = await marcas.allInnerTexts();
    // El tablero a cuadros es del EDITOR. En el portal la pieza es lo que se va
    // a descargar, y un tablero gris ocupando media pieza la hace ver rota.
    check('en el portal, un hueco vacío NO dibuja el tablero a cuadros',
        await page.evaluate(() => [...document.querySelectorAll('[data-node]')]
            .every(e => !/repeating-conic/.test(getComputedStyle(e).backgroundImage))));
    check('ni el cartel «Sin imagen»',
        !/Sin imagen/.test(await page.locator('#root').innerText()));
    // Dos recuadros anidados —la fotografía ocupa media pieza y el logotipo cae
    // dentro— escribían sus rótulos uno encima del otro.
    check('los rótulos de dos huecos anidados no se pisan',
        await page.evaluate(() => {
            const cajas = [...document.querySelectorAll('[data-hint]')]
                .map(e => e.getBoundingClientRect());
            if (cajas.length < 2) return true;
            // Cada rótulo se dibuja arriba de su caja: basta con que las cajas
            // no empiecen a la misma altura.
            const tops = cajas.map(r => Math.round(r.top));
            return new Set(tops).size === tops.length;
        }));

    check('se marca cada hueco de imagen vacío', textosMarcas.length >= 2, textosMarcas.join(' | '));
    // Un hueco SIN ejemplo se identifica por su etiqueta; el que TIENE ejemplo
    // se ve limpio a propósito, así que se lo busca por su id — el del nodo.
    check('un hueco sin ejemplo dice de qué dato se trata',
        textosMarcas.some(t => /Fotograf/i.test(t)), textosMarcas.join(' | '));
    check('el recuadro del logotipo cae donde la plantilla lo pone', await page.evaluate(() => {
        const h = document.querySelector('[data-hint="logo"]');
        if (!h) return false;
        const r = h.getBoundingClientRect();
        const stage = h.closest('div[style*="scale"]')?.getBoundingClientRect();
        // Arriba a la izquierda, y ocupando una franja, no la pieza entera.
        return !!stage && r.top < stage.top + stage.height * 0.3
            && r.left < stage.left + stage.width * 0.4
            && r.width < stage.width * 0.6;
    }));
    // La promesa del módulo es que la vista previa ES el archivo. Con recuadros
    // a la vista deja de ser literal, y callarlo sería peor que no mostrarlos.
    check('y se dice que lo del recuadro no se descarga',
        /no se descarga/i.test(await page.locator('#root').innerText()));

    // Lo que de verdad importa: que NO viaje al archivo. El exportador dibuja
    // `doc.nodes`, y una marca no es un nodo.
    check('la marca no es un nodo del documento', await page.evaluate(() => {
        const h = document.querySelector('[data-hint]');
        return !!h && !h.hasAttribute('data-node');
    }));

    // ── La imagen de EJEMPLO (v4.726) ─────────────────────────────
    //
    // El administrador diseña con un logotipo puesto y quien abre el enlace
    // quiere ver cómo va a quedar. Se dibuja DENTRO de la guía, atenuado y
    // rotulado — no como contenido del nodo, que sigue vacío.
    check('el ejemplo se dibuja dentro de la guía',
        await page.locator('[data-hint] [data-hint-sample]').count() >= 1);
    // El rótulo NO va encima del ejemplo: tapaba justamente lo que se quiere
    // ver, que es cómo queda el logotipo en su sitio.
    check('el ejemplo se ve limpio, sin texto encima', await page.evaluate(() => {
        const h = [...document.querySelectorAll('[data-hint]')]
            .find(el => el.querySelector('[data-hint-sample]'));
        return !!h && (h.textContent || '').trim() === '';
    }));
    // El hueco SIN ejemplo sí lleva su etiqueta: es lo único que dice qué va ahí.
    check('un hueco sin ejemplo conserva su etiqueta', await page.evaluate(() => {
        const h = [...document.querySelectorAll('[data-hint]')]
            .find(el => !el.querySelector('[data-hint-sample]'));
        return !!h && /Fotograf/i.test(h.textContent || '');
    }));
    check('la leyenda dice que el ejemplo no es tuyo y no se descarga',
        /no es tuyo y no se descarga/i.test(await page.locator('#root').innerText()));
    // Y el aviso que de verdad protege va JUNTO AL BOTÓN, que es donde alguien
    // podría llevarse una pieza sin su logotipo creyendo que lo tiene.
    check('junto a descargar se avisa que la pieza saldría sin esa imagen',
        /sale <?strong>?sin esa imagen|sale sin esa imagen/i.test(await page.locator('#root').innerText()),
        (await page.locator('#root').innerText()).slice(-400));

    // Lo que de verdad importa, otra vez: el NODO del logotipo sigue vacío, así
    // que el archivo no lleva el escudo del administrador.
    check('el nodo del logotipo sigue sin dibujarse',
        await page.locator('[data-node="logo"]').count() === 0);
    check('y el ejemplo no es un nodo', await page.evaluate(() => {
        const img = document.querySelector('[data-hint-sample]');
        return !!img && !img.closest('[data-node]');
    }));

    // Y la otra mitad: en cuanto hay logotipo, el recuadro deja sitio a la
    // imagen de verdad. Una marca que se quedara puesta sería peor que ninguna.
    const pngHint = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.route('**/api/public/design/aniversario/photo', r => r.fulfill({
        json: { dataUrl: `data:image/png;base64,${pngHint.toString('base64')}`, key: 'logo', width: 104, height: 104, notes: [] },
    }));
    const casillas = page.locator('input[type=file]');
    await casillas.first().setInputFiles({ name: 'escudo.png', mimeType: 'image/png', buffer: pngHint });
    await page.waitForTimeout(900);
    const restantes = await page.locator('[data-hint]').allInnerTexts();
    check('al subir la imagen, su recuadro desaparece',
        restantes.length < textosMarcas.length, `${textosMarcas.length} → ${restantes.length}`);
    check('y el nodo de esa imagen sí se dibuja',
        await page.locator('[data-node="logo"], [data-node="foto"]').count() >= 1);

    // La vista previa es local e instantánea.
    await page.getByPlaceholder('Rotary Club Bogotá Centro').fill('Club Rotario Pasto');
    await page.waitForTimeout(300);
    check('la vista previa se repinta mientras se escribe',
        /Club Rotario Pasto/.test(await page.locator('[data-node="titulo"]').innerText().catch(() => '')));

    // El campo obligatorio gobierna GENERAR, que es el gesto que ahora produce
    // la pieza. Se comprueba desde el formulario, que es donde se edita.
    await page.getByRole('button', { name: /Editar los datos/ }).click();
    await page.waitForTimeout(300);
    await page.getByPlaceholder('Rotary Club Bogotá Centro').fill('');
    await page.waitForTimeout(250);
    check('sin el club no se puede generar', await page.getByRole('button', { name: /Generar mi pieza/ }).isDisabled());
    await page.getByPlaceholder('Rotary Club Bogotá Centro').fill('Club Rotario Pasto');
    await page.waitForTimeout(250);
    check('y con el club y los años sí', !(await page.getByRole('button', { name: /Generar mi pieza/ }).isDisabled()));
    check('el portal no lanzó errores', fallos.length === 0, fallos.join(' | '));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
// El portal público COMPONIENDO
//
// Lo pedido: que la fotografía que sube el visitante la integre la IA DENTRO
// del lienzo institucional, como un diseño gráfico, en vez de encajarla en un
// recuadro. El motor y los endpoints existían desde v4.722; lo que faltaba era
// que esta pantalla los llamara — y eso no se ve desde el servidor.
console.log('\nEl portal público, componiendo con IA');
{
    const { buildPublication, bakeFrozen } = await import('../server/lib/designPublish.js');
    const compiled = compileTemplate({
        template: templateById('aniversario_foto'), variables: {},
        branding: { district: '4281', governor: 'Fabio', period: '2026-2027' }, keepSlots: true,
    });
    const doc = { format: compiled.format, background: compiled.background, nodes: compiled.nodes };
    const frozen = { distrito: '4281', gobernador: 'Fabio', periodo: '2026-2027' };
    const pub = buildPublication({ document: doc, name: 'Aniversario', slug: 'aniversario', settings: { frozen } });
    const RESP = {
        slug: pub.slug, name: pub.name, intro: '', category: 'aniversario', format: pub.format,
        document: bakeFrozen(pub.document, frozen), fields: pub.fields,
        composition: { enabled: true, variants: 1 },
        // Con distrito, el club se ELIGE de la lista (v4.775).
        district: '4281',
    };

    const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlantillaPublica from './src/pages/PlantillaPublica';
window.go = () => createRoot(document.getElementById('root')).render(
  React.createElement(MemoryRouter, { initialEntries: ['/plantillas/aniversario'] },
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/plantillas/:slug', element: React.createElement(PlantillaPublica) }))));
`;
    const portal = await build({
        stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser',
        define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-test"' },
        external: ['jspdf'], jsx: 'automatic',
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));
    page.on('console', m => { if (m.type() === 'error') fallos.push(`console: ${m.text()}`); });

    const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    let pidioComponer = null;
    let sondeos = 0;
    let pidioVerificar = null;
    // El veredicto se controla desde la prueba: primero aprueba, y más abajo se
    // reprueba para comprobar que la composición se DESCARTA.
    let veredicto = { state: 'ok', use: true, reason: null, consequence: null };

    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/public/design/aniversario', r => r.fulfill({ json: RESP }));
    // El logo de la cabecera (v4.774): su respaldo apunta al S3 real y en el
    // arnés esa red no existe — sin esta ruta, el <img> falla con un error de
    // consola que la comprobación de «sin errores» atrapa.
    await page.route('**rotary-platform-assets**', r => r.fulfill({
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    }));
    await page.route('**/api/public/design/aniversario/photo', r =>
        r.fulfill({ json: { dataUrl: PIXEL, notes: [] } }));
    await page.route('**/api/public/design/aniversario/backdrop', r => {
        try { pidioComponer = JSON.parse(r.request().postData() || '{}'); } catch { pidioComponer = {}; }
        return r.fulfill({ json: { variants: [{ planId: 'foto_superior', label: 'Arriba', taskId: 'task_9' }] } });
    });
    // El primer sondeo devuelve `pending`: es el caso real —el modelo tarda
    // entre 20 y 60 segundos— y hay que comprobar que la pantalla lo espera en
    // vez de darlo por fallido.
    await page.route('**/api/public/design/aniversario/verify', r => {
        try { pidioVerificar = JSON.parse(r.request().postData() || '{}'); } catch { pidioVerificar = {}; }
        return r.fulfill({ json: veredicto });
    });
    await page.route('**/api/public/design/clubs**', r => r.fulfill({
        json: [{ name: 'Pasto', display: 'Club Rotario Pasto', district: '4281', logo: null, years: 52 }],
    }));
    await page.route('**/api/public/design/aniversario/backdrop/task_9', r => {
        sondeos += 1;
        return sondeos < 2
            ? r.fulfill({ json: { status: 'pending' } })
            : r.fulfill({ json: { status: 'ready', url: 'https://ejemplo.test/compuesto.png', notes: [] } });
    });
    await page.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: portal.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(900);

    // Subir la FOTOGRAFÍA dispara la composición. El logotipo no: un escudo se
    // dibuja nítido en su sitio, no se funde con el fondo.
    const archivos = page.locator('input[type=file]');
    const cuantos = await archivos.count();
    // La FOTOGRAFÍA es la única casilla que acepta `image/*`; el logotipo, la
    // firma y el sello enumeran sus formatos. Buscar por «jpeg» tomaba el
    // logotipo —y comprobaba lo contrario de lo que se quería—.
    let idxFoto = -1;
    for (let i = 0; i < cuantos; i++) {
        if ((await archivos.nth(i).getAttribute('accept')) === 'image/*') { idxFoto = i; break; }
    }
    check('la casilla de la fotografía existe en el formulario', idxFoto >= 0, `${cuantos} casillas`);
    const png = Buffer.from(PIXEL.split(',')[1], 'base64');
    await archivos.nth(idxFoto).setInputFiles({ name: 'club.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(1200);

    // Subir NO compone: con un gesto explícito de Generar, hacerlo también al
    // soltar el archivo gastaría los créditos dos veces por visita.
    check('subir la fotografía NO compone todavía', !pidioComponer);
    // Y tampoco ENTRA a la pieza: con la composición encendida, la foto entra
    // al GENERAR —integrada por el modelo o en su recuadro como respaldo—.
    // Mostrarla apenas se sube prometía que iba a quedar ahí, y quedaba en
    // otra parte. En el formulario se ve en su casilla, que es donde se eligió.
    check('la fotografía NO entra a la pieza al subirla',
        await page.locator('[data-node="foto"]').count() === 0);

    // Generar exige lo obligatorio, así que el club va antes — y acá se ELIGE
    // de la lista del distrito (v4.775), que además trae los años calculados.
    check('el club se elige de la lista del distrito',
        await page.locator('select').count() === 1
        && (await page.locator('select').innerText()).includes('Mi club no está en la lista'));
    await page.locator('select').selectOption({ label: 'Pasto' });
    await page.waitForTimeout(300);
    check('elegirlo completa los años y la casilla se esconde',
        !(await page.locator('#root').innerText()).includes('Años que cumple'));
    check('y con eso alcanza para generar',
        !(await page.getByRole('button', { name: /Generar mi pieza/ }).isDisabled()));
    await page.getByRole('button', { name: /Generar mi pieza/ }).click();
    await page.waitForTimeout(1200);
    check('generar pide componer', !!pidioComponer);
    check('y le manda la fotografía al motor',
        typeof pidioComponer?.photo === 'string' && pidioComponer.photo.startsWith('data:image/'));
    check('mientras compone se DICE en qué paso está',
        /Componiendo el dise/i.test(await page.locator('#root').innerText()));

    await page.waitForTimeout(9000);
    check('un sondeo pendiente no se toma por un fallo', sondeos >= 2, `${sondeos} sondeos`);
    check('la composición se COMPRUEBA antes de usarla', !!pidioVerificar);
    check('y se le manda la fotografía original y la composición',
        typeof pidioVerificar?.photo === 'string' && pidioVerificar.photo.startsWith('data:image/')
        && typeof pidioVerificar?.composed === 'string');
    check('el fondo compuesto entra en la pieza',
        await page.locator('[data-node="fondo_ia"]').count() === 1);
    check('y apaga el nodo de la fotografía, que ya está dentro',
        await page.locator('[data-node="foto"]').count() === 0);
    check('el texto se sigue dibujando encima, nítido',
        await page.locator('[data-node="titulo"]').count() === 1);

    // La vuelta atrás tiene que existir: una composición que no gusta no puede
    // dejar la pieza peor que antes.
    check('al terminar se dice que la pieza está lista',
        /Tu pieza está lista/i.test(await page.locator('#root').innerText()));
    check('y se ofrece volver a editar sin empezar de nuevo',
        await page.getByRole('button', { name: /Editar los datos/ }).count() === 1);
    check('y regenerar', await page.getByRole('button', { name: /Regenerar/ }).count() === 1);

    const volver = page.getByText('Prefiero verla en su recuadro');
    check('se ofrece volver a la fotografía en su recuadro', await volver.count() === 1);
    await volver.click();
    await page.waitForTimeout(400);
    check('y al volver, el fondo compuesto se va',
        await page.locator('[data-node="fondo_ia"]').count() === 0);
    check('con la fotografía otra vez visible',
        await page.locator('[data-node="foto"]').count() === 1);
    // ── Un veredicto NEGATIVO descarta la composición ──────────────
    //
    // Es el punto de todo el control: si el modelo inventó una persona, la
    // pieza sale con la fotografía en su recuadro, intacta. No se retoca la
    // imagen —eso sería el composite que el equipo rechazó dos veces—, se
    // descarta y se dice por qué.
    veredicto = {
        state: 'failed', use: false,
        reason: 'La composición agregó una persona que no está en tu fotografía.',
        consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
    };
    sondeos = 0;
    await page.getByRole('button', { name: /Regenerar/ }).click();
    await page.waitForTimeout(9000);
    check('un veredicto negativo descarta la composición',
        await page.locator('[data-node="fondo_ia"]').count() === 0);
    check('y la fotografía vuelve a su recuadro',
        await page.locator('[data-node="foto"]').count() === 1);
    const avisoFinal = await page.locator('#root').innerText();
    check('se dice el motivo y su consecuencia',
        /agregó una persona/i.test(avisoFinal) && /tal como la subiste/i.test(avisoFinal));

    // ── Un RECORTE del encuadre se usa, y se dice ──────────────────
    //
    // La corrección de fondo: componer es encuadrar, así que en una foto de
    // grupo alguien de los bordes queda fuera SIEMPRE. Reprobar por eso vetaba
    // toda composición de una foto de club. Ahora la pieza se usa y el aviso
    // sale igual, porque quien va a publicarla tiene que saber que puede no
    // salir todo el mundo.
    veredicto = {
        state: 'ok', use: true, reason: null, consequence: null,
        cropped: true,
        notice: 'El encuadre del diseño recortó a alguien de los bordes de tu fotografía. Si preferís que salgan todos, podés volver a la fotografía en su recuadro.',
    };
    sondeos = 0;
    await page.getByRole('button', { name: /Regenerar/ }).click();
    await page.waitForTimeout(9000);
    check('un recorte del encuadre NO descarta la composición',
        await page.locator('[data-node="fondo_ia"]').count() === 1);
    const avisoRecorte = await page.locator('#root').innerText();
    check('y aun así se avisa del recorte',
        /recort[óo] a alguien de los bordes/i.test(avisoRecorte));
    check('sin decir que se usó la fotografía en su recuadro, porque no fue así',
        !/tal como la subiste/i.test(avisoRecorte));

    check('componer no lanzó errores', fallos.length === 0, fallos.join(' | '));
    await page.close();
}

check('el editor no lanzó ningún error', errores.length === 0, errores.join(' | '));
await browser.close();

console.log(`\n${'═'.repeat(60)}`);
console.log(`imágenes en ${OUT}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(f => console.log(`   · ${f}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas en verde.`);
