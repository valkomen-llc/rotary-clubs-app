#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// EXCHANGE, EN UN NAVEGADOR (v4.1335.0)
//
//   FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/…?sslmode=disable npm run test:fair:exchange:ui
//
// «Proyectos postulados» real contra el servidor REAL del módulo y Postgres
// REAL: la columna, el clip que abre el comprobante, el visor, conciliar desde
// el panel, el resumen y sus filtros, «Registrar traslado» con la barra de la
// Bóveda, el administrador del evento (sólo consulta) y el teléfono (390 px).
// Se salta sin base local, playwright o esbuild. Capturas: EXCHANGE_UI_SHOT=carpeta.
// ════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:exchange:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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
const SHOT = process.env.EXCHANGE_UI_SHOT || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 300)}` : ''); }
};

// ── S3 simulado ─────────────────────────────────────────────────────
const objects = new Map();
const s3 = http.createServer((req, res) => {
    const key = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/test_bucket\//, ''));
    const o = objects.get(key);
    if (!o) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Length': o.length, 'Content-Type': 'application/pdf', 'Access-Control-Allow-Origin': '*' });
    return res.end(req.method === 'HEAD' ? undefined : o);
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));
process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Payment" (id TEXT PRIMARY KEY, provider TEXT DEFAULT 'stripe', "providerRef" TEXT, status TEXT, amount DOUBLE PRECISION,
    currency TEXT, "rawPayload" TEXT, "orderId" TEXT, "clubId" TEXT, "applicationFee" DOUBLE PRECISION, "netAmount" DOUBLE PRECISION, "isPlatformCollection" BOOLEAN DEFAULT TRUE,
    "stripeBalanceTxId" TEXT, "stripeStatus" TEXT, "availableOn" TIMESTAMPTZ, "clubAvailableOn" TIMESTAMPTZ, "paymentMethod" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, location, "clubId") VALUES ('evt-ui','XII Feria de Proyectos Rotary Colombia','xii-ui','Valledupar','club-feria') ON CONFLICT DO NOTHING`);
