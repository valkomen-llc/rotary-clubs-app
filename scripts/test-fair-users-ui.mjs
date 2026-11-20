#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// «Usuarios» de la Feria EN UN NAVEGADOR (v4.1342.0)
//
//   FAIR_E2E_DATABASE_URL=postgres://postgres@127.0.0.1:5433/fair npm run test:fair:users:ui
//
// La pestaña real contra el servidor REAL del módulo (Express + router de la
// Feria) y Postgres REAL: buscar a Mónica Gaitán, abrir su cuenta, generar
// una contraseña y entrar con ella; enlace de restablecimiento; la cuenta
// vinculada sin opción de clave. En 1280 y 390 px sin desplazamiento
// horizontal. Se salta sin base local, playwright, esbuild o dist/assets.
// Capturas: USERS_UI_SHOT=carpeta.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:users:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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
if (!CSS) { console.log('… se salta: falta dist/assets (correr `npx vite build`)'); process.exit(0); }
const SHOT = process.env.USERS_UI_SHOT || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });

process.env.DATABASE_URL = E2E_DB;
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-ui','XII Feria','xii') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
const { ensureEventRegistrationSchema } = await import(`${REPO}/server/lib/ensureEventRegistrationSchema.js`);
await ensureTables();
await ensureEventRegistrationSchema();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-ui','evt-ui', '{"deadline":"2026-11-09"}'::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO NOTHING`);
const sub = (await db.query(`
    INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "projectIndex")
    VALUES ('FP-J2WJZQ','evt-ui','Mónica','Gaitán','mgaitanr77@gmail.com','Cali','4281','CENTRO DE REHABILITACIÓN DE ALTA TECNOLOGÍA PARA PERSONAS CON AUTISMO Y DISCAPACIDADES','received','paid','+57 3126198537','salud',250000,1) RETURNING *`)).rows[0];
const acc = (await db.query(`INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName") VALUES ($1,$2,$3,'Cali') RETURNING *`,
    [sub.id, sub.email, await bcrypt.hash('Olvidada2026', 10)])).rows[0];
