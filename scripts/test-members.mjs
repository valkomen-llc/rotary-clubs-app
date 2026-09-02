#!/usr/bin/env node
/**
 * El directorio de socios del panel — v4.985
 * ===========================================
 *
 * Del reporte con la pantalla delante: «sólo veo a los que tienen cargo de
 * junta o autor; deberían aparecer los 45». La pantalla PINTABA los 45 y esta
 * prueba lo fija en un navegador de verdad —45 tarjetas con 18 socios con
 * categoría y 27 sin ella—. Lo que fallaba era encontrarlos: el buscador no
 * hallaba «Perez» escribiendo sin tilde a un «Pérez», y nada decía cuántos se
 * estaban mostrando.
 *
 * Dos partes: el CRITERIO (`src/lib/memberDirectory.ts`, puro, pide `esbuild`)
 * y la PANTALLA (pide `playwright` y `dist/`). Cada parte se salta sola si le
 * falta su herramienta: un despliegue no se cae por una dependencia de
 * desarrollo.
 *
 *   npm i --no-save playwright esbuild
 *   npm run test:members
 */
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ── Los datos: 18 con categoría + 27 sin ella, como el caso reportado ────
const MEMBERS = [];
let pos = -18;
const esp = (name, flags) => MEMBERS.push({ id: `esp-${MEMBERS.length}`, name, image: 'https://x/a.jpg', description: 'Reseña', isBoard: false, boardRole: null, isHonorary: false, isGovernor: false, isAuthor: false, isActive: false, category: 'active', link: null, position: pos++, ...flags });
esp('Presidenta Club', { isBoard: true, boardRole: 'Presidente', isActive: true });
for (let i = 0; i < 7; i++) esp(`Honorario ${i}`, { isHonorary: true });
for (let i = 0; i < 4; i++) esp(`Gobernador ${i}`, { isGovernor: true });
for (let i = 0; i < 6; i++) esp(`TIEMPO PRESENTE ${i}`, { isAuthor: true, link: 'https://issuu.com/x', description: 'José Antonio Salazar Cruz' });
const REG = ['José Pérez', 'María Ramírez', 'Andrés Gómez', 'Sofía Núñez', 'Álvaro Peña'];
for (let i = 0; i < 27; i++) MEMBERS.push({ id: `reg-${i}`, name: `${REG[i % 5]} ${i}`, image: 'https://x/b.jpg', description: 'Socio activo', isBoard: false, boardRole: null, isHonorary: false, isGovernor: false, isAuthor: false, isActive: true, category: 'active', link: null, position: 0 });

// ── 1. El criterio ───────────────────────────────────────────────────────
let build = null;
try { ({ build } = await import('esbuild')); } catch { /* sin esbuild */ }

