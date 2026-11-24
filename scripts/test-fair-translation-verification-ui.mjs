#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Traducción verificada por Cadre, EN UN NAVEGADOR.
//                         npm run test:fair:translation-verification:ui
// v4.1356.0
//
// La pantalla real (PostulacionesPagos) contra el servidor REAL del módulo
// (Express + router de la Feria) y Postgres REAL; la IA y el correo se
// simulan en el propio servidor, así no sale nada a la red.
//
//   FAIR_E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/tr_ui npm run test:fair:translation-verification:ui
//
// Recorre: la columna «Traducción EN» y el bloque de indicadores; abrir la
// traducción desde la celda; traducir, revisar y VERIFICAR con la ventana de
// confirmación; la insignia «EN ✓» junto al nombre con su información (cursor
// y teclado); que el Cadre verifique y el traductor no; que un cambio del club
// retire la insignia y deje «Requiere actualización»; los filtros desde las
// tarjetas; y el teléfono (390 px) sin desplazamiento horizontal. Necesita
// `dist/assets` (npx vite build) para el CSS. Se salta sin base local.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:translation-verification:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
    process.exit(0);
}
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
if (!CSS) console.log('  (sin dist/assets: las comprobaciones de diseño necesitan `npx vite build`)');

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); }
};

process.env.DATABASE_URL = E2E_DB;
process.env.GEMINI_API_KEY = 'clave-de-prueba';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const { items } = JSON.parse(body.contents.at(-1).parts[0].text);
    const text = JSON.stringify({ translations: items.map(it => ({ id: it.id, text: `EN: ${it.text}` })) });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: EmailService } = await import(`${REPO}/server/services/EmailService.js`);
const correos = [];
EmailService.sendPlatformEmail = async ({ to, subject, html }) => { correos.push({ to, subject, html }); return { success: true, id: `m${correos.length}` }; };
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-tru','XII Feria de Proyectos Rotary Colombia','xii-tru') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
const { checkTranslationValidity } = await import(`${REPO}/server/lib/translationTrackingStore.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-tru','evt-tru', $1::jsonb) ON CONFLICT (key) DO UPDATE SET config = EXCLUDED.config`,
    [JSON.stringify({ access: { cadres: ['cadre@feria.org'], translators: ['traductora@feria.org'] } })]);
await db.query(`DELETE FROM "ProjectFairSubmission" WHERE "eventId" = 'evt-tru'`);
const sub = async (ref, nombre, desc) => (await db.query(`INSERT INTO "ProjectFairSubmission"
    ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "projectDescription", "workflowStatus", status, phone, "focusArea", "focusAreaLabel", "amountCop", "appliedAt", "budgetUsd")
    VALUES ($1,'evt-tru','Paula Andrea','Cruz',$4,'Pereira del Café','Rotary Distrito 4281',$2,$3,'received','paid','+57 3176547111','water','Agua, Saneamiento e Higiene.',250000,NOW(),45000) RETURNING id`,
    [ref, nombre, desc, `${ref.toLowerCase()}@club.org`])).rows[0].id;
const P1 = await sub('FP-TRU001', 'Cuna de Vida', 'Dotación de unidades neonatales para dos hospitales de Pereira.');
const P2 = await sub('FP-TRU002', 'Agua para comunidades', 'Filtros comunitarios para 300 familias de la vereda.');
await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", status) VALUES ($1, $2::jsonb, 60, 'submitted')`, [P1, JSON.stringify({
    objetivos: { generalObjective: 'Reducir la mortalidad neonatal en Pereira tras el terremoto.' },
})]);
const pagoAntes = (await db.query('SELECT id, status, "workflowStatus", "amountCop", "paidAt" FROM "ProjectFairSubmission" WHERE "eventId" = $1 ORDER BY id', ['evt-tru'])).rows;

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const ADMIN = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'club-feria' }, SECRET);
const CADRE = jwt.sign({ id: 'u-cadre', email: 'cadre@feria.org', role: 'editor', clubId: null }, SECRET);
const TRADUCTORA = jwt.sign({ id: 'u-tr', email: 'traductora@feria.org', role: 'editor', clubId: null }, SECRET);

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Pantalla from './src/pages/admin/PostulacionesPagos';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { Toaster } from 'sonner';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, { initialEntries: ['/admin/postulaciones-pagos'] },
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(React.Fragment, null, React.createElement(Pantalla), React.createElement(Toaster)))))));
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
});