await db.query(`INSERT INTO "User" (id, email, name, role, "clubId") VALUES ('u-ev','consulta@d4281.org','Admin Evento','district_admin','c-d4281') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
const { ensureDisbursementSchema } = await import(`${REPO}/server/lib/ensureDisbursementSchema.js`);
await ensureTables();
await ensureDisbursementSchema();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-ui','evt-ui', $1::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = EXCLUDED.config`,
[JSON.stringify({ registration: { priceMode: 'COP', amountCop: 250000 } })]);
const sub = async (ref, nombre, { pi = null, manual = false, paid = true } = {}) => {
    const row = (await db.query(`INSERT INTO "ProjectFairSubmission"
        ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "focusAreaLabel", "amountCop", "appliedAt", "projectIndex", "stripePaymentIntentId", "paidAt", "paymentConfirmationOrigin")
        VALUES ($1,'evt-ui','Paula','Cruz',$2,'Club Rotario Pereira','4281',$3,'received',$4,'+573176547111','education','Educación',250000,NOW(),1,$5,$6,$7) RETURNING *`,
    [ref, `${ref.toLowerCase()}@club.org`, nombre, paid ? 'paid' : 'pending_payment', pi, paid ? new Date() : null, paid ? (manual ? 'manual_admin' : 'stripe') : null])).rows[0];
    if (pi) await db.query(`INSERT INTO "Payment" (id, "providerRef", status, amount, currency, "clubId", "netAmount", "availableOn", "clubAvailableOn") VALUES ($1,$2,'succeeded',250000,'cop','club-feria',250000, NOW() - interval '20 days', NOW() - interval '10 days')`, [`pay-${ref}`, pi]);
    return row;
};
const A = await sub('FP-UIA', 'Agua potable para Valledupar', { pi: 'pi_ua' });
await sub('FP-UIB', 'Becas rurales', { pi: 'pi_ub' });
await sub('FP-UIC', 'Comedor escolar', { pi: 'pi_uc' });
await sub('FP-UIE', 'Equipos de salud', { pi: 'pi_ue' });
await sub('FP-UIF', 'Feria de emprendimiento', { manual: true });
objects.set('private/disbursements/dA.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(500, 32), Buffer.from('\n%%EOF')]));
objects.set('private/disbursements/lote.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(500, 32), Buffer.from('\n%%EOF')]));
await db.query(`INSERT INTO "Disbursement" (id, "paymentId", "clubId", amount, currency, "disbursedAt", beneficiary, method, reference, status, "receiptKey", "receiptName", "receiptMime", "receiptBytes", "createdByName")
    VALUES ('dA','pay-FP-UIA','club-feria',250000,'COP','2026-10-15T15:00:00Z','Colrotarios','transferencia_bancaria','MERC-101','confirmado','private/disbursements/dA.pdf','traslado-agua.pdf','application/pdf',520,'Tesorería')`);
await db.query(`INSERT INTO "DisbursementBatch" (id, "clubId", beneficiary, currency, "count", "netAmount", method, reference, "disbursedAt", status, "receiptKey", "receiptName", "receiptMime", "receiptBytes", "createdByName")
    VALUES ('loteui','club-feria','Colrotarios','COP',2,500000,'transferencia_bancaria','MERC-202','2026-10-20T15:00:00Z','confirmado','private/disbursements/lote.pdf','lote-octubre.pdf','application/pdf',520,'Tesorería')`);
for (const [id, p] of [['dB', 'FP-UIB'], ['dC', 'FP-UIC']]) {
    await db.query(`INSERT INTO "Disbursement" (id, "paymentId", "clubId", amount, currency, "disbursedAt", beneficiary, method, reference, status, "batchId", "createdByName")
        VALUES ($1,$2,'club-feria',250000,'COP','2026-10-20T15:00:00Z','Colrotarios','transferencia_bancaria','MERC-202','confirmado','loteui','Tesorería')`, [id, `pay-${p}`]);
}

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API_REAL = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const ADMIN = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'club-feria' }, SECRET);
const EVENT_ADMIN = jwt.sign({ id: 'u-ev', email: 'consulta@d4281.org', role: 'district_admin', clubId: 'c-d4281' }, SECRET);

const wrap = (importPath, props = '') => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
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
                        React.createElement(React.Fragment, null, React.createElement(Toaster, null), React.createElement(Pantalla, ${props || 'null'}))))))));
`;
const ADMIN_JS = (await build({
    stdin: { contents: wrap('./src/pages/admin/PostulacionesPagos', "{ embedded: true, eventId: 'evt-ui' }"), resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"0.0.0-diag"' },
    jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl' },
})).outputFiles[0].text;

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
const abrir = async ({ viewport, token }) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: SHOT ? 2 : 1 });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    await page.route('http://localhost/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body>' }));
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-feria', name: 'Feria', settings: [] } }));
    await page.route(`http://127.0.0.1:${s3.address().port}/**`, r => r.fulfill({ contentType: 'application/pdf', body: objects.get('private/disbursements/dA.pdf') }));
    await page.route('**/api/project-fair/**', async r => {
        const u = new URL(r.request().url());
        const resp = await r.fetch({ url: `${API_REAL}${u.pathname}${u.search}`, timeout: 60000 });
        await r.fulfill({ response: resp });
    });
    await page.goto('http://localhost/admin/dashboard?panel=proyectos&evento=evt-ui');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate((t) => localStorage.setItem('rotary_token', t), token);
    await page.addScriptTag({ content: ADMIN_JS });
    await page.evaluate(() => window.go('/admin/dashboard?panel=proyectos&evento=evt-ui'));
    await page.waitForTimeout(2200);
    return { page, errores };
};
const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (page, name, full = false) => { if (SHOT) await page.screenshot({ path: join(SHOT, `${name}.png`), fullPage: full }); };

