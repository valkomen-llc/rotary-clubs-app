#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución en un NAVEGADOR.  npm run test:contribution:ui
// v4.986.0
//
// Comprueba lo que una prueba de criterio no puede ver:
//
//   1. Que la MISMA dirección sirva DOS vistas y que el modo se decida por
//      contexto de plataforma. El operador entra por el dominio de la
//      plataforma y `by-domain` le devuelve el sitio «Origen», así que SÍ
//      tiene club activo: si el modo se decidiera por «hay club», estaría
//      viendo la vista del sitio creyendo ver el módulo central (v4.853).
//
//   2. Que el sitio pueda ADMINISTRAR VARIAS campañas: que las liste, que
//      diga cuál está al aire y que al cambiar de campaña cargue LA SUYA.
//
//   3. Que lo que SALE hacia el servidor lleve el `campaignId` correcto. Un
//      guardado que se va a la campaña equivocada no lo ve el typecheck y es
//      el error caro de esta pantalla.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:contribution:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

import { existsSync, readFileSync, readdirSync } from 'node:fs';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Home from './src/pages/admin/ContributionCampaignsHome';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import ChunkErrorBoundary from './src/components/ChunkErrorBoundary';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, null,
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(ChunkErrorBoundary, null,
                        React.createElement(Home)))))));