const browser = await chromium.launch();
const SHOT = process.env.TRANSLATION_UI_SHOT;

const abrir = async (viewport, token, role) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 300)); });
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria', settings: [] } }));
    await page.route('**/api/project-fair/**', async r => {
        const u = new URL(r.request().url());
        const resp = await r.fetch({ url: `${API_REAL}${u.pathname}${u.search}`, timeout: 60000 });
        await r.fulfill({ response: resp });
    });
    await page.goto('http://localhost/?evento=evt-tru&tab=submissions');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(([t, r]) => {
        localStorage.setItem('rotary_token', t);
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u', role: r, clubId: 'club-feria' }));
        localStorage.setItem('pp-tr-open', '1');
    }, [token, role]);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(900);
    return { page, errores };
};
const fila = (page, ref) => page.locator('tr', { hasText: ref });

console.log('\n▸ Administrador, escritorio (1500 px)');
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 }, ADMIN, 'administrator');
    check('la tabla tiene la columna «Traducción EN»', await page.locator('thead').getByRole('button', { name: 'Traducción EN', exact: true }).isVisible());
    check('cada fila dice su estado: «Sin traducir»', (await fila(page, 'FP-TRU001').innerText()).includes('Sin traducir'));
    const bloque = page.locator('section', { hasText: 'Seguimiento de traducciones' });
    check('el bloque «Seguimiento de traducciones» con el avance general', await bloque.isVisible() && /0 de 2 verificadas/.test(await bloque.innerText()), await bloque.innerText().catch(() => ''));
    check('sin verificar, ningún proyecto lleva la insignia', (await page.getByRole('button', { name: /Traducción inglesa verificada de/ }).count()) === 0);

    // Abrir la traducción desde la celda
    await fila(page, 'FP-TRU001').getByRole('button', { name: /Traducción al inglés de Cuna de Vida/ }).click();
    await page.getByText('Traducción inglesa', { exact: true }).waitFor({ timeout: 10000 });
    const verificar = page.getByRole('button', { name: 'Verificar traducción' });
    check('la celda abre la pestaña «Traducción» con «Verificar traducción» inactivo', await verificar.isVisible() && await verificar.isDisabled());
    await page.getByRole('button', { name: /Traducir proyecto al inglés/ }).click();
    await page.getByText('Generada por IA').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
    check('generada por IA: Pendiente de revisión y revisión 0 %', /Revisión\s*0 %/.test(await page.locator('section', { hasText: 'Traducción inglesa' }).first().innerText()));
    check('cada campo dice que lo generó la IA', (await page.getByText('Generada por IA').count()) >= 2);
    check('sin revisar, verificar sigue inactivo y dice por qué', await verificar.isDisabled() && await page.getByText(/Para verificar: Faltan \d+ campo\(s\) por marcar como revisados/).isVisible());
    await page.getByRole('button', { name: /Marcar todos como revisados/ }).click();
    await page.waitForTimeout(1200);
    check('todo revisado: «Verificar traducción» se habilita', await verificar.isEnabled());
    // Un cambio sin guardar bloquea
    await page.getByLabel(/Traducción al inglés de Nombre del proyecto/).fill('Cradle of Life');
    check('con un cambio sin guardar, verificar se bloquea y lo dice', await verificar.isDisabled() && await page.getByText(/sin guardar: guárdalos antes de verificar/).isVisible());
    await page.getByLabel(/Traducción al inglés de Nombre del proyecto/).fill('EN: Cuna de Vida');
    // Editar el texto deshace «Revisado» de ese campo: hay que volver a marcarlo.
    await page.getByRole('article', { name: 'Traducción de Nombre del proyecto' }).getByRole('checkbox', { name: 'Revisado', exact: true }).check();
    await page.getByRole('button', { name: /Guardar borrador/ }).click();
    await page.waitForTimeout(1200);
    check('guardado, vuelve a estar habilitado', await verificar.isEnabled());
    await verificar.click();
    const dialogo = page.getByRole('dialog', { name: /Confirmas la verificación de la traducción/ });
    await dialogo.waitFor({ timeout: 5000 });
    const txt = await dialogo.innerText();
    check('la ventana muestra proyecto, traducidos, revisados, avisos, responsable y versión', ['Cuna de Vida', 'Campos traducidos', 'Campos revisados', 'Avisos pendientes', 'admin@feria.org', 'Versión'].every(t => txt.includes(t)), txt);
    check('… y el texto de la certificación', /conserva el sentido, la precisión y el contexto/.test(txt));
    if (SHOT) await page.screenshot({ path: `${SHOT}/verificar-dialogo.png` });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    check('«Cancelar» no verifica', (await db.query(`SELECT COUNT(*)::int AS n FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1`, [P1])).rows[0].n === 0);
    await verificar.click();
    await dialogo.getByRole('button', { name: 'Confirmar verificación' }).click();
    await page.getByText(/Traducción verificada/).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const panel = await page.locator('section', { hasText: 'Traducción inglesa' }).first().innerText();
    check('confirmado: «Verificada», por quién, versión 1, vigente', /Verificada/.test(panel) && /admin@feria\.org/.test(panel) && /versión 1/.test(panel) && /vigente/.test(panel), panel);
    check('el historial de verificación lo registra', await page.getByText('Historial de verificación').isVisible() && (await page.getByText(/^Traducción verificada$/).count()) >= 1);
    check('la pestaña del expediente dice «Verificada»', /Verificada/.test(await page.getByRole('tab', { name: /Traducción/ }).innerText()));
    if (SHOT) await page.screenshot({ path: `${SHOT}/traduccion-verificada.png` });
    // Cerrar el expediente
    // Cerrar el expediente: clic en el velo, fuera de la ficha.
    await page.mouse.click(20, 500);
    await page.waitForTimeout(1500);

    // La insignia
    const insignia = page.getByRole('button', { name: 'Traducción inglesa verificada de Cuna de Vida' }).first();
    check('la insignia «EN ✓» aparece junto al nombre del proyecto verificado', await insignia.isVisible() && /EN/.test(await insignia.innerText()));
    check('… y no en el que no lo está', (await fila(page, 'FP-TRU002').getByRole('button', { name: /Traducción inglesa verificada/ }).count()) === 0);
    await insignia.hover();
    const tip = page.getByRole('tooltip');
    await tip.waitFor({ timeout: 3000 }).catch(() => {});
    const tipTxt = await tip.innerText().catch(() => '');
    check('al pasar el cursor: quién, fecha, campos, versión y vigencia', ['Traducción inglesa verificada', 'admin@feria.org', 'Fecha', 'revisados', 'Versión', 'Vigente'].every(t => tipTxt.includes(t)), tipTxt);
    check('… y aclara que no aprueba el proyecto', /No es una aprobación técnica, financiera ni administrativa/.test(tipTxt));
    if (SHOT) await page.screenshot({ path: `${SHOT}/insignia.png`, clip: { x: 0, y: 0, width: 1500, height: 1000 } });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    await insignia.focus();
    await page.waitForTimeout(200);
    check('con el teclado (foco) también se muestra', await page.getByRole('tooltip').isVisible());
    await page.keyboard.press('Escape');
    const celda = await fila(page, 'FP-TRU001').innerText();
    check('la columna dice «Verificada» con traducción y revisión al 100 %', /Verificada/.test(celda) && (celda.match(/100 %/g) || []).length >= 2, celda);
    const blq = await page.locator('section', { hasText: 'Seguimiento de traducciones' }).innerText();
    check('los indicadores: 1 de 2 verificadas · 50 %', /1 de 2 verificadas/.test(blq) && /50 %/.test(blq), blq);

    // Tarjetas como filtros
    await page.locator('section', { hasText: 'Seguimiento de traducciones' }).getByRole('button', { name: /Sin traducir/ }).click();
    await page.waitForTimeout(1200);
    const refs = await page.locator('tbody tr').allInnerTexts();
    check('la tarjeta «Sin traducir» filtra la tabla', refs.length === 1 && refs[0].includes('FP-TRU002'), refs.join(' | '));
    await page.locator('section', { hasText: 'Seguimiento de traducciones' }).getByRole('button', { name: /Proyectos con textos/ }).click();
    await page.waitForTimeout(1000);
    check('errores de consola: ninguno', !errores.length, errores.join(' | '));
    await page.close();
}

