#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// «Confirmar pago manualmente» de un inscrito al evento, EN UN NAVEGADOR — v4.1310
// EVENT_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:event:manual-payment:ui
//
// El listado real de inscripciones (EventRegistrationsManager) en Chromium, con
// `/api/event-registrations/**` y `/api/event-funds/**` reenviados a los
// routers REALES sobre Postgres real y un S3 simulado con CORS. Recorre la
// ficha de la captura: abrir a la inscrita, «Confirmar pago manualmente»,
// adjuntar el comprobante, revisar, confirmar, y ver la ficha con el pago
// confirmado y su comprobante. «Cambiar a → Pago confirmado» abre la misma
// ventana. También a 390 px.
//
// Con MANUAL_UI_SHOT=<carpeta> deja capturas. Se salta sin base local, sin
// playwright o sin esbuild. Usa el CSS de `dist/assets` si existe.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { register, createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const HERE = new URL('..', import.meta.url);
const E2E_DB = process.env.EVENT_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:event:manual-payment:ui] Sin EVENT_E2E_DATABASE_URL local: se omite.');
    process.exit(0);
}
const require = createRequire(`${REPO}/package.json`);
let chromium, build;
try {
    try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = require('playwright')); }
    ({ build } = await import('esbuild'));
} catch { console.log('… se salta: faltan playwright o esbuild'); process.exit(0); }
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

const objects = new Map();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,HEAD', 'Access-Control-Allow-Headers': '*' };
const s3 = http.createServer((req, res) => {
    const key = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/test_bucket\//, ''));
    if (req.method === 'OPTIONS') { res.writeHead(200, CORS); return res.end(); }
    if (req.method === 'PUT') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => { objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(200, { ...CORS, ETag: '"x"' }); res.end(); });
        return;
    }
    const o = objects.get(key);
    if (!o) { res.writeHead(404, CORS); return res.end(); }
    if (req.method === 'HEAD') { res.writeHead(200, { ...CORS, 'Content-Length': o.body.length, 'Content-Type': o.type }); return res.end(); }
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const body = m ? o.body.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined) : o.body;
    res.writeHead(m ? 206 : 200, { ...CORS, 'Content-Length': body.length, 'Content-Type': o.type });
    res.end(body);
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));
process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://localhost:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
const MAIL = new URL('./scripts/fixtures/email-completed-stub.mjs', HERE).href;
register(`data:text/javascript,
    const M=${JSON.stringify(MAIL)};
    export async function resolve(s,c,n){ if(/EmailService\\.js$/.test(s)) return {url:M,shortCircuit:true}; return n(s,c); }`, HERE);

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const { JWT_SECRET, PLATFORM_AUDIENCE } = await import(`${REPO}/server/middleware/auth.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, "clubId" TEXT, metadata JSONB DEFAULT '{}', image TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, logo TEXT, "footerLogo" TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, phone TEXT, "clubId" TEXT, role TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "startDate", "endDate", location, "clubId") VALUES
    ('ev-ui','XII Rotary Project Fair Colombia 2027','xii-ui','2027-01-28','2027-01-31','Valledupar','club-feria') ON CONFLICT DO NOTHING`);
await db.query(`INSERT INTO "Club" (id, name) VALUES ('club-feria','Feria') ON CONFLICT DO NOTHING`);
const { default: regRouter } = await import(`${REPO}/server/routes/event-registrations.js`);
const { default: fundsRouter } = await import(`${REPO}/server/routes/event-funds.js`);
const { ensureEventRegistrationSchema } = await import(`${REPO}/server/lib/ensureEventRegistrationSchema.js`);
await ensureEventRegistrationSchema();
const ins = async (ref, nombre, apellido, cat, label, aud, moneda, monto) => (await db.query(`INSERT INTO "EventRegistration"
    ("eventId", "clubId", "publicRef", "firstName", "lastName", email, "categoryKey", "categoryLabel", audience, status,
     currency, "totalAmount", "baseCurrency", "baseAmount", "chargeCurrency", "chargeAmount", pricing, "submittedAt", country, city, district)
    VALUES ('ev-ui','club-feria',$1,$2,$3,$4,$5,$6,$7,'pending_payment',$8,$9,$8,$9,$8,$9,$10::jsonb,NOW(),'Colombia','Cali','4281') RETURNING id`,
    [ref, nombre, apellido, `${ref.toLowerCase()}@x.org`, cat, label, aud, moneda, monto,
        JSON.stringify({ baseCurrency: moneda, baseAmount: monto, chargeCurrency: moneda, chargeAmount: monto })])).rows[0].id;
