#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// test:fair:club-ficha:ui — «Descargar ficha técnica (PDF)» en Mi Proyecto
// (v4.1345), de punta a punta: servidor REAL del módulo, Postgres REAL y un
// navegador que pulsa el botón y descarga el PDF. Se lee el PDF descargado
// (pdfjs) para comprobar qué dice.
//
//   FAIR_E2E_DATABASE_URL=postgres://postgres@127.0.0.1:5433/fair npm run test:fair:club-ficha:ui
//
// Se salta sin base local, playwright, esbuild o dist/assets. Capturas y el
// PDF: CLUB_FICHA_SHOT=carpeta.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:club-ficha:ui] Sin FAIR_E2E_DATABASE_URL local: se omite.');
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
if (!CSS) { console.log('… se salta: falta dist/assets (correr `npx vite build`)'); process.exit(0); }
const SHOT = process.env.CLUB_FICHA_SHOT || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });

// El logotipo de la Feria: el servidor lo descarga por https. Aquí no hay red,
// así que esa ÚNICA dirección se sirve desde el propio proceso (un PNG de 2×1).
const LOGO_URL = 'https://logo.feria.test/rotary-feria.png';
// Un logotipo HORIZONTAL como el de la Feria (Rotary | Feria de Proyectos),
// rasterizado con sharp si está; si no, un PNG mínimo.
const PNG_2x1 = await (async () => {
    try {
        const sharp = (await import('sharp')).default;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="96"><rect width="420" height="96" fill="#fff"/><text x="8" y="62" font-size="44" font-family="Arial" font-weight="700" fill="#17458F">Rotary</text><circle cx="185" cy="48" r="30" fill="#F7A81B"/><text x="232" y="40" font-size="20" font-family="Arial" fill="#17458F">Feria de Proyectos</text><text x="232" y="70" font-size="24" font-family="Arial" font-style="italic" fill="#17458F">Colombia</text></svg>`;
        return await sharp(Buffer.from(svg)).png().toBuffer();
    } catch {
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgYPj/n4GBgQEADhABAWB5hzIAAAAASUVORK5CYII=', 'base64');
    }
})();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => (String(url) === LOGO_URL
    ? new Response(PNG_2x1, { status: 200, headers: { 'content-type': 'image/png' } })
    : realFetch(url, opts));

process.env.DATABASE_URL = E2E_DB;
const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT, logo TEXT)`);
await db.query(`ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS logo TEXT`);
await db.query(`INSERT INTO "Club" (id, name, logo) VALUES ('club-feria','Feria de Proyectos',$1) ON CONFLICT (id) DO UPDATE SET logo = $1`, [LOGO_URL]);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "clubId") VALUES ('evt-ficha','XII Feria','xii','club-feria') ON CONFLICT (id) DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-ficha','evt-ficha', $1::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = $1::jsonb`,
[JSON.stringify({ deadline: '2099-12-31', edition: { name: 'XII Rotary Project Fair Colombia 2027' }, registration: { priceMode: 'COP', amountCop: 250000 },
    // v4.1346 — Como en producción: la convocatoria tiene su PROPIA copia de la
    // plantilla, anterior a «Clubes participantes».
    masterForm: await (async () => {
        const { DEFAULT_MASTER_FORM } = await import(`${REPO}/server/lib/projectFairMasterForm.js`);
        return { ...DEFAULT_MASTER_FORM, sections: DEFAULT_MASTER_FORM.sections.map(sec => (sec.key === 'identificacion' ? { ...sec, fields: sec.fields.filter(f => f.key !== 'participatingClubs') } : sec)) };
    })() })]);