`;

const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: {
        'import.meta.env.VITE_API_URL': '"/api"',
        'process.env.NODE_ENV': '"production"',
        __APP_VERSION__: '"0.0.0-diag"',
    },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

const CAMPANAS = [
    {
        id: 'c-terremoto', name: 'Emergencia Terremoto Colombia 2026', slug: 'terremoto',
        status: 'active', effectiveStatus: 'active', startAt: null, endAt: null, priority: 10,
        showing: true,
        override: { contact: { name: 'Ana Gómez', phone: '3001112233', email: 'ana@club.org' }, localNote: 'Sede los sábados' },
        centers: [{ id: 'ct-1', city: 'Cali', address: 'Calle 1', active: true }],
    },
    {
        id: 'c-agua', name: 'Agua potable Chocó 2027', slug: 'agua',
        status: 'scheduled', effectiveStatus: 'scheduled', startAt: null, endAt: null, priority: 5,
        showing: false,
        override: { contact: { name: 'Luis Pérez', phone: '', email: '' } },
        centers: [],
    },
];

/** Monta la pantalla con un usuario y devuelve lo que quedó pintado. */
const abrir = async (user, rutas = {}) => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
    const errores = [];
    const enviado = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        if (/Failed to load resource/.test(m.text())) return; // ver `requestfailed`
        errores.push(`CONSOLE: ${m.text().slice(0, 300)}`);
    });
    // Un recurso estático que el arnés no sirve —un PNG del panel— no es un
    // error de la pantalla: sólo cuentan los de JavaScript.
    page.on('requestfailed', r => {
        if (/\.(png|jpe?g|svg|webp|ico|woff2?)(\?|$)/i.test(r.url())) return;
        errores.push(`REQFAIL: ${r.url().slice(0, 160)}`);
    });

    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    // ⚠️ El operador SÍ tiene club activo: `by-domain` le devuelve «Origen».
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'origen', name: 'Origen', settings: [] } }));
    await page.route('**/api/clubs/*/sections*', r => r.fulfill({ json: [] }));
    await page.route('**/api/contribution-campaigns/site/campaigns*', r =>
        r.fulfill({ json: { campaigns: CAMPANAS, showingId: 'c-terremoto' } }));
    await page.route('**/api/contribution-campaigns/site/override*', async r => {
        enviado.push({ url: 'override', body: JSON.parse(r.request().postData() || '{}') });
        return r.fulfill({ json: { override: JSON.parse(r.request().postData() || '{}').content } });
    });
    // El listado del módulo CENTRAL, para la vista del operador.
    await page.route('**/api/contribution-campaigns?*', r => r.fulfill({ json: { campaigns: [] } }));
    for (const [patron, cuerpo] of Object.entries(rutas)) {
        await page.route(patron, r => r.fulfill({ json: cuerpo }));
    }
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
    }));
    await page.goto('http://localhost/');
    await page.evaluate((u) => {
        localStorage.setItem('rotary_token', 't-diag');
        localStorage.setItem('rotary_user', JSON.stringify(u));
    }, user);
    try {
        const css = readdirSync('dist/assets').filter(f => f.startsWith('index-') && f.endsWith('.css'));
        if (css[0]) await page.addStyleTag({ content: readFileSync(`dist/assets/${css[0]}`, 'utf8') });
    } catch { /* sin dist */ }
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(2200);
    return { page, errores, enviado };
};

let pass = 0, fail = 0;
const check = (n, c, extra = '') => {
    if (c) { pass++; console.log(`  OK    ${n}`); }
    else { fail++; console.log(`  FALLA ${n}${extra ? ` — ${extra}` : ''}`); }
};

// ── 1. El ADMINISTRADOR DEL SITIO ───────────────────────────────────
console.log('\n▸ El administrador del sitio ve SU vista, con sus campañas');
{
    const { page, errores, enviado } = await abrir({ id: 'u1', role: 'club_admin', clubId: 'c-4281' });
    const texto = await page.locator('#root').innerText().catch(() => '(vacío)');

    check('la pantalla se llama «Campañas de Contribución»',
        /Campañas de Contribución/.test(texto), texto.slice(0, 300));
    check('⚠️ y NO «Maneras de Contribuir» en ninguna parte',
        !/Maneras de Contribuir/.test(texto), texto.slice(0, 500));
    check('lista las DOS campañas que alcanzan al sitio',
        (await page.locator('#campana-del-sitio option').count()) === 2);
    check('⚠️ dice cuál se está mostrando', /se está mostrando/i.test(texto), texto.slice(0, 600));
    check('abre en la que está al aire, que es por la que van a preguntar',
        /Emergencia Terremoto Colombia 2026/.test(texto));
    check('carga la información local de esa campaña',
        (await page.locator('input[value="Ana Gómez"]').count()) === 1);
    check('la página de aportes de siempre sigue editándose acá',
        /La página de aportes cuando no hay campaña/.test(texto) && /Encabezado/.test(texto));

    // ⚠️ Cambiar de campaña carga LA SUYA, no la de la anterior.
    await page.selectOption('#campana-del-sitio', 'c-agua');
    await page.waitForTimeout(400);
    const tras = await page.locator('#root').innerText().catch(() => '');
    check('⚠️ cambiar de campaña carga la información local de ESA campaña',
        (await page.locator('input[value="Luis Pérez"]').count()) === 1
        && (await page.locator('input[value="Ana Gómez"]').count()) === 0);
    check('…y la programada se anuncia como todavía no publicada',
        /todavía no está al aire/.test(tras), tras.slice(0, 600));

    // Lo que SALE: el guardado tiene que llevar la campaña elegida.
    await page.locator('input[value="Luis Pérez"]').fill('Luis P. Restrepo');
    await page.locator('text=Guardar información local').first().click();
    await page.waitForTimeout(600);
    check('⚠️ el guardado sale con el campaignId de la campaña ELEGIDA',
        enviado.some(e => e.body?.campaignId === 'c-agua'), JSON.stringify(enviado).slice(0, 300));
    check('sin errores en consola', errores.length === 0, errores.join(' | ').slice(0, 400));
    await page.close();
}

// ── 2. El USUARIO INSTITUCIONAL ─────────────────────────────────────
console.log('\n▸ El usuario institucional entra a la misma vista del sitio');
{
    const { page, errores } = await abrir({ id: 'u2', role: 'institutional_user', clubId: 'c-4281' });
    const texto = await page.locator('#root').innerText().catch(() => '(vacío)');
    check('ve la vista del sitio, no una pantalla vacía',
        /Campañas de Contribución/.test(texto) && /Emergencia Terremoto Colombia 2026/.test(texto),
        texto.slice(0, 400));
    check('sin errores en consola', errores.length === 0, errores.join(' | ').slice(0, 400));
    await page.close();
}

// ── 3. El OPERADOR DE LA PLATAFORMA ─────────────────────────────────
console.log('\n▸ El operador ve el módulo CENTRAL, no la vista del sitio');
{
    const { page, errores } = await abrir({ id: 'u3', role: 'administrator', clubId: 'origen' });
    const texto = await page.locator('#root').innerText().catch(() => '(vacío)');
    // ⚠️ Tiene club activo («Origen»). Si el modo se decidiera por «hay club»,
    // estaría viendo la vista del sitio creyendo administrar la plataforma.
    check('ve la administración de campañas, con «Nueva campaña»',
        /Nueva campaña/.test(texto), texto.slice(0, 400));
    check('⚠️ y NO la vista del sitio: no le piden su contacto local',
        !/Guardar información local/.test(texto), texto.slice(0, 400));
    check('sin errores en consola', errores.length === 0, errores.join(' | ').slice(0, 400));
    await page.close();
}

await browser.close();
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} comprobaciones, ${fail} fallo(s).`);
process.exit(fail === 0 ? 0 : 1);
