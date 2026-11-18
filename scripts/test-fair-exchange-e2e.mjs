#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EXCHANGE — recorrido de EXTREMO A EXTREMO (v4.1335.0)
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/…?sslmode=disable npm run test:fair:exchange:e2e
//
// Postgres REAL + S3 simulado en memoria + el router real del módulo. Los
// traslados se siembran como los deja el motor de la Bóveda (`Disbursement`,
// `DisbursementBatch`): Exchange los LEE, los concilia y los documenta.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ. No lee DATABASE_URL: exige
// FAIR_E2E_DATABASE_URL apuntando a localhost, y una base VACÍA y desechable.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:exchange:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
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
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Payment" (id TEXT PRIMARY KEY, provider TEXT DEFAULT 'stripe', "providerRef" TEXT, status TEXT, amount DOUBLE PRECISION,
    currency TEXT, "rawPayload" TEXT, "orderId" TEXT, "clubId" TEXT, "applicationFee" DOUBLE PRECISION, "netAmount" DOUBLE PRECISION, "isPlatformCollection" BOOLEAN DEFAULT TRUE,
    "stripeBalanceTxId" TEXT, "stripeStatus" TEXT, "availableOn" TIMESTAMPTZ, "clubAvailableOn" TIMESTAMPTZ, "paymentMethod" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug, "clubId") VALUES ('evt-xii','XII Feria','xii','c-fair'), ('evt-xiii','XIII Feria','xiii','c-fair') ON CONFLICT DO NOTHING`);
await db.query(`INSERT INTO "Club" (id, name, type) VALUES ('c-fair','Feria','project_fair'), ('c-d4281','Distrito 4281','district') ON CONFLICT DO NOTHING`);
await db.query(`INSERT INTO "User" (id, email, name, role, "clubId") VALUES ('u-ev','admin.evento@d4281.org','Admin Evento','district_admin','c-d4281') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
const { ensureDisbursementSchema } = await import(`${REPO}/server/lib/ensureDisbursementSchema.js`);
await ensureTables();
await ensureDisbursementSchema();
const cfg = { registration: { priceMode: 'COP', amountCop: 250000 }, access: { reviewers: ['rev@feria.org'], finance: ['fin@feria.org'] } };
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config, "updatedAt") VALUES ('evt-xiii','evt-xiii',$1::jsonb, NOW() - interval '2 days') ON CONFLICT DO NOTHING`, [JSON.stringify(cfg)]);
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config, "updatedAt") VALUES ('evt-xii','evt-xii',$1::jsonb, NOW()) ON CONFLICT DO NOTHING`, [JSON.stringify(cfg)]);

const sub = async (ref, { paid = true, pi = null, manual = false, eventId = 'evt-xii', amountCop = 250000, metadata = null } = {}) => {
    const { rows } = await db.query(`INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName",
            "workflowStatus", status, phone, "focusArea", "amountCop", "appliedAt", "stripePaymentIntentId", "paidAt", "paymentConfirmationOrigin", "idNumber", metadata)
        VALUES ($1,$2,'Nombre','Pérez',$3,$4,'4281',$5,'received',$6,'+57300111','agua',$7,NOW(),$8,$9,$10,'1234567',COALESCE($11::jsonb,'{}'::jsonb)) RETURNING id`,
        [ref, eventId, `${ref.toLowerCase()}@club.org`, `Club ${ref}`, `Proyecto ${ref}`, paid ? 'paid' : 'pending_payment', amountCop, pi,
            paid ? new Date(Date.now() - 86400000 * 10) : null, paid ? (manual ? 'manual_admin' : 'stripe') : null, metadata ? JSON.stringify(metadata) : null]);
    if (pi) {
        await db.query(`INSERT INTO "Payment" (id, provider, "providerRef", status, amount, currency, "clubId", "netAmount") VALUES ($1,'stripe',$2,'succeeded',$3,'cop','c-fair',$3)`,
            [`pay-${ref}`, pi, amountCop]);
    }
    return rows[0].id;
};
const pdf = (tag) => Buffer.concat([Buffer.from(`%PDF-1.7\n% ${tag}\n`), Buffer.alloc(2000, 32), Buffer.from('\n%%EOF')]);
const disb = async (id, payRef, amount, { batchId = null, reference = null, receiptKey = null, at = '2026-10-15T15:00:00Z' } = {}) => {
    if (receiptKey) objects.set(receiptKey, { body: pdf(id), type: 'application/pdf' });
    await db.query(`INSERT INTO "Disbursement" (id, "paymentId", "clubId", amount, currency, "disbursedAt", beneficiary, method, reference, status, "receiptKey", "receiptName", "receiptMime", "receiptBytes", "batchId", "createdByName")
        VALUES ($1,$2,'c-fair',$3,'COP',$4,'Colrotarios','transferencia_bancaria',$5,'confirmado',$6,$7,$8,$9,$10,'Tesorería Feria')`,
        [id, `pay-${payRef}`, amount, at, reference, receiptKey, receiptKey ? `${id}.pdf` : null, receiptKey ? 'application/pdf' : null, receiptKey ? 2030 : null, batchId]);
};