if (!build) {
    console.log('\n⊘ criterio — falta esbuild, se salta.');
} else {
    console.log('\n── El criterio (memberDirectory.ts)');
    const out = await build({
        entryPoints: ['src/lib/memberDirectory.ts'], bundle: true, write: false,
        format: 'esm', platform: 'node', logLevel: 'silent',
    });
    const dir = mkdtempSync(join(tmpdir(), 'members-'));
    const file = join(dir, 'memberDirectory.mjs');
    writeFileSync(file, out.outputFiles[0].text);
    const M = await import(pathToFileURL(file).href);
    rmSync(dir, { recursive: true, force: true });

    check('normalizeText quita tildes y mayúsculas', M.normalizeText('  José  PÉREZ ') === 'jose perez');
    check('normalizeText de null es vacío', M.normalizeText(null) === '' && M.normalizeText(undefined) === '');
    check('«Perez» sin tilde encuentra a «Pérez»', M.memberMatchesQuery({ name: 'José Pérez' }, 'Perez'));
    check('«ramirez» encuentra a «María Ramírez»', M.memberMatchesQuery({ name: 'María Ramírez' }, 'ramirez'));
    check('«perez jose» encuentra en cualquier orden', M.memberMatchesQuery({ name: 'José Pérez' }, 'perez jose'));
    check('cada palabra tiene que estar', !M.memberMatchesQuery({ name: 'José Pérez' }, 'perez gomez'));
    check('busca en la reseña', M.memberMatchesQuery({ name: 'X', description: 'Ex presidente' }, 'presidente'));
    check('busca en el cargo de junta', M.memberMatchesQuery({ name: 'X', boardRole: 'Tesorero' }, 'tesorero'));
    check('consulta vacía coincide con todos', M.memberMatchesQuery({ name: 'X' }, '') && M.memberMatchesQuery({ name: 'X' }, '   '));
    check('un socio sin nombre no rompe', M.memberMatchesQuery({}, '') && !M.memberMatchesQuery({}, 'x'));

    check('TODOS no deja fuera a nadie', MEMBERS.every(m => M.memberMatchesFilter(m, 'all')));
    check('un filtro desconocido no esconde a nadie', M.memberMatchesFilter({ name: 'X' }, 'lo-que-sea'));
    const v = M.filterDirectory(MEMBERS, { filter: 'all', query: '' });
    check('TODOS sin búsqueda: 45 de 45, 0 ocultos', v.visible.length === 45 && v.total === 45 && v.hidden === 0);
    const vb = M.filterDirectory(MEMBERS, { filter: 'active', query: '' });
    check('ACTIVOS: 28 de 45 y 17 ocultos', vb.visible.length === 28 && vb.hidden === 17, JSON.stringify([vb.visible.length, vb.hidden]));
    const vq = M.filterDirectory(MEMBERS, { filter: 'all', query: 'perez' });
    check('búsqueda «perez» sin tilde: 6 de 45', vq.visible.length === 6, String(vq.visible.length));
    const vq2 = M.filterDirectory(MEMBERS, { filter: 'author', query: 'salazar' });
    check('filtro + búsqueda se combinan', vq2.visible.length === 6 && vq2.hidden === 39);
    check('filterDirectory con null no lanza', M.filterDirectory(null, {}).total === 0);

    const c = M.countByFilter(MEMBERS);
    check('conteos por pestaña', c.all === 45 && c.active === 28 && c.board === 1 && c.honorary === 7 && c.governor === 4 && c.author === 6, JSON.stringify(c));

    check('la frase de TODOS nombra el total', M.describeDirectoryView({ visible: 45, total: 45 }, 'all', '') === 'Mostrando los 45 socios del directorio.');
    check('la frase con filtro dice «N de total» y el filtro', /Mostrando 28 de 45 socios · filtro: socios activos\./.test(M.describeDirectoryView({ visible: 28, total: 45 }, 'active', '')));
    check('la frase con búsqueda cita lo escrito', M.describeDirectoryView({ visible: 6, total: 45 }, 'all', 'Perez').includes('«Perez»'));
    check('filtro + búsqueda van juntos', M.describeDirectoryView({ visible: 0, total: 45 }, 'author', 'x').includes('autores + «x»'));
    check('singular con un socio', M.describeDirectoryView({ visible: 1, total: 1 }, 'all', '') === 'Mostrando los 1 socio del directorio.');
    check('sin socios se dice', M.describeDirectoryView({ visible: 0, total: 0 }, 'all', '') === 'El directorio todavía no tiene socios.');

    // La pantalla consume el criterio, no lo reescribe: una copia se separa en silencio.
    const page = readFileSync('src/pages/admin/MembersPage.tsx', 'utf8');
    check('MembersPage importa filterDirectory', /filterDirectory/.test(page) && /from '\.\.\/\.\.\/lib\/memberDirectory'/.test(page));
    check('MembersPage no vuelve a comparar con toLowerCase().includes', !/toLowerCase\(\)\.includes\(/.test(page));
    check('MembersPage pinta el resumen y el final del directorio', /directory-summary/.test(page) && /directory-end/.test(page));
}

// ── 2. La pantalla ───────────────────────────────────────────────────────
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* sin playwright */ }
if (!build || !chromium || !existsSync('dist/assets')) {
    console.log('\n⊘ pantalla — falta playwright, esbuild o dist/, se salta.');
} else {
    console.log('\n── La pantalla (MembersPage en Chromium)');
    const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MembersPage from './src/pages/admin/MembersPage';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, null,
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(MembersPage))))));
`;
    const bundle = await build({
        stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser',
        define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-test"' },
        jsx: 'automatic', logLevel: 'silent',
    });
    const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errores = []; page.on('pageerror', e => errores.push(e.message));
    // El comodín va PRIMERO: Playwright resuelve la última ruta registrada antes.
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/**', r => r.fulfill({ json: { id: 'club-bo', name: 'Rotary Bogotá Occidente', settings: [] } }));
    await page.route('**/api/admin/clubs/club-bo', r => r.fulfill({ json: { id: 'club-bo', name: 'Rotary Bogotá Occidente', settings: [], members: MEMBERS } }));
    // Un ORIGEN real: sobre about:blank un fetch relativo no sale (v4.720).
    await page.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.goto('http://localhost/');
    await page.evaluate(() => {
        localStorage.setItem('rotary_token', 't-prueba');
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u1', role: 'club_admin', clubId: 'club-bo' }));
    });
    const css = readdirSync('dist/assets').filter(f => f.startsWith('index-') && f.endsWith('.css'));
    if (css[0]) await page.addStyleTag({ content: readFileSync(`dist/assets/${css[0]}`, 'utf8') });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('text=Socios y Junta Directiva', { timeout: 20000 });
    await page.waitForTimeout(300);

    const tarjetas = () => page.locator('div[draggable="true"]').count();
    // El buscador del DIRECTORIO, no el global del panel: los dos empiezan por «Buscar».
    const buscador = page.locator('input[placeholder="Buscar por nombre o cargo..."]');

    check('TODOS pinta las 45 tarjetas', await tarjetas() === 45, String(await tarjetas()));
    check('el resumen dice los 45', (await page.getByTestId('directory-summary').textContent()).includes('Mostrando los 45 socios'));
    check('el final del directorio se dice', (await page.getByTestId('directory-end').textContent()).includes('45 de 45'));
    check('las pestañas llevan su conteo', (await page.locator('button', { hasText: 'ACTIVOS' }).first().textContent()).includes('28'));

    // La última tarjeta es alcanzable desplazando el contenedor del panel.
    const alcanzable = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('div[draggable="true"]')];
        const last = cards[cards.length - 1];
        last.scrollIntoView();
        const r = last.getBoundingClientRect();
        return r.top >= 0 && r.top < window.innerHeight;
    });
    check('la tarjeta 45 se alcanza desplazando', alcanzable);

    await buscador.fill('Perez'); await page.waitForTimeout(150);
    check('«Perez» sin tilde encuentra a los 6 «Pérez»', await tarjetas() === 6, String(await tarjetas()));
    check('el resumen dice 6 de 45 y cita la búsqueda', /Mostrando 6 de 45 socios/.test(await page.getByTestId('directory-summary').textContent()));
    await buscador.fill('ramirez'); await page.waitForTimeout(150);
    check('«ramirez» encuentra a las 6 «Ramírez»', await tarjetas() === 6, String(await tarjetas()));
    await buscador.fill('nadie con este nombre'); await page.waitForTimeout(150);
    check('sin coincidencias, el vacío nombra el total y ofrece volver', /Ninguno de los 45 socios/.test(await page.locator('text=No se encontraron miembros').locator('..').textContent()));
    await page.getByRole('button', { name: 'Ver los 45' }).first().click(); await page.waitForTimeout(150);
    check('«Ver los 45» vuelve a mostrar todo', await tarjetas() === 45 && await buscador.inputValue() === '');
    await page.locator('button', { hasText: 'ACTIVOS' }).first().click(); await page.waitForTimeout(150);
    check('ACTIVOS: 28 tarjetas y el resumen dice 28 de 45', await tarjetas() === 28 && /28 de 45/.test(await page.getByTestId('directory-summary').textContent()));
    check('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
}

console.log(`\n${pass} OK, ${fail} FALLA\n`);
process.exit(fail ? 1 : 0);
