#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// «Confirmar pago manualmente», EN UN NAVEGADOR y contra el SERVIDOR REAL — v4.1308
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:manual-payment:ui
//
// La pantalla real (PostulacionesPagos) en Chromium, con sus peticiones a
// `/api/project-fair/**` reenviadas al router real del módulo sobre Postgres
// real y un S3 simulado (con CORS, porque el navegador sube DIRECTO al
// almacenamiento). Recorre lo que pidió el comité con la captura delante:
// abrir la ficha, adjuntar el comprobante, ver que el pago cubre los dos
// proyectos de la inscripción, revisar, confirmar, y que el conteo de
// pagadas cambie sin recargar. También a 390 px.
//
// Con MANUAL_UI_SHOT=<carpeta> deja capturas. Se salta sin base local, sin
// playwright o sin esbuild. Usa el CSS de `dist/assets` si existe.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:manual-payment:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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

// ── S3 simulado, con CORS ─────────────────────────────────────────────
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
// `localhost`, como la página: Chrome bloquea que un origen cuyo espacio de
// red no conoce suba a una dirección de loopback (Local Network Access).
process.env.AWS_ENDPOINT_URL_S3 = `http://localhost:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-ui','XII Feria','xii-ui') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-ui','evt-ui', $1::jsonb) ON CONFLICT DO NOTHING`,
    [JSON.stringify({ registration: { priceMode: 'COP', amountCop: 250000, secondProjectAmountCop: 100000 } })]);
const REG = (await db.query(`INSERT INTO "ProjectFairRegistration" ("eventId", "clubName", district, email, modality) VALUES ('evt-ui','Barranquilla Centro','Rotary Distrito 4271','jorge@x.org','double') RETURNING id`)).rows[0].id;
const sub = async (ref, nombre, index, amount) => (await db.query(`INSERT INTO "ProjectFairSubmission"
    ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "registrationId", "projectIndex", "appliedAt", "budgetUsd")
    VALUES ($1,'evt-ui','Jorge','Nieto','jorge@x.org','Barranquilla Centro','Rotary Distrito 4271',$2,'received','pending_payment','+57 300','salud',$3,$4,$5,NOW(),100000) RETURNING id`,
    [ref, nombre, amount, REG, index])).rows[0].id;
const P1 = await sub('FP-SORIS1', 'Jornada de las Sorisas', 1, 250000);
const P2 = await sub('FP-HILOS2', 'Milagro entre hilos', 2, 100000);

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const TOKEN = jwt.sign({ id: 'u-admin', email: 'valledupar@feria.org', role: 'administrator', clubId: 'club-feria' }, SECRET);

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

const dir = mkdtempSync(join(tmpdir(), 'manual-ui-'));
const PDF = join(dir, 'Comprobante transferencia Bancolombia.pdf');
writeFileSync(PDF, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(30000, 32), Buffer.from('\n%%EOF')]));

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// La página se sirve con `route.fulfill` y su espacio de red queda «desconocido»:
// Chrome le negaría subir al S3 simulado de loopback (Local Network Access).
// En producción el almacenamiento es S3 de AWS, público: no aplica.
const ARGS = ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'];
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME, args: ARGS } : { args: ARGS });
const SHOT = process.env.MANUAL_UI_SHOT;

