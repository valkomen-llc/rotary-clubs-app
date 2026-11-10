#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Confirmación MANUAL del pago de una inscripción a un evento — v4.1310.0
//   npm run test:event:manual-payment
//   EVENT_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:event:manual-payment
//
// 1. Criterio puro (`eventManualPayment.js`): qué estados se confirman,
//    validación, prefijo privado y la vista sin la clave de S3.
// 2. Invariantes leídas de los archivos.
// 3. EXTREMO A EXTREMO (sólo con una base LOCAL y desechable): Postgres real,
//    un S3 simulado en memoria y el router real de inscripciones, con el correo
//    capturado. Nacional, internacional y CADRE; comprobante disfrazado, clave
//    ajena, sin soporte, fecha futura, doble confirmación, permisos, correo sí
//    y no, la conciliación del evento y el tablero.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register, createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const HERE = new URL('..', import.meta.url);
const leer = (p) => readFileSync(join(REPO, p), 'utf8');

let n = 0; const fallos = [];
const ok = (c, m, extra = '') => {
    if (c) { n++; console.log(`  ✓ ${m}`); }
    else { fallos.push(m); console.log(`  ✗ ${m}${extra ? ` — ${String(extra).slice(0, 300)}` : ''}`); }
};

const M = await import(`${REPO}/server/lib/eventManualPayment.js`);

console.log('── 1. Criterio');
for (const s of ['started', 'pending_payment', 'payment_failed', 'expired', 'waitlist']) ok(M.manualConfirmVerdict({ status: s }).ok, `«${s}» se puede confirmar a mano`);
for (const s of ['paid', 'confirmed', 'accredited', 'cancelled', 'refunded', 'draft']) {
    const v = M.manualConfirmVerdict({ status: s });
    ok(!v.ok && v.reason, `«${s}» no, con su motivo escrito`);
}
const ahora = Date.parse('2026-11-10T03:00:00Z');
const base = { reference: 'Bancolombia #1', paidAt: '2026-11-09T21:56:00-05:00', amount: '400000', currency: 'COP', paymentMethod: 'Transferencia bancaria', reason: 'Consignación directa', evidence: '' };
let v = M.validateManualPayment(base, { receiptAttached: true, now: ahora });
ok(v.ok && v.value.amount === 400000 && v.value.paidAt.toISOString() === '2026-11-10T02:56:00.000Z', 'válido: el monto como número y la fecha con su zona');
ok(v.ok && v.value.notify === true && v.value.evidence === null, 'por defecto avisa al participante; sin referencia escrita queda null');
ok(!M.validateManualPayment(base, { receiptAttached: false, now: ahora }).ok, 'sin archivo NI referencia: no');
ok(M.validateManualPayment({ ...base, evidence: 'extracto 33' }, { receiptAttached: false, now: ahora }).ok, 'sólo con la referencia escrita: sí');
ok(/futuro/.test(M.validateManualPayment({ ...base, paidAt: '2026-11-11T10:00:00Z' }, { receiptAttached: true, now: ahora }).error || ''), 'fecha futura: no');
ok(!M.validateManualPayment({ ...base, amount: '-5' }, { receiptAttached: true, now: ahora }).ok, 'monto negativo: no');
ok(!M.validateManualPayment({ ...base, currency: 'EUR' }, { receiptAttached: true, now: ahora }).ok, 'moneda fuera de COP/USD: no');
ok(!M.validateManualPayment({ ...base, reason: 'ok' }, { receiptAttached: true, now: ahora }).ok, 'motivo de menos de 5 letras: no');
ok(M.validateManualPayment({ ...base, notify: false }, { receiptAttached: true, now: ahora }).value.notify === false, 'se puede no avisar');
ok(M.eventManualReceiptPrefix('ev1', 'r1') === 'private/event-manual-payments/ev1/r1', 'prefijo privado por evento e inscripción');
ok(M.eventManualReceiptPrefix('ev 1', 'r1') === null, 'un id raro no arma prefijo');
ok(M.eventManualReceiptBelongs('private/event-manual-payments/ev1/r1/x.pdf', 'ev1', 'r1'), 'su clave: sí');
ok(!M.eventManualReceiptBelongs('private/event-manual-payments/ev1/r2/x.pdf', 'ev1', 'r1'), 'la de OTRA inscripción: no');
ok(!M.eventManualReceiptBelongs('private/event-receipts/ev1/x.pdf', 'ev1', 'r1'), 'la de un formulario COLROTARIOS del mismo evento: no');
const vista = M.manualPaymentView({ manual: { reference: 'R', receipt: { key: 'private/x', name: 'a.pdf', mime: 'application/pdf', bytes: 9 } } });
ok(vista.receipt.name === 'a.pdf' && !JSON.stringify(vista).includes('private/x'), 'la vista lleva el comprobante SIN la clave de S3');
ok(M.manualPaymentView({ sessionId: 'cs_1' }) === null, 'un pago de Stripe no tiene vista manual');

