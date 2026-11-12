#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Expediente integral del proyecto, EN UN NAVEGADOR.   npm run test:fair:dossier:ui
// v4.1324.0
//
// La pantalla real (PostulacionesPagos) contra el servidor REAL del módulo
// (Express + router de la Feria) y Postgres REAL; la IA se simula en `fetch`
// del propio servidor (formato de Gemini), así no sale nada a la red.
//
//   FAIR_E2E_DATABASE_URL=postgres://postgres@127.0.0.1:55432/fair_e2e npm run test:fair:dossier:ui
//
// Recorre lo que pidió el comité: abrir el proyecto desde «Ver», leer TODO el
// formulario, editar con resumen y motivo, ver el historial, traducir, revisar,
// aprobar, previsualizar y descargar las tres fichas, preparar la libreta,
// descargar fichas en lote, y que un perfil sin permiso no pueda editar ni por
// la interfaz ni pidiéndolo a mano. Y en un teléfono (390 px) sin
// desplazamiento horizontal. Se salta sin base local, playwright o esbuild.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:dossier:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); }
};

process.env.DATABASE_URL = E2E_DB;
process.env.GEMINI_API_KEY = 'clave-de-prueba';
// ── La IA, simulada en el servidor (formato de Gemini) ──
const enviados = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const userText = body.contents.at(-1).parts[0].text;
    enviados.push(userText);
    const { items } = JSON.parse(userText);
    const text = JSON.stringify({ translations: items.map(it => ({ id: it.id, text: `EN: ${it.text}` })) });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-exp','XII Feria de Proyectos Rotary Colombia - Valledupar 2027','xii-exp') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-exp','evt-exp', $1::jsonb) ON CONFLICT (key) DO UPDATE SET config = EXCLUDED.config`,
    [JSON.stringify({ access: { translators: ['traductora@feria.org'] } })]);
const sub = async (ref, nombre, eventId = 'evt-exp') => (await db.query(`INSERT INTO "ProjectFairSubmission"
    ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "projectDescription", "workflowStatus", status, phone, "focusArea", "focusAreaLabel", "amountCop", "appliedAt", "budgetUsd", "idType", "idNumber")
    VALUES ($1,$2,'Paula Andrea','Cruz','paula@x.org','Pereira del Café','Rotary Distrito 4281',$3,'Instalar 12 filtros para 300 familias.','received','paid','+57 3176547111','water','Agua, Saneamiento e Higiene.',250000,NOW(),45000,'cc','1088999999') RETURNING id`,
    [ref, eventId, nombre])).rows[0].id;
const P1 = await sub('FP-EXP001', 'Agua limpia para La Esperanza');
const P2 = await sub('FP-EXP002', 'Bibliotecas rurales');
await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", status) VALUES ($1, $2::jsonb, 60, 'submitted')`, [P1, JSON.stringify({
    identificacion: { clubName: 'Pereira del Café', district: '4281', city: 'Pereira', projectName: 'Agua limpia para La Esperanza', focusAreas: ['Agua, Saneamiento e Higiene.'] },
    objetivos: { generalObjective: 'Garantizar agua potable a 300 familias.', projectDescription: 'Se instalan 12 filtros comunitarios.' },
    necesidades: { needs: 'La vereda no tiene acueducto.' },
    contacto: { contactName: 'Paula Cruz', contactEmail: 'paula@x.org', contactPhone: '+57 3176547111' },
})]);
const pagoAntes = (await db.query('SELECT status, "workflowStatus", "amountCop", "paidAt" FROM "ProjectFairSubmission" WHERE id = $1', [P1])).rows[0];

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const ADMIN = jwt.sign({ id: 'u-admin', email: 'valledupar@feria.org', role: 'administrator', clubId: 'club-feria' }, SECRET);
// Sin sitio asociado: hoy un `editor`/`club_admin` CON sitio resuelve a
// `site_admin` y `isProjectFairSiteAdmin` lo trata como dueño de la Feria
// (defecto preexistente, ver docs/claude/expediente-integral-del-proyecto.md).
const TRADUCTORA = jwt.sign({ id: 'u-tr', email: 'traductora@feria.org', role: 'editor', clubId: null }, SECRET);

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Pantalla from './src/pages/admin/PostulacionesPagos';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, { initialEntries: ['/admin/postulaciones-pagos'] },
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(Pantalla))))));
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
const SHOT = process.env.DOSSIER_UI_SHOT;