const abrir = async (viewport) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().replace(/\?X-Amz[^']*/, '?…').slice(0, 400)); });
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria', settings: [] } }));
    // El módulo, contra el servidor REAL.
    await page.route('**/api/project-fair/**', async r => {
        const u = new URL(r.request().url());
        const resp = await r.fetch({ url: `${API_REAL}${u.pathname}${u.search}` });
        await r.fulfill({ response: resp });
    });
    await page.goto('http://localhost/?evento=evt-ui&tab=submissions');
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

console.log('\n▸ Escritorio (1500 px)');
{
    const { page, errores } = await abrir({ width: 1500, height: 1000 });
    const pagadasAntes = await page.locator('text=/en el sistema · \\d+ pagadas/').first().textContent().catch(() => '');
    await page.locator('tr', { hasText: 'FP-SORIS1' }).getByRole('button', { name: /Ver/ }).click();
    await page.getByRole('button', { name: /Confirmar pago manualmente/ }).first().click();
    const modal = page.locator('div.fixed', { hasText: 'Confirmar Pago Manualmente' }).last();
    await modal.waitFor();
    const texto = await modal.innerText();
    check('la ventana muestra la inscripción de dos proyectos', /Este club inscribió 2 proyectos/.test(texto), texto.slice(0, 300));
    check('propone cubrir «Milagro entre hilos» (marcado)', await modal.getByRole('checkbox').isChecked());
    check('el valor se prellena con la inscripción completa: 350000', (await modal.locator('input[type=number]').inputValue()) === '350000');
    const fecha = await modal.locator('input[type=datetime-local]').inputValue();
    const ahora = new Date();
    check('la fecha se prellena en hora LOCAL', fecha.startsWith(`${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}T${String(ahora.getHours()).padStart(2, '0')}`), fecha);
    check('el botón para adjuntar está a la vista', await modal.getByRole('button', { name: /Adjuntar comprobante/ }).isVisible());

    await modal.locator('input[type=file]').setInputFiles(PDF);
    await modal.getByText('Comprobante transferencia Bancolombia.pdf').waitFor({ timeout: 8000 }).catch(() => {});
    check('el comprobante sube DIRECTO al almacenamiento y se muestra con su nombre', [...objects.keys()].some(k => k.startsWith(`private/project-fair-receipts/${P1}/`)));
    check('la referencia del soporte pasa a ser opcional', /Referencia del soporte \(opcional\)/.test(await modal.innerText()));
    if (SHOT) await page.screenshot({ path: `${SHOT}/manual-1-ventana.png` });

    await modal.locator('input[placeholder^="Ej. Bancolombia"]').fill('Bancolombia #9482710');
    await modal.locator('textarea').fill('Consignación directa a la cuenta del comité organizador');
    await modal.getByRole('button', { name: /Continuar a revisión/ }).click();
    const rev = await modal.innerText();
    check('la revisión dice que marcará los 2 proyectos', /los 2 proyectos/.test(rev), rev.slice(0, 400));
    check('la revisión lista el comprobante y lo que cubre', /Comprobante transferencia Bancolombia\.pdf/.test(rev) && /Milagro entre hilos/.test(rev));
    check('sin aviso de diferencia: 350.000 es lo esperado', !/es distinto del valor esperado/.test(rev));
    if (SHOT) await page.screenshot({ path: `${SHOT}/manual-2-revision.png` });

    await modal.getByRole('button', { name: /Confirmar y desbloquear/ }).click();
    await page.getByText(/inscripción completa quedó pagada/).waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    check('la ventana se cierra al confirmar', !(await page.locator('text=Confirmar Pago Manualmente').isVisible()));
    const a = await fila(P1), b = await fila(P2);
    check('en la base: los dos proyectos pagados, origen manual', a.status === 'paid' && b.status === 'paid' && b.paymentConfirmationOrigin === 'manual_admin');
    check('en la base: lo recibido una vez (350.000 en el primero)', Number(a.amountReceived) === 350000 && b.amountReceived === null);
    check('en la base: comprobante guardado como PDF', a.manualPaymentReceiptMime === 'application/pdf' && /Bancolombia/.test(a.manualPaymentReceiptName));

    await page.locator('button').filter({ hasText: /^Pago$/ }).last().click();
    await page.waitForTimeout(400);
    const ficha = await page.locator('div.rounded-xl', { hasText: 'Confirmación Administrativa Manual' }).last().innerText().catch(() => '');
    check('la ficha muestra la confirmación con el comprobante adjunto', /Confirmación Administrativa Manual/i.test(ficha) && /Comprobante transferencia Bancolombia\.pdf/.test(ficha), ficha.slice(0, 300));
    check('y dice que el pago cubre también el segundo proyecto', /FP-HILOS2/.test(ficha));
    if (SHOT) await page.screenshot({ path: `${SHOT}/manual-3-ficha.png` });

    await page.keyboard.press('Escape');
    const pagadasDespues = await page.locator('text=/en el sistema · \\d+ pagadas/').first().textContent().catch(() => '');
    check('«N en el sistema · M pagadas» se actualiza sin recargar', /2 pagadas/.test(pagadasDespues || ''), `${pagadasAntes} → ${pagadasDespues}`);
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ Móvil (390 px)');
{
    await db.query(`UPDATE "ProjectFairSubmission" SET status = 'pending_payment', "amountReceived" = NULL, metadata = '{}'::jsonb, "paymentConfirmationOrigin" = NULL, "manualPaymentReceiptKey" = NULL WHERE id = ANY($1::text[])`, [[P1, P2]]);
    const { page, errores } = await abrir({ width: 390, height: 844 });
    await page.locator('tr', { hasText: 'FP-HILOS2' }).getByRole('button', { name: /Ver/ }).click();
    await page.getByRole('button', { name: /Confirmar pago manualmente/ }).first().click();
    const modal = page.locator('div.fixed', { hasText: 'Confirmar Pago Manualmente' }).last();
    await modal.waitFor();
    const caja = await modal.locator('> div').first().boundingBox();
    check('la ventana cabe en el ancho del teléfono', caja && caja.x >= 0 && caja.x + caja.width <= 391, JSON.stringify(caja));
    const scroll = await modal.locator('> div').first().evaluate(el => ({ over: getComputedStyle(el).overflowY, h: el.clientHeight, vh: window.innerHeight }));
    check('y se desplaza por dentro si es más alta que la pantalla', scroll.over === 'auto' && scroll.h <= scroll.vh, JSON.stringify(scroll));
    check('abierta desde el segundo proyecto, propone cubrir el primero', /Jornada de las Sorisas/.test(await modal.innerText()) && await modal.getByRole('checkbox').isChecked());
    await modal.getByRole('checkbox').uncheck();
    check('al desmarcarlo, el valor vuelve a la línea propia (100000)', (await modal.locator('input[type=number]').inputValue()) === '100000');
    if (SHOT) await page.screenshot({ path: `${SHOT}/manual-4-movil.png`, fullPage: false });
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

await browser.close();
srv.close(); s3.close();
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:manual-payment:ui — ${ok} pasaron, ${malos.length} fallaron.`);
process.exit(malos.length ? 1 : 0);
