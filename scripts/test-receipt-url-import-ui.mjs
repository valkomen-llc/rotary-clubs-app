#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// «Importar comprobante desde URL», EN UN NAVEGADOR — v4.1312
// RECEIPT_IMPORT_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:receipt-url-import:ui
//
// La pestaña real de inscripciones completadas (EventCompletedRegistrationsManager)
// en Chromium, con `/api/event-registrations/**` reenviado al router REAL
// sobre Postgres real, el SDK de S3 REAL contra un S3 local (con sus
// metadatos) y un servidor HTTPS local haciendo de «la otra plataforma».
// Recorre la ficha de la captura: un registro de «Importación histórica» sin
// comprobante, «Importar comprobante desde URL» debajo de «Subir comprobante»,
// usar el enlace que guardó la importación, verificar, ver la vista previa,
// importar y ver la tarjeta «Comprobante adjunto» sin que cambie el estado.
// También a 390 px y con un enlace privado.
//
// Con RECEIPT_UI_SHOT=<carpeta> deja capturas. Se salta sin base local, sin
// playwright o sin esbuild. Usa el CSS de `dist/assets` si existe.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { register, createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const HERE = new URL('..', import.meta.url);
const E2E_DB = process.env.RECEIPT_IMPORT_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:receipt-url-import:ui] Sin RECEIPT_IMPORT_E2E_DATABASE_URL local: se omite.');
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

// ── S3 local: guarda cuerpo, tipo y metadatos (x-amz-meta-*) ──────────
const objects = new Map();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,HEAD', 'Access-Control-Allow-Headers': '*' };
const s3 = http.createServer((req, res) => {
    const key = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/test_bucket\//, ''));
    if (req.method === 'OPTIONS') { res.writeHead(200, CORS); return res.end(); }
    if (req.method === 'PUT') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            let body = Buffer.concat(chunks);
            // El SDK puede mandar el cuerpo en «aws-chunked» con la suma al final.
            if (/aws-chunked/.test(req.headers['content-encoding'] || '')) {
                const parts = []; let i = 0;
                while (i < body.length) {
                    const nl = body.indexOf('\r\n', i); const size = parseInt(body.subarray(i, nl).toString().split(';')[0], 16);
                    if (!size) break; parts.push(body.subarray(nl + 2, nl + 2 + size)); i = nl + 2 + size + 2;
                }
                body = Buffer.concat(parts);
            }
            const meta = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.startsWith('x-amz-meta-')));
            objects.set(key, { body, type: req.headers['content-type'], meta });
            res.writeHead(200, { ...CORS, ETag: '"x"' }); res.end();
        });
        return;
    }
    const o = objects.get(key);
    if (!o) { res.writeHead(404, CORS); return res.end(); }
    const head = { ...CORS, 'Content-Length': o.body.length, 'Content-Type': o.type, ...o.meta };
    if (req.method === 'HEAD') { res.writeHead(200, head); return res.end(); }
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const body = m ? o.body.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined) : o.body;
    res.writeHead(m ? 206 : 200, { ...head, 'Content-Length': body.length });
    res.end(body);
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));

// ── «La otra plataforma»: HTTPS local con certificado propio ──────────
const dir = mkdtempSync(join(tmpdir(), 'receipt-ui-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'),
    '-subj', '/CN=formularios.test', '-addext', 'subjectAltName=DNS:formularios.test'], { stdio: 'ignore' });
