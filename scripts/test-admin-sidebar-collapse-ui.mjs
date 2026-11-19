#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Minimizar / maximizar la barra lateral del panel, EN UN NAVEGADOR (v4.1333.0)
//
//   npm run test:admin:sidebar-collapse:ui        (capturas: SIDEBAR_UI_SHOT=carpeta)
//
// El AdminLayout real (el de TODOS los sitios) con la API simulada: minimizar,
// títulos de los íconos con el cursor y con el teclado, que el título no se
// recorte, que la preferencia se recuerde, ⌘K, y que en el teléfono el cajón
// siga entero. Se salta sin playwright o esbuild. Con `dist/assets` aplica el
// CSS real (necesario para medir anchos).
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
let chromium, build;
try {
    try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = require('playwright')); }
    ({ build } = await import('esbuild'));
} catch {
    console.log('… se salta: faltan playwright o esbuild');
    process.exit(0);
}
const CSS = (() => {
    try {
        const f = readdirSync(join(REPO, 'dist/assets')).find(n => /^index-.*\.css$/.test(n));
        return f ? readFileSync(join(REPO, 'dist/assets', f), 'utf8') : null;
    } catch { return null; }
})();
if (!CSS) { console.log('… se salta: sin dist/assets (corre `npx vite build`) no hay CSS para medir anchos'); process.exit(0); }
const SHOT = process.env.SIDEBAR_UI_SHOT || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); }
};

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
                        React.createElement(AdminLayout, null, React.createElement('div', { id: 'contenido' }, 'Contenido del módulo'))))))));
