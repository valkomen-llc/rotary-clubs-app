#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Confirmación MANUAL de pagos — recorrido de EXTREMO A EXTREMO (v4.1308.0)
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:manual-payment:e2e
//
// Postgres REAL + un S3 simulado en memoria + el router real del módulo:
// adjuntar el comprobante → confirmar → abrirlo con enlace firmado; un
// archivo disfrazado, una clave ajena, sin soporte, doble confirmación,
// fecha futura; la inscripción de dos proyectos pagada en un solo pago; y lo
// que ven los indicadores (pagadas, recaudo) antes y después.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ. No lee DATABASE_URL: exige
// FAIR_E2E_DATABASE_URL apuntando a localhost, y una base VACÍA y desechable.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:manual-payment:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
const require = createRequire(`${REPO}/package.json`);

// ── S3 simulado (path-style) ──────────────────────────────────────────
const objects = new Map();
const s3 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const key = decodeURIComponent(u.pathname.replace(/^\/test_bucket\//, ''));
    if (req.method === 'PUT') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => { objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(200, { ETag: '"x"' }); res.end(); });
        return;
    }
    const o = objects.get(key);
    if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>'); }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type || 'application/octet-stream' }); return res.end(); }
    if (req.method === 'GET') {
        let body = o.body;
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        if (m) {
            body = o.body.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined);
            res.writeHead(206, { 'Content-Length': body.length, 'Content-Type': o.type });
        } else res.writeHead(200, { 'Content-Length': body.length, 'Content-Type': o.type });
        return res.end(body);
    }
    res.writeHead(405); res.end();
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
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-xii','XII Feria','xii') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-xii','evt-xii', $1::jsonb) ON CONFLICT DO NOTHING`,
    [JSON.stringify({ registration: { priceMode: 'COP', amountCop: 250000, secondProjectAmountCop: 100000 } })]);

const sub = async (ref, extra = {}) => {
    const { rows } = await db.query(`INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "registrationId", "projectIndex", "appliedAt")
        VALUES ($1,'evt-xii','Nombre','Pérez',$2,$3,'4281',$4,$5,'pending_payment','+57300','agua',$6,$7,$8,NOW()) RETURNING id`,
        [ref, `${ref.toLowerCase()}@club.org`, extra.club || 'Club Barranquilla', `Proyecto ${ref}`, extra.wf || 'received',
            extra.amountCop === undefined ? 250000 : extra.amountCop, extra.registrationId || null, extra.index || 1]);
    return rows[0].id;
};
const registration = async (club) => (await db.query(`INSERT INTO "ProjectFairRegistration" ("eventId", "clubName", district, email, modality) VALUES ('evt-xii',$1,'4281',$2,'double') RETURNING id`, [club, `${club}@x.org`])).rows[0].id;

const SOLO = await sub('FP-SOLO');
const OTRO = await sub('FP-OTRO');
const REG = await registration('Club Sorisas');
const DOS_1 = await sub('FP-D1', { registrationId: REG, index: 1, club: 'Club Sorisas' });
// El segundo SIN línea escrita: es el caso que contaba como pagado sin sumar.
const DOS_2 = await sub('FP-D2', { registrationId: REG, index: 2, club: 'Club Sorisas', amountCop: null });
const REG_AJENA = await registration('Club Ajeno');
const AJENO = await sub('FP-AJ', { registrationId: REG_AJENA, index: 1, club: 'Club Ajeno' });

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api/project-fair`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const admin = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'c1' }, SECRET);
const viewer = jwt.sign({ id: 'u-view', email: 'viewer@x.org', role: 'editor' }, SECRET);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const EV = '?evento=evt-xii';
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40000, 32), Buffer.from('\n%%EOF')]);
const subir = async (id, bytes, filename = 'comprobante.pdf', contentType = 'application/pdf') => {
    const pre = await call('POST', `/admin/postulaciones/${id}/manual-payment/receipt-url${EV}`, admin, { filename, contentType, size: bytes.length });
    assert.equal(pre.status, 200, JSON.stringify(pre.data));
    const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes });
    assert.equal(put.status, 200);
    return { key: pre.data.key, name: filename, contentType };
};
const base = { reference: 'Bancolombia #9482710', paidAt: new Date(Date.now() - 3600_000).toISOString(), amount: 250000, currency: 'COP', paymentMethod: 'Transferencia bancaria', reason: 'Consignación directa a la cuenta del comité' };
const fila = async (id) => (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [id])).rows[0];
const intel = async () => (await call('GET', `/admin/inteligencia${EV}`, admin)).data;

const antes = await intel();
console.log(`  (antes: ${antes.participation.paid} pagadas, recaudo ${antes.participation.collectedAmount})`);