try {
    console.log('\n▸ Comité, escritorio');
    {
        const { page, errores } = await abrir({ viewport: { width: 1600, height: 1100 }, token: ADMIN });
        await page.getByRole('columnheader', { name: /Exchange/ }).waitFor({ timeout: 20000 }).catch(() => {});
        check('la columna «Exchange» está en la tabla', await page.getByRole('columnheader', { name: /Exchange/ }).isVisible());
        const heads = await page.locator('thead th').allInnerTexts();
        const iPago = heads.findIndex(h => /^Pago/i.test(h.trim()));
        const iEx = heads.findIndex(h => /Exchange/i.test(h));
        check('junto a Pago y Valor', iEx === iPago + 2, heads.join(' | '));
        check('«En conciliación» con su clip', await page.getByRole('button', { name: 'Ver el comprobante de traslado de Agua potable para Valledupar' }).isVisible());
        check('el pago sin traslado dice «Pendiente» y ofrece registrarlo', (await page.getByText('Pendiente', { exact: true }).count()) > 0 && await page.getByRole('button', { name: 'Registrar el traslado de Equipos de salud' }).isVisible());
        check('la confirmación manual dice «Pago directo»', (await page.getByText('Pago directo', { exact: true }).count()) > 0);
        await shot(page, 'exchange-tabla-1600');

        await page.getByRole('button', { name: 'Ver el comprobante de traslado de Agua potable para Valledupar' }).click();
        const dlg = page.getByRole('dialog', { name: /Exchange: traslado y conciliación/ });
        await dlg.getByText('Transferencia individual').waitFor({ timeout: 15000 }).catch(() => {});
        check('el visor abre con la transferencia', await dlg.getByText('Transferencia individual').isVisible());
        check('… y los tres estados por separado', await dlg.getByText('Pago de inscripción').isVisible() && await dlg.getByText('Conciliación', { exact: true }).isVisible());
        check('… la referencia bancaria', await dlg.getByText('MERC-101').isVisible());
        await shot(page, 'exchange-visor-1600');
        await dlg.getByRole('button', { name: 'Ver' }).first().click();
        const viewer = page.getByRole('dialog', { name: /Comprobante traslado-agua\.pdf/ });
        await viewer.waitFor({ timeout: 10000 }).catch(() => {});
        check('el clip abre el comprobante CORRECTO en el visor de comprobantes', await viewer.isVisible());
        check('con su botón de descarga', await viewer.getByRole('button', { name: 'Descargar' }).isVisible());
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        check('cerrar el visor deja abierto el detalle', await dlg.isVisible());

        await dlg.getByRole('button', { name: 'Marcar como conciliado' }).click();
        await dlg.getByLabel('Motivo u observación').fill('Verificado contra el extracto de Colrotarios');
        await dlg.getByRole('button', { name: 'Confirmar' }).click();
        await page.waitForTimeout(1500);
        check('se concilia desde el visor', (await dlg.getByText('Conciliado', { exact: true }).count()) > 0);
        await dlg.getByRole('button', { name: /Historial Exchange/ }).click();
        check('el historial lo registra', await dlg.getByText('Conciliación confirmada').isVisible());
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1200);
        check('la tabla se actualiza: «Conciliado»', (await page.locator('tbody').getByText('Conciliado', { exact: true }).count()) > 0);

        await page.getByRole('button', { name: /Exchange — traslados y conciliación/ }).click();
        await page.getByText('Total trasladado').waitFor({ timeout: 15000 }).catch(() => {});
        check('el resumen expandible muestra los indicadores', await page.getByText('Total trasladado').isVisible() && await page.getByText('Total conciliado').isVisible());
        check('el total trasladado cuenta el lote UNA vez (750.000)', (await page.getByText(/\$\s?750\.000/).count()) > 0);
        await shot(page, 'exchange-resumen-1600');
        await page.getByRole('button', { name: /^En conciliación \d/ }).click();
        await page.waitForTimeout(1500);
        const refs = await page.locator('tbody tr td:first-child').allInnerTexts();
        check('el filtro «En conciliación» deja el lote (B y C)', refs.length === 2 && refs.every(r => /FP-UI[BC]/.test(r)), refs.join(','));
        await page.getByRole('button', { name: /^Todos \d/ }).click();
        await page.waitForTimeout(1500);

        await page.getByRole('button', { name: 'Registrar el traslado de Equipos de salud' }).click();
        await page.getByText('Traslado de lo cobrado').waitFor({ timeout: 15000 }).catch(() => {});
        check('«Registrar traslado» abre la MISMA barra de la Bóveda', await page.getByText('Traslado de lo cobrado').isVisible());
        await shot(page, 'exchange-registrar-1600');
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }

    console.log('\n▸ Administrador del evento (sólo consulta)');
    {
        await fetch(`${API_REAL}/api/project-fair/admin/exchange/accesos?evento=evt-ui`, {
            method: 'POST', headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'consulta@d4281.org', canDownload: true }),
        });
        const { page, errores } = await abrir({ viewport: { width: 1500, height: 1000 }, token: EVENT_ADMIN });
        await page.getByRole('columnheader', { name: /Exchange/ }).waitFor({ timeout: 20000 }).catch(() => {});
        await shot(page, 'exchange-consulta-inicio');
        if (errores.length) console.log('   errores:', errores.join(' | '));
        check('ve la columna Exchange', await page.getByRole('columnheader', { name: /Exchange/ }).isVisible());
        check('no ve correos ni teléfonos de los responsables', (await page.getByText('fp-uia@club.org').count()) === 0 && (await page.getByText('+573176547111').count()) === 0);
        check('no tiene la ficha completa («Ver» del expediente)', (await page.locator('tbody').getByRole('button', { name: /^Ver$/ }).count()) === 0);
        await page.getByRole('button', { name: 'Ver el comprobante de traslado de Becas rurales' }).click();
        const dlg = page.getByRole('dialog', { name: /Exchange: traslado y conciliación/ });
        await dlg.getByText(/Transferencia agrupada/).waitFor({ timeout: 15000 }).catch(() => {});
        check('consulta la transferencia agrupada con sus dos proyectos', await dlg.getByText(/Transferencia agrupada \(2 proyectos\)/).isVisible());
        check('sin botones para conciliar ni corregir', (await dlg.getByRole('button', { name: /conciliado|Corregir|Registrar datos|Adjuntar/ }).count()) === 0);
        check('se le dice que su acceso es de consulta', await dlg.getByText(/Acceso de consulta/).isVisible());
        await shot(page, 'exchange-consulta-1500');
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }

    console.log('\n▸ Teléfono (390 px)');
    {
        const { page, errores } = await abrir({ viewport: { width: 390, height: 844 }, token: ADMIN });
        await page.getByText('Equipos de salud').first().waitFor({ timeout: 20000 }).catch(() => {});
        check('las tarjetas llevan Exchange', (await page.getByRole('listitem').filter({ hasText: 'Exchange' }).count()) >= 4);
        if (CSS) check('sin desplazamiento horizontal', await sinScrollHorizontal(page));
        await page.getByRole('button', { name: 'Ver el comprobante de traslado de Becas rurales' }).click();
        const dlg = page.getByRole('dialog', { name: /Exchange: traslado y conciliación/ });
        await dlg.getByText(/Transferencia agrupada/).waitFor({ timeout: 15000 }).catch(() => {});
        check('el visor abre a pantalla completa', await dlg.isVisible());
        if (CSS) check('el visor tampoco desborda', await sinScrollHorizontal(page));
        await shot(page, 'exchange-movil-390', true);
        check('sin errores en la página', errores.length === 0, errores.join(' | '));
        await page.close();
    }
} finally {
    await browser.close();
    srv.close(); s3.close();
    await db.pool.end();
}
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:exchange:ui — ${ok} bien, ${malos.length} mal.`);
if (malos.length) process.exit(1);
