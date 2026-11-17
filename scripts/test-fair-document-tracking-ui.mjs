#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Seguimiento documental, EN UN NAVEGADOR (v4.1332.0)
//
//   FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:document-tracking:ui
//
// Las pantallas reales (Proyectos postulados del comité y «Mi Proyecto» del
// club) contra el servidor REAL del módulo y Postgres REAL. Escritorio y
// teléfono (390 px) sin desplazamiento horizontal. Se salta sin base local,
// playwright o esbuild. Capturas: DOC_UI_SHOT=carpeta.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:document-tracking:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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
const SHOT = process.env.DOC_UI_SHOT || '';
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
const { default: EmailService } = await import(`${REPO}/server/services/EmailService.js`);
const mails = [];
EmailService.sendPlatformEmail = async (m) => { mails.push(m); return { success: true }; };
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, location) VALUES ('evt-doc','XII Feria de Proyectos Rotary Colombia','xii-doc','Valledupar') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
const DEADLINE = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-doc','evt-doc', $1::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = EXCLUDED.config`,
[JSON.stringify({ registration: { priceMode: 'COP', amountCop: 250000 }, documentTracking: { deadline: DEADLINE } })]);

const sub = async (ref, nombre, email) => (await db.query(`INSERT INTO "ProjectFairSubmission"
    ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "focusAreaLabel", "amountCop", "appliedAt", "projectIndex")
    VALUES ($1,'evt-doc','Paula','Cruz',$2,'Club Rotario Pereira del Café','4281',$3,'received','pending_payment','+573176547111','education','Educación Básica y Alfabetización',250000,NOW(),1) RETURNING *`,
[ref, email, nombre])).rows[0];
const P = await sub('FP-DOC1', 'Dotación escolar para la vereda La Esperanza', 'paula@club.org');
const Q = await sub('FP-DOC2', 'Dotación hospital neonatal', 'paula@club.org');
await db.query(`INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName") VALUES ($1,'acc1@club.org','!','Pereira')`, [P.id]);
await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", "lastEditedAt") VALUES ($1, $2::jsonb, 0, NOW())`, [P.id, JSON.stringify({
    identificacion: { clubName: 'Club Rotario Pereira del Café', district: '4281', city: 'Pereira', projectName: 'Dotación escolar' },
    objetivos: { generalObjective: 'Dotar 4 escuelas.', projectDescription: 'Mobiliario y textos.' },
    contacto: { contactName: 'Paula Cruz', contactEmail: 'correo-mal', contactPhone: '+57 317 654 7111' },
})]);

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const portalToken = (s) => jwt.sign({ sub: `acc-${s.id}`, submissionId: s.id, email: s.email, aud: 'project-fair-portal' }, SECRET);
const ADMIN = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'club-feria' }, SECRET);

const wrap = (importPath, props = '') => `
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
                        React.createElement(Pantalla, ${props || 'null'})))))));
`;
const bundleOf = async (importPath, props) => (await build({
    stdin: { contents: wrap(importPath, props), resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
})).outputFiles[0].text;
const CLUB_JS = await bundleOf('./src/pages/MiProyecto');
const ADMIN_JS = await bundleOf('./src/pages/admin/PostulacionesPagos', "{ embedded: true, eventId: 'evt-doc' }");

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
    await page.waitForTimeout(1800);
    return { page, errores };
};
const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name, full = false) => { if (SHOT) await page.screenshot({ path: join(SHOT, `${name}.png`), fullPage: full }); };

