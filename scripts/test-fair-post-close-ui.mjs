#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Edición de proyectos después del cierre, EN UN NAVEGADOR (v4.1330.0)
//
//   FAIR_E2E_DATABASE_URL=postgres://postgres@127.0.0.1:5433/fair npm run test:fair:post-close:ui
//
// Las pantallas reales («Mi Proyecto» del club y Postulaciones del comité)
// contra el servidor REAL del módulo (Express + router de la Feria) y
// Postgres REAL, con la convocatoria CERRADA. En escritorio y en un teléfono
// (390 px) sin desplazamiento horizontal. Se salta sin base local,
// playwright o esbuild. Para las capturas: POST_CLOSE_UI_SHOT=carpeta.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:post-close:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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
if (!CSS) console.log('  (sin dist/assets: las comprobaciones de diseño móvil necesitan `npx vite build`)');
const SHOT = process.env.POST_CLOSE_UI_SHOT || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); }
};

process.env.DATABASE_URL = E2E_DB;
const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, location) VALUES ('evt-ui','XII Feria de Proyectos Rotary Colombia','xii-ui','Valledupar') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-ui','evt-ui', $1::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = EXCLUDED.config`,
[JSON.stringify({ deadline: '2026-11-09', registration: { priceMode: 'COP', amountCop: 250000 } })]);

const sub = async (ref, wf, nombre) => (await db.query(`INSERT INTO "ProjectFairSubmission"
    ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "focusAreaLabel", "amountCop", "appliedAt", "projectIndex")
    VALUES ($1,'evt-ui','Elena','Ortiz',$2,'Club Rotario Valledupar','4271',$3,$4,'pending_payment','+573001234567','water','Agua, Saneamiento e Higiene.',250000,'2026-11-01T10:00:00Z',1) RETURNING *`,
[ref, `${ref.toLowerCase()}@club.org`, nombre, wf])).rows[0];
const P = await sub('FP-UI1', 'received', 'Agua limpia para La Esperanza');
const Q = await sub('FP-UI2', 'in_review', 'Bibliotecas rurales');
const AP = await sub('FP-UI3', 'approved', 'Huertas escolares');
// La Formulación al 53 % y el FDD al 21 %, como en la captura del cliente.
await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", "lastEditedAt") VALUES ($1, $2::jsonb, 53, NOW())`, [P.id, JSON.stringify({
    identificacion: { clubName: 'Club Rotario Valledupar', district: '4271', city: 'Valledupar', projectName: 'Agua limpia para La Esperanza' },
    objetivos: { generalObjective: 'Garantizar agua potable.' },
    contacto: { contactName: 'Elena Ortiz', contactEmail: 'fp-ui1@club.org', contactPhone: '+573001234567' },
})]);
await db.query(`INSERT INTO "ProjectFairProjectForm" ("submissionId", "formKey", answers, "completionPct", "lastEditedAt") VALUES ($1, 'fdd_2026_2027', '{}'::jsonb, 21, NOW())`, [P.id]);
await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", status, "submittedAt", "lastEditedAt") VALUES ($1, $2::jsonb, 100, 'submitted', NOW(), NOW())`, [Q.id, JSON.stringify({
    identificacion: { clubName: 'Club Rotario Valledupar', district: '4271' }, objetivos: { projectDescription: 'Diez bibliotecas.' },
    presupuesto: { budgetTable: { projectCost: { pesos: '1000000' } } },
})]);

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const portalToken = (s) => jwt.sign({ sub: `acc-${s.id}`, submissionId: s.id, email: s.email, aud: 'project-fair-portal' }, SECRET);
const ADMIN = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'club-feria' }, SECRET);

const wrap = (importPath) => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Pantalla from '${importPath}';
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
                        React.createElement(Pantalla)))))));
`;
const bundleOf = async (importPath) => (await build({
    stdin: { contents: wrap(importPath), resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
})).outputFiles[0].text;
const CLUB_JS = await bundleOf('./src/pages/MiProyecto');
const ADMIN_JS = await bundleOf('./src/pages/admin/PostulacionesPagos');

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

const abrir = async ({ viewport, js, path, storage }) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria', settings: [] } }));
    await page.route('**/api/project-fair/**', async r => {
        const u = new URL(r.request().url());
        const resp = await r.fetch({ url: `${API_REAL}${u.pathname}${u.search}`, timeout: 60000 });
        await r.fulfill({ response: resp });
    });
    await page.goto(`http://localhost${path}`);
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, storage);
    await page.addScriptTag({ content: js });
    await page.evaluate((p) => window.go(p), path);
    await page.waitForTimeout(1500);
    return { page, errores };
};
const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name) => { if (SHOT) await page.screenshot({ path: join(SHOT, `${name}.png`), fullPage: false }); };