console.log('── 2. Invariantes');
{
    const ctl = leer('server/controllers/eventRegistrationController.js');
    const cuerpo = ctl.slice(ctl.indexOf('export const confirmManualRegistrationPayment'), ctl.indexOf('/** Aplica a la inscripción el desenlace'));
    ok(/WHERE id = \$4 AND status = ANY\(\$5\) RETURNING \*/.test(cuerpo), 'el UPDATE es CONDICIONAL al estado (dos clics o el webhook a la vez no confirman dos veces)');
    ok(cuerpo.indexOf('UPDATE "EventRegistration"') < cuerpo.indexOf('recordPayment('), 'y va ANTES de registrar el pago (sin pagos huérfanos)');
    ok(/provider: 'manual'/.test(cuerpo) && /status: 'succeeded'/.test(cuerpo), 'deja su fila de pago: provider manual, succeeded');
    ok(/finalizePaidRegistration\(rows\[0\]/.test(cuerpo), 'termina en finalizePaidRegistration, el MISMO final que Stripe y PayPal');
    ok(/if \(notify\) await notifyRegistration/.test(ctl), 'el correo se puede omitir sólo cuando se pide');
    const adm = leer('server/controllers/eventRegistrationAdminController.js');
    for (const f of ['manualPaymentReceiptUrl', 'confirmManualPayment', 'manualPaymentReceipt']) {
        const c = adm.slice(adm.indexOf(`export const ${f} =`), adm.indexOf(`export const ${f} =`) + 1500);
        ok(/requirePaymentsCapability\(req, res, event\)/.test(c), `${f} exige la capacidad de pagos del evento`);
    }
    const rutas = leer('server/routes/event-registrations.js');
    ok(/router\.post\('\/admin\/registrations\/:id\/manual-payment', authMiddleware/.test(rutas), 'ruta de confirmar, autenticada');
    ok(/router\.get\('\/admin\/registrations\/:id\/manual-payment\/receipt', authMiddleware/.test(rutas), 'ruta del comprobante, autenticada');
    const funds = leer('server/lib/eventFundsSpec.js');
    ok(/!\['paypal', 'manual'\]\.includes\(exito\.provider\)/.test(funds), 'la conciliación no ofrece «verificar con Stripe» para un pago manual');
    const ui = leer('src/components/admin/events/EventRegistrationsManager.tsx');
    ok(/if \(next === 'paid' && puedeConfirmarManual\) \{[^}]*setShowManual\(true\)/.test(ui), '«Cambiar a → Pago confirmado» abre la ventana del comprobante');
    ok(/Confirmar pago manualmente/.test(ui) && /Confirmación manual del pago/.test(ui), 'la ficha tiene el botón y muestra la confirmación con su comprobante');
    const modal = leer('src/components/admin/events/ManualPaymentModal.tsx');
    ok(/type="file"/.test(modal) && /manual-payment\/receipt-url/.test(modal), 'la ventana adjunta el comprobante');
    ok(/fechaInputAIso\(form\.paidAt\)/.test(modal), 'la fecha viaja con su zona');
    ok(!/const \w+ = \(\{[^)]*\}\) => \{/.test(ui.slice(ui.indexOf('const DetailSheet'), ui.indexOf('const DetailSheet') + 200)), 'la ventana NO se declara dentro de la ficha');
}

const E2E_DB = process.env.EVENT_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('\n[test:event:manual-payment] Sin EVENT_E2E_DATABASE_URL local: se omite el extremo a extremo.');
    terminar();
}

console.log('── 3. Extremo a extremo (Postgres real + S3 simulado + router real)');
const objects = new Map();
const s3 = http.createServer((req, res) => {
    const key = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/test_bucket\//, ''));
    if (req.method === 'PUT') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => { objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(200, { ETag: '"x"' }); res.end(); });
        return;
    }
    const o = objects.get(key);
    if (!o) { res.writeHead(404); return res.end(); }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type }); return res.end(); }
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const body = m ? o.body.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined) : o.body;
    res.writeHead(m ? 206 : 200, { 'Content-Length': body.length, 'Content-Type': o.type });
    res.end(body);
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));
process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';