const MONICA = await ins('EV-KE9385', 'Monica Dalila', 'Gaitan Rodríguez', 'registro_nacional', 'Registro Nacional', 'nacional', 'COP', 400000);
const PAULA = await ins('EV-CADRE1', 'Paula Andrea', 'Cruz Mejía', 'cadres', 'CADRE', 'cadres', 'COP', 200000);

const app = express();
app.use('/api/event-registrations', regRouter);
app.use('/api/event-funds', fundsRouter);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const TOKEN = jwt.sign({ id: 'u-admin', email: 'valledupar@feria.org', name: 'Comité Organizador', role: 'administrator', clubId: 'club-feria' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });

const STATUSES = [
    { key: 'pending_payment', label: 'Pendiente de pago' }, { key: 'paid', label: 'Pago confirmado' },
    { key: 'confirmed', label: 'Confirmado' }, { key: 'cancelled', label: 'Cancelado' },
];
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Pantalla from './src/components/admin/events/EventRegistrationsManager';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement('div', { style: { padding: 16 } },
        React.createElement(Pantalla, { eventId: 'ev-ui', eventTitle: 'XII Feria', categories: [], statuses: ${JSON.stringify(STATUSES)} })));
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
});
const dir = mkdtempSync(join(tmpdir(), 'ev-manual-ui-'));
const PDF = join(dir, 'Transferencia Monica Gaitan.pdf');
writeFileSync(PDF, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(30000, 32), Buffer.from('\n%%EOF')]));

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// La página se sirve con `route.fulfill` y Chrome negaría subir al S3 de
// loopback (Local Network Access). En producción el S3 es de AWS: no aplica.
const ARGS = ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'];
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME, args: ARGS } : { args: ARGS });
const SHOT = process.env.MANUAL_UI_SHOT;

const abrir = async (viewport) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 300)); });
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    const proxy = async r => {
        const u = new URL(r.request().url());
        await r.fulfill({ response: await r.fetch({ url: `${API_REAL}${u.pathname}${u.search}` }) });
    };
    await page.route('**/api/event-registrations/**', proxy);
    await page.route('**/api/event-funds/**', proxy);
    await page.goto('http://localhost/');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate((t) => { localStorage.setItem('rotary_token', t); }, TOKEN);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('tbody tr', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    return { page, errores };
};
const fila = async (id) => (await db.query('SELECT * FROM "EventRegistration" WHERE id = $1', [id])).rows[0];