const KEY = readFileSync(join(dir, 'k.pem')); const CERT = readFileSync(join(dir, 'c.pem'));
rmSync(dir, { recursive: true, force: true });
// Un PNG REAL (para que la miniatura y la vista previa se pinten) y un PDF.
const sharp = require('sharp');
const PNG = await sharp({ create: { width: 360, height: 220, channels: 3, background: { r: 23, g: 69, b: 143 } } })
    .composite([{ input: Buffer.from('<svg width="360" height="220"><text x="20" y="120" font-size="28" fill="#fff">Comprobante de pago</text></svg>') }]).png().toBuffer();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const externo = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    const p = req.url.split('?')[0];
    if (p === '/uploads/comprobante-kely.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PNG); }
    if (p === '/uploads/pago.pdf') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(PDF); }
    if (p === '/privado.pdf') { res.writeHead(403); return res.end('prohibido'); }
    res.writeHead(404); res.end('no');
});
await new Promise(r => externo.listen(0, '127.0.0.1', r));
const EXT = (p) => `https://formularios.test:${externo.address().port}${p}`;
globalThis.__receiptFetchTesting = {
    ca: CERT, allowAnyPort: true, allowAddress: (ip) => ip === '127.0.0.1', totalTimeoutMs: 6000,
    resolve: (h, o, cb) => (h === 'formularios.test' ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))),
};

process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://localhost:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
const MAIL = new URL('./scripts/fixtures/email-completed-stub.mjs', HERE).href;
const FETCH = new URL('./scripts/fixtures/receipt-url-fetch-local.mjs', HERE).href;
register(`data:text/javascript,
    const M=${JSON.stringify(MAIL)}, F=${JSON.stringify(FETCH)};
    export async function resolve(s,c,n){
      if(/EmailService\\.js$/.test(s)) return {url:M,shortCircuit:true};
      if(/receiptUrlFetch\\.js$/.test(s)) return {url:F,shortCircuit:true};
      return n(s,c);
    }`, HERE);

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const { JWT_SECRET, PLATFORM_AUDIENCE } = await import(`${REPO}/server/middleware/auth.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, "clubId" TEXT, metadata JSONB DEFAULT '{}', image TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, logo TEXT, "footerLogo" TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, phone TEXT, "clubId" TEXT, role TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "startDate", "endDate", location, "clubId") VALUES
    ('ev-conf','XIII Conferencia Distrital Rotary 4281','conferencia-ui','2027-05-28','2027-05-30','Villavicencio','club-4281') ON CONFLICT DO NOTHING`);
await db.query(`INSERT INTO "Club" (id, name) VALUES ('club-4281','Distrito 4281') ON CONFLICT DO NOTHING`);
const { default: regRouter } = await import(`${REPO}/server/routes/event-registrations.js`);
const { ensureEventRegistrationSchema } = await import(`${REPO}/server/lib/ensureEventRegistrationSchema.js`);
await ensureEventRegistrationSchema();
const crear = async (code, source, email, doc, importUrl) => (await db.query(
    `INSERT INTO "EventCompletedRegistration"
        ("eventId", "clubId", status, "registrationSource", "registrationCode", "firstName", "lastName", "documentNumber",
         email, phone, district, "clubName", answers, flags, "importMeta", "submittedAt")
     VALUES ('ev-conf','club-4281','submitted',$1,$2,'Kely Johana','Gonzalez Salazar',$3,$4,'+57 3103086447','4281',
             'Honda Ciudad de los Puentes','{}','{}',$5, NOW()) RETURNING id`,
    [source, code, doc, email, importUrl ? JSON.stringify({ receiptUrl: importUrl }) : null])).rows[0].id;
const HIST = await crear('RPF13-C-DAQRY', 'historical_import', 'kelyjohana@example.com', '65795554', EXT('/uploads/comprobante-kely.png?token=abc'));
const OTRO = await crear('RPF13-C-MOVIL', 'manual', 'otra@example.com', '1234');

