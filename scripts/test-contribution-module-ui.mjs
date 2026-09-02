#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución en un NAVEGADOR.  npm run test:contribution:ui
// v4.987.0
//
// Comprueba lo que una prueba de criterio no puede ver:
//
//   1. Que la MISMA pantalla sirva al operador y a un sitio, y que lo que
//      cambia sea lo que el SERVIDOR manda: el alcance no se deduce en el
//      navegador.
//
//   2. Que una campaña AJENA (la publicó la plataforma y alcanza al sitio) se
//      abra en su panel local —contacto, nota, QR, centros— y no en el editor:
//      editarla desde acá le cambiaría la página a los demás sitios.
//
//   3. Que una campaña PROPIA se abra en el editor completo y sin la sección
//      de alcance, que un sitio no decide.
//
//   4. Que lo que SALE hacia el servidor lleve el `campaignId` correcto. Un
//      guardado que se va a la campaña equivocada no lo ve el typecheck.
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
import Pantalla from './src/pages/admin/ContributionCampaigns';
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
                        React.createElement(Pantalla)))))));
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

const base = (extra) => ({
    slug: 'x', campaignType: 'terremoto', startAt: null, endAt: null, priority: 0,
    content: {}, stats: [], targeting: { mode: 'clubs', clubIds: ['c-4281'] }, feed: {},
    recipientClubId: null, publishedAt: null, updatedAt: new Date().toISOString(),
    ...extra,
});
// La de la PLATAFORMA (ajena al sitio, pero le alcanza) y la PROPIA del sitio.
const AJENA = base({ id: 'c-terremoto', name: 'Emergencia Terremoto Colombia 2026', status: 'active', effectiveStatus: 'active', ownerClubId: null, own: false, showing: true });
const PROPIA = base({ id: 'c-agua', name: 'Agua potable Chocó 2027', status: 'draft', effectiveStatus: 'draft', ownerClubId: 'c-4281', own: true, showing: false });
const LOCAL = { override: { contact: { name: 'Ana Gómez', phone: '3001112233', email: 'ana@club.org' }, localNote: 'Sede los sábados' }, centers: [{ id: 'ct-1', city: 'Cali', address: 'Calle 1', active: true }] };