console.log('\n▸ Escritorio (1500 px) — Registro Nacional');
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 });
    await page.locator('tbody tr', { hasText: 'Monica Dalila' }).first().click();
    const boton = page.getByRole('button', { name: 'Confirmar pago manualmente' });
    await boton.waitFor({ timeout: 8000 });
    check('la ficha ofrece «Confirmar pago manualmente»', await boton.isVisible());
    await boton.click();
    const modal = page.getByRole('dialog', { name: 'Confirmar pago manualmente' });
    await modal.waitFor();
    check('el valor se prellena con el de la inscripción (400000 COP)', (await modal.locator('input[type=number]').inputValue()) === '400000' && (await modal.locator('select').nth(1).inputValue()) === 'COP');
    check('avisar al participante viene marcado', await modal.getByRole('checkbox').isChecked());
    await modal.locator('input[type=file]').setInputFiles(PDF);
    await modal.getByText('Transferencia Monica Gaitan.pdf').waitFor({ timeout: 8000 }).catch(() => {});
    check('el comprobante sube directo al almacenamiento privado de ESTA inscripción', [...objects.keys()].some(k => k.startsWith(`private/event-manual-payments/ev-ui/${MONICA}/`)));
    await modal.locator('input[placeholder^="Ej. Bancolombia"]').fill('Bancolombia #77120');
    await modal.locator('textarea').fill('Transferencia a la cuenta del comité organizador');
    if (SHOT) await page.screenshot({ path: `${SHOT}/evento-1-ventana.png` });
    await modal.getByRole('button', { name: 'Continuar a revisión' }).click();
    const rev = await modal.innerText();
    check('la revisión muestra el comprobante y el correo', /Transferencia Monica Gaitan\.pdf/.test(rev) && /Correo al participante\s*Sí/.test(rev), rev.slice(0, 300));
    await modal.getByRole('button', { name: 'Confirmar pago' }).click();
    await page.getByText(/Pago confirmado\. La inscripción quedó/).waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const f = await fila(MONICA);
    check('en la base: «Pago confirmado» con código', f.status === 'paid' && Boolean(f.registrationCode));
    const ficha = await page.locator('section', { hasText: 'Confirmación manual del pago' }).first().innerText().catch(() => '');
    check('la ficha muestra la confirmación con el comprobante y quién confirmó', /Transferencia Monica Gaitan\.pdf/.test(ficha) && /Comité Organizador/.test(ficha) && /Bancolombia #77120/.test(ficha), ficha.slice(0, 400));
    check('y ya no ofrece confirmar otra vez', !(await page.getByRole('button', { name: 'Confirmar pago manualmente' }).isVisible()));
    if (SHOT) {
        await page.locator('section', { hasText: 'Confirmación manual del pago' }).first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOT}/evento-2-ficha.png` });
    }
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Móvil (390 px) — CADRE, por «Cambiar a → Pago confirmado»');
{
    const { page, errores } = await abrir({ width: 390, height: 844 });
    await page.locator('tbody tr', { hasText: 'Paula Andrea' }).first().click();
    await page.getByRole('button', { name: 'Confirmar pago manualmente' }).waitFor({ timeout: 8000 });
    await page.locator('select').filter({ hasText: 'Selecciona un estado' }).selectOption('paid');
    const modal = page.getByRole('dialog', { name: 'Confirmar pago manualmente' });
    check('elegir «Pago confirmado» abre la ventana del comprobante (no cambia el estado a ciegas)', await modal.isVisible() && (await fila(PAULA)).status === 'pending_payment');
    const caja = await modal.boundingBox();
    check('la ventana cabe en el teléfono y se desplaza por dentro', caja && caja.x >= 0 && caja.x + caja.width <= 391 && caja.height <= 844, JSON.stringify(caja));
    if (SHOT) await page.screenshot({ path: `${SHOT}/evento-3-movil.png` });
    await modal.locator('input[placeholder^="Ej. Bancolombia"]').fill('Recibo 44');
    await modal.locator('textarea').fill('Pagó en efectivo en la sede');
    await modal.getByRole('button', { name: 'Continuar a revisión' }).click();
    check('sin archivo ni referencia del soporte no avanza', /Adjunta el comprobante o escribe la referencia/.test(await modal.innerText()));
    await modal.locator('input[placeholder^="Ej. # extracto"]').fill('Recibo físico #44');
    await modal.getByRole('button', { name: 'Continuar a revisión' }).click();
    await modal.getByRole('button', { name: 'Confirmar pago' }).click();
    await page.waitForTimeout(1200);
    check('CADRE confirmado con la referencia escrita', (await fila(PAULA)).status === 'paid');
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

await browser.close();
srv.close(); s3.close();
console.log(`\n${malos.length ? '❌' : '✅'} test:event:manual-payment:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