`, resolveDir: REPO, loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
})).outputFiles[0].text;

const USER = { id: 'u1', email: 'admin@feriadeproyectos.org', role: 'club_admin', clubId: 'c1', firstName: 'Daniel', lastName: 'Yazo' };
const CLUB = { id: 'c1', name: 'Feria de Proyectos', domain: 'feria.test', status: 'active', type: 'project_fair' };
const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

// Un logotipo HORIZONTAL como el de la Feria (Rotary | Feria de Proyectos Colombia).
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="96"><rect width="420" height="96" fill="#fff"/><text x="8" y="62" font-size="44" font-family="Arial" font-weight="700" fill="#17458F">Rotary</text><circle cx="185" cy="48" r="30" fill="#F7A81B"/><text x="232" y="40" font-size="20" font-family="Arial" fill="#17458F">Feria de Proyectos</text><text x="232" y="70" font-size="24" font-family="Arial" font-style="italic" fill="#17458F">Colombia</text></svg>').toString('base64');
const abrir = async (viewport, storage = {}, club = CLUB) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/auth/me*', r => r.fulfill({ json: { user: USER } }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: club }));
    await page.goto('http://localhost/admin/dashboard');
    await page.addStyleTag({ content: CSS });
    await page.evaluate(({ st, u, c }) => {
        localStorage.setItem('rotary_token', 'tok'); localStorage.setItem('rotary_user', JSON.stringify(u)); localStorage.setItem('rotary_club', JSON.stringify(c));
        for (const [k, v] of Object.entries(st)) {
            if (k.startsWith('session:')) sessionStorage.setItem(k.slice(8), v); else localStorage.setItem(k, v);
        }
    }, { st: storage, u: USER, c: club });
    await page.addScriptTag({ content: JS });
    await page.evaluate(() => window.go('/admin/dashboard'));
    await page.locator('aside[aria-label="Menú del panel"]').waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    return { page, errores };
};
const anchoMenu = (page) => page.locator('aside[aria-label="Menú del panel"]').evaluate(el => Math.round(el.getBoundingClientRect().width));
const anchoContenido = (page) => page.locator('#contenido').evaluate(el => Math.round(el.getBoundingClientRect().width));
const shot = async (page, name) => { if (SHOT) await page.screenshot({ path: join(SHOT, `${name}.png`) }); };

try {
    console.log('\n▸ Escritorio (1440 px)');
    {
        const { page, errores } = await abrir({ width: 1440, height: 900 });
        const aside = page.locator('aside[aria-label="Menú del panel"]');
        check('arranca MINIMIZADA por defecto (80 px, v4.1341)', await anchoMenu(page) === 80);
        await aside.getByRole('button', { name: 'Maximizar menú' }).click();
        await page.waitForTimeout(450);
        check('«Maximizar menú» es opcional: la abre a 288 px', await anchoMenu(page) === 288);
        check('maximizar se recuerda sólo en esta pestaña', await page.evaluate(() => sessionStorage.getItem('admin-sidebar-expanded')) === '1');
        check('el botón «Minimizar menú» está a la vista', await page.getByRole('button', { name: 'Minimizar menú' }).isVisible());
        const antes = await anchoContenido(page);
        await shot(page, 'maximizada-1440');
        await page.getByRole('button', { name: 'Minimizar menú' }).click();
        await page.waitForTimeout(450);
        check('minimizada: 80 px', await anchoMenu(page) === 80);
        check('el contenido gana el espacio', await anchoContenido(page) > antes + 150, `${antes} → ${await anchoContenido(page)}`);
        check('sólo íconos: los títulos no se ven', !(await aside.getByText('Postulación de Proyectos', { exact: true }).count()) || !(await aside.getByText('Postulación de Proyectos', { exact: true }).first().isVisible()));
        check('los títulos de sección se vuelven líneas', !(await aside.getByText('General', { exact: true }).count()));
        const enlace = aside.getByRole('link', { name: 'Centro de Inteligencia' });
        check('cada ícono conserva su nombre accesible', await enlace.count() === 1);
        await enlace.hover();
        const tip = page.getByRole('tooltip');
        await tip.waitFor({ timeout: 3000 }).catch(() => {});
        check('al pasar el cursor aparece el título del ícono', await tip.isVisible() && (await tip.textContent())?.includes('Centro de Inteligencia'));
        const caja = await tip.boundingBox();
        check('el título queda a la derecha de la barra, sin recortarse', !!caja && caja.x >= 80 && caja.width > 100);
        await shot(page, 'minimizada-1440-titulo');
        await page.mouse.move(900, 500);
        await page.waitForTimeout(150);
        check('al salir del ícono el título desaparece', !(await tip.count()));
        await aside.getByRole('link', { name: 'Contactos & Leads' }).focus();
        check('con el teclado (Tab) también aparece el título', (await page.getByRole('tooltip').textContent())?.includes('Contactos & Leads'));
        await aside.getByRole('link', { name: 'Contactos & Leads' }).blur();
        await aside.getByRole('button', { name: 'Postulación de Proyectos (bloqueado)' }).hover();
        check('un ícono bloqueado dice que está bloqueado', (await page.getByRole('tooltip').textContent())?.includes('bloqueado'));
        await aside.getByRole('button', { name: 'Cerrar sesión' }).hover();
        check('el pie también: «Cerrar sesión»', (await page.getByRole('tooltip').textContent())?.includes('Cerrar sesión'));
        check('la versión no se muestra minimizada', !(await aside.getByText(/Release|Lanzamiento/).count()));
        const logoBarra = await aside.locator('img').count() + await aside.getByText('Feria de Proyectos', { exact: true }).count();
        check('minimizada, el logotipo sale de la barra', logoBarra === 0);
        const enc = page.locator('header [data-logo-encabezado]');
        const cajaLogo = await enc.boundingBox();
        const cajaTitulo = await page.locator('header h2').boundingBox();
        check('… y aparece en el encabezado, justo a la izquierda de «Dashboard»', !!cajaLogo && !!cajaTitulo && cajaLogo.x + cajaLogo.width <= cajaTitulo.x + 1 && cajaTitulo.x - (cajaLogo.x + cajaLogo.width) < 40 && Math.abs((cajaLogo.y + cajaLogo.height / 2) - (cajaTitulo.y + cajaTitulo.height / 2)) < 8);
        check('el logotipo del encabezado se ve legible (≥ 28 px de alto)', !!cajaLogo && cajaLogo.height >= 28);
        check('al minimizar se borra la marca de la pestaña', await page.evaluate(() => sessionStorage.getItem('admin-sidebar-expanded')) === null);
        await page.keyboard.press('Control+k');
        await page.waitForTimeout(450);
        check('⌘K / Ctrl+K maximiza y enfoca el buscador', await anchoMenu(page) === 288 && await page.evaluate(() => document.activeElement?.getAttribute('placeholder')?.startsWith('Buscar')));
        await page.getByRole('button', { name: 'Minimizar menú' }).click();
        await page.waitForTimeout(400);
        await aside.getByRole('button', { name: 'Maximizar menú' }).click();
        await page.waitForTimeout(450);
        check('«Maximizar menú» la devuelve a 288 px', await anchoMenu(page) === 288);
        check('maximizada, el logotipo vuelve a la barra y sale del encabezado', !(await page.locator('header [data-logo-encabezado]').count()) && (await aside.getByText('Feria de Proyectos', { exact: true }).count()) === 1);
        check('maximizada no hay títulos flotantes', !(await page.getByRole('tooltip').count()));
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }

    console.log('\n▸ Volver al panel: minimizada siempre (v4.1341)');
    {
        const { page, errores } = await abrir({ width: 1440, height: 900 }, { 'admin-sidebar-collapsed': '0' }, { ...CLUB, logo: LOGO });
        check('vuelve minimizada, aunque quede la preferencia vieja «maximizada»', await anchoMenu(page) === 80);
        const logo = page.locator('header [data-logo-encabezado] img');
        const caja = await logo.boundingBox();
        check('con un logotipo horizontal real: va en el encabezado, legible', !!caja && caja.height >= 36 && caja.width >= 120, JSON.stringify(caja));
        check('… y no queda en la barra minimizada', !(await page.locator('aside[aria-label="Menú del panel"] img').count()));
        await shot(page, 'minimizada-1440');
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }

    console.log('\n▸ En la misma pestaña, maximizada se mantiene al recargar');
    {
        const { page, errores } = await abrir({ width: 1440, height: 900 }, { 'session:admin-sidebar-expanded': '1' });
        check('con la marca de la pestaña abre maximizada', await anchoMenu(page) === 288);
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }

    console.log('\n▸ Teléfono (390 px), con la barra minimizada por defecto');
    {
        const { page, errores } = await abrir({ width: 390, height: 844 });
        await page.locator('header button').first().click();
        await page.waitForTimeout(450);
        const aside = page.locator('aside[aria-label="Menú del panel"]');
        check('en el teléfono el logotipo no se mueve al encabezado', !(await page.locator('header [data-logo-encabezado]').count()));
        check('el cajón del teléfono se abre ENTERO (con los títulos)', await anchoMenu(page) === 288 && await aside.getByText('Contactos & Leads', { exact: true }).isVisible());
        check('en el teléfono no se ofrece minimizar', !(await page.getByRole('button', { name: 'Minimizar menú' }).isVisible()));
        check('sin desplazamiento horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await shot(page, 'telefono-390');
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }
} finally {
    await browser.close();
}
console.log(`\n${malos.length ? '❌' : '✅'} ${ok} comprobaciones en verde${malos.length ? `, ${malos.length} fallidas: ${malos.join(' · ')}` : ''}.`);
process.exit(malos.length ? 1 : 0);