console.log('\n▸ El club cambia un texto ya verificado');
{
    await db.query(`UPDATE "ProjectFairMasterForm" SET answers = jsonb_set(answers, '{objetivos,generalObjective}', '"Reducir la mortalidad neonatal en Pereira y Dosquebradas."') WHERE "submissionId" = $1`, [P1]);
    await checkTranslationValidity(P1);
    const { page, errores } = await abrir({ width: 1500, height: 1000 }, ADMIN, 'administrator');
    check('la insignia desaparece', (await page.getByRole('button', { name: /Traducción inglesa verificada de Cuna de Vida/ }).count()) === 0);
    check('la columna dice «Requiere actualización»', /Requiere actualización/.test(await fila(page, 'FP-TRU001').innerText()));
    await fila(page, 'FP-TRU001').getByRole('button', { name: /Traducción al inglés de Cuna de Vida/ }).click();
    await page.getByText(/Requiere actualización: el original cambió/).waitFor({ timeout: 10000 });
    check('la pestaña explica qué campo cambió', /Objetivo general/i.test(await page.getByText(/Campos afectados/).first().innerText()));
    check('hay acceso directo a revisar sólo los afectados', await page.getByRole('button', { name: 'Ver campos afectados' }).isVisible());
    check('el administrador puede revocar', await page.getByRole('button', { name: /Revocar la verificación/ }).isVisible());
    if (SHOT) await page.screenshot({ path: `${SHOT}/requiere-actualizacion.png` });
    check('errores de consola: ninguno', !errores.length, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Cadre y traductora');
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 }, CADRE, 'editor');
    await fila(page, 'FP-TRU002').getByRole('button', { name: /Traducción al inglés de Agua para comunidades/ }).click();
    await page.getByText('Traducción inglesa', { exact: true }).waitFor({ timeout: 10000 });
    check('el Cadre ve «Verificar traducción»', await page.getByRole('button', { name: 'Verificar traducción' }).isVisible());
    check('el Cadre no ve «Revocar» ni asigna', (await page.getByRole('button', { name: /Revocar/ }).count()) === 0);
    check('errores de consola: ninguno', !errores.length, errores.join(' | '));
    await page.close();
}
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 }, TRADUCTORA, 'editor');
    await fila(page, 'FP-TRU002').getByRole('button', { name: /Traducción al inglés de Agua para comunidades/ }).click();
    await page.getByText('Traducción inglesa', { exact: true }).waitFor({ timeout: 10000 });
    check('la traductora NO ve «Verificar traducción»', (await page.getByRole('button', { name: 'Verificar traducción' }).count()) === 0);
    check('… ni «Asignar Cadre» en el bloque', (await page.getByRole('button', { name: /Asignar Cadre/ }).count()) === 0);
    check('errores de consola: ninguno', !errores.length, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Teléfono (390 px)');
{
    const { page, errores } = await abrir({ width: 390, height: 844 }, ADMIN, 'administrator');
    await page.waitForSelector('ul[aria-label="Proyectos postulados"] li', { timeout: 10000 }).catch(() => {});
    const tarjeta = page.locator('ul[aria-label="Proyectos postulados"] li', { hasText: 'FP-TRU001' });
    const tarjetaTxt = await tarjeta.innerText().catch(e => `ERROR ${e.message}`);
    check('la tarjeta móvil trae la traducción', /Traducción EN/i.test(tarjetaTxt) && /Requiere actualización/.test(tarjetaTxt), tarjetaTxt);
    await tarjeta.scrollIntoViewIfNeeded().catch(() => {});
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('sin desplazamiento horizontal', sobra <= 1, String(sobra));
    if (SHOT) await page.screenshot({ path: `${SHOT}/movil.png` });
    check('errores de consola: ninguno', !errores.length, errores.join(' | '));
    await page.close();
}

const pagoDespues = (await db.query('SELECT id, status, "workflowStatus", "amountCop", "paidAt" FROM "ProjectFairSubmission" WHERE "eventId" = $1 ORDER BY id', ['evt-tru'])).rows;
check('nada de esto tocó pagos ni estados de postulación', JSON.stringify(pagoAntes) === JSON.stringify(pagoDespues));

await browser.close();
srv.close();
await db.pool.end().catch(() => {});
globalThis.fetch = realFetch;
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:translation-verification:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