// Los proyectos del escenario.
const A = await sub('FP-A', { pi: 'pi_A' });             // traslado individual con comprobante
const B = await sub('FP-B', { pi: 'pi_B' });             // traslado AGRUPADO B + C, un comprobante
const C = await sub('FP-C', { pi: 'pi_C' });
const D = await sub('FP-D', { pi: 'pi_D' });             // traslado parcial
const E = await sub('FP-E', { pi: 'pi_E' });             // pagado, sin traslado
const F = await sub('FP-F', { manual: true });           // pago directo (confirmación manual)
const G = await sub('FP-G', { paid: false });            // pago pendiente
const H = await sub('FP-H', { pi: 'pi_H' });             // traslado SIN comprobante
const I = await sub('FP-I', { pi: 'pi_I', amountCop: 350000 });  // ancla de dos proyectos
const J = await sub('FP-J', { paid: true, metadata: { payment: { coveredBy: I, coveredByRef: 'FP-I' } } });
const X = await sub('FP-X', { pi: 'pi_X', eventId: 'evt-xiii' }); // otra edición

await disb('d-A', 'FP-A', 250000, { reference: 'MERC-001', receiptKey: 'private/disbursements/d-A.pdf' });
await db.query(`INSERT INTO "DisbursementBatch" (id, "clubId", beneficiary, currency, "count", "netAmount", method, reference, "disbursedAt", status, "receiptKey", "receiptName", "receiptMime", "receiptBytes", "createdByName")
    VALUES ('lote1','c-fair','Colrotarios','COP',2,500000,'transferencia_bancaria','MERC-777','2026-10-20T15:00:00Z','confirmado','private/disbursements/lote1.pdf','lote1.pdf','application/pdf',2030,'Tesorería Feria')`);
objects.set('private/disbursements/lote1.pdf', { body: pdf('lote1'), type: 'application/pdf' });
await disb('d-B', 'FP-B', 250000, { batchId: 'lote1', reference: 'MERC-777', at: '2026-10-20T15:00:00Z' });
await disb('d-C', 'FP-C', 250000, { batchId: 'lote1', reference: 'MERC-777', at: '2026-10-20T15:00:00Z' });
await disb('d-D', 'FP-D', 100000, { reference: 'MERC-002', receiptKey: 'private/disbursements/d-D.pdf' });
await disb('d-H', 'FP-H', 250000, { reference: 'MERC-003' });
await disb('d-X', 'FP-X', 250000, { reference: 'MERC-900', receiptKey: 'private/disbursements/d-X.pdf' });