try {
    console.log('\n▸ Comité, Proyectos postulados, escritorio');
    {
        const { page, errores } = await abrir({ viewport: { width: 1500, height: 1100 }, js: ADMIN_JS, path: '/admin/dashboard?panel=proyectos&evento=evt-doc', storage: { rotary_token: ADMIN } });
        const strip = page.getByRole('heading', { name: /Seguimiento documental/ });
        await strip.waitFor({ timeout: 20000 }).catch(() => {});
        check('la franja «Seguimiento documental» aparece sobre la tabla', await strip.isVisible());
        check('con la fecha límite de la edición', await page.getByText(/Fecha límite documental:/).isVisible());
        check('indicadores: «Documentación incompleta» con su número', await page.getByRole('button', { name: /Documentación incompleta/ }).isVisible());
        const formCell = page.getByRole('button', { name: /^Formulación de Dotación escolar[^:]*: \d+ %/ });
        check('la celda de Formulación dice porcentaje y estado en texto', await formCell.isVisible());
        const lbl = await formCell.getAttribute('aria-label');
        const portal = await (await fetch(`${API_REAL}/api/project-fair/portal/forms`, { headers: { Authorization: `Bearer ${portalToken(P)}` } })).json();
        const clubPct = portal.forms.find(f => f.key === 'master').completionPct;
        check(`la cifra del panel es la de «Mi Proyecto» (${clubPct} %)`, lbl.includes(`${clubPct} %`), lbl);
        check('hay barras accesibles con su valor', (await page.locator('[role="progressbar"][aria-valuenow]').count()) >= 4);
        check('la presentación dice «Pendiente» y el Video Pitch va aparte', await page.getByRole('button', { name: /Presentación de Dotación escolar[^:]*: Pendiente/ }).isVisible() && (await page.getByText('No solicitado').count()) > 0);
        check('semáforo: vence en 2 días', (await page.getByText(/Vence en 2 días/).count()) > 0);
        await shot(page, 'comite-tabla-1500');

        await formCell.click();
        await page.getByRole('dialog', { name: /Dotación escolar/ }).waitFor({ timeout: 10000 }).catch(() => {});
        const dlg = page.getByRole('dialog', { name: /Dotación escolar/ });
        check('el detalle abre con el proyecto, el club y el responsable', await dlg.isVisible() && await dlg.getByText(/paula@club.org/).isVisible());
        check('nombra secciones y campos pendientes', (await dlg.getByText(/Campos obligatorios pendientes/).count()) > 0);
        await dlg.getByText(/Campos obligatorios pendientes/).first().click();
        check('… incluido el correo con formato incorrecto', await dlg.getByText(/Email: Escribe un correo electrónico válido/).isVisible());
        check('validar un formulario incompleto está deshabilitado', await dlg.getByRole('button', { name: 'Validar' }).first().isDisabled());
        await shot(page, 'comite-detalle-1500');
        await dlg.getByRole('button', { name: 'No aplica a este proyecto' }).nth(1).click();
        await dlg.locator('textarea').fill('El club no solicita FDD en este período.');
        await dlg.getByRole('button', { name: 'Guardar' }).click();
        await page.waitForTimeout(1500);
        check('«No aplica» al FDD con motivo: el detalle lo muestra', await dlg.getByText(/Motivo: El club no solicita FDD/).isVisible());
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1200);
        check('la tabla se actualiza: FDD «No aplica»', await page.getByRole('button', { name: /FDD de Dotación escolar[^:]*: no aplica/ }).isVisible());

        await page.getByRole('button', { name: 'Recordatorios de documentación' }).click();
        const rem = page.getByRole('dialog', { name: 'Recordatorios de documentación' });
        await rem.getByRole('button', { name: /Preparar vista previa/ }).click();
        await rem.getByText(/correo\(s\) a enviar/).waitFor({ timeout: 15000 }).catch(() => {});
        check('vista previa: un correo para los dos proyectos del mismo responsable', (await rem.getByText(/paula@club.org/).count()) > 0 && await rem.getByText(/FP-DOC1[\s\S]*FP-DOC2|FP-DOC2[\s\S]*FP-DOC1/).first().isVisible());
        check('la vista previa muestra el correo real', await rem.locator('iframe[title="Vista previa del correo"]').isVisible());
        check('«Confirmar y enviar» exige marcar la revisión', await rem.getByRole('button', { name: /Confirmar y enviar/ }).isDisabled());
        await shot(page, 'comite-recordatorios-1500');
        await rem.getByRole('checkbox').check();
        await rem.getByRole('button', { name: /Confirmar y enviar/ }).click();
        await rem.getByText(/Resultado:/).waitFor({ timeout: 15000 }).catch(() => {});
        check('envío confirmado: un correo', mails.length === 1 && mails[0].to === 'paula@club.org');
        await rem.getByRole('tab', { name: 'Registro de envíos' }).click();
        await page.waitForTimeout(800);
        check('el registro de envíos lo lista como «Enviado»', (await rem.getByText('Enviado').count()) > 0);
        await rem.getByRole('button', { name: 'Cerrar' }).click();

        await page.getByRole('button', { name: /Contraer columnas/ }).click();
        check('el grupo de columnas se contrae (queda el avance global)', !(await page.getByRole('button', { name: /^Formulación de Dotación escolar/ }).count()) && await page.getByRole('button', { name: /Avance documental de Dotación escolar/ }).isVisible());
        await page.getByRole('button', { name: /Expandir columnas/ }).click();
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }

    console.log('\n▸ Comité, teléfono (390 px)');
    {
        const { page, errores } = await abrir({ viewport: { width: 390, height: 844 }, js: ADMIN_JS, path: '/admin/dashboard?panel=proyectos&evento=evt-doc', storage: { rotary_token: ADMIN } });
        await page.getByRole('heading', { name: /Seguimiento documental/ }).waitFor({ timeout: 20000 }).catch(() => {});
        check('tarjetas con el avance documental en vez de la tabla', await page.getByRole('button', { name: /Abrir seguimiento documental de Dotación escolar/ }).isVisible());
        if (CSS) check('sin desplazamiento horizontal', await sinScrollHorizontal(page));
        await shot(page, 'comite-telefono-390', true);
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }

    for (const [nombre, viewport] of [['escritorio', { width: 1280, height: 1100 }], ['teléfono', { width: 390, height: 844 }]]) {
        console.log(`\n▸ Club, «Mi Proyecto», ${nombre}`);
        const { page, errores } = await abrir({ viewport, js: CLUB_JS, path: '/mi-proyecto', storage: { feria_portal_token: portalToken(P) } });
        await page.getByRole('heading', { name: 'Avance documental del proyecto' }).waitFor({ timeout: 20000 }).catch(() => {});
        check('el panel «Avance documental del proyecto» aparece', await page.getByRole('heading', { name: 'Avance documental del proyecto' }).isVisible());
        const st = await (await fetch(`${API_REAL}/api/project-fair/portal/document-status`, { headers: { Authorization: `Bearer ${portalToken(P)}` } })).json();
        check(`muestra la misma cifra que el comité (${st.tracking.overallPct} %)`, (await page.getByRole('progressbar', { name: `Avance documental: ${st.tracking.overallPct} %` }).count()) === 1);
        check('el FDD marcado «No aplica» no aparece como pendiente', !(await page.getByText('Solicitud de Aportes del FDD', { exact: false }).locator('xpath=ancestor::li').count()));
        check('la tarjeta «Entrega de la presentación del proyecto» está', await page.getByText('Entrega de la presentación del proyecto').isVisible());
        check('con su botón de carga', await page.getByText('Cargar presentación').isVisible());
        if (CSS) check('sin desplazamiento horizontal', await sinScrollHorizontal(page));
        await shot(page, `club-mi-proyecto-${viewport.width}`, true);
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }
} finally {
    await browser.close();
    srv.close();
}
console.log(`\n${malos.length ? '❌' : '✅'} ${ok} comprobaciones en verde${malos.length ? `, ${malos.length} fallidas: ${malos.join(' · ')}` : ''}.`);
process.exit(malos.length ? 1 : 0);