/** Monta la pantalla con un usuario y la respuesta del servidor que se indique. */
const abrir = async (user, { scope, campaigns }) => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
    const errores = [];
    const enviado = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        if (/Failed to load resource/.test(m.text())) return;
        errores.push(`CONSOLE: ${m.text().slice(0, 300)}`);
    });
    page.on('requestfailed', r => {
        if (/\.(png|jpe?g|svg|webp|ico|woff2?)(\?|$)/i.test(r.url())) return;
        errores.push(`REQFAIL: ${r.url().slice(0, 160)}`);
    });

    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'c-4281', name: 'Distrito 4281', settings: [] } }));
    await page.route('**/api/clubs/*/sections*', r => r.fulfill({ json: [] }));
    await page.route('**/api/admin/clubs*', r => r.fulfill({ json: [] }));
    await page.route('**/api/notification-profiles*', r => r.fulfill({ json: [] }));
    // El listado: el SERVIDOR dice el alcance.
    await page.route('**/api/contribution-campaigns', r =>
        r.fulfill({ json: { scope, campaigns, catalog: [], showingId: 'c-terremoto' } }));
    // La ficha: `own` y `local` también vienen del servidor.
    // Para el OPERADOR toda campaña es propia: así contesta el servidor real
    // (`scopedCampaign` devuelve own:true sin mirar el dueño).
    const esOperador = scope === 'platform';
    await page.route('**/api/contribution-campaigns/c-terremoto', r =>
        r.fulfill({ json: { campaign: { ...AJENA, own: esOperador }, own: esOperador, local: esOperador ? null : LOCAL, history: [], publishErrors: [] } }));
    await page.route('**/api/contribution-campaigns/c-terremoto/*', r => r.fulfill({ json: { centers: [], readings: [], totals: [] } }));
    await page.route('**/api/contribution-campaigns/c-agua', r =>
        r.fulfill({ json: { campaign: PROPIA, own: true, local: null, history: [], publishErrors: [] } }));
    await page.route('**/api/contribution-campaigns/c-agua/*', r => r.fulfill({ json: { centers: [], readings: [], totals: [] } }));
    await page.route('**/api/contribution-campaigns/site/override*', async r => {
        enviado.push({ url: 'override', body: JSON.parse(r.request().postData() || '{}') });
        return r.fulfill({ json: { override: {} } });
    });
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
    }));
    await page.goto('http://localhost/');
    await page.evaluate((u) => {
        localStorage.setItem('rotary_token', 't-diag');
        localStorage.setItem('rotary_user', JSON.stringify(u));
        localStorage.removeItem('contrib_cards_open');
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
const texto = async (page) => page.locator('#root').innerText().catch(() => '(vacío)');

// ── 1. El ADMINISTRADOR DEL SITIO ───────────────────────────────────
console.log('\n▸ El administrador del sitio entra a LA MISMA herramienta');
{
    const { page, errores, enviado } = await abrir({ id: 'u1', role: 'district_admin', clubId: 'c-4281' }, { scope: 'site', campaigns: [PROPIA, AJENA] });
    let t = await texto(page);

    check('la pantalla se llama «Campañas de Contribución»', /Campañas de Contribución/.test(t), t.slice(0, 300));
    check('⚠️ y NO «Maneras de Contribuir» en ninguna parte', !/Maneras de Contribuir/.test(t), t.slice(0, 500));
    check('⚠️ tiene «Nueva campaña»: es la herramienta de verdad, no un formulario de contacto',
        /Nueva campaña/.test(t), t.slice(0, 400));
    check('lista las dos: la propia y la que llega del Distrito',
        /Agua potable Chocó 2027/.test(t) && /Emergencia Terremoto Colombia 2026/.test(t));
    check('⚠️ dice cuál se está mostrando', /se está mostrando/i.test(t), t.slice(0, 600));
    check('⚠️ y marca la ajena como tal', /llega del distrito/i.test(t), t.slice(0, 600));
    check('⚠️ el accesorio «Página de aportes sin campaña» ya no está (v4.989)',
        !/Página de aportes sin campaña/.test(t));

    // La AJENA → el MISMO editor (v4.988), sin el control del estado.
    await page.locator('button', { hasText: 'Emergencia Terremoto Colombia 2026' }).first().click();
    await page.waitForTimeout(700);
    t = await texto(page);
    check('⚠️ la ajena se abre en el editor COMPLETO, con las herramientas de Club Platform',
        /Identidad y vigencia/.test(t) && /Hero/.test(t) && /Expandir todo/.test(t) && /Guardar/.test(t), t.slice(0, 700));
    check('⚠️ dice que la publicó el Administrador del Sistema y que su contenido es compartido',
        /la publicó el Administrador del Sistema/.test(t) && /lo verán todos ellos/.test(t), t.slice(0, 700));
    check('⚠️ …SIN los botones de estado: pausar o archivar una campaña compartida no es de un sitio',
        !/Publicar ahora/.test(t) && !/Pausar/.test(t) && !/Archivar/.test(t) && /lo maneja el Administrador del Sistema/.test(t),
        [...t.matchAll(/.{0,40}(Pausar|Archivar|Publicar ahora|lo maneja).{0,40}/g)].map(m => m[0]).join(' || ') || '(ninguna)');
    check('⚠️ …y sin alcance, notificaciones ni solicitudes',
        !/Alcance \(targeting\)/.test(t) && !/Notificaciones/.test(t) && !/Solicitudes de contenido/.test(t), t.slice(0, 900));
    check('lo local de ese sitio está como card dentro del editor', /Información local de tu sitio/.test(t));
    await page.locator('button', { hasText: 'Información local de tu sitio' }).first().click();
    await page.waitForTimeout(400);
    check('…y al abrirla trae lo que ese sitio le agrega', (await page.locator('input[value="Ana Gómez"]').count()) === 1);
    await page.locator('input[value="Ana Gómez"]').fill('Ana G. Restrepo');
    await page.locator('text=Guardar información local').first().click();
    await page.waitForTimeout(600);
    check('⚠️ el guardado local sale con el campaignId de ESA campaña',
        enviado.some(e => e.body?.campaignId === 'c-terremoto'), JSON.stringify(enviado).slice(0, 300));

    // Volver y abrir la PROPIA → editor completo, sin Alcance.
    await page.locator('button[aria-label="Volver al listado"]').click();
    await page.waitForTimeout(400);
    await page.locator('button', { hasText: 'Agua potable Chocó 2027' }).first().click();
    await page.waitForTimeout(700);
    t = await texto(page);
    check('⚠️ la PROPIA se abre en el editor completo',
        /Identidad y vigencia/.test(t) && /Hero/.test(t) && /Publicar ahora/.test(t), t.slice(0, 600));
    check('⚠️ …sin la sección de alcance: un sitio no decide a quién alcanza',
        !/Alcance \(targeting\)/.test(t) && !/Notificaciones/.test(t) && !/Solicitudes de contenido/.test(t), t.slice(0, 800));
    check('sin errores en consola', errores.length === 0, errores.join(' | ').slice(0, 400));
    await page.close();
}

// ── 2. El USUARIO INSTITUCIONAL ─────────────────────────────────────
console.log('\n▸ El usuario institucional entra a la misma pantalla');
{
    const { page, errores } = await abrir({ id: 'u2', role: 'institutional_user', clubId: 'c-4281' }, { scope: 'site', campaigns: [AJENA] });
    const t = await texto(page);
    check('ve las campañas, no una pantalla vacía',
        /Campañas de Contribución/.test(t) && /Emergencia Terremoto Colombia 2026/.test(t), t.slice(0, 400));
    check('sin errores en consola', errores.length === 0, errores.join(' | ').slice(0, 400));
    await page.close();
}

// ── 3. El OPERADOR DE LA PLATAFORMA ─────────────────────────────────
console.log('\n▸ El operador ve lo mismo, con el alcance a la vista');
{
    const { page, errores } = await abrir({ id: 'u3', role: 'administrator', clubId: 'origen' },
        { scope: 'platform', campaigns: [{ ...AJENA, own: true, showing: false }] });
    let t = await texto(page);
    check('ve la administración con «Nueva campaña»', /Nueva campaña/.test(t), t.slice(0, 400));
    check('⚠️ y no se le rotula nada como «llega del Distrito»: todas son suyas', !/llega del distrito/i.test(t));
    check('tampoco al operador le aparece «Página de aportes sin campaña»', !/Página de aportes sin campaña/.test(t));
    await page.locator('button', { hasText: 'Emergencia Terremoto Colombia 2026' }).first().click();
    await page.waitForTimeout(700);
    t = await texto(page);
    check('⚠️ al operador SÍ se le ofrece el alcance (targeting)', /Alcance \(targeting\)/.test(t), t.slice(0, 600));
    check('sin errores en consola', errores.length === 0, errores.join(' | ').slice(0, 400));
    await page.close();
}

await browser.close();
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} comprobaciones, ${fail} fallo(s).`);
process.exit(fail === 0 ? 0 : 1);