const linked = (await db.query(`INSERT INTO "EventAttendeeAccount" (email, "passwordHash", "firstName", "lastName", status, "linkedRealm", "linkedId") VALUES ('mgaitanr77+evento@gmail.com', '!', 'Mónica', 'Gaitán (evento)', 'active', 'portal', $1) RETURNING *`, [acc.id])).rows[0];
await db.query(`INSERT INTO "EventRegistration" ("eventId", email, "firstName", "lastName", "accountId", status, "clubName") VALUES ('evt-ui', $1, 'Mónica', 'Gaitán', $2, 'confirmed', 'Cali')`, [linked.email, linked.id]);

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BACK = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const ADMIN = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'c1' }, SECRET);

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import UsuariosFeria from './src/components/admin/feria/UsuariosFeria';
window.go = () => createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
    React.createElement(Toaster, null), React.createElement('div', { style: { padding: 16 } }, React.createElement(UsuariosFeria, { eventId: 'evt-ui' }))));`;
const JS = (await build({ stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic', logLevel: 'silent' })).outputFiles[0].text;

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
let okCount = 0; const malos = [];
const check = (name, cond, extra = '') => { if (cond) { okCount++; console.log(`  OK    ${name}`); } else { malos.push(name); console.log(`  FALLA ${name} ${extra}`); } };
const abrir = async (viewport) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: SHOT ? 2 : 1, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.route('http://localhost/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/')) {
            const r = await fetch(`${BACK}${url.pathname}${url.search}`, { method: route.request().method(), headers: { ...route.request().headers(), host: undefined, origin: 'https://feria.test' }, body: route.request().postData() || undefined });
            return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' }, body: Buffer.from(await r.arrayBuffer()) });
        }
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body>' });
    });
    await page.goto('http://localhost/admin/postulaciones?tab=users');
    await page.addStyleTag({ content: CSS });
    await page.evaluate((t) => localStorage.setItem('rotary_token', t), ADMIN);
    await page.addScriptTag({ content: JS });
    await page.evaluate(() => window.go());
    await page.getByText('Usuarios de la edición').waitFor({ timeout: 15000 });
    return { page, errores, ctx };
};
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name) => { if (SHOT) await page.screenshot({ path: join(SHOT, `${name}.png`), fullPage: false }); };

try {
    console.log('\n▸ Escritorio (1280 px)');
    {
        const { page, errores, ctx } = await abrir({ width: 1280, height: 900 });
        await page.getByLabel('Buscar usuarios').fill('gaitan');
        await page.waitForTimeout(900);
        const filas = page.locator('tbody tr');
        check('buscar «gaitan» trae las cuentas de Mónica Gaitán', await filas.count() === 2 && (await page.getByText('mgaitanr77@gmail.com', { exact: true }).count()) === 1);
        check('se ve el proyecto FP-J2WJZQ en la fila', (await page.getByText(/FP-J2WJZQ/).count()) >= 1);
        check('la cuenta vinculada dice «Vinculada»', (await page.getByText('Vinculada', { exact: true }).count()) === 1);
        await shot(page, 'usuarios-1280');
        const fila = filas.filter({ hasText: 'mgaitanr77@gmail.com' });
        await fila.getByRole('button', { name: 'Gestionar' }).click();
        const panel = page.getByRole('dialog', { name: 'Cuenta de usuario' });
        await panel.getByText('Asignar una contraseña nueva').waitFor({ timeout: 8000 });
        check('el panel muestra su perfil (correo, teléfono, proyecto)', await panel.getByText('+57 3126198537').isVisible() && await panel.getByText('FP-J2WJZQ').isVisible());
        check('«Guardar contraseña» no se activa con menos de 8 caracteres', await (async () => { await panel.getByPlaceholder('Mínimo 8 caracteres').fill('corta'); return panel.getByRole('button', { name: 'Guardar contraseña' }).isDisabled(); })());
        await shot(page, 'panel-1280');
        await panel.getByRole('button', { name: /Generar una segura y asignarla/ }).click();
        await panel.getByText('Contraseña asignada').waitFor({ timeout: 8000 });
        const generada = (await panel.locator('code').first().textContent())?.trim() || '';
        check('la contraseña generada se muestra una vez para copiarla', generada.length >= 12);
        check('con el mensaje listo para WhatsApp', (await panel.getByText(/te asignó una contraseña nueva\. Ingresa en/).count()) === 1);
        await shot(page, 'contrasena-asignada-1280');
        const login = await fetch(`${BACK}/api/project-fair/portal/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mgaitanr77@gmail.com', password: generada }) });
        check('Mónica entra a /mi-proyecto con esa contraseña', login.status === 200);
        check('el historial del panel registra el cambio', await panel.getByText('Asignó una contraseña nueva').first().isVisible());
        await panel.getByRole('button', { name: 'Generar enlace' }).click();
        await panel.getByText(/Enlace \(vence en 24 horas\)/).waitFor({ timeout: 8000 });
        check('el enlace de restablecimiento se puede copiar', (await panel.locator('code', { hasText: '/mi-proyecto?reset=' }).count()) === 1);
        await panel.getByRole('button', { name: 'Cerrar' }).click();
        await page.locator('tbody tr').filter({ hasText: 'Gaitán (evento)' }).getByRole('button', { name: 'Gestionar' }).click();
        await panel.getByText(/está vinculada a otra identidad/).waitFor({ timeout: 8000 });
        check('la vinculada NO ofrece contraseña y lleva a su cuenta de origen', !(await panel.getByText('Asignar una contraseña nueva').count()) && await panel.getByRole('button', { name: /Abrir la cuenta de origen/ }).isVisible());
        check('sin desplazamiento horizontal', await sinDesborde(page));
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    console.log('\n▸ Teléfono (390 px)');
    {
        const { page, errores, ctx } = await abrir({ width: 390, height: 844 });
        const anchos = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.overflow-x-auto')).slice(0, 5).map(e => `${e.tagName}.${String(e.className).slice(0, 60)} → ${Math.round(e.getBoundingClientRect().right)}`));
        check('la página no se desborda (la tabla se desplaza dentro de su caja)', await sinDesborde(page), anchos.join(' | '));
        await page.locator('tbody tr').first().getByRole('button', { name: 'Gestionar' }).scrollIntoViewIfNeeded();
        await page.locator('tbody tr').filter({ hasText: 'mgaitanr77@gmail.com' }).getByRole('button', { name: 'Gestionar' }).click();
        const panel = page.getByRole('dialog', { name: 'Cuenta de usuario' });
        await panel.getByText('Asignar una contraseña nueva').waitFor({ timeout: 8000 });
        const ancho = await panel.evaluate(el => Math.round(el.getBoundingClientRect().width));
        check('el panel ocupa el ancho del teléfono', ancho <= 390 && ancho >= 380, String(ancho));
        check('con el panel abierto, sin desplazamiento horizontal', await sinDesborde(page));
        await shot(page, 'panel-390');
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
} finally {
    await browser.close();
    srv.close();
}
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:users:ui — ${okCount} comprobaciones, ${malos.length} fallas.`);
process.exit(malos.length ? 1 : 0);
