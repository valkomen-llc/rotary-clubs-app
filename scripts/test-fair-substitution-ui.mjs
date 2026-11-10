#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// «Sustituir por otro proyecto», EN UN NAVEGADOR y contra el SERVIDOR REAL — v4.1311
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:substitution:ui
//
// La pantalla real (PostulacionesPagos) en Chromium, con `/api/project-fair/**`
// reenviado al router real sobre Postgres real y un Stripe simulado. Recorre
// el caso que lo motivó: abrir FP-GLMGQL, sustituirlo por FP-GVGEQX, ver las
// comprobaciones y los dos pagos, aplicar, y que el listado y la ficha digan
// lo correcto. También a 390 px.
//
// Con SUBST_UI_SHOT=<carpeta> deja capturas. Se salta sin base local, sin
// playwright o sin esbuild. Usa el CSS de `dist/assets` si existe.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:substitution:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); }
};

// ── Stripe simulado ──────────────────────────────────────────────────
const intents = new Map();
const stripeSrv = http.createServer((req, res) => {
    const m = /^\/v1\/payment_intents\/([^/?]+)/.exec(req.url);
    const pi = m && intents.get(m[1]);
    res.setHeader('Content-Type', 'application/json');
    if (!pi) { res.writeHead(404); return res.end(JSON.stringify({ error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such payment_intent' } })); }
    res.writeHead(200); res.end(JSON.stringify(pi));
});
await new Promise(r => stripeSrv.listen(0, '127.0.0.1', r));

process.env.DATABASE_URL = E2E_DB;
process.env.STRIPE_SECRET_KEY = 'sk_live_fake_for_ui';
process.env.STRIPE_API_BASE = `http://127.0.0.1:${stripeSrv.address().port}`;

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Payment" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, provider TEXT, "providerRef" TEXT, status TEXT, amount NUMERIC, currency TEXT, "rawPayload" JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW(), UNIQUE (provider, "providerRef"))`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-sui','XII Feria','xii-sui') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-sui','evt-sui', $1::jsonb) ON CONFLICT DO NOTHING`,
    [JSON.stringify({ registration: { priceMode: 'COP', amountCop: 250000, secondProjectAmountCop: 100000 } })]);

const sub = async (ref, f) => (await db.query(`INSERT INTO "ProjectFairSubmission"
    ("publicRef", "eventId", "firstName", "lastName", email, phone, "clubName", district, "projectName", "focusArea", "focusAreaLabel", "budgetUsd",
     "workflowStatus", status, "amountCop", "amountReceived", "chargeCurrency", "paidAt", "stripePaymentIntentId", "stripeSessionId",
     "paymentConfirmationOrigin", "projectIndex", "appliedAt", "createdAt", metadata)
    VALUES ($1,'evt-sui',$2,$3,$4,$5,$6,'Rotary Distrito 4271',$7,'paz','Promoción de la Paz',$8,$9,'paid',250000,$10,$11,$12,$13,$14,'stripe',1,NOW(),$15,'{}'::jsonb) RETURNING id`,
[ref, f.firstName, f.lastName, f.email, f.phone, f.club, f.projectName, f.budgetUsd, f.wf, f.received, f.currency, f.paidAt, f.pi, f.cs, f.createdAt])).rows[0].id;

const RETIRED = await sub('FP-GLMGQL', {
    firstName: 'XIMENA', lastName: 'CAICEDO', email: 'ximena-caicedo@hotmail.com', phone: '+57 3153813747', club: 'Cúcuta Ciudad de Árboles',
    projectName: 'Adecuación de salón para apoyo socio-emocional a nivel grupal y atención psicosocial individual', budgetUsd: 65390, wf: 'received',
    received: 262500, currency: 'COP', paidAt: '2026-08-11T15:20:00Z', pi: 'pi_live_ximena', cs: 'cs_live_ximena', createdAt: '2026-08-11T15:00:00Z',
});
const KEPT = await sub('FP-GVGEQX', {
    firstName: 'francy', lastName: 'calderon bonilla', email: 'francycalb@hotmail.com', phone: '+57 3158074933', club: 'cucuta ciudad de los arboles',
    projectName: 'Centro para la Paz y la Convivencia Escolar', budgetUsd: 98, wf: 'in_review',
    received: 1, currency: 'USD', paidAt: '2026-07-31T18:00:00Z', pi: 'pi_prueba_francy', cs: 'cs_prueba_francy', createdAt: '2026-07-31T17:00:00Z',
});
intents.set('pi_live_ximena', {
    id: 'pi_live_ximena', object: 'payment_intent', livemode: true, status: 'succeeded', amount: 26250000, amount_received: 26250000, currency: 'cop',
    metadata: { submissionId: RETIRED },
    latest_charge: { id: 'ch_live_ximena', object: 'charge', amount_refunded: 0, refunded: false, disputed: false, billing_details: { name: 'Ximena Caicedo', email: 'ximena-caicedo@hotmail.com' } },
});
await db.query(`INSERT INTO "Payment" (provider, "providerRef", status, amount, currency, "rawPayload") VALUES ('stripe','pi_live_ximena','succeeded',262500,'COP','{}'::jsonb) ON CONFLICT DO NOTHING`);

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const TOKEN = jwt.sign({ id: 'u-admin', email: 'comite@feria.org', role: 'administrator', clubId: 'club-feria' }, SECRET);

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
const SHOT = process.env.SUBST_UI_SHOT;

const abrir = async (viewport) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 400)); });
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria', settings: [] } }));
    await page.route('**/api/project-fair/**', async r => {
        const u = new URL(r.request().url());
        const resp = await r.fetch({ url: `${API_REAL}${u.pathname}${u.search}` });
        await r.fulfill({ response: resp });
    });
    await page.goto('http://localhost/?evento=evt-sui&tab=submissions');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate((t) => {
        localStorage.setItem('rotary_token', t);
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u-admin', role: 'administrator', clubId: 'club-feria' }));
    }, TOKEN);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    return { page, errores };
};
const fila = async (id) => (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [id])).rows[0];

