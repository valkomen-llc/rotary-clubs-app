#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LA PANTALLA DE INTEGRACIONES.  npm run test:integrations:ui
// v4.867.0
//
// Reproduce el defecto reportado: `/admin/integraciones` quedaba en «Esta
// pantalla no se pudo mostrar» con «Cannot read properties of undefined
// (reading 'toLocaleString')», y por un contador NO SE PODÍA LLEGAR A LAS
// CREDENCIALES.
//
// ⚠️ Es la lección de v4.852 por la otra puerta: un error de render sube al
// límite de error, que desmonta el SUBÁRBOL ENTERO. No se pierde un número, se
// pierde la pantalla.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:integrations:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Integrations from './src/pages/admin/Integrations';
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
                        React.createElement(Integrations)))))));
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

const errores = [];
page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));

await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'origen', name: 'Origen', settings: [] } }));

// ⚠️ LA RESPUESTA REAL DE `GET /translate/usage`. No trae `estimatedTokensInput`,
// `estimatedTokensOutput`, `estimatedCostUSD`, `model` ni `pricingNote` — el
// módulo de traducción dejó de calcularlos en v4.662, y la pantalla los leía
// igual. Esta forma es la del servidor de hoy, no la que la pantalla esperaba.
await page.route('**/api/translate/usage*', r => r.fulfill({ json: {
    totalCachedTranslations: 1284,
    memCacheEntries: 96,
    byLanguage: [{ lang: 'en', count: 800, chars: 42000, domains: [] }],
    provider: { configured: 'gemini', fallback: 'openai', chain: ['gemini', 'openai'], active: 'gemini' },
    activity30d: {
        ok: { calls: 120, texts: 940, chars: 51000, avgMs: 412 },
        error: { calls: 3, texts: 0, chars: 0, avgMs: null },
        edits: 7,
    },
} }));

await page.route('http://localhost/', r => r.fulfill({
    contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
}));
await page.goto('http://localhost/');
await page.evaluate(() => {
    localStorage.setItem('rotary_token', 't-diag');
    localStorage.setItem('rotary_user', JSON.stringify({ id: 'u1', role: 'administrator', clubId: 'origen' }));
});
try {
    const css = readdirSync('dist/assets').filter(f => f.startsWith('index-') && f.endsWith('.css'));
    if (css[0]) await page.addStyleTag({ content: readFileSync(`dist/assets/${css[0]}`, 'utf8') });
} catch { /* sin dist */ }

await page.addScriptTag({ content: bundle.outputFiles[0].text });
await page.evaluate(() => window.go());
await page.waitForTimeout(1800);

// Se pulsa «Actualizar» del bloque de traducciones, que es lo que dispara la
// carga del uso — el camino exacto del reporte.
await page.locator('text=Actualizar').first().click().catch(() => {});
await page.waitForTimeout(1200);

const texto = await page.locator('#root').innerText().catch(() => '(vacío)');
await browser.close();

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { if (c) { pass++; console.log(`  OK    ${n}`); } else { fail++; console.log(`  FALLA ${n}${extra ? ` — ${extra}` : ''}`); } };

console.log('\n▸ La pantalla se pinta');

// EL DEFECTO REPORTADO.
ok('no cae en «Esta pantalla no se pudo mostrar»',
    !/no se pudo mostrar/i.test(texto), texto.slice(0, 300));
ok('sin errores de render', !errores.some(e => /toLocaleString|TypeError/.test(e)),
    errores.join(' | '));

console.log('\n▸ Se llega a las credenciales');

// Lo que el usuario venía a hacer: cargar credenciales.
ok('la pantalla muestra sus secciones', texto.length > 200, `largo ${texto.length}`);

console.log('\n▸ Los contadores dicen la verdad');

// Se muestran los que SÍ se miden.
ok('el total de la caché', /1\.284/.test(texto), texto.slice(0, 800));
ok('la caché en memoria', /96/.test(texto));
ok('el proveedor activo', /gemini/i.test(texto));

// ⚠️ Y NO se afirma un costo que el módulo dejó de calcular en v4.662: hoy la
// traducción va por una cadena de proveedores y DeepL, Google y Azure ni
// siquiera cobran por tokens.
ok('NO se afirma un costo en dólares que no se calcula',
    !/Costo Total USD/i.test(texto), texto.slice(0, 800));
ok('ni tokens de un modelo único que ya no existe',
    !/Tokens Entrada|Tokens Salida/i.test(texto));

// `fmt` con un dato ausente da «—», no «0»: un cero es una afirmación.
const fuente = readFileSync(new URL('../src/pages/admin/Integrations.tsx', import.meta.url), 'utf8');
ok('un contador ausente se pinta «—», no «0»',
    /Number\.isFinite\(n\)\) \? n\.toLocaleString\('es-CO'\) : '—'/.test(fuente));

console.log('');
if (fail) { console.log(`\x1b[31m✗ ${fail} fallo(s), ${pass} bien\x1b[0m\n`); process.exit(1); }
console.log(`\x1b[32m✓ ${pass} comprobaciones — se llega a las credenciales\x1b[0m\n`);
