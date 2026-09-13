#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA FICHA DEL REEL, en un navegador.  npm run test:reels:ficha:ui
// v4.1041.0
//
// Cierra el pendiente declarado en v4.1040: «la ficha del Reel no se comprueba
// en un navegador — al tocar su maquetación, mirarla (la lección de v4.717)».
//
// Lo que mide, y que NINGUNA prueba de criterio puede ver: DÓNDE cae el control
// del outro. Se reportó como «no aparece la opción de agregar el outro» con el
// botón EN la captura: existía, estaba cableado y vivía al final de la columna
// de metadatos, cortado por el borde del modal. Medido antes del arreglo, en
// una ventana de 1000 px caía en y=992-1020 — fuera de la pantalla.
//
// ⚠️ El CSS COMPILADO no es opcional: sin él la página se monta con todo en
// `display:block` y las medidas no son las de la maquetación real — la prueba
// pasaría por los motivos equivocados (la lección de v4.851).
//
// Pide `playwright`, `esbuild` y `dist/` compilado, y SE SALTA SOLO si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:reels:ficha:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const distAssets = path.join(repo, 'dist/assets');
const cssFile = existsSync(distAssets)
    ? readdirSync(distAssets).find(n => n.startsWith('index-') && n.endsWith('.css'))
    : null;
if (!cssFile) {
    console.log('\n⊘ test:reels:ficha:ui — falta dist/ compilado, se salta.\n');
    process.exit(0);
}
const css = readFileSync(path.join(distAssets, cssFile), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const section = t => console.log(`\n${t}`);

// El Reel del reporte: terminado, con archivo, SIN outro puesto.
const REEL = {
    id: '3ff74396-290c-4281-8c3b-13e843b1b6e1',
    title: 'Entrega de 117 prendas dobles, ademas de 31 pares de zapatos',
    status: 'needs_review', statusLabel: 'Requiere revisión',
    formatLabel: 'Vertical · Reels, TikTok y Shorts',
    videoUrl: 'https://example.org/reel.mp4', posterUrl: null,
    durationSec: 20, sizeBytes: 24 * 1024 * 1024, bitrateKbps: 10075,
    width: 1080, height: 1920, hasAudio: true,
    musicStyleLabel: 'Institucional', musicUrl: 'https://example.org/m.mp3',
    narration: null, creditsEstimated: 220, processingMs: 2079 * 60000,
    createdAt: '2026-09-11T10:00:00Z', savedToLibraryAt: '2026-09-12T10:00:00Z',
    engineLabel: 'Kling 2.6', engineModel: 'kling-2.6/image-to-video',
    renderProviderLabel: 'FFmpeg (en el servidor)', organizationName: 'Popayán',
    scenes: [1, 2, 3, 4, 5].map(i => ({ id: 's' + i, position: i, status: 'ready' })),
    copies: [1, 2, 3, 4].map(i => ({ id: 'c' + i })),
    tags: [], notes: [], scenesPending: 0, progress: 1, outro: null,
    outroOptions: { transitions: [{ id: 'fundido', label: 'Fundido' }], defaultTransition: 'fundido', minSec: 0.3, maxSec: 1.2 },
    origin: {
        submissionId: 'sub1', versionNumber: 1,
        campaignName: 'Emergencia Terremoto Colombia 2026',
        submissionTitle: 'Entrega de 117 prendas dobles', club: 'Popayán',
        articleTitle: 'Rotary Popayán envía ayuda a damnificados en Sevilla',
    },
    config: { sourceImages: [] },
};

const OUTROS = [
    { id: 'o1', title: 'Cierre institucional 4281', videoUrl: 'https://example.org/o1.mp4', isDefault: true, durationSec: 5, hasAudio: true },
    { id: 'o2', title: 'Cierre Popayán', videoUrl: 'https://example.org/o2.mp4', isDefault: false, durationSec: 5, hasAudio: false },
];

// Un SOLO bundle: dos copias de React rompen los hooks.
const bundle = await build({
    stdin: {
        contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ReelLibrary from './src/components/admin/content-studio/ReelLibrary.tsx';
import { AuthProvider } from './src/hooks/useAuth.tsx';
createRoot(document.getElementById('root')).render(
    React.createElement(AuthProvider, null,
        React.createElement(ReelLibrary, { onDuplicate: () => {}, onPublish: () => {} })));
`,
        resolveDir: repo, loader: 'jsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl' },
    logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

/** Abre la ficha del Reel en una ventana del alto pedido. */
const abrirFicha = async (alto) => {
    const page = await browser.newPage({ viewport: { width: 1728, height: alto } });
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));

    await page.route('**/api/**', r => {
        const u = r.request().url();
        if (u.includes('/reels/library')) return r.fulfill({ json: { reels: [REEL], total: 1 } });
        if (u.includes('content-studio/outros')) return r.fulfill({ json: { outros: OUTROS } });
        return r.fulfill({ json: {} });
    });
    await page.route('**/*.mp4', r => r.fulfill({ status: 200, contentType: 'video/mp4', body: '' }));
    // El arnés necesita un ORIGEN real: sobre `about:blank` una dirección
    // relativa no tiene base contra la que resolverse y la petición no sale,
    // así que la prueba pasaría sin ejercitar nada (la lección de v4.720).
    await page.route('http://localhost/', r => r.fulfill({
        status: 200, contentType: 'text/html',
        body: `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root"></div></body></html>`,
    }));

    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForTimeout(1200);
    await page.locator('button').filter({ hasText: 'Entrega de 117 prendas' }).first().click();
    await page.waitForTimeout(700);
    return { page, errores };
};