console.log('\n▸ Móvil (390 px): la ventana cabe');
{
    const { page, errores } = await abrir({ width: 390, height: 844 });
    await page.locator('tr', { hasText: 'FP-GLMGQL' }).getByRole('button', { name: /Ver/ }).click();
    await page.getByRole('button', { name: /Sustituir por otro proyecto/ }).click();
    const modal = page.getByRole('dialog');
    await modal.waitFor();
    const caja = await modal.boundingBox();
    check('la ventana cabe en el ancho del teléfono', caja && caja.x >= 0 && caja.x + caja.width <= 391, JSON.stringify(caja));
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Escritorio (1500 px): el caso FP-GLMGQL → FP-GVGEQX');
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 });
    if (SHOT) await page.screenshot({ path: `${SHOT}/sustitucion-0-listado-antes.png` });
    await page.locator('tr', { hasText: 'FP-GLMGQL' }).getByRole('button', { name: /Ver/ }).click();
    await page.getByRole('button', { name: /Sustituir por otro proyecto/ }).click();
    const modal = page.getByRole('dialog');
    await modal.waitFor();
    check('el importe se prellena con la línea del pago (250000 COP)', (await modal.locator('input[inputmode=decimal]').inputValue()) === '250000');
    await modal.locator('input[placeholder="FP-XXXXXX"]').fill('FP-GVGEQX');
    await modal.getByRole('button', { name: /Verificar/ }).click();
    await modal.getByText(/Todas las comprobaciones pasan|Hay diferencias/).waitFor({ timeout: 10000 });
    const t = await modal.innerText();
    check('todas las comprobaciones pasan', /Todas las comprobaciones pasan/.test(t), t.slice(0, 600));
    check('muestra al pagador: XIMENA CAICEDO', /Pagado por\s*XIMENA CAICEDO/.test(t));
    check('muestra el pago de USD 1 identificado como prueba', /modo de pruebas/.test(t) && /US\$1\.00/.test(t));
    check('la responsable que se conserva es Francy', /Responsable: francy calderon bonilla \(no cambia\)/.test(t));
    const aplicar = modal.getByRole('button', { name: /Aplicar sustitución/ });
    check('no deja aplicar sin marcar la autorización', await aplicar.isDisabled());
    await modal.getByRole('checkbox').check();
    if (SHOT) {
        await modal.evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: `${SHOT}/sustitucion-1-verificacion.png` });
        await modal.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.screenshot({ path: `${SHOT}/sustitucion-2-pagos-y-motivo.png` });
    }
    await aplicar.click();
    await modal.getByText('Sustitución aplicada.').waitFor({ timeout: 10000 }).catch(() => {});
    check('la ventana confirma la sustitución', /Sustitución aplicada/.test(await modal.innerText()));
    const a = await fila(RETIRED), b = await fila(KEPT);
    check('en la base: FP-GLMGQL archivado con el pago intacto', !!a.archivedAt && a.stripePaymentIntentId === 'pi_live_ximena' && Number(a.amountReceived) === 262500);
    check('en la base: FP-GVGEQX respaldado, sin dinero propio, En revisión', b.metadata.payment.coveredBy === RETIRED && b.amountReceived === null && b.workflowStatus === 'in_review');
    await modal.getByRole('button', { name: /^Cerrar$/ }).last().click();
    await page.waitForTimeout(300);
    const banner = await page.getByText(/Archivada — sustituida por FP-GVGEQX/).isVisible().catch(() => false);
    check('la ficha del retirado dice que fue sustituido', banner);
    // La ficha se cierra con un clic en el fondo, a la izquierda del panel.
    await page.mouse.click(100, 500);
    await page.waitForTimeout(800);
    const tabla = await page.locator('table tbody').innerText();
    check('el listado ya no muestra FP-GLMGQL', !tabla.includes('Adecuación de salón'), tabla.slice(0, 400));
    check('FP-GVGEQX muestra «Pagó: XIMENA CAICEDO» y su respaldo', /Respaldado por FP-GLMGQL/.test(tabla) && /Pagó: XIMENA CAICEDO/.test(tabla));
    if (SHOT) await page.screenshot({ path: `${SHOT}/sustitucion-3-listado-despues.png` });

    await page.locator('tr', { hasText: 'FP-GVGEQX' }).getByRole('button', { name: /Ver/ }).click();
    await page.locator('div.fixed.inset-0 header button').filter({ hasText: /^Pago$/ }).click();
    await page.waitForTimeout(400);
    const bloque = await page.locator('div', { hasText: /^Pago oficial reasignado desde FP-GLMGQL/ }).last().innerText().catch(() => '');
    check('la ficha del conservado muestra el pago reasignado, el pagador y la responsable', /XIMENA CAICEDO/.test(bloque) && /francy calderon bonilla/.test(bloque), bloque.slice(0, 400));
    check('y deja dicho que el USD 1 no cuenta para la inscripción', /no cuenta para la inscripción/.test(bloque));
    if (SHOT) await page.screenshot({ path: `${SHOT}/sustitucion-4-ficha-conservado.png` });
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

await browser.close();
srv.close(); stripeSrv.close();
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:substitution:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
