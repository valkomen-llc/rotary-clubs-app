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