const abrir = async (viewport, token, role) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1, acceptDownloads: true });
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
    await page.goto('http://localhost/?evento=evt-exp&tab=submissions');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(([t, r]) => {
        localStorage.setItem('rotary_token', t);
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u', role: r, clubId: 'club-feria' }));
    }, [token, role]);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    return { page, errores };
};
const textoDe = async (download) => readFileSync(await download.path()).toString('latin1');

console.log('\n▸ Administrador, escritorio (1500 px)');
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 }, ADMIN, 'administrator');
    const fila = page.locator('tr', { hasText: 'FP-EXP001' });
    check('la tabla conserva «Ver» y suma el menú «⋯»', await fila.getByRole('button', { name: /^Ver$/ }).isVisible() && await fila.getByRole('button', { name: /Más acciones/ }).isVisible());
    await fila.getByRole('button', { name: /Más acciones/ }).click();
    const menu = page.getByRole('menu');
    await menu.waitFor({ timeout: 5000 }).catch(() => {});
    const items = await menu.getByRole('menuitem').allInnerTexts();
    check('el menú ofrece ver, editar, traducir, los tres PDF y el historial', ['Ver expediente', 'Editar información', 'Traducir al inglés', 'Descargar PDF en español', 'Descargar PDF en inglés', 'Descargar PDF bilingüe', 'Ver historial'].every(t => items.some(i => i.includes(t))), items.join(' | '));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await fila.getByRole('button', { name: /^Ver$/ }).click();
    await page.getByText('Estado de preparación documental').waitFor({ timeout: 10000 });
    const tabs = await page.getByRole('tab').allInnerTexts();
    check('«Ver» abre el expediente con sus pestañas', ['Resumen', 'Formulario completo', 'Documentos', 'Traducción', 'Fichas PDF', 'Libreta', 'Pago', 'Historial'].every(t => tabs.some(x => x.startsWith(t))), tabs.join(' | '));
    const prep = await page.locator('section', { hasText: 'Estado de preparación documental' }).innerText();
    check('el resumen trae la preparación documental', /Original disponible/.test(prep) && /Traducción inglesa/.test(prep) && /Libreta de presentación/.test(prep), prep);

    // Formulario completo
    await page.getByRole('tab', { name: /Formulario completo/ }).click();
    await page.getByRole('heading', { name: 'Formulación del proyecto' }).waitFor();
    check('se ven los formularios reales (Formulación y FDD)', await page.getByRole('heading', { name: 'Formulación del proyecto' }).isVisible() && await page.getByRole('heading', { name: /Solicitud de Aportes del FDD/ }).isVisible());
    check('un campo vacío dice «No informado»', (await page.getByText('No informado').count()) > 5);
    check('se ve el objetivo que escribió el club', await page.getByText('Garantizar agua potable a 300 familias.').isVisible());

    await page.getByRole('button', { name: 'Editar información' }).click();
    const objetivo = page.locator('textarea').filter({ hasText: 'Garantizar agua potable a 300 familias.' }).first();
    await objetivo.fill('Garantizar agua potable a 320 familias de la vereda.');
    check('avisa los cambios sin guardar', await page.getByText(/Tienes 1 cambio\(s\) sin guardar/).isVisible());
    let dialogo = '';
    page.once('dialog', d => { dialogo = d.message(); d.dismiss(); });
    await page.getByRole('tab', { name: /Documentos/ }).click();
    await page.waitForTimeout(200);
    check('cambiar de pestaña con cambios sin guardar pide confirmación (y se queda)', /sin guardar/.test(dialogo) && await page.getByText(/Tienes 1 cambio/).isVisible(), dialogo);
    await page.getByRole('button', { name: /Guardar cambios \(1\)/ }).click();
    const confirmar = page.getByRole('dialog', { name: 'Confirmar cambios' });
    check('antes de guardar muestra el resumen anterior → nuevo', await confirmar.getByText(/320 familias/).isVisible());
    await confirmar.getByRole('button', { name: /Confirmar y guardar/ }).click();
    await page.waitForTimeout(800);
    const m = (await db.query('SELECT answers FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', [P1])).rows[0];
    check('se guardó en la base, mezclado (lo demás intacto)', m.answers.objetivos.generalObjective.includes('320') && m.answers.contacto.contactEmail === 'paula@x.org');

    // Cifras: exige motivo
    await page.getByRole('button', { name: 'Editar información' }).click();
    const presupuesto = page.locator('label', { hasText: /^Presupuesto del proyecto \(US\$\)/ }).locator('xpath=..').locator('input');
    await presupuesto.fill('50000');
    await page.getByRole('button', { name: /Guardar cambios/ }).click();
    const conf2 = page.getByRole('dialog', { name: 'Confirmar cambios' });
    check('cambiar cifras exige motivo (botón inactivo sin él)', await conf2.getByText(/obligatorio: cambian cifras/).isVisible() && await conf2.getByRole('button', { name: /Confirmar y guardar/ }).isDisabled());
    await conf2.locator('textarea').fill('El club corrigió el presupuesto por correo.');
    await conf2.getByRole('button', { name: /Confirmar y guardar/ }).click();
    await page.waitForTimeout(800);
    check('con motivo se guarda', Number((await db.query('SELECT "budgetUsd" FROM "ProjectFairSubmission" WHERE id = $1', [P1])).rows[0].budgetUsd) === 50000);

    // Historial
    await page.getByRole('tab', { name: /Historial/ }).click();
    await page.getByText('Cambios del expediente').waitFor();
    await page.waitForTimeout(500);
    check('el historial muestra antes, después y motivo', await page.getByText('El club corrigió el presupuesto por correo.').first().isVisible() && await page.getByText(/320 familias/).first().isVisible());

    // Traducción
    await page.getByRole('tab', { name: /Traducción/ }).click();
    await page.getByRole('button', { name: /Traducir proyecto al inglés/ }).click();
    await page.getByText('English — Translation').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    check('genera el borrador y muestra las dos columnas', await page.getByText('Español — Original').first().isVisible() && (await page.locator('textarea[aria-label^="Traducción al inglés"]').count()) >= 5);
    check('al proveedor no viajaron el documento, el correo ni el teléfono', enviados.length > 0 && !enviados.join().includes('1088999999') && !enviados.join().includes('paula@x.org') && !enviados.join().includes('3176547111'));
    const tNeeds = page.getByRole('textbox', { name: 'Traducción al inglés de Necesidades' });
    await tNeeds.fill('The rural village has no water supply.');
    await page.getByRole('button', { name: /Guardar borrador \(1\)/ }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Marcar todos como revisados/ }).click();
    await page.waitForTimeout(800);
    check('corregida y revisada → «Revisada»', await page.locator('span', { hasText: /^Revisada$/ }).first().isVisible());
    await page.getByRole('button', { name: /Aprobar versión inglesa/ }).click();
    await page.waitForTimeout(800);
    check('aprobada → «Aprobada» y versión 1', await page.locator('span', { hasText: /^Aprobada$/ }).first().isVisible() && await page.getByText(/Versión 1 ·/).isVisible());

    // Fichas PDF
    await page.getByRole('tab', { name: /Fichas PDF/ }).click();
    await page.getByRole('button', { name: 'Vista previa' }).first().click();
    await page.locator('iframe[title="Vista previa de la ficha"]').waitFor({ timeout: 15000 });
    check('vista previa antes de descargar', await page.locator('iframe[title="Vista previa de la ficha"]').isVisible());
    const descargar = async (i) => {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Descargar' }).nth(i).click()]);
        return { name: dl.suggestedFilename(), text: await textoDe(dl) };
    };
    const es = await descargar(0);
    check('PDF en español: archivo PDF con el texto del expediente', es.text.startsWith('%PDF') && /ficha-es\.pdf$/.test(es.name) && es.text.includes('320 familias'), es.name);
    check('el PDF no lleva el documento de identidad', !es.text.includes('1088999999'));
    const en = await descargar(1);
    check('PDF en inglés: usa la traducción aprobada, sin marca de borrador', en.text.includes('Project Profile') && en.text.includes('The rural village has no water supply.') && !en.text.includes('NOT APPROVED'));
    const bi = await descargar(2);
    check('PDF bilingüe: las dos versiones completas', bi.text.includes('Section 2') && bi.text.includes('La vereda no tiene acueducto.') && bi.text.includes('The rural village has no water supply.'));

    // Libreta
    await page.getByRole('tab', { name: /Libreta/ }).click();
    await page.getByRole('button', { name: /Preparar libreta/ }).click();
    await page.waitForTimeout(600);
    const objetivoLibreta = await page.getByRole('textbox', { name: 'Objetivo principal' }).inputValue();
    check('la libreta copia el objetivo del expediente (no lo inventa)', objetivoLibreta.includes('320 familias'));
    await page.getByRole('textbox', { name: 'Mensaje breve para la presentación' }).fill('Agua potable para una comunidad rural de Risaralda.');
    await page.getByRole('button', { name: /Guardar versión/ }).click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /Aprobar libreta/ }).click();
    await page.waitForTimeout(700);
    check('libreta guardada (v1) y aprobada', await page.getByText(/Versión 1 · Aprobada/).isVisible());

    // Pantalla completa y cierre
    const anchoAntes = await page.locator('[role=tablist]').evaluate(e => e.closest('.overflow-y-auto').getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Ver a pantalla completa' }).click();
    await page.waitForTimeout(300);
    const anchoDespues = await page.locator('[role=tablist]').evaluate(e => e.closest('.overflow-y-auto').getBoundingClientRect().width);
    check('el expediente se expande a pantalla completa', anchoDespues > anchoAntes + 300, `${anchoAntes} → ${anchoDespues}`);
    if (SHOT) await page.screenshot({ path: `${SHOT}/expediente-escritorio.png` });
    await page.getByRole('button', { name: 'Cerrar el expediente' }).click();
    await page.waitForTimeout(700);
    check('al cerrar, la tabla sigue ahí y la fila dice «EN · Aprobada»', await page.locator('tr', { hasText: 'FP-EXP001' }).getByText('EN · Aprobada').isVisible());

    // Lote: dos proyectos → ZIP con dos PDF
    await page.getByRole('button', { name: /^Seleccionar$/ }).click();
    for (const ref of ['FP-EXP001', 'FP-EXP002']) await page.locator('tr', { hasText: ref }).locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /Fichas y traducción/ }).click();
    const lote = page.getByRole('dialog', { name: 'Documentación en lote' });
    await lote.getByText(/Aprobada: 1/).waitFor({ timeout: 10000 }).catch(() => {});
    check('el lote muestra el estado de traducción de la selección', await lote.getByText(/Aprobada: 1/).isVisible() && await lote.getByText(/No iniciada: 1/).isVisible());
    const [zip] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), lote.getByRole('button', { name: /Descargar ZIP/ }).click()]);
    const JSZip = require('jszip');
    const z = await JSZip.loadAsync(readFileSync(await zip.path()));
    check('ZIP con un PDF por proyecto', Object.keys(z.files).length === 2 && Object.keys(z.files).every(n => n.endsWith('.pdf')), Object.keys(z.files).join(', '));
    check('sin errores en consola', !errores.length, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Traductora (perfil sin edición)');
{
    const { page, errores } = await abrir({ width: 1280, height: 900 }, TRADUCTORA, 'editor');
    await page.locator('tr', { hasText: 'FP-EXP001' }).getByRole('button', { name: /Más acciones/ }).click();
    const items = await page.getByRole('menu').getByRole('menuitem').allInnerTexts();
    check('su menú no ofrece «Editar información»', !items.some(i => i.includes('Editar información')) && items.some(i => i.includes('Traducir al inglés')), items.join(' | '));
    await page.keyboard.press('Escape');
    await page.locator('tr', { hasText: 'FP-EXP001' }).getByRole('button', { name: /^Ver$/ }).click();
    await page.getByRole('tab', { name: /Formulario completo/ }).click();
    await page.getByRole('heading', { name: 'Formulación del proyecto' }).waitFor();
    check('en el formulario no hay botón para editar', (await page.getByRole('button', { name: 'Editar información' }).count()) === 0);
    const directo = await page.evaluate(async (id) => {
        const r = await fetch(`/api/project-fair/admin/postulaciones/${id}/expediente?evento=evt-exp`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('rotary_token')}` }, body: JSON.stringify({ edits: [{ path: 'master.necesidades.needs', value: 'Pisado' }] }) });
        return r.status;
    }, P1);
    check('pedirlo a mano al servidor también se rechaza (403)', directo === 403, String(directo));
    await page.getByRole('tab', { name: /Traducción/ }).click();
    await page.getByText('Español — Original').first().waitFor();
    check('puede traducir pero no aprobar', (await page.getByRole('button', { name: /Aprobar versión inglesa/ }).count()) === 0 && (await page.getByRole('button', { name: /Regenerar pendientes/ }).count()) === 1);
    check('sin errores en consola', !errores.length, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Teléfono (390 px)');
{
    const { page, errores } = await abrir({ width: 390, height: 844 }, ADMIN, 'administrator');
    await page.locator('tr', { hasText: 'FP-EXP001' }).getByRole('button', { name: /^Ver$/ }).click();
    await page.getByText('Estado de preparación documental').waitFor({ timeout: 10000 });
    for (const t of ['Formulario completo', 'Traducción', 'Fichas PDF']) {
        await page.getByRole('tab', { name: new RegExp(t) }).click();
        await page.waitForTimeout(700);
        const sobra = await page.evaluate(() => {
            const panel = document.querySelector('[role=tablist]')?.closest('.overflow-y-auto');
            return { doc: document.documentElement.scrollWidth - window.innerWidth, panel: panel ? panel.scrollWidth - panel.clientWidth : 0 };
        });
        check(`«${t}» sin desplazamiento horizontal`, sobra.doc <= 1 && sobra.panel <= 1, JSON.stringify(sobra));
    }
    await page.getByRole('tab', { name: /Traducción/ }).click();
    await page.waitForTimeout(500);
    const columnas = await page.getByText('Español — Original').first().evaluate(e => getComputedStyle(e.parentElement.parentElement).gridTemplateColumns.split(' ').length);
    check('en el teléfono las columnas se apilan', columnas === 1, String(columnas));
    if (SHOT) await page.screenshot({ path: `${SHOT}/expediente-movil.png` });
    check('sin errores en consola', !errores.length, errores.join(' | '));
    await page.close();
}

const pagoDespues = (await db.query('SELECT status, "workflowStatus", "amountCop", "paidAt" FROM "ProjectFairSubmission" WHERE id = $1', [P1])).rows[0];
check('nada de esto tocó el pago ni el estado de la postulación', JSON.stringify(pagoAntes) === JSON.stringify(pagoDespues));

await browser.close();
srv.close();
await db.pool.end().catch(() => {});
globalThis.fetch = realFetch;
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:dossier:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