const sub = async (ref, name, doc) => (await db.query(`
    INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "projectIndex", "documentNumber", "appliedAt")
    VALUES ($1,'evt-ficha','Leidy','Ávila',$2,'E-Club Origen','4281',$3,'in_review','paid','+57 3001112233','paz',250000,1,$4, NOW()) RETURNING *`,
[ref, `${ref.toLowerCase()}@club.org`, name, doc]).catch(async () => (await db.query(`
    INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "projectIndex", "appliedAt")
    VALUES ($1,'evt-ficha','Leidy','Ávila',$2,'E-Club Origen','4281',$3,'in_review','paid','+57 3001112233','paz',250000,1, NOW()) RETURNING *`,
[ref, `${ref.toLowerCase()}@club.org`, name])))).rows[0];
const S = await sub('FP-6K5MAX', 'Caimalito construye paz', '1088123456');
const X = await sub('FP-OTRO', 'Proyecto de otro club', '999');

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BACK = `http://127.0.0.1:${srv.address().port}`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const portalToken = (s) => jwt.sign({ sub: `acc-${s.id}`, submissionId: s.id, email: s.email, aud: 'project-fair-portal' }, SECRET);
const tS = portalToken(S);
const call = async (method, path, token, body) => {
    const r = await fetch(`${BACK}/api/project-fair${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};

let okCount = 0; const malos = [];
const check = (name, cond, extra = '') => { if (cond) { okCount++; console.log(`  OK    ${name}`); } else { malos.push(name); console.log(`  FALLA ${name} ${extra}`); } };

// El club diligencia lo que su formulario pide (Formulación y FDD).
const fill = async (formKey, marker) => {
    const g = await call('GET', `/portal/forms/${formKey}`, tS);
    const answers = JSON.parse(JSON.stringify(g.data.answers || {}));
    for (const sec of (g.data.template?.sections || []).filter(x => !x.adminOnly)) {
        answers[sec.key] = answers[sec.key] || {};
        for (const fd of sec.fields || []) {
            if (fd.type === 'computed' || answers[sec.key][fd.key]) continue;
            answers[sec.key][fd.key] = { textarea: `${marker} ${fd.key}`, text: `${marker}`, email: 'gestor@club.org', phone: '3001234567', date: '2026-11-10', number: '100', currency: '1000', percent: '10', checkbox: true }[fd.type] ?? undefined;
            if (answers[sec.key][fd.key] === undefined) delete answers[sec.key][fd.key];
        }
    }
    return call('PUT', `/portal/forms/${formKey}`, tS, { answers });
};

try {
    console.log('\n▸ El servidor');
    check('la Formulación se guarda', (await fill('master', 'Formulación')).status === 200);
    check('la Solicitud del FDD se guarda', (await fill('fdd_2026_2027', 'FDD')).status === 200);

    console.log('\n▸ Clubes participantes (v4.1346, caso Paula Cruz)');
    let gm = await call('GET', '/portal/forms/master', tS);
    const identKeys = (gm.data.template?.sections || []).find(x => x.key === 'identificacion')?.fields.map(f => f.key) || [];
    check('con una plantilla guardada vieja, el campo aparece igual (se agrega al leer)', identKeys.includes('participatingClubs'));
    const am = gm.data.answers;
    am.identificacion = { ...(am.identificacion || {}), participatingClubs: ['Pereira', 'Pereira del Otún', 'Pereira Nuevo'] };
    let pm = await call('PUT', '/portal/forms/master', tS, { answers: am });
    check('el gestor guarda los clubes participantes', pm.status === 200);
    const guardado = (await db.query('SELECT answers FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', [S.id])).rows[0].answers;
    check('quedan en la base como lista', JSON.stringify(guardado.identificacion.participatingClubs) === JSON.stringify(['Pereira', 'Pereira del Otún', 'Pereira Nuevo']));

    console.log('\n▸ Presupuesto (v4.1347, caso Paula Cruz)');
    // La Formulación SIN «Distrito Colombiano» en dólares; el FDD pide 958.
    am.presupuesto = { budgetTable: { projectCost: { pesos: '464297236', usd: '136558' }, localClub: { pesos: '20400000', usd: '6000' } } };
    // v4.1354 — Paula cambió el título en la Formulación y el club principal
    // es Pereira Perla del Otún, no el club con el que se inscribió la cuenta.
    am.identificacion = { ...(am.identificacion || {}), projectName: 'Cuna de Vida: Recuperando la atención neonatal en Pereira tras el terremoto', clubName: 'Pereira Perla del Otún' };
    check('la Formulación guarda su presupuesto, el título nuevo y el club principal', (await call('PUT', '/portal/forms/master', tS, { answers: am })).status === 200);
    const gf = await call('GET', '/portal/forms/fdd_2026_2027', tS);
    const af = gf.data.answers;
    af.presupuesto = { ...(af.presupuesto || {}), budgetUsd: '136558', budgetBreakdown: [
        { concept: 'Equipment', amountUsd: '132727' }, { concept: 'Monitoring/evaluation', amountUsd: '441' },
        { concept: 'Project management', amountUsd: '735' }, { concept: 'Operations (Unforeseen)', amountUsd: '2655' },
        // v4.1353 — Paula agregó el total como un rubro más: «por eso me sale el doble».
        // v4.1354 — Y luego borró la palabra «total» pero dejó el monto.
        { concept: '', amountUsd: '136558' }] };
    af.fdd = { ...(af.fdd || {}), requestedUsd: '958' };
    // v4.1353 — Otro club escrito en el texto «Nombre del Club Rotario» del FDD.
    af.club = { ...(af.club || {}), clubName: 'E-Club Origen y Club Rotario Dosquebradas' };
    check('el FDD guarda su desglose (con la fila «total» del club) y lo solicitado', (await call('PUT', '/portal/forms/fdd_2026_2027', tS, { answers: af })).status === 200);
    let r = await call('GET', '/portal/ficha', null);
    check('sin sesión del perfil, nada', r.status === 401);
    r = await call('GET', '/portal/ficha', tS);
    check('con la sesión del gestor: su ficha', r.status === 200 && r.data.publicRef === 'FP-6K5MAX' && r.data.audience === 'club');
    const keys = (r.data.es?.groups || []).map(g => g.key);
    check('con el registro, la Formulación y el FDD', keys.includes('submission') && keys.includes('master') && keys.includes('fdd_2026_2027'), keys.join(','));
    const json = JSON.stringify(r.data.es);
    check('NUNCA el documento de identidad', !json.includes('1088123456') && !json.includes('submission.document'));
    check('ni lo que escribe sólo el comité (adminOnly)', !(r.data.es.groups || []).some(g => g.sections.some(s => s.adminOnly)));
    check('sí la Aprobación institucional del FDD, que diligencia el club (v4.1347)', (r.data.es.groups || []).some(g => g.key === 'fdd_2026_2027' && g.sections.some(s => s.key === 'aprobacion')));
    check('trae el logotipo de la Feria (lo descarga el servidor)', typeof r.data.logo === 'string' && r.data.logo.startsWith('data:image/png;base64,'));
    const rx = await call('GET', '/portal/ficha', portalToken(X));
    check('otro club descarga SU ficha, nunca la ajena', rx.status === 200 && rx.data.publicRef === 'FP-OTRO');
    const log = (await db.query(`SELECT * FROM "ProjectDossierExport" WHERE mode = 'club' ORDER BY "createdAt"`)).rows;
    check('cada descarga queda registrada (modo «club»)', log.length >= 2 && log.some(l => JSON.stringify(l.submissionIds).includes(S.id)));

    console.log('\n▸ El botón y el PDF en el navegador');
    const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import DocumentProgressPanel from './src/components/project-forms/DocumentProgressPanel';
import { buildDossierPdf } from './src/lib/projectDossierPdf';
import { FormField } from './src/components/project-forms/FormFields';
import { PARTICIPATING_CLUBS_FIELD } from './server/lib/projectFairMasterForm.js';
import { DEFAULT_FDD_FORM } from './server/lib/projectFairFddForm.js';
const BREAKDOWN = DEFAULT_FDD_FORM.sections.find(x => x.key === 'presupuesto').fields.find(f => f.key === 'budgetBreakdown');
const DesgloseDemo = () => {
    const [v, setV] = React.useState([{ concept: 'Equipment', amountUsd: '132727' }, { concept: 'Monitoring/evaluation', amountUsd: '441' }, { concept: 'Project management', amountUsd: '735' }, { concept: 'Operations', amountUsd: '2655' }, { concept: '', amountUsd: '136558' }]);
    window.__desglose = v;
    return React.createElement('div', { style: { padding: 16, maxWidth: 760 }, 'data-demo-desglose': true },
        React.createElement(FormField, { field: { ...BREAKDOWN }, value: v, answers: {}, disabled: false, onChange: setV }));
};
window.goDesglose = () => createRoot(document.getElementById('root')).render(React.createElement(DesgloseDemo));
const ClubsDemo = () => {
    const [v, setV] = React.useState(['Pereira']);
    window.__clubs = v;
    return React.createElement('div', { style: { padding: 16, maxWidth: 760 }, 'data-demo-clubs': true },
        React.createElement(FormField, { field: { ...PARTICIPATING_CLUBS_FIELD }, value: v, answers: {}, disabled: false, onChange: setV }));
};
window.goClubs = () => createRoot(document.getElementById('root')).render(React.createElement(ClubsDemo));
// La ficha del COMITÉ (expediente) con la misma letra: se arma en el navegador.
window.adminPdf = async (payload) => {
    const doc = await buildDossierPdf(payload);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
};
window.go = (t) => createRoot(document.getElementById('root')).render(React.createElement('div', { style: { padding: 16, maxWidth: 1100 } }, React.createElement(DocumentProgressPanel, { token: t })));`;
    const JS = (await build({ stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser',
        define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' }, jsx: 'automatic', logLevel: 'silent' })).outputFiles[0].text;
    const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux/chrome';
    const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
    try {
        for (const [modo, vp] of [['normal', { width: 1280, height: 900 }], ['normal', { width: 390, height: 844 }], ['sin-fuente', { width: 1280, height: 900 }], ['clubes', { width: 390, height: 844 }]]) {
            const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true, deviceScaleFactor: SHOT ? 2 : 1 });
            const page = await ctx.newPage();
            const errores = [];
            page.on('pageerror', e => errores.push(e.message));
            await page.route('http://localhost/**', async (route) => {
                const url = new URL(route.request().url());
                if (url.pathname.startsWith('/api/club-catalog/public/clubs')) {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clubs: [
                        { id: 'c1', name: 'Pereira', shortName: 'Pereira', city: 'Pereira', state: 'Risaralda', country: 'Colombia', districtNumber: 4281, organizationType: 'Club Rotario', clubType: 'rotary' },
                        { id: 'c2', name: 'Pereira del Otún', shortName: 'Otún', city: 'Pereira', state: 'Risaralda', country: 'Colombia', districtNumber: 4281, organizationType: 'Club Rotario', clubType: 'rotary' },
                        { id: 'c3', name: 'Pereira Nuevo', shortName: 'Nuevo', city: 'Pereira', state: 'Risaralda', country: 'Colombia', districtNumber: 4281, organizationType: 'Club Rotario', clubType: 'rotary' },
                    ] }) });
                }
                if (url.pathname.startsWith('/api/')) {
                    const res = await realFetch(`${BACK}${url.pathname}${url.search}`, { method: route.request().method(), headers: route.request().headers() });
                    return route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' }, body: Buffer.from(await res.arrayBuffer()) });
                }
                // «sin-fuente»: el servidor responde la página (200) en vez del TTF,
                // como un hosting con respaldo de SPA ante un archivo que falta.
                if (url.pathname.startsWith('/fonts/pdf/') && modo === 'sin-fuente') {
                    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>index</body></html>' });
                }
                if (url.pathname.startsWith('/fonts/pdf/')) {
                    return route.fulfill({ status: 200, contentType: 'font/ttf', body: readFileSync(join(REPO, 'public', url.pathname)) });
                }
                return route.fulfill({ contentType: 'text/html', body: '<!doctype html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body>' });
            });
            await page.goto('http://localhost/mi-proyecto');
            await page.addStyleTag({ content: CSS });
            await page.addScriptTag({ content: JS });
            if (modo === 'clubes') {
                await page.evaluate(() => window.goClubs());
                const add = page.getByRole('button', { name: /Agregar club participante/ });
                await add.waitFor({ timeout: 10000 });
                await add.click();
                await page.getByPlaceholder('Nombre, ciudad o departamento').fill('otun');
                await page.getByText('Pereira del Otún', { exact: true }).first().click();
                await page.waitForTimeout(200);
                check('(390 px) se agrega un club del catálogo buscando «otun» (sin tilde)', JSON.stringify(await page.evaluate(() => window.__clubs)) === JSON.stringify(['Pereira', 'Pereira del Otún']));
                await add.click();
                await page.getByPlaceholder('Nombre, ciudad o departamento').fill('Pereira');
                await page.locator('[data-club-selector]').getByText('Pereira', { exact: true }).first().click();
                check('(390 px) un club repetido no se agrega y se avisa', (await page.evaluate(() => window.__clubs)).length === 2 && await page.getByText(/ya está en la lista/).isVisible());
                await page.getByRole('button', { name: 'Cancelar' }).click();
                await page.getByRole('button', { name: 'Quitar Pereira', exact: true }).click();
                check('(390 px) se quita un club con su botón', JSON.stringify(await page.evaluate(() => window.__clubs)) === JSON.stringify(['Pereira del Otún']));
                check('(390 px) sin desplazamiento horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
                if (SHOT) await page.locator('[data-demo-clubs]').screenshot({ path: join(SHOT, 'clubes-390.png') });
                check('(390 px) sin errores en la página (clubes)', errores.length === 0, errores.join(' | '));
                // v4.1354 — El desglose en el FORMULARIO avisa de la fila «total».
                await page.evaluate(() => window.goDesglose());
                await page.locator('[data-desglose-suma]').waitFor({ timeout: 10000 });
                check('(390 px) el desglose muestra la suma de los rubros SIN la fila total', /US\$ 136,558\.00/.test(await page.locator('[data-desglose-suma]').innerText()));
                check('(390 px) y avisa que la fila 5 parece el total del proyecto', /La fila 5 parece el total/.test(await page.locator('[data-desglose-total-aviso]').innerText()));
                if (SHOT) await page.locator('[data-demo-desglose]').screenshot({ path: join(SHOT, 'desglose-390.png') });
                await page.locator('[data-demo-desglose] button[title="Quitar fila"]').nth(4).click();
                check('(390 px) al quitarla, el aviso desaparece y la suma no cambia', (await page.locator('[data-desglose-total-aviso]').count()) === 0 && /US\$ 136,558\.00/.test(await page.locator('[data-desglose-suma]').innerText()) && (await page.evaluate(() => window.__desglose.length)) === 4);
                check('(390 px) sin desplazamiento horizontal (desglose)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
                await ctx.close();
                continue;
            }
            await page.evaluate((t) => window.go(t), tS);
            const boton = page.getByRole('button', { name: /Descargar ficha técnica \(PDF\)/ });
            await boton.waitFor({ timeout: 15000 });
            if (modo === 'sin-fuente') {
                const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), boton.click()]);
                const b = readFileSync(await dl.path());
                check('sin la fuente (el servidor devuelve la página), la ficha igual se descarga en Helvetica', b.subarray(0, 5).toString() === '%PDF-' && !b.toString('latin1').includes('OpenSans') && /Helvetica/.test(b.toString('latin1')));
                check('sin errores en la página (sin fuente)', errores.length === 0, errores.join(' | '));
                await ctx.close();
                continue;
            }
            check(`(${vp.width} px) el botón está DENTRO de «Avance documental del proyecto»`, (await page.locator('section[aria-labelledby="avance-documental"] [data-ficha-tecnica]').count()) === 1);
            check(`(${vp.width} px) sin desplazamiento horizontal`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
            if (SHOT) await page.locator('section[aria-labelledby="avance-documental"]').screenshot({ path: join(SHOT, `panel-${vp.width}.png`) });
            const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), boton.click()]);
            const path = await download.path();
            const bytes = readFileSync(path);
            check(`(${vp.width} px) descarga un PDF con nombre de ficha técnica`, bytes.subarray(0, 5).toString() === '%PDF-' && /^FP-6K5MAX-Cuna-de-Vida-.*-ficha-tecnica\.pdf$/.test(download.suggestedFilename()), download.suggestedFilename());
            check(`(${vp.width} px) escrito en Open Sans`, bytes.toString('latin1').includes('OpenSans'));
            check(`(${vp.width} px) con el logotipo de la Feria en la cabecera`, /\/Subtype\s*\/Image/.test(bytes.toString('latin1')));
            if (vp.width === 1280) {
                if (SHOT) writeFileSync(join(SHOT, 'ficha.pdf'), bytes);
                const pdfjs = await import(`${REPO}/node_modules/pdfjs-dist/legacy/build/pdf.mjs`);
                const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false }).promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const c = await (await pdf.getPage(i)).getTextContent();
                    text += c.items.map(it => it.str).join(' ') + '\n';
                }
                check('el PDF dice qué es, de qué proyecto y de qué club', /FICHA TÉCNICA DEL PROYECTO/.test(text) && text.includes('Cuna de Vida') && text.includes('E-Club Origen') && text.includes('FP-6K5MAX'));
                check('con las tildes bien escritas (Open Sans, no Helvetica)', text.includes('Ávila') && /Formulación/.test(text));
                check('trae la Formulación y la Solicitud de Aportes del FDD', /Formulación del proyecto/.test(text) && /Solicitud de Aportes del FDD/.test(text) && text.includes('Formulación generalObjective') && /FDD /.test(text));
                check('NO trae el documento de identidad', !text.includes('1088123456'));
                check('dice cuántas páginas tiene', /Página 1 de \d+/.test(text), `${pdf.numPages} páginas`);
                check('aclara que no incluye documento ni pagos', /No incluye documento de identidad ni datos de pago/.test(text));
                const portada = (await (await pdf.getPage(1)).getTextContent()).items.map(it => it.str).join(' ').replace(/\s+/g, ' ');
                check('la portada lleva el título escrito en la Formulación (v4.1354)', /Cuna de Vida: Recuperando la atención neonatal en Pereira tras el terremoto/.test(portada), portada.slice(0, 260));
                check('con el club principal de la Formulación (Pereira Perla del Otún), no el del registro (v4.1354)', /Pereira Perla del Otún · Distrito 4281/.test(portada));
                check('y el club del registro pasa a los participantes, con los escritos en «Club Rotario» (v4.1346, v4.1353, v4.1354)', /Clubes participantes:\s*Pereira, Pereira del Otún, Pereira Nuevo, E-Club Origen, Club Rotario Dosquebradas/.test(portada));
                check('el registro inicial conserva lo inscrito', /Caimalito construye paz/.test(text));
                const plano = text.replace(/\s+/g, ' ');
                check('«Club postulante → Club Rotario» dice el club principal, con la cuenta de inscripción debajo (v4.1355)', /Club postulante Club Rotario Pereira Perla del Otún Inscrita con la cuenta del club: E-Club Origen/.test(plano), (plano.match(/Club postulante.{0,140}/) || [''])[0]);
                check('«Nombre del proyecto» del registro dice el título vigente, con el inicial debajo (v4.1355)', /Nombre del proyecto Cuna de Vida: Recuperando la atención neonatal en Pereira tras el terremoto Nombre en el registro inicial: Caimalito construye paz/.test(plano), (plano.match(/Proyecto \(registro inicial\).{0,200}/) || [''])[0]);
                const flat = text.replace(/\s+/g, ' ');
                check('el desglose sale como tabla con cada rubro y su valor', /Equipment US\$ 132\.727/.test(flat) && /Monitoring\/evaluation US\$ 441/.test(flat) && /Project management US\$ 735/.test(flat) && /4 Operations \(Unforeseen\) US\$ 2\.655/.test(flat));
                check('la fila «total» del club NO es un rubro: ni se numera ni se suma (v4.1353)', !/(^|\s)5 total/i.test(flat) && /Total del desglose US\$ 136\.558/.test(flat) && !/273\.116/.test(flat), (flat.match(/.{0,80}Total del desglose.{0,60}/) || [''])[0]);
                check('se muestra aparte como el total escrito por el club, que coincide', /Total escrito por el club: US\$ 136\.558 \(coincide con la suma de los rubros/.test(flat));
                check('y el desglose coincide con el presupuesto total (sin «Diferencia» negativa)', /Coincide con el presupuesto total del proyecto \(US\$ 136\.558\)/.test(flat) && !/Diferencia sin detallar: US\$ -/.test(flat));
                check('la tabla de la Formulación dice lo solicitado al FDD (US$ 958)', /Solicitado al FDD en la Solicitud de Aportes del FDD: US\$ 958/.test(flat));
                check('y la Aprobación institucional del FDD está en la ficha', /Aprobación institucional/.test(flat));
                check('los calculados salen como dinero (Total de aportes esperados US$ 2.000)', /Total de aportes esperados \(US\$\) US\$ 2\.000/.test(flat) && /25% mín\. del aporte al FAP 2023-2024 \(US\$\) US\$ 250/.test(flat));
                // La ficha del comité (expediente, en español) también en Open Sans.
                const admin = await call('GET', '/portal/ficha', tS);
                const b64 = await page.evaluate((p) => window.adminPdf({ ...p.data, kind: 'es', audience: undefined, logo: undefined }), admin);
                const adminBytes = Buffer.from(b64, 'base64');
                check('la ficha del COMITÉ sigue generándose, ahora en Open Sans', adminBytes.subarray(0, 5).toString() === '%PDF-' && adminBytes.toString('latin1').includes('OpenSans'));
            }
            check(`(${vp.width} px) sin errores en la página`, errores.length === 0, errores.join(' | '));
            await ctx.close();
        }
    } finally { await browser.close(); }
} finally {
    srv.close();
}
console.log(`\n${malos.length ? '❌' : '✅'} test:fair:club-ficha:ui — ${okCount} comprobaciones, ${malos.length} fallas.`);
process.exit(malos.length ? 1 : 0);