const MAIL = new URL('./scripts/fixtures/email-completed-stub.mjs', HERE).href;
register(`data:text/javascript,
    const M=${JSON.stringify(MAIL)};
    export async function resolve(s,c,n){ if(/EmailService\\.js$/.test(s)) return {url:M,shortCircuit:true}; return n(s,c); }`, HERE);
const require = createRequire(`${REPO}/package.json`);
const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const mail = await import(MAIL);
const { JWT_SECRET, PLATFORM_AUDIENCE } = await import(`${REPO}/server/middleware/auth.js`);

await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, "clubId" TEXT, metadata JSONB DEFAULT '{}', image TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, logo TEXT, "footerLogo" TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, phone TEXT, "clubId" TEXT, role TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "startDate", "endDate", location, "clubId") VALUES
    ('ev-feria','XII Rotary Project Fair Colombia 2027','xii-feria','2027-01-28','2027-01-31','Valledupar','club-feria'),
    ('ev-otro','Otro evento','otro','2027-03-01','2027-03-02','Bogotá','club-otro') ON CONFLICT DO NOTHING`);
await db.query(`INSERT INTO "Club" (id, name) VALUES ('club-feria','Feria'),('club-otro','Otro') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/event-registrations.js`);
const { ensureEventRegistrationSchema } = await import(`${REPO}/server/lib/ensureEventRegistrationSchema.js`);
await ensureEventRegistrationSchema();
const app = express();
app.use('/api/event-registrations', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api/event-registrations/admin/registrations`;
const admin = jwt.sign({ id: 'u-admin', email: 'valledupar@feria.org', name: 'Comité Organizador', role: 'administrator' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });
const ajeno = jwt.sign({ id: 'u-ajeno', email: 'x@otro.org', role: 'club_admin', clubId: 'club-otro' }, JWT_SECRET, { audience: PLATFORM_AUDIENCE });
const call = async (method, path, token, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
let seq = 0;
const inscribir = async (nombre, categoria, audiencia, moneda, monto, status = 'pending_payment') => {
    seq += 1;
    const { rows } = await db.query(`INSERT INTO "EventRegistration"
        ("eventId", "clubId", "publicRef", "firstName", "lastName", email, "categoryKey", audience, status,
         currency, "totalAmount", "baseCurrency", "baseAmount", "chargeCurrency", "chargeAmount", pricing, "submittedAt")
        VALUES ('ev-feria','club-feria',$1,$2,'Prueba',$3,$4,$5,$6,$7,$8,$7,$8,$7,$8,$9::jsonb,NOW()) RETURNING id`,
        [`EV-T${seq}`, nombre, `p${seq}@x.org`, categoria, audiencia, status, moneda, monto,
            JSON.stringify({ baseCurrency: moneda, baseAmount: monto, chargeCurrency: moneda, chargeAmount: monto })]);
    return rows[0].id;
};
const NAC = await inscribir('Monica', 'registro_nacional', 'nacional', 'COP', 400000);
const INT = await inscribir('James', 'registro_internacional', 'internacional', 'USD', 150);
const CAD = await inscribir('Paula', 'cadres', 'cadres', 'COP', 200000);
const PAGADA = await inscribir('Ya', 'registro_nacional', 'nacional', 'COP', 400000, 'paid');
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20000, 32), Buffer.from('\n%%EOF')]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(5000, 1)]);
const subir = async (id, bytes, filename = 'comprobante.pdf', contentType = 'application/pdf') => {
    const pre = await call('POST', `/${id}/manual-payment/receipt-url`, admin, { filename, contentType, size: bytes.length });
    if (pre.status !== 200) return { pre };
    await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes });
    return { key: pre.data.key, name: filename, contentType };
};
const reg = async (id) => (await db.query('SELECT * FROM "EventRegistration" WHERE id = $1', [id])).rows[0];
const pagos = async (id) => (await db.query(`SELECT * FROM "EventRegistrationPayment" WHERE "registrationId" = $1 AND provider = 'manual'`, [id])).rows;
const datos = { reference: 'Bancolombia #9482710', paidAt: new Date(Date.now() - 3600_000).toISOString(), amount: 400000, currency: 'COP', paymentMethod: 'Transferencia bancaria', reason: 'Transferencia a la cuenta del comité', notify: false };