console.log('── Permisos y validación del archivo');
ok((await call('POST', `/admin/postulaciones/${SOLO}/manual-payment/receipt-url${EV}`, viewer, { filename: 'a.pdf', contentType: 'application/pdf', size: 10 })).status === 403, 'un perfil sin permiso no sube comprobantes (403)');
let r = await call('POST', `/admin/postulaciones/${SOLO}/manual-payment/receipt-url${EV}`, admin, { filename: 'a.exe', contentType: 'application/x-msdownload', size: 10 });
ok(r.status === 422, 'un ejecutable se rechaza antes de subir (422)');
r = await call('POST', `/admin/postulaciones/${SOLO}/manual-payment/receipt-url${EV}`, admin, { filename: 'a.pdf', contentType: 'application/pdf', size: 30 * 1024 * 1024 });
ok(r.status === 422 && /10 MB/.test(r.data.error), 'más de 10 MB se rechaza con el límite dicho');

console.log('── Lo que la confirmación rechaza');
const disfrazado = await subir(SOLO, Buffer.from('esto es un texto con extension pdf'));
r = await call('POST', `/admin/postulaciones/${SOLO}/confirm-manual-payment${EV}`, admin, { ...base, receipt: disfrazado });
ok(r.status === 422 && /no es un PDF/.test(r.data.error), 'un texto renombrado a .pdf: 422 (se leen sus bytes)');
const ajena = await subir(OTRO, pdf);
r = await call('POST', `/admin/postulaciones/${SOLO}/confirm-manual-payment${EV}`, admin, { ...base, receipt: ajena });
ok(r.status === 422 && /no corresponde/.test(r.data.error), 'el comprobante subido para OTRA postulación no se reclama');
r = await call('POST', `/admin/postulaciones/${SOLO}/confirm-manual-payment${EV}`, admin, { ...base });
ok(r.status === 400 && /Adjunta el comprobante/.test(r.data.error), 'sin archivo ni referencia del soporte: 400');
r = await call('POST', `/admin/postulaciones/${SOLO}/confirm-manual-payment${EV}`, admin, { ...base, evidence: 'extracto', paidAt: new Date(Date.now() + 86400_000).toISOString() });
ok(r.status === 400 && /futuro/.test(r.data.error), 'una fecha futura: 400');
ok((await fila(SOLO)).status === 'pending_payment', 'nada de lo anterior tocó la postulación');

console.log('── Confirmar con el comprobante adjunto');
const bueno = await subir(SOLO, pdf, 'Consignación Bancolombia.pdf');
r = await call('POST', `/admin/postulaciones/${SOLO}/confirm-manual-payment${EV}`, admin, { ...base, receipt: bueno });
ok(r.status === 200 && r.data.submission.paymentStatus === 'paid' || r.data.submission?.status === 'paid', 'confirmado: 200');
ok(r.data.submission.manualPaymentReceipt?.name === 'Consignación Bancolombia.pdf' && r.data.submission.manualPaymentReceipt.bytes === pdf.length, 'la ficha trae nombre y peso REAL del comprobante');
ok(!JSON.stringify(r.data).includes('private/project-fair-receipts'), 'la clave de S3 no viaja a la pantalla');
let f = await fila(SOLO);
ok(f.status === 'paid' && f.paymentConfirmationOrigin === 'manual_admin' && f.manualPaymentReceiptMime === 'application/pdf', 'fila pagada, origen manual, tipo leído de los bytes');
ok(Number(f.amountReceived) === 250000 && Number(f.amountCop) === 250000, 'lo recibido y la línea quedan escritos');
ok(Math.abs(new Date(f.paidAt).getTime() - new Date(base.paidAt).getTime()) < 1000, 'la fecha del pago es el instante enviado (con su zona)');
r = await call('GET', `/admin/postulaciones/${SOLO}/manual-payment/receipt${EV}`, admin);
ok(r.status === 200 && r.data.url.includes(`private/project-fair-receipts/${SOLO}/`) && /X-Amz-Expires=300/.test(r.data.url), 'el comprobante se abre con un enlace firmado de 5 minutos');
const got = await fetch(r.data.url);
ok(Buffer.from(await got.arrayBuffer()).equals(pdf), 'y es exactamente el archivo adjuntado');
r = await call('POST', `/admin/postulaciones/${SOLO}/confirm-manual-payment${EV}`, admin, { ...base, evidence: 'otra vez' });
ok(r.status === 409, 'confirmar dos veces: 409, la primera confirmación queda intacta');
ok((await fila(SOLO)).manualPaymentEvidence === null, '(y no se pisó con la segunda)');
const hist = await db.query(`SELECT * FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'payment_confirmed_manually'`, [SOLO]);
ok(hist.rows.length === 1 && /Comprobante adjunto: Consignación Bancolombia\.pdf/.test(hist.rows[0].detail), 'el historial registra el comprobante, una sola vez');

