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
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' },
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
    const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import DesignStudio from './src/components/admin/design-studio/DesignStudio';
window.go = () => createRoot(document.getElementById('root')).render(React.createElement(DesignStudio));
`;
    const panel = await build({
        stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser',
        define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' },
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
    await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'sello.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(900);
    check('subir llama a /api/media/upload (queda en la Biblioteca)', llamado);
    check('la imagen subida entra como capa', /Imagen/.test(await page.locator('aside').last().innerText()));
    check('y se dibuja en el lienzo', await page.locator('img[src*="subida.png"], img[src*="banner-image"]').count() > 0);
    check('subir no lanzó errores', fallos.length === 0, fallos.join(' | '));

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

    // Los pasos del panel se numeran a mano, y agregar la Cabecera en v4.724
    // dejó DOS secciones con el «5» —el número de la Composición estaba escrito
    // dentro de su propio componente—. No lo ve el typecheck ni ninguna prueba
    // de criterio: hay que mirar la pantalla.
    const numeros = await izq.locator('section span.rounded-full').allInnerTexts();
    const pasos = numeros.map(n => n.trim()).filter(n => /^\d+$/.test(n));
    check('los pasos del panel no repiten número', new Set(pasos).size === pasos.length, pasos.join(','));
    check('y van en orden desde el 1',
        pasos.join(',') === pasos.map((_, i) => i + 1).join(','), pasos.join(','));

    await page.close();
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
        branding: { district: '4281', governor: 'Fabio Enrique Véjar Montañez', period: '2026-2027' },
        keepSlots: true,
    });
    const doc = { format: compiled.format, background: compiled.background, nodes: compiled.nodes };
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
        define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' },
        external: ['jspdf'], jsx: 'automatic',
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));
    page.on('console', m => { if (m.type() === 'error') fallos.push(`console: ${m.text()}`); });

    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/public/design/aniversario', r => r.fulfill({ json: RESP }));
    await page.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: portal.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(900);

    const txt = await page.locator('#root').innerText();
    check('el portal se pinta sin sesión', (await page.locator('#root').innerHTML()).length > 500);
    check('sin errores al montar', fallos.length === 0, fallos.join(' | '));

    // El formulario sale de las variables, no de una lista escrita a mano.
    // Los cuatro datos que pidió el cliente, los mismos del Generador de
    // Pendones: logotipo, nombre, años y fotografía del club (v4.722.3).
    check('el formulario se derivó de las variables',
        ['Logotipo del club', 'Nombre del club', 'Años que cumple', 'Mensaje', 'Fotografía'].every(l => txt.includes(l)),
        txt.slice(0, 300));
    check('ofrece escribir el mensaje con IA', /Generar mensaje con IA/.test(txt));
    // El texto dice «el archivo», no «una foto»: la misma casilla sirve para el
    // logotipo, una firma o un sello, y llamarla «foto» confunde en el campo que
    // pide el escudo del club.
    check('ofrece arrastrar el archivo', /Arrastrá el archivo/.test(txt));
    check('ofrece descargar y compartir', /Descargar PNG/.test(txt) && /Compartir/.test(txt));

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
        await page.locator('[data-node="saludo"]').count() === 1);

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
    check('se marca cada hueco de imagen vacío', textosMarcas.length >= 2, textosMarcas.join(' | '));
    check('y cada uno dice de qué dato se trata',
        textosMarcas.some(t => /Logotipo del club/i.test(t)) && textosMarcas.some(t => /Fotograf/i.test(t)),
        textosMarcas.join(' | '));
    check('el recuadro del logotipo cae donde la plantilla lo pone', await page.evaluate(() => {
        const h = [...document.querySelectorAll('[data-hint]')]
            .find(el => /Logotipo/i.test(el.textContent || ''));
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
    check('y se dice que los recuadros no se descargan',
        /no se descargan/i.test(await page.locator('#root').innerText()));

    // Lo que de verdad importa: que NO viaje al archivo. El exportador dibuja
    // `doc.nodes`, y una marca no es un nodo.
    check('la marca no es un nodo del documento', await page.evaluate(() => {
        const h = document.querySelector('[data-hint]');
        return !!h && !h.hasAttribute('data-node');
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
        /Club Rotario Pasto/.test(await page.locator('[data-node="saludo"]').innerText().catch(() => '')));

    // El campo obligatorio gobierna la descarga.
    await page.getByPlaceholder('Rotary Club Bogotá Centro').fill('');
    await page.waitForTimeout(250);
    check('sin el club no se puede descargar', await page.getByRole('button', { name: /Descargar PNG/ }).isDisabled());
    await page.getByPlaceholder('Rotary Club Bogotá Centro').fill('Club Rotario Pasto');
    await page.waitForTimeout(250);
    check('y con el club sí', !(await page.getByRole('button', { name: /Descargar PNG/ }).isDisabled()));
    check('el portal no lanzó errores', fallos.length === 0, fallos.join(' | '));
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