// La huella de lo que Exchange NO puede tocar: pagos, traslados y postulaciones.
const huella = async () => {
    const parts = [];
    for (const [t, cols] of [['Payment', 'id, status, amount, "netAmount"'], ['Disbursement', 'id, amount, status, "batchId", reference, "receiptKey"'],
        ['DisbursementBatch', 'id, "netAmount", status, reference, "receiptKey"'],
        ['ProjectFairSubmission', 'id, status, "paidAt", "amountReceived", "amountCop", "workflowStatus", "paymentConfirmationOrigin", metadata']]) {
        const { rows } = await db.query(`SELECT ${cols} FROM "${t}" ORDER BY id`);
        parts.push(JSON.stringify(rows));
    }
    return createHash('sha256').update(parts.join('|')).digest('hex');
};
const antes = await huella();

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api/project-fair`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const admin = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'c-fair' }, SECRET);
const finance = jwt.sign({ id: 'u-fin', email: 'fin@feria.org', role: 'editor', clubId: 'c-d4281' }, SECRET);
const reviewer = jwt.sign({ id: 'u-rev', email: 'rev@feria.org', role: 'editor', clubId: 'c-d4281' }, SECRET);
const eventAdmin = jwt.sign({ id: 'u-ev', email: 'admin.evento@d4281.org', role: 'district_admin', clubId: 'c-d4281' }, SECRET);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const EV = '?evento=evt-xii';
const list = async (token = admin, extra = '') => call('GET', `/admin/postulaciones${EV}&pageSize=200${extra}`, token);
const byRef = (rows) => Object.fromEntries(rows.map(r => [r.publicRef, r]));
const enc = encodeURIComponent;

console.log('── La columna: estados independientes del pago');
let r = await list();
ok(r.status === 200, 'el listado responde con la columna Exchange');
let m = byRef(r.data.submissions);
ok(m['FP-A'].paymentStatus === 'paid' && m['FP-A'].exchange.state === 'en_conciliacion' && m['FP-A'].exchange.hasReceipt, 'A: pago confirmado + comprobante adjunto + en conciliación (tres estados distintos)');
ok(m['FP-B'].exchange.state === 'en_conciliacion' && m['FP-C'].exchange.state === 'en_conciliacion', 'B y C: el MISMO comprobante agrupado aparece en los dos proyectos');
ok(m['FP-D'].exchange.state === 'parcial' && m['FP-D'].exchange.allocated === 100000 && m['FP-D'].exchange.expected === 250000, 'D: traslado parcial (100.000 de 250.000)');
ok(m['FP-E'].exchange.state === 'sin_traslado' && m['FP-E'].exchange.label === 'Pendiente', 'E: pagado y sin traslado → «Pendiente»');
ok(m['FP-F'].exchange.state === 'pago_directo', 'F: confirmación manual → pago directo (no pasa por la cuenta de la plataforma)');
ok(m['FP-G'].exchange.state === 'no_aplica', 'G: pago pendiente → no aplica');
ok(m['FP-H'].exchange.state === 'sin_comprobante', 'H: traslado registrado sin comprobante → «Falta comprobante» (adjuntar no es lo único: registrar tampoco concilia)');
ok(m['FP-J'].exchange.via?.publicRef === 'FP-I' && m['FP-J'].exchange.anchor === false, 'J: proyecto cubierto por el pago de I sigue a su ancla');
ok(!m['FP-X'], 'el proyecto de otra edición no aparece');

console.log('── Resumen: por moneda, cada operación UNA vez');
r = await call('GET', `/admin/exchange/resumen${EV}`, admin);
const cop = r.data.totals.porMoneda.find(t => t.currency === 'COP');
ok(r.status === 200 && cop, 'resumen en COP');
ok(cop.trasladado === 1100000, `total trasladado = 250.000 + 500.000 (lote, una vez) + 100.000 + 250.000 = 1.100.000 (fue ${cop.trasladado})`);
ok(cop.operaciones === 4, 'cuatro operaciones bancarias (el lote compartido cuenta una vez)');
ok(cop.recibido === 250000 * 6 + 350000, 'total recibido = pagos con movimiento (el cubierto no suma dos veces)');
ok(cop.pendienteTraslado === 150000 + 250000 + 350000, 'pendiente de traslado = D (150.000) + E + I');
ok(r.data.totals.pagosDirectos === 1, 'el pago directo se informa aparte');
ok(!r.data.totals.porMoneda.some(t => t.currency === 'USD'), 'sin dólares inventados: COP y USD no se mezclan');

console.log('── Filtros combinables');
r = await list(admin, '&exchange=en_conciliacion');
ok(r.data.submissions.map(s => s.publicRef).sort().join() === 'FP-A,FP-B,FP-C', 'filtro «En conciliación»');
r = await list(admin, '&exchange=comprobante');
ok(r.data.submissions.map(s => s.publicRef).sort().join() === 'FP-A,FP-B,FP-C,FP-D', 'filtro «Comprobante adjunto»');
r = await list(admin, '&exchangeRef=merc-777');
ok(r.data.submissions.map(s => s.publicRef).sort().join() === 'FP-B,FP-C', 'búsqueda por referencia bancaria');
r = await list(admin, '&trasladoDesde=2026-10-18&trasladoHasta=2026-10-31');
ok(r.data.submissions.map(s => s.publicRef).sort().join() === 'FP-B,FP-C', 'filtro por fecha del traslado');
r = await list(admin, '&exchange=parcial&search=FP-D');
ok(r.data.submissions.length === 1 && r.data.pagination.total === 1, 'Exchange se combina con la búsqueda de siempre');

console.log('── El visor');
r = await call('GET', `/admin/exchange/postulaciones/${B}${EV}`, admin);
ok(r.status === 200 && r.data.operations.length === 1, 'detalle de B');
const lote = r.data.operations[0];
ok(lote.kind === 'agrupada' && lote.allocations.length === 2 && lote.allocated === 500000, 'la transferencia agrupada muestra sus dos asignaciones y su total una vez');
ok(lote.allocations.some(a => a.isThis && a.project.publicRef === 'FP-B'), 'marca cuál asignación es la de este proyecto');
ok(lote.bovedaFiles.length === 1 && !JSON.stringify(r.data).includes('private/disbursements'), 'el comprobante se lista sin su clave de S3');
r = await call('GET', `/admin/exchange/operaciones/${enc(lote.key)}/archivo${EV}&fuente=boveda&indice=0`, admin);
ok(r.status === 200 && /lote1\.pdf/.test(r.data.url) && /X-Amz-Expires=300/.test(r.data.url), 'el ícono abre el comprobante CORRECTO con enlace firmado de 5 minutos');
r = await call('GET', `/admin/exchange/operaciones/${enc(lote.key)}/archivo${EV}&fuente=boveda&indice=0&descargar=1`, admin);
ok(r.status === 200 && /response-content-disposition=attachment/i.test(r.data.url), 'la descarga lleva su nombre de archivo');
const consultas = await db.query(`SELECT action FROM "ExchangeEvent" WHERE "operationKey" = $1`, [lote.key]);
ok(consultas.rows.some(x => x.action === 'comprobante_consultado') && consultas.rows.some(x => x.action === 'comprobante_descargado'), 'consulta y descarga quedan auditadas');

console.log('── Conciliación');
const opA = 'd:d-A';
r = await call('POST', `/admin/exchange/operaciones/${enc(opA)}/estado${EV}`, reviewer, { to: 'conciliado' });
ok(r.status === 403, 'un revisor (sin finanzas) no concilia (403)');
r = await call('POST', `/admin/exchange/operaciones/${enc(opA)}/estado${EV}`, finance, { to: 'conciliado' });
ok(r.status === 200, 'finanzas concilia A (comprobante + referencia)');
r = await call('POST', `/admin/exchange/operaciones/${enc(opA)}/estado${EV}`, finance, { to: 'conciliado' });
ok(r.status === 409, 'dos clics no concilian dos veces (409)');
m = byRef((await list()).data.submissions);
ok(m['FP-A'].exchange.state === 'conciliado' && m['FP-A'].exchange.confirmedAmount === 250000 && m['FP-A'].paymentStatus === 'paid', 'A: conciliado, y el pago sigue siendo el mismo (independientes)');
r = await call('PUT', `/admin/exchange/operaciones/${enc(opA)}/datos${EV}`, finance, { bankReference: 'OTRA' });
ok(r.status === 409 && /reabre/i.test(r.data.error), 'un conciliado no se edita: se reabre (409)');
r = await call('POST', `/admin/exchange/operaciones/${enc(opA)}/estado${EV}`, finance, { to: 'en_conciliacion' });
ok(r.status === 409 && /motivo/.test(r.data.error), 'reabrir exige motivo');
r = await call('POST', `/admin/exchange/operaciones/${enc(opA)}/estado${EV}`, finance, { to: 'en_conciliacion', note: 'Referencia mal transcrita en el extracto' });
ok(r.status === 200, 'se reabre con motivo');
const reab = await db.query(`SELECT payload FROM "ExchangeEvent" WHERE "operationKey" = $1 AND action = 'conciliacion_reabierta'`, [opA]);
ok(reab.rows[0]?.payload?.previous?.reconciledByName === 'fin@feria.org', 'la conciliación ORIGINAL queda completa en el historial');

console.log('── Monedas y diferencias (lote B + C)');
r = await call('PUT', `/admin/exchange/operaciones/${enc(lote.key)}/datos${EV}`, finance, { sentAmount: 125, sentCurrency: 'USD', receivedAmount: 495000, receivedCurrency: 'COP', exchangeRate: 3960 });
ok(r.status === 400 && /tasa/.test(r.data.error), 'una tasa sin fuente se rechaza: no se usa una tasa de hoy');
r = await call('PUT', `/admin/exchange/operaciones/${enc(lote.key)}/datos${EV}`, finance, { transferDate: '2099-01-01' });
ok(r.status === 400, 'fecha de transferencia futura: 400');
r = await call('PUT', `/admin/exchange/operaciones/${enc(lote.key)}/datos${EV}`, finance, {
    sentAmount: 125, sentCurrency: 'USD', receivedAmount: 495000, receivedCurrency: 'COP', exchangeRate: 3960, rateSource: 'Comprobante Mercury',
    feeAmount: 15, feeCurrency: 'USD', bankReference: 'MERC-777', transferDate: '2026-10-20T15:00:00Z', notes: 'Giro agrupado',
});
ok(r.status === 200 && r.data.version === 2, 'datos de la operación guardados (versión 2)');
r = await call('PUT', `/admin/exchange/operaciones/${enc(lote.key)}/datos${EV}`, finance, { receivedAmount: 1, receivedCurrency: 'COP', version: 1 });
ok(r.status === 409 && r.data.code === 'STALE', 'una edición sobre una versión vieja no pisa el cambio de otro (409)');
r = await call('GET', `/admin/exchange/postulaciones/${C}${EV}`, admin);
ok(r.data.operations[0].difference === -5000, 'diferencia medida en la misma moneda: 495.000 − 500.000 = −5.000');
r = await call('POST', `/admin/exchange/operaciones/${enc(lote.key)}/estado${EV}`, finance, { to: 'conciliado' });
ok(r.status === 409 && /diferencia/.test(r.data.error), 'con diferencia no se concilia sin explicarla');
r = await call('POST', `/admin/exchange/operaciones/${enc(lote.key)}/estado${EV}`, finance, { to: 'con_diferencia', note: 'Faltan 5.000 COP: revisar con Colrotarios' });
ok(r.status === 200, 'se registra la diferencia');
m = byRef((await list()).data.submissions);
ok(m['FP-B'].exchange.state === 'con_diferencia' && m['FP-C'].exchange.state === 'con_diferencia', 'B y C: «Diferencia»');
r = await call('GET', `/admin/exchange/resumen${EV}`, admin);
ok(r.data.totals.porMoneda.find(t => t.currency === 'COP').diferencias === 1, 'una operación con diferencia (no dos)');
r = await call('POST', `/admin/exchange/operaciones/${enc(lote.key)}/estado${EV}`, finance, { to: 'conciliado', note: 'Comisión del banco receptor confirmada por Colrotarios' });
ok(r.status === 200, 'se concilia con la diferencia explicada');
const hist = await call('GET', `/admin/exchange/postulaciones/${B}${EV}`, admin);
ok(hist.data.history.some(h => h.action === 'datos_registrados') && hist.data.history.some(h => h.action === 'diferencia_registrada') && hist.data.history.some(h => h.action === 'conciliacion_confirmada') && hist.data.history.some(h => h.action === 'pago_recibido'), 'historial: pago, traslado, datos, diferencia y conciliación');

console.log('── Soportes de Exchange (H sin comprobante)');
const opH = 'd:d-H';
const subir = async (token, bytes, name = 'recepcion.pdf', type = 'application/pdf') => {
    const pre = await call('POST', `/admin/exchange/operaciones/${enc(opH)}/documentos/url${EV}`, token, { filename: name, contentType: type, size: bytes.length });
    if (pre.status !== 200) return pre;
    const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes });
    assert.equal(put.status, 200);
    return call('POST', `/admin/exchange/operaciones/${enc(opH)}/documentos${EV}`, token, { key: pre.data.key, name, kind: 'comprobante_recepcion' });
};
r = await call('POST', `/admin/exchange/operaciones/${enc(opH)}/estado${EV}`, finance, { to: 'conciliado' });
ok(r.status === 409 && /comprobante/.test(r.data.error), 'sin comprobante no se concilia');
r = await subir(finance, Buffer.from('texto con extension pdf'));
ok(r.status === 422, 'un texto renombrado a .pdf se rechaza por sus bytes (422)');
r = await call('POST', `/admin/exchange/operaciones/${enc(opH)}/documentos/url${EV}`, finance, { filename: 'a.exe', contentType: 'application/x-msdownload', size: 10 });
ok(r.status === 400, 'un ejecutable no se prepara para subir');
r = await subir(finance, pdf('H'));
ok(r.status === 201, 'soporte PDF adjuntado a H');
const docKey = (await db.query(`SELECT "storageKey" FROM "ExchangeDocument" WHERE "operationKey" = $1`, [opH])).rows[0].storageKey;
ok(docKey.startsWith('private/exchange/d-d-H/'), 'guardado bajo el prefijo PRIVADO de la operación');
m = byRef((await list()).data.submissions);
ok(m['FP-H'].exchange.state === 'en_conciliacion' && m['FP-H'].exchange.hasReceipt, 'H pasa a «En conciliación» (comprobante adjunto, sin verificar)');

console.log('── Acceso del administrador del EVENTO (sólo consulta)');
r = await list(eventAdmin);
ok(r.status === 403 && r.data.code === 'NO_FAIR_PROFILE', 'sin acceso concedido: 403 (no ve nada)');
r = await call('POST', `/admin/exchange/accesos${EV}`, finance, { email: 'admin.evento@d4281.org' });
ok(r.status === 403, 'finanzas no concede accesos (sólo quien administra la configuración)');
r = await call('POST', `/admin/exchange/accesos${EV}`, admin, { email: 'Admin.Evento@d4281.org', canDownload: false, note: 'Conferencia Distrital' });
ok(r.status === 201 && r.data.linkedUser === true, 'el administrador concede el acceso de consulta (ligado al usuario)');
r = await call('POST', `/admin/exchange/accesos${EV}`, admin, { email: 'admin.evento@d4281.org' });
ok(r.status === 409, 'no se duplica un acceso vigente');
r = await list(eventAdmin);
ok(r.status === 200 && r.data.access.role === 'exchange_viewer', 'con el acceso, ve «Proyectos postulados»');
const fila = byRef(r.data.submissions)['FP-B'];
ok(fila.exchange?.state === 'conciliado', 've la columna Exchange');
ok(!('email' in fila) && !('phone' in fila) && !('idNumber' in fila) && !('responsable' in fila) && !('stripePaymentIntentId' in fila), 'sin datos personales ni referencias de Stripe (lista blanca)');
r = await call('GET', `/admin/exchange/postulaciones/${B}${EV}`, eventAdmin);
ok(r.status === 200 && r.data.capabilities.view && !r.data.capabilities.manage && !r.data.capabilities.reconcile && !r.data.capabilities.download, 'consulta el detalle; sus capacidades son sólo de consulta');
r = await call('GET', `/admin/exchange/operaciones/${enc(lote.key)}/archivo${EV}&fuente=boveda&indice=0`, eventAdmin);
ok(r.status === 200 && r.data.url, 'abre el comprobante');
r = await call('GET', `/admin/exchange/operaciones/${enc(lote.key)}/archivo${EV}&fuente=boveda&indice=0&descargar=1`, eventAdmin);
ok(r.status === 403, 'sin permiso de descarga: 403');
r = await call('POST', `/admin/exchange/operaciones/${enc(opH)}/estado${EV}`, eventAdmin, { to: 'con_diferencia', note: 'intento de cambio' });
ok(r.status === 403, 'no concilia (403)');
r = await call('PUT', `/admin/exchange/operaciones/${enc(opH)}/datos${EV}`, eventAdmin, { notes: 'x' });
ok(r.status === 403, 'no corrige datos (403)');
const docId = (await db.query(`SELECT id FROM "ExchangeDocument" WHERE "operationKey" = $1`, [opH])).rows[0].id;
r = await call('POST', `/admin/exchange/documentos/${docId}/retirar${EV}`, eventAdmin, { reason: 'quiero borrarlo' });
ok(r.status === 403, 'no retira comprobantes (403)');
r = await call('GET', `/admin/postulaciones/${B}${EV}`, eventAdmin);
ok(r.status === 403, 'la ficha completa (expediente, datos personales) sigue cerrada');
r = await call('GET', `/admin/exchange/postulaciones/${X}?evento=evt-xii`, eventAdmin);
ok(r.status === 404, 'un proyecto de OTRA edición «no existe» para él');
r = await call('GET', `/admin/exchange/operaciones/${enc('d:d-X')}/archivo?evento=evt-xii&fuente=boveda`, eventAdmin);
ok(r.status === 404, 'ni su comprobante');
r = await call('GET', `/admin/exchange/postulaciones/${X}?evento=evt-xiii`, eventAdmin);
ok(r.status === 403, 'y en esa otra edición no tiene acceso (403)');
const g = await db.query(`SELECT "userId", "lastUsedAt" FROM "ExchangeAccessGrant" WHERE lower(email) = 'admin.evento@d4281.org' AND "revokedAt" IS NULL`);
ok(g.rows[0]?.userId === 'u-ev' && g.rows[0]?.lastUsedAt, 'el acceso queda ligado al usuario y registra su último uso');
const grants = (await call('GET', `/admin/exchange/config${EV}`, admin)).data.grants;
r = await call('POST', `/admin/exchange/accesos/${grants.find(x => x.email === 'admin.evento@d4281.org').id}/revocar${EV}`, admin, { reason: 'Fin del encargo' });
ok(r.status === 200, 'se revoca con motivo');
r = await list(eventAdmin);
ok(r.status === 403, 'revocado: deja de ver al instante');

console.log('── La siembra pedida (valjupa@…) y las cuentas');
const cfgAdmin = (await call('GET', `/admin/exchange/config${EV}`, admin)).data;
const sembrado = cfgAdmin.grants.find(x => x.email === 'valjupa@rotarydistrict4281colombia.org');
ok(sembrado && sembrado.source === 'siembra_v4.1335' && !sembrado.revokedAt, 'el acceso pedido para el administrador del evento existe en la edición abierta');
const marca = await db.query(`SELECT 1 FROM "ExchangeEvent" WHERE action = 'acceso_sembrado' AND "eventId" = 'evt-xii'`);
ok(marca.rows.length === 1, 'la siembra deja su marca (revocarlo es definitivo)');
const otra = await db.query(`SELECT 1 FROM "ExchangeAccessGrant" WHERE "eventId" = 'evt-xiii'`);
ok(otra.rows.length === 0, 'no se siembra en otra edición');
r = await call('PUT', `/admin/exchange/config${EV}`, admin, {
    origin: { label: 'Mercury', institution: 'Mercury Bank', holder: 'Valkomen LLC', accountNumber: '9988776655', currency: 'USD' },
    destination: { label: 'Colrotarios', institution: 'Bancolombia', holder: 'Colrotarios', accountNumber: '0123456789', currency: 'COP' },
});
ok(r.status === 200 && r.data.accounts.origin.accountNumber === '9988776655', 'las cuentas se configuran (no están en el código)');
r = await call('PUT', `/admin/exchange/config${EV}`, finance, { origin: {} });
ok(r.status === 403, 'finanzas no cambia las cuentas');
r = await call('GET', `/admin/exchange/config${EV}`, finance);
ok(r.data.accounts.origin.accountNumber === '****6655' && r.data.grants.length === 0, 'quien no configura ve la cuenta enmascarada y no ve los accesos');
r = await call('PUT', `/admin/exchange/config${EV}`, admin, {
    origin: { label: 'Mercury', institution: 'Mercury Bank', holder: 'Valkomen LLC', accountNumber: '****6655', currency: 'USD' },
    destination: { label: 'Colrotarios', accountNumber: '0123456789', currency: 'COP' },
});
ok(r.data.accounts.origin.accountNumber === '9988776655', 'una cuenta enmascarada que vuelve no pisa la guardada');
const histCfg = await db.query(`SELECT history FROM "ExchangeConfig" WHERE "eventId" = 'evt-xii'`);
ok(!JSON.stringify(histCfg.rows[0].history).includes('9988776655'), 'la bitácora de la configuración no guarda números completos');

console.log('── Reportes');
let csv = await fetch(`${BASE}/admin/exchange/export.csv${EV}&vista=operaciones`, { headers: { Authorization: `Bearer ${admin}` } }).then(x => x.text());
let lines = csv.trim().split('\n');
ok(lines.filter(l => l.startsWith('b:lote1')).length === 1 && /;500000;/.test(lines.find(l => l.startsWith('b:lote1'))), 'operaciones: el lote una vez con su total');
csv = await fetch(`${BASE}/admin/exchange/export.csv${EV}&vista=asignaciones`, { headers: { Authorization: `Bearer ${admin}` } }).then(x => x.text());
lines = csv.trim().split('\n').filter(l => l.startsWith('b:lote1'));
ok(lines.length === 2 && lines.every(l => /;250000;/.test(l) && !/;500000;/.test(l)), 'asignaciones: una fila por proyecto, sin repetir el total de la operación');
csv = await fetch(`${BASE}/admin/export.csv${EV}`, { headers: { Authorization: `Bearer ${admin}` } }).then(x => x.text());
ok(/Exchange \(estado\)/.test(csv) && /Referencia bancaria/.test(csv) && /MERC-777/.test(csv), 'el CSV del listado incluye Exchange');
r = await call('GET', `/admin/exchange/resumen${EV}`, reviewer);
ok(r.status === 403, 'un revisor no ve Exchange (no ve pagos)');

console.log('── Reversión en la Bóveda');
await db.query(`UPDATE "Disbursement" SET status = 'reversado', "reversedAt" = NOW(), "reversedBy" = 'Tesorería', "reversedReason" = 'Valor errado' WHERE id = 'd-D'`);
m = byRef((await list()).data.submissions);
ok(m['FP-D'].exchange.state === 'sin_traslado', 'un traslado revertido deja de contar: D vuelve a «Pendiente»');
r = await call('POST', `/admin/exchange/operaciones/${enc('d:d-D')}/estado${EV}`, finance, { to: 'conciliado' });
ok(r.status === 409 && /revertido/.test(r.data.error), 'no se concilia un traslado revertido');
r = await call('GET', `/admin/exchange/postulaciones/${D}${EV}`, admin);
ok(r.status === 200, 'el detalle de D responde');
await db.query(`UPDATE "Disbursement" SET status = 'confirmado', "reversedAt" = NULL, "reversedBy" = NULL, "reversedReason" = NULL WHERE id = 'd-D'`);

console.log('── Lo que Exchange NO toca');
ok(await huella() === antes, 'pagos, traslados de la Bóveda y postulaciones: idénticos byte a byte');

srv.close(); s3.close();
await db.pool.end();
console.log(`\n✅ test:fair:exchange:e2e — ${n} comprobaciones contra Postgres real.`);