for (const [nombre, viewport] of [['escritorio', { width: 1280, height: 1100 }], ['teléfono', { width: 390, height: 844 }]]) {
    console.log(`\n▸ Club, «Mi Proyecto», ${nombre}`);
    const { page, errores } = await abrir({ viewport, js: CLUB_JS, path: '/mi-proyecto', storage: { feria_portal_token: portalToken(P) } });
    await page.getByText('Formularios y recursos del proyecto').waitFor({ timeout: 15000 }).catch(() => {});
    const aviso = page.getByText('La convocatoria para nuevas postulaciones ha finalizado. Sin embargo, puedes continuar completando y actualizando la información de tu proyecto registrado.');
    check('el aviso nuevo reemplaza al candado amarillo', await aviso.isVisible() && !(await page.getByText(/El plazo de postulación cerró/).count()));
    check('dice que los cambios quedan para revisión del comité', await page.getByText(/estarán disponibles para revisión por el comité organizador/).isVisible());
    check('la Formulación (53 %) ofrece «Continuar formulario»', await page.getByRole('button', { name: /Formulación del proyecto[\s\S]*Continuar formulario/ }).isVisible());
    check('la Solicitud del FDD (21 %) también', await page.getByRole('button', { name: /Solicitud de Aportes del FDD[\s\S]*Continuar formulario/ }).isVisible());
    check('el plazo dice que se puede seguir editando', await page.getByText(/Postulaciones cerradas · puedes seguir editando/).isVisible());
    check('sin desplazamiento horizontal', await sinScrollHorizontal(page));
    await aviso.scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, `club-mi-proyecto-${viewport.width}`);

    await page.getByRole('button', { name: /Formulación del proyecto[\s\S]*Continuar formulario/ }).click();
    await page.getByText(/puedes seguir completando y actualizando este formulario/).waitFor({ timeout: 10000 }).catch(() => {});
    check('el formulario abre editable, con el aviso posterior al cierre', await page.getByText(/puedes seguir completando y actualizando este formulario/).isVisible());
    await page.getByRole('button', { name: /Objetivos del proyecto/ }).click();
    const desc = page.locator('textarea').nth(1);
    check('los campos se pueden escribir', await desc.isEnabled());
    await desc.fill('Pozos y filtros para 300 familias de la vereda La Esperanza.');
    await page.getByRole('button', { name: /Guardar/ }).first().click();
    await page.waitForTimeout(1200);
    const guardado = (await db.query('SELECT answers, "completionPct" FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', [P.id])).rows[0];
    check('el cambio se guarda en el proyecto existente', guardado.answers.objetivos.projectDescription.startsWith('Pozos y filtros'));
    check('sin desplazamiento horizontal en el formulario', await sinScrollHorizontal(page));
    await shot(page, `club-formulario-${viewport.width}`);
    check('sin errores en la página', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Club, proyecto «En revisión»: campos sensibles bloqueados');
{
    const { page, errores } = await abrir({ viewport: { width: 1280, height: 1100 }, js: CLUB_JS, path: '/mi-proyecto', storage: { feria_portal_token: portalToken(Q) } });
    await page.getByRole('button', { name: /Formulación del proyecto[\s\S]*Ver y editar formulario/ }).click({ timeout: 15000 });
    await page.getByText(/datos sensibles/).waitFor({ timeout: 10000 }).catch(() => {});
    check('un formulario enviado y editable dice «Ver y editar formulario» y explica los bloqueos', await page.getByText(/datos sensibles \(club, presupuesto, montos y contactos\)/).isVisible());
    // La primera sección puede venir abierta: se abre sólo si hace falta.
    if (!(await page.getByText('Requiere autorización del comité').count())) await page.getByRole('button', { name: /Identificación del proyecto/ }).click();
    await page.waitForTimeout(300);
    // El rótulo no envuelve el control: se toma el contenedor MÁS interno que
    // tiene el rótulo «Club Rotario» y su campo.
    const club = page.locator('div', { has: page.locator('label', { hasText: /^Club Rotario/ }) }).filter({ has: page.locator('input') }).last().locator('input').first();
    check('el club llega deshabilitado', await club.isDisabled());
    check('con la marca «Requiere autorización del comité»', (await page.getByText('Requiere autorización del comité').count()) > 0);
    await shot(page, 'club-restringido-1280');
    check('sin errores en la página', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Club, proyecto «Aprobado»: pedir autorización');
{
    const { page, errores } = await abrir({ viewport: { width: 390, height: 844 }, js: CLUB_JS, path: '/mi-proyecto', storage: { feria_portal_token: portalToken(AP) } });
    const pedir = page.getByRole('button', { name: 'Solicitar autorización para editar' }).first();
    await pedir.waitFor({ timeout: 15000 }).catch(() => {});
    check('la tarjeta ofrece «Ver formulario» y «Solicitar autorización para editar»', await pedir.isVisible() && (await page.getByRole('button', { name: /^Ver formulario/ }).count()) > 0);
    check('no aparece el aviso de edición abierta', !(await page.getByText(/Sin embargo, puedes continuar completando/).count()));
    page.once('dialog', d => d.accept('Actualizar el número de beneficiarios'));
    await pedir.click();
    await page.getByText(/Enviamos tu solicitud al comité organizador/).waitFor({ timeout: 10000 }).catch(() => {});
    check('confirma el envío de la solicitud', await page.getByText(/Enviamos tu solicitud al comité organizador/).isVisible());
    await page.waitForTimeout(1200);
    check('la tarjeta pasa a «Edición pendiente de autorización»', (await page.getByText('Edición pendiente de autorización').count()) > 0);
    check('sin desplazamiento horizontal', await sinScrollHorizontal(page));
    await shot(page, 'club-autorizacion-390');
    check('sin errores en la página', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Comité, Postulaciones');
{
    const { page, errores } = await abrir({
        viewport: { width: 1500, height: 1000 }, js: ADMIN_JS, path: '/admin/postulaciones-pagos?evento=evt-ui&tab=submissions',
        storage: { rotary_token: ADMIN, rotary_user: JSON.stringify({ id: 'u', role: 'administrator', clubId: 'club-feria' }) },
    });
    await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => {});
    const filaP = page.locator('tr', { hasText: 'FP-UI1' });
    check('la fila del proyecto editado dice «Cambios pendientes de revisión»', await filaP.getByText(/Cambios pendientes de revisión/).isVisible());
    check('la del aprobado dice que pide autorización', await page.locator('tr', { hasText: 'FP-UI3' }).getByText('Pide autorización para editar').isVisible());
    await page.getByRole('button', { name: /Filtros/ }).first().click().catch(() => {});
    const sel = page.locator('label', { hasText: 'Actualizaciones posteriores al cierre' }).locator('select');
    check('existe el filtro «Actualizaciones posteriores al cierre»', await sel.isVisible());
    await sel.selectOption('sin');
    await page.waitForTimeout(1200);
    check('«Sin actualizaciones» esconde el proyecto editado', !(await page.locator('tr', { hasText: 'FP-UI1' }).count()));
    await sel.selectOption('all');
    await page.waitForTimeout(1200);
    await page.locator('tr', { hasText: 'FP-UI1' }).getByRole('button', { name: /^Ver$/ }).click();
    await page.getByText('Este proyecto fue modificado después del cierre de postulaciones.').waitFor({ timeout: 10000 }).catch(() => {});
    check('la ficha avisa que se modificó después del cierre', await page.getByText('Este proyecto fue modificado después del cierre de postulaciones.').isVisible());
    check('y muestra la última actualización', await page.getByText('Última actualización del proyecto').isVisible());
    await shot(page, 'comite-ficha-1500');
    await page.getByRole('button', { name: 'Marcar cambios como revisados' }).click();
    await page.waitForTimeout(1200);
    const m = (await db.query('SELECT metadata FROM "ProjectFairSubmission" WHERE id = $1', [P.id])).rows[0].metadata;
    check('«Marcar cambios como revisados» lo deja revisado en la base', m.postCloseEdit.pendingReview === false && !!m.postCloseEdit.reviewedBy);
    await page.getByRole('button', { name: /Ver cambios en el historial/ }).click();
    await page.getByText('Edición del club · después del cierre').first().waitFor({ timeout: 10000 }).catch(() => {});
    check('el historial muestra las ediciones del club, campo a campo', (await page.getByText('Edición del club · después del cierre').count()) > 0);
    check('sin errores en la página', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Comité, Convocatoria: la sección de configuración');
{
    const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Card from './src/components/admin/feria/ConvocatoriaConfig';
window.go = () => createRoot(document.getElementById('root')).render(React.createElement(Card, { canEdit: true }));`;
    const js = (await build({ stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic', logLevel: 'silent' })).outputFiles[0].text;
    const { page, errores } = await abrir({ viewport: { width: 390, height: 900 }, js, path: '/admin/config?evento=evt-ui', storage: { rotary_token: ADMIN } });
    const titulo = page.getByRole('heading', { name: 'Edición de proyectos después del cierre' });
    await titulo.waitFor({ timeout: 15000 }).catch(() => {});
    check('la Convocatoria tiene la sección «Edición de proyectos después del cierre»', await titulo.isVisible());
    check('activada por defecto', await page.getByLabel(/Permitir que los proyectos existentes se sigan editando/).isChecked());
    check('ofrece las tres vigencias', (await page.locator('select').filter({ hasText: 'Solo mediante autorización individual' }).count()) === 1);
    // Se mide la SECCIÓN nueva: otras listas de la Convocatoria (con su
    // botón de borrar al lado del campo) ya desbordaban antes de v4.1330.
    const desborde = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h2')].find(x => x.textContent?.includes('Edición de proyectos después del cierre'));
        const sec = h?.closest('section');
        if (!sec) return 'sin sección';
        const malos = [sec, ...sec.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1);
        return malos.length ? malos.slice(0, 3).map(e => e.tagName).join(',') : '';
    });
    check('la sección no se desborda en el teléfono', desborde === '', desborde);
    await titulo.scrollIntoViewIfNeeded();
    await shot(page, 'comite-convocatoria-390');
    check('sin errores en la página', errores.length === 0, errores.join(' | '));
    await page.close();
}

await browser.close();
srv.close();
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:post-close:ui — ${ok} comprobaciones, ${malos.length} fallas.`);
process.exit(malos.length ? 1 : 0);