// ── 1. El control del outro cae DENTRO de la ventana ──────────────────────
//
// Es la comprobación que da nombre a la prueba. Verificada a la inversa: con
// la sección al final de la columna de metadatos, `dentro` es false.
section('1. Dónde cae el control del outro');
for (const alto of [1000, 800]) {
    const { page, errores } = await abrirFicha(alto);
    const m = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const puertas = btns
            .filter(b => /^(agregar|cambiar)\s+outro$/i.test((b.innerText || '').trim().replace(/\s+/g, ' ')))
            .map(b => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), dentro: r.bottom <= window.innerHeight && r.top >= 0 }; });
        const publicar = btns.find(b => (b.innerText || '').toLowerCase().includes('publicar en redes'));
        return { puertas, publicar: publicar ? Math.round(publicar.getBoundingClientRect().top) : null };
    });
    ok(`la ficha se monta sin errores (ventana de ${alto} px)`, errores.length === 0, errores[0]);
    ok(`hay DOS puertas al outro con ventana de ${alto} px`, m.puertas.length === 2, `hay ${m.puertas.length}`);
    ok(`las dos caen DENTRO de la ventana de ${alto} px`,
        m.puertas.length === 2 && m.puertas.every(p => p.dentro),
        JSON.stringify(m.puertas));
    ok(`el atajo acompaña a «Publicar en redes sociales» (${alto} px)`,
        m.publicar !== null && m.puertas.some(p => Math.abs(p.top - m.publicar) < 120),
        `publicar=${m.publicar} puertas=${JSON.stringify(m.puertas.map(p => p.top))}`);
    await page.close();
}

// ── 2. Las dos puertas abren UN solo selector ─────────────────────────────
//
// Dos selectores serían dos verdades sobre el mismo outro: el estado vive en
// `ReelDetail` justamente para que no ocurra.
section('2. Las dos puertas abren el MISMO selector');
{
    const { page } = await abrirFicha(1000);
    const abiertos = async () => page.evaluate(() =>
        [...document.querySelectorAll('h3')].filter(h => (h.innerText || '').toLowerCase().includes('elegir')).length);

    ok('sin pulsar nada no hay ningún selector abierto', (await abiertos()) === 0);

    for (const i of [0, 1]) {
        const b = page.locator('button').filter({ hasText: /(Agregar|Cambiar)\s+outro/i }).nth(i);
        await b.scrollIntoViewIfNeeded();
        await b.click({ force: true });
        await page.waitForTimeout(600);
        ok(`la puerta ${i} abre exactamente UN selector`, (await abiertos()) === 1, `abiertos: ${await abiertos()}`);
        if (i === 0) {
            const lista = await page.evaluate(() => document.body.innerText.includes('Cierre institucional'));
            ok('el selector trae los outros guardados de la plataforma', lista);
            const z = await page.evaluate(() => {
                const h = [...document.querySelectorAll('h3')].find(x => (x.innerText || '').toLowerCase().includes('elegir'));
                const caja = h.closest('.fixed');
                const r = caja.getBoundingClientRect();
                return { z: getComputedStyle(caja).zIndex, ancho: Math.round(r.width), alto: Math.round(r.height) };
            });
            ok('y se pinta POR ENCIMA de la ficha, con tamaño real', z.z === '70' && z.ancho > 0 && z.alto > 0, JSON.stringify(z));
        }
        await page.locator('button').filter({ hasText: /Elegir\s+outro/i }).first().isVisible().catch(() => {});
        await page.evaluate(() => {
            const h = [...document.querySelectorAll('h3')].find(x => (x.innerText || '').toLowerCase().includes('elegir'));
            if (h) h.closest('.fixed').querySelector('button:last-of-type');
        });
        // Cerrar por el velo, que es el camino que el usuario tiene a mano.
        await page.mouse.click(20, 20);
        await page.waitForTimeout(400);
    }
    await page.close();
}

// ── 3. La palabra «outro» NO se traduce ───────────────────────────────────
//
// Era la causa del reporte de v4.1040: el traductor de DOM la reescribía como
// «Cierre» y quien la buscaba por su nombre no la encontraba.
section('3. «Outro» es el nombre del módulo, no lenguaje');
{
    const { page } = await abrirFicha(1000);
    const marcados = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')]
            .filter(b => /outro/i.test(b.innerText || ''));
        return btns.map(b => Boolean(b.querySelector('[data-no-translate]')));
    });
    ok('todo botón que nombra el outro lo lleva con data-no-translate',
        marcados.length >= 2 && marcados.every(Boolean), JSON.stringify(marcados));
    await page.close();
}

await browser.close();
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} ok, ${fail} fallos\n`);
process.exit(fail === 0 ? 0 : 1);