console.log('── Sólo con la referencia escrita (como antes)');
r = await call('POST', `/admin/postulaciones/${OTRO}/confirm-manual-payment${EV}`, admin, { ...base, evidence: 'Recibo físico #44' });
ok(r.status === 200 && r.data.submission.manualPaymentReceipt === null, 'sin archivo también se puede, con la referencia');
ok((await call('GET', `/admin/postulaciones/${OTRO}/manual-payment/receipt${EV}`, admin)).status === 404, 'y no hay comprobante que abrir (404)');

console.log('── La inscripción de dos proyectos, en un solo pago');
r = await call('POST', `/admin/postulaciones/${DOS_1}/confirm-manual-payment${EV}`, admin, { ...base, amount: 350000, evidence: 'x', coverProjectIds: [AJENO] });
ok(r.status === 409 && /No pertenece/.test(r.data.error), 'cubrir un proyecto de OTRO club: 409');
ok((await fila(DOS_1)).status === 'pending_payment', 'y no se confirmó nada');
const det = await call('GET', `/admin/postulaciones/${DOS_1}${EV}`, admin);
ok(det.data.registrationSummary.pendingTotal === 350000 && det.data.registrationSummary.lines.length === 2, 'la ficha muestra la inscripción: debe 350.000 en dos líneas');
const comp = await subir(DOS_1, pdf, 'transferencia.pdf');
r = await call('POST', `/admin/postulaciones/${DOS_1}/confirm-manual-payment${EV}`, admin, { ...base, amount: 350000, receipt: comp, coverProjectIds: [DOS_2] });
ok(r.status === 200 && r.data.covered.length === 1 && r.data.covered[0].id === DOS_2, 'confirmado el primero cubriendo el segundo');
const d1 = await fila(DOS_1); const d2 = await fila(DOS_2);
ok(d1.status === 'paid' && d2.status === 'paid', 'los DOS proyectos quedan pagados');
ok(Number(d1.amountReceived) === 350000 && d2.amountReceived === null, 'lo recibido vive UNA vez, en el ancla');
ok(d2.metadata.payment.coveredBy === DOS_1 && d2.paymentConfirmationOrigin === 'manual_admin', 'el segundo sabe quién lo cubrió');
ok(Number(d2.amountCop) === 100000, 'el segundo, que no tenía su línea, queda con la tarifa del segundo proyecto (100.000)');
ok(d2.manualPaymentReceiptKey === d1.manualPaymentReceiptKey, 'y comparte el comprobante');
r = await call('GET', `/admin/postulaciones/${DOS_2}/manual-payment/receipt${EV}`, admin);
ok(r.status === 200 && r.data.name === 'transferencia.pdf', 'la ficha del segundo abre el comprobante del pago que lo cubrió');
const det2 = await call('GET', `/admin/postulaciones/${DOS_1}${EV}`, admin);
ok(det2.data.registrationSummary.pendingTotal === 0 && det2.data.registrationSummary.paidTotal === 350000, 'la inscripción queda pagada de manera completa: saldo 0');
ok(det2.data.registrationSummary.payments.length === 1 && det2.data.registrationSummary.payments[0].covers.length === 2, 'un solo pago, que cubre los dos proyectos');
ok((await db.query(`SELECT 1 FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'payment_confirmed_manually'`, [DOS_2])).rows.length === 1, 'el historial del segundo también lo registra');

console.log('── Lo que ven los indicadores');
const despues = await intel();
ok(despues.participation.paid === antes.participation.paid + 4, `pagadas: ${antes.participation.paid} → ${despues.participation.paid} (+4 proyectos)`);
ok(despues.participation.collectedAmount === antes.participation.collectedAmount + 250000 + 250000 + 250000 + 100000, `recaudo: +850.000 (${despues.participation.collectedAmount})`);
ok(despues.participation.withTwoProjectsPaid >= 1, 'la inscripción de dos proyectos cuenta como pagada completa');
const cat = await call('GET', `/admin/catalog${EV}`, admin);
ok(cat.data.health.paid >= 4, '«M pagadas» del encabezado las incluye');
const vista = await call('GET', `/admin/postulaciones${EV}&vista=pago_confirmado`, admin);
ok([SOLO, OTRO, DOS_1, DOS_2].every(id => vista.data.submissions.some(s => s.id === id)), 'el filtro «Pago confirmado» las lista');

srv.close(); s3.close(); await db.end?.();
console.log(`\n✅ test:fair:manual-payment:e2e — ${n} comprobaciones contra Postgres real.`);
process.exit(0);
