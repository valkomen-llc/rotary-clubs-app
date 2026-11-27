#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// «Abrir Sitio» y los contadores GA4 de la cabecera, EN UN NAVEGADOR (v4.1361)
//
//   npm run test:admin:open-site:ui
//
// Reproduce el caso del Club Rotario Tuluá El Lago: el navegador carga OTRO
// sitio en el contexto del panel (el que tiene rotary4281.org) y el servidor
// sabe que el usuario es de Tuluá. Comprueba con el AdminLayout real:
//   · «Abrir Sitio» lleva a la dirección del club del usuario, nunca a
//     rotary4281.org;
//   · los contadores GA4 no mandan `hostname` (el servidor usa la sesión);
//   · la sesión guardada se corrige y el panel recarga el sitio del club.
// Se salta sin playwright, esbuild o dist/assets.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
let chromium, build;
try {
    try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = require('playwright')); }
    ({ build } = await import('esbuild'));
} catch { console.log('… se salta: faltan playwright o esbuild'); process.exit(0); }
const CSS = (() => {
    try { const f = readdirSync(join(REPO, 'dist/assets')).find(n => /^index-.*\.css$/.test(n)); return f ? readFileSync(join(REPO, 'dist/assets', f), 'utf8') : null; } catch { return null; }
})();
if (!CSS) { console.log('… se salta: sin dist/assets (corre `npx vite build`)'); process.exit(0); }

let ok = 0; const malos = [];
const check = (n, c, extra = '') => { if (c) { ok++; console.log('  OK   ', n); } else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); } };

const JS = (await build({
    stdin: {
        contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from './src/components/admin/AdminLayout';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { CartProvider } from './src/contexts/CartContext';
window.go = (path) => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, { initialEntries: [path] },
        React.createElement(ClubProvider, null,
            React.createElement(LanguageProvider, null,
                React.createElement(AuthProvider, null,
                    React.createElement(CartProvider, null,
                        React.createElement(AdminLayout, null, React.createElement('div', { id: 'contenido' }, 'Analíticas'))))))));
`, resolveDir: REPO, loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
})).outputFiles[0].text;

// La sesión del club SIN slug (y sin el club bien guardado), como la de Tuluá.
const USER = { id: 'u-tl', email: 'admin@rotarytuluaellago.org', role: 'club_admin', clubId: 'c-tulua', club: { id: 'c-tulua', name: 'Club Rotario Tuluá El Lago', subdomain: null } };
// Lo que el navegador cargaba en el contexto: OTRO sitio, con rotary4281.org.
const AJENO = { id: 'c-dist', name: 'Nombre del club', domain: 'rotary4281.org', subdomain: 'rotary4281', status: 'active', type: 'club', onboardingCompleted: true };
const PROPIO = { id: 'c-tulua', name: 'Club Rotario Tuluá El Lago', domain: null, subdomain: 'rotary-club-tulua-el-lago', status: 'draft', type: 'club', onboardingCompleted: true };
const SITE = { id: 'c-tulua', name: 'Club Rotario Tuluá El Lago', slug: 'rotary-club-tulua-el-lago', ownDomain: null, foreignDomain: 'rotary4281.org', url: 'https://app.clubplatform.org/?club=rotary-club-tulua-el-lago' };

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errores = [];
    const traffic = [];
    const byDomain = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/auth/me*', r => r.fulfill({ json: { user: USER } }));
    await page.route('**/api/clubs/by-domain*', r => {
        const q = new URL(r.request().url()).searchParams.get('domain');
        byDomain.push(q);
        // Sólo con el slug del club devuelve el club; con cualquier otra cosa, el sitio ajeno.
        return r.fulfill({ json: q === PROPIO.subdomain ? PROPIO : AJENO });
    });
    await page.route('**/api/admin/my-site*', r => r.fulfill({ json: { site: SITE } }));
    await page.route('**/api/analytics/traffic*', r => { traffic.push(r.request().url()); return r.fulfill({ json: { totals: { users: 0, pageViews: 0 } } }); });
    await page.goto('http://localhost/admin/analytics');
    await page.addStyleTag({ content: CSS });
    await page.evaluate(({ u }) => { localStorage.setItem('rotary_token', 'tok'); localStorage.setItem('rotary_user', JSON.stringify(u)); }, { u: USER });
    await page.addScriptTag({ content: JS });
    await page.evaluate(() => window.go('/admin/analytics'));
    await page.locator('aside[aria-label="Menú del panel"]').waitFor({ timeout: 15000 });
    await page.waitForTimeout(2500);

    const abrir = page.getByRole('link', { name: /Abrir Sitio/ });
    const href = await abrir.getAttribute('href').catch(() => null);
    check('«Abrir Sitio» lleva a app.clubplatform.org/?club=<slug del club>', href === SITE.url, href);
    check('… y nunca a rotary4281.org', !String(href || '').includes('rotary4281.org'));
    check('los contadores GA4 de la cabecera no mandan `hostname` (el servidor usa la sesión)', traffic.length > 0 && traffic.every(u => !/hostname=/.test(u)), traffic.join(' | '));
    const sesion = await page.evaluate(() => JSON.parse(localStorage.getItem('rotary_user') || 'null'));
    check('la sesión guardada queda con el club y su slug', sesion?.club?.id === 'c-tulua' && sesion?.club?.subdomain === SITE.slug, JSON.stringify(sesion?.club));
    check('el panel vuelve a pedir el sitio con el slug del club', byDomain.includes(SITE.slug), byDomain.join(', '));
    check('sin errores en la página', !errores.length, errores.join(' | '));
} finally {
    await browser.close();
}
console.log(`\n${malos.length ? '❌' : '✅'} test:admin:open-site:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