const app = express();
app.use('/api/event-registrations', regRouter);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const TOKEN = jwt.sign({ id: 'u-admin', email: 'registro@rotary4281.org', name: 'Daniel Yazo', role: 'administrator', clubId: 'club-4281' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './src/hooks/useAuth';
import Pantalla from './src/components/admin/events/EventCompletedRegistrationsManager';
// Dentro de AuthProvider, como en producción: el selector de medios lo usa.
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(AuthProvider, null,
        React.createElement('div', { style: { padding: 16 } }, React.createElement(Pantalla, { eventId: 'ev-conf', eventTitle: 'Conferencia' }))));
`;
const bundle = await build({
    stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'];
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME, args: ARGS } : { args: ARGS });
const SHOT = process.env.RECEIPT_UI_SHOT;

const abrir = async (viewport) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 300)); });
    await page.route('http://localhost/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/event-registrations/**', async r => {
        const u = new URL(r.request().url());
        await r.fulfill({ response: await r.fetch({ url: `${API_REAL}${u.pathname}${u.search}` }) });
    });
    await page.goto('http://localhost/');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate((t) => { localStorage.setItem('rotary_token', t); }, TOKEN);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('tbody tr', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    return { page, errores };
};
const fila = async (id) => (await db.query('SELECT * FROM "EventCompletedRegistration" WHERE id = $1', [id])).rows[0];

console.log('\n▸ Escritorio (1500 px) — registro de «Importación histórica»');
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 });
    await page.locator('tbody tr', { hasText: 'RPF13-C-DAQRY' }).first().click();
    const subir = page.getByRole('button', { name: 'Subir comprobante' });
    const importar = page.getByRole('button', { name: 'Importar comprobante desde URL' });
    await importar.waitFor({ timeout: 8000 });
    check('«Este registro no tiene comprobante adjunto»', await page.getByText('Este registro no tiene comprobante adjunto.').isVisible());
    const [a, b] = [await subir.boundingBox(), await importar.boundingBox()];
    check('«Importar comprobante desde URL» va justo DEBAJO de «Subir comprobante»', a && b && b.y > a.y + a.height - 1 && Math.abs(b.x - a.x) < 4, JSON.stringify({ a, b }));
    if (SHOT) await page.locator('[data-testid=receipt-card]').screenshot({ path: `${SHOT}/1-sin-comprobante.png` });
    await importar.click();
    const modal = page.getByRole('dialog', { name: 'Importar comprobante desde URL' });
    await modal.waitFor();
    const txt = await modal.innerText();
    check('el modal tiene su descripción, campos y tres botones', /Club Platform descargará una copia/.test(txt)
        && await modal.getByRole('button', { name: 'Cancelar' }).isVisible()
        && await modal.getByRole('button', { name: 'Verificar enlace' }).isVisible()
        && await modal.getByRole('button', { name: 'Importar comprobante' }).isVisible());
    check('ofrece el enlace que registró la importación histórica', /La importación histórica registró/.test(txt));
    await modal.getByRole('button', { name: 'Usar este enlace' }).click();
    check('…y lo usa', (await modal.locator('#import-receipt-url').inputValue()).includes('/uploads/comprobante-kely.png'));
    await modal.getByRole('button', { name: 'Verificar enlace' }).click();
    await modal.getByText(/Enlace verificado/).waitFor({ timeout: 10000 }).catch(() => {});
    const v = await modal.innerText();
    check('verificado: PNG, tamaño y origen', /Enlace verificado: el archivo es un PNG válido/.test(v) && /formularios\.test/.test(v), v.slice(0, 400));
    const prev = modal.locator('img[alt="Vista previa del comprobante"]');
    await page.waitForTimeout(500);
    check('la vista previa se pinta (imagen real desde el almacenamiento)', await prev.evaluate(i => i.complete && i.naturalWidth > 0).catch(() => false));
    check('verificar NO vinculó nada todavía', !(await fila(HIST)).receiptKey);
    if (SHOT) await modal.screenshot({ path: `${SHOT}/2-verificado.png` });
    await modal.locator('#import-receipt-name').fill('Comprobante Kely Gonzalez');
    await modal.getByRole('button', { name: 'Importar comprobante' }).click();
    await page.getByText(/Comprobante importado y asociado/).waitFor({ timeout: 10000 }).catch(() => {});
    await page.locator('[data-testid=receipt-card]').getByText('Comprobante adjunto').waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    const card = await page.locator('[data-testid=receipt-card]').innerText().catch(() => '');
    check('aparece «Comprobante adjunto» sin recargar', /Comprobante adjunto/i.test(card), card);
    check('…con nombre, tipo, fecha y origen URL externa', /Comprobante Kely Gonzalez\.png/.test(card) && /PNG/.test(card) && /Importado el/.test(card) && /Origen: URL externa \(formularios\.test\)/.test(card), card);
    check('…y «Ver comprobante», «Descargar», «Reemplazar comprobante»', ['Ver comprobante', 'Descargar', 'Reemplazar comprobante'].every(t => card.includes(t)));
    check('la miniatura se pinta', await page.locator('[data-testid=receipt-card] img').first().evaluate(i => i.complete && i.naturalWidth > 0).catch(() => false));
    const f = await fila(HIST);
    check('en la base: comprobante en el prefijo del evento, estado SIN cambiar', f.receiptKey?.startsWith('private/event-receipts/ev-conf/') && f.status === 'submitted' && f.receiptMime === 'image/png');
    check('la copia es idéntica al original', objects.get(f.receiptKey)?.body?.equals(PNG));
    check('la cabecera sigue «Pendiente de validación»', await page.getByText('Pendiente de validación').first().isVisible());
    check('el historial lo cuenta', /importó el comprobante «Comprobante Kely Gonzalez\.png» desde un enlace externo \(formularios\.test\)/.test(await page.innerText('body')));
    if (SHOT) await page.locator('[data-testid=receipt-card]').screenshot({ path: `${SHOT}/3-comprobante-adjunto.png` });
    await page.getByRole('button', { name: 'Ver comprobante' }).first().click();
    const visor = page.getByRole('dialog', { name: /Comprobante Comprobante Kely/ });
    await visor.waitFor({ timeout: 8000 }).catch(() => {});
    check('«Ver comprobante» abre el visor con la imagen', await visor.locator('img').evaluate(i => i.complete && i.naturalWidth > 0).catch(() => false));
    if (SHOT) await page.screenshot({ path: `${SHOT}/4-visor.png` });
    await page.keyboard.press('Escape');
    check('Escape cierra el visor', !(await visor.isVisible().catch(() => false)));
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Móvil (390 px) — un enlace privado y luego un PDF');
{
    const { page, errores } = await abrir({ width: 390, height: 844 });
    await page.locator('tbody tr', { hasText: 'RPF13-C-MOVIL' }).first().click();
    await page.getByRole('button', { name: 'Importar comprobante desde URL' }).click();
    const modal = page.getByRole('dialog', { name: 'Importar comprobante desde URL' });
    await modal.waitFor();
    const caja = await modal.boundingBox();
    check('el modal cabe en el teléfono', caja && caja.x >= 0 && caja.x + caja.width <= 391, JSON.stringify(caja));
    await modal.locator('#import-receipt-url').fill('http://formularios.test/pago.pdf');
    await modal.getByRole('button', { name: 'Verificar enlace' }).click();
    check('http:// → «no es válido» sin ir al servidor', /no es válido/.test(await modal.innerText()));
    await modal.locator('#import-receipt-url').fill(EXT('/privado.pdf'));
    await modal.getByRole('button', { name: 'Importar comprobante' }).click();
    await modal.getByRole('alert').waitFor({ timeout: 10000 }).catch(() => {});
    const err = await modal.getByRole('alert').innerText().catch(() => '');
    check('privado → «requiere permisos adicionales … Subir comprobante»', /requiere permisos adicionales/.test(err) && /Subir comprobante/.test(err), err);
    if (SHOT) await page.screenshot({ path: `${SHOT}/5-movil-restringido.png` });
    check('nada cambió en la inscripción', !(await fila(OTRO)).receiptKey);
    await modal.locator('#import-receipt-url').fill(EXT('/uploads/pago.pdf'));
    await modal.getByRole('button', { name: 'Importar comprobante' }).click();
    await page.getByText(/Comprobante importado y asociado/).waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const card = await page.locator('[data-testid=receipt-card]').innerText().catch(() => '');
    check('importar sin verificar antes también funciona (PDF)', /pago\.pdf/.test(card) && /PDF/.test(card), card);
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

await browser.close();
srv.close(); s3.close(); externo.close();
console.log(`\n${malos.length ? '❌' : '✅'} test:receipt-url-import:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