let r = await call('POST', `/${NAC}/manual-payment/receipt-url`, ajeno, { filename: 'a.pdf', contentType: 'application/pdf', size: 10 });
ok(r.status === 404, 'otro sitio no ve la inscripción (404)', JSON.stringify(r));
r = await call('POST', `/${PAGADA}/manual-payment/receipt-url`, admin, { filename: 'a.pdf', contentType: 'application/pdf', size: 10 });
ok(r.status === 409, 'una inscripción ya pagada no prepara comprobante (409)');
const disfrazado = await subir(NAC, Buffer.from('texto con extension pdf'));
r = await call('POST', `/${NAC}/manual-payment`, admin, { ...datos, receipt: disfrazado });
ok(r.status === 422 && /no es un PDF/.test(r.data.error), 'un texto renombrado a .pdf: 422 (se leen sus bytes)', JSON.stringify(r.data));
const deOtra = await subir(CAD, pdf);
r = await call('POST', `/${NAC}/manual-payment`, admin, { ...datos, receipt: deOtra });
ok(r.status === 422 && /no corresponde/.test(r.data.error), 'el comprobante subido para OTRA inscripción no se reclama');
r = await call('POST', `/${NAC}/manual-payment`, admin, { ...datos });
ok(r.status === 400 && /Adjunta el comprobante/.test(r.data.error), 'sin archivo ni referencia: 400');
r = await call('POST', `/${NAC}/manual-payment`, admin, { ...datos, evidence: 'x', paidAt: new Date(Date.now() + 86400_000).toISOString() });
ok(r.status === 400 && /futuro/.test(r.data.error), 'fecha futura: 400');
ok((await reg(NAC)).status === 'pending_payment' && !(await pagos(NAC)).length, 'nada de lo anterior tocó la inscripción ni dejó pagos');

console.log('   · Nacional, con PDF y sin correo');
const comp = await subir(NAC, pdf, 'Transferencia Bancolombia.pdf');
r = await call('POST', `/${NAC}/manual-payment`, admin, { ...datos, receipt: comp });
ok(r.status === 200 && r.data.registration.status === 'paid', 'confirmado: «Pago confirmado»', JSON.stringify(r.data).slice(0, 300));
let fila = await reg(NAC);
ok(fila.registrationCode && fila.paidAt && Math.abs(new Date(fila.paidAt) - new Date(datos.paidAt)) < 1000, 'recibe código de inscripción y la fecha REAL del pago');
let p = await pagos(NAC);
ok(p.length === 1 && p[0].status === 'succeeded' && Number(p[0].amount) === 400000 && p[0].currency === 'COP', 'deja UNA fila de pago manual con valor y moneda');
ok(p[0].payload.manual.receipt.mime === 'application/pdf' && p[0].payload.manual.by === 'Comité Organizador', 'con el comprobante (tipo leído de los bytes) y quién confirmó');
ok(!mail.enviados.length, 'sin correo cuando se pidió no avisar');
const det = await call('GET', `/${NAC}`, admin);
const vistaPago = det.data.payments.find(x => x.provider === 'manual');
ok(vistaPago?.manual?.receipt?.name === 'Transferencia Bancolombia.pdf' && !JSON.stringify(det.data).includes('private/event-manual-payments'), 'la ficha muestra el comprobante sin la clave de S3');
ok(det.data.history.some(h => h.type === 'payment_confirmed_manually' && /Bancolombia #9482710/.test(h.comment || '')), 'el historial registra la confirmación con su referencia');
r = await call('GET', `/${NAC}/manual-payment/receipt?paymentId=${vistaPago.id}`, admin);
ok(r.status === 200 && /X-Amz-Expires=300/.test(r.data.url) && r.data.url.includes(`private/event-manual-payments/ev-feria/${NAC}/`), 'el comprobante se abre con enlace firmado de 5 minutos');
ok(Buffer.from(await (await fetch(r.data.url)).arrayBuffer()).equals(pdf), 'y es exactamente el archivo adjuntado');
r = await call('POST', `/${NAC}/manual-payment`, admin, { ...datos, evidence: 'otra vez' });
ok(r.status === 409 && (await pagos(NAC)).length === 1, 'confirmar dos veces: 409 y un solo pago');

console.log('   · Internacional en USD, con PNG y con correo');
const compInt = await subir(INT, png, 'wire.png', 'image/png');
r = await call('POST', `/${INT}/manual-payment`, admin, { ...datos, amount: 150, currency: 'USD', paymentMethod: 'Otro medio verificado', receipt: compInt, notify: true });
ok(r.status === 200 && (await reg(INT)).status === 'paid', 'internacional confirmado en USD');
ok((await pagos(INT))[0].payload.manual.receipt.mime === 'image/png', 'una imagen PNG también sirve de comprobante');
ok(mail.enviados.some(m => String(m.to || '').includes('@x.org')), 'con «avisar» marcado sale el correo de inscripción confirmada', JSON.stringify(mail.enviados.map(m => m.to)));

console.log('   · CADRE sólo con la referencia escrita');
r = await call('POST', `/${CAD}/manual-payment`, admin, { ...datos, amount: 200000, evidence: 'Recibo físico #44' });
ok(r.status === 200 && (await pagos(CAD))[0].payload.manual.receipt === null, 'CADRE confirmado sin archivo, con la referencia');
ok((await call('GET', `/${CAD}/manual-payment/receipt`, admin)).status === 404, 'y no hay comprobante que abrir (404)');

console.log('   · Lo que ven el tablero y la conciliación');
const dash = await call('GET', `/../dashboard?eventRef=ev-feria`, admin);
const settled = Number(dash.data?.totals?.settled ?? -1);
const porCat = Object.fromEntries((dash.data?.byCategory || []).map(c => [c.categoryKey || c.key || c.category, c]));
ok(dash.status === 200 && settled === 4, `el tablero cuenta los pagos confirmados: ${settled} (3 manuales + 1 previo)`, JSON.stringify(dash.data?.totals).slice(0, 300));
const cop = (dash.data?.byCurrency || []).find(c => c.currency === 'COP' || c.baseCurrency === 'COP');
ok(cop && Number(cop.base) >= 400000 + 200000 + 400000, `el recaudo en COP suma las confirmaciones manuales (${cop?.base})`, JSON.stringify(dash.data?.byCurrency));
const { paymentOf } = await import(`${REPO}/server/lib/eventFundsSpec.js`);
const pagosNac = (await db.query('SELECT * FROM "EventRegistrationPayment" WHERE "registrationId" = $1', [NAC])).rows.map(x => ({ ...x, registrationId: x.registrationId, amount: Number(x.amount) }));
const po = paymentOf(await reg(NAC), pagosNac);
ok(po.status === 'confirmado' && po.charged === 400000 && po.eventAmount === 400000 && po.viaStripe === false && po.manual === true, 'la conciliación lo ve confirmado, por 400.000, manual y sin «verificar con Stripe»', JSON.stringify(po));

srv.close(); s3.close();
terminar();

function terminar() {
    console.log(`\n${fallos.length ? '❌' : '✅'} test:event:manual-payment — ${n} pasaron${fallos.length ? `, ${fallos.length} fallaron` : ''}.`);
    process.exit(fallos.length ? 1 : 0);
}
