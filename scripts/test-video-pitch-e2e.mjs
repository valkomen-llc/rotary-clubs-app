#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — recorrido de EXTREMO A EXTREMO (v4.1293.0)
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:video-pitch:e2e
//
// Postgres REAL + un S3 simulado en memoria + el router real del módulo:
// disponibilidad → borrador precargado → materiales (válidos, disfrazados,
// verticales) → envío con número → permisos → revisión → información
// requerida y reenvío → guion manual → enviado al club → ajustes → aprobado →
// producción → video final → entrega → el club lo ve → bandeja, bloque y CSV.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ. Por eso no lee DATABASE_URL: exige
// FAIR_E2E_DATABASE_URL apuntando a localhost, y una base VACÍA y desechable.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:video-pitch:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
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
    if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
    if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>'); }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type || 'application/octet-stream' }); return res.end(); }
    if (req.method === 'GET') {
        let body = o.body;
        const range = req.headers.range;
        if (range) {
            const m = /bytes=(\d*)-(\d*)/.exec(range);
            if (m[1] === '') body = o.body.subarray(-Number(m[2]));
            else body = o.body.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined);
            res.writeHead(206, { 'Content-Length': body.length, 'Content-Type': o.type });
        } else res.writeHead(200, { 'Content-Length': body.length, 'Content-Type': o.type });
        return res.end(body);
    }
    res.writeHead(405); res.end();
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));
const S3_PORT = s3.address().port;

// ── Stripe simulado (v4.1296) ─────────────────────────────────────────
// Lo mínimo que usa el módulo: crear una Checkout Session, leerla (con el
// PaymentIntent expandido), expirarla y leer un PaymentIntent con su cargo.
// La prueba decide cuándo una sesión «se paga» (`stripeState.pay(id)`).
const stripeSessions = new Map();
const stripeIntents = new Map();
let stripeSeq = 0;
const parseForm = (txt) => { const out = {}; for (const [k, v] of new URLSearchParams(txt)) out[k] = v; return out; };
const stripeState = {
    pay(id) {
        const sess = stripeSessions.get(id); if (!sess) throw new Error('sesión inexistente');
        const pi = `pi_${++stripeSeq}`;
        stripeIntents.set(pi, { id: pi, object: 'payment_intent', status: 'succeeded', amount: sess.amount_total, currency: sess.currency, metadata: sess.metadata, latest_charge: { id: `ch_${stripeSeq}`, receipt_url: `https://pay.stripe.test/receipts/${pi}` } });
        Object.assign(sess, { status: 'complete', payment_status: 'paid', payment_intent: pi });
        return sess;
    },
    expire(id) { const sess = stripeSessions.get(id); if (sess && sess.status === 'open') sess.status = 'expired'; return sess; },
    sessions: stripeSessions,
};
const stripeSrv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
        const body = parseForm(Buffer.concat(chunks).toString());
        const u = new URL(req.url, 'http://x');
        const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        let m;
        if (req.method === 'POST' && u.pathname === '/v1/checkout/sessions') {
            const id = `cs_test_${++stripeSeq}`;
            const metadata = {}; for (const [k, v] of Object.entries(body)) { const mm = /^metadata\[(.+)\]$/.exec(k); if (mm) metadata[mm[1]] = v; }
            const sess = { id, object: 'checkout.session', status: 'open', payment_status: 'unpaid', url: `https://checkout.stripe.test/${id}`, currency: body['line_items[0][price_data][currency]'], amount_total: Number(body['line_items[0][price_data][unit_amount]']), expires_at: Math.floor(Date.now() / 1000) + 86400, metadata, client_reference_id: body.client_reference_id || null, payment_intent: null };
            stripeSessions.set(id, sess); return json(200, sess);
        }
        if ((m = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(u.pathname)) && req.method === 'POST') { const sess = stripeState.expire(m[1]); return sess ? json(200, sess) : json(404, { error: { message: 'No such session' } }); }
        if ((m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(u.pathname)) && req.method === 'GET') {
            const sess = stripeSessions.get(m[1]); if (!sess) return json(404, { error: { message: 'No such session' } });
            const expandPi = [...u.searchParams.values()].includes('payment_intent');
            return json(200, { ...sess, payment_intent: expandPi && sess.payment_intent ? stripeIntents.get(sess.payment_intent) : sess.payment_intent });
        }
        if ((m = /^\/v1\/payment_intents\/([^/]+)$/.exec(u.pathname)) && req.method === 'GET') { const pi = stripeIntents.get(m[1]); return pi ? json(200, pi) : json(404, { error: { message: 'No such payment_intent' } }); }
        json(404, { error: { message: `sin ruta ${req.method} ${u.pathname}` } });
    });
});
await new Promise(r => stripeSrv.listen(0, '127.0.0.1', r));
process.env.STRIPE_API_BASE = `http://127.0.0.1:${stripeSrv.address().port}`;
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${S3_PORT}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
delete process.env.OPENAI_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);

await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-xii','XII Feria','xii') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-xii','evt-xii','{}') ON CONFLICT DO NOTHING`);

const sub = async (ref, wf, extra = {}) => {
    const { rows } = await db.query(`INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "projectDescription", "workflowStatus", status, "archivedAt", phone, "focusArea", "budgetUsd")
        VALUES ($1,'evt-xii',$2,'Pérez',$3,$4,$5,$6,$7,$8,'pending_payment',$9,'+57 300 1234567','agua', 25000) RETURNING id`,
        [ref, `Nombre ${ref}`, `${ref}@club.org`, extra.club || 'Club Valledupar', extra.district || '4271', `Proyecto ${ref}`, 'Pozos de agua para tres veredas, 450 personas.', wf, extra.archived ? new Date() : null]);
    const id = rows[0].id;
    const acc = await db.query(`INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName") VALUES ($1,$2,'!',$3) RETURNING id`, [id, `${ref}@club.org`, extra.club || 'Club Valledupar']);
    return { id, accountId: acc.rows[0].id, email: `${ref}@club.org` };
};
const A = await sub('FP-A', 'received');
const B = await sub('FP-B', 'in_review', { club: 'Club Cartagena', district: '4281' });
const C = await sub('FP-C', 'draft');
const D = await sub('FP-D', 'received', { archived: true });
await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct") VALUES ($1, $2::jsonb, 50)`,
    [A.id, JSON.stringify({ necesidades: { needs: 'No hay agua potable en la zona.', beneficiariesCount: '450 personas' }, identificacion: { city: 'Valledupar' } })]);

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api/project-fair`;

const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const admin = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'c1' }, SECRET);
const viewer = jwt.sign({ id: 'u-view', email: 'viewer@x.org', role: 'editor' }, SECRET);
const portal = (s) => jwt.sign({ sub: s.accountId, submissionId: s.id, email: s.email, aud: 'project-fair-portal' }, SECRET);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, headers: r.headers };
};
const EV = '?evento=evt-xii';
const jpg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(30000, 1)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20000, 32), Buffer.from('%%EOF')]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(200000, 1)]);

const uploadPortal = async (token, filename, bytes, meta = {}) => {
    const pre = await call('POST', '/portal/video-pitch/files/presign', token, { filename, size: bytes.length });
    if (pre.status !== 200) return pre;
    const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes });
    assert.equal(put.status, 200);
    return call('POST', '/portal/video-pitch/files', token, { storageKey: pre.data.storageKey, filename, ...meta });
};
const uploadAdmin = async (id, role, filename, bytes, meta = {}) => {
    const pre = await call('POST', `/admin/video-pitch/${id}/files/presign${EV}`, admin, { filename, size: bytes.length, role });
    if (pre.status !== 200) return pre;
    const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes });
    assert.equal(put.status, 200);
    return call('POST', `/admin/video-pitch/${id}/files${EV}`, admin, { storageKey: pre.data.storageKey, filename, role, ...meta });
};

console.log('── Disponibilidad');
let r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.status === 200 && r.data.exists === false && r.data.status === 'not_requested' && r.data.available === true, 'postulado sin solicitud: «No solicitado» y disponible');
ok(r.data.prefill.identification.responsibleName === 'Nombre FP-A Pérez' && r.data.prefill.identification.whatsapp === '+57 300 1234567', 'bloque A precargado');
ok(r.data.prefill.suggestions.problem === 'No hay agua potable en la zona.' && r.data.identity.projectName === 'Proyecto FP-A', 'sugerencias de la Formulación e identidad del proyecto');
ok(r.data.context.hasProjectContext && r.data.context.hasFormulation && r.data.context.items.some(i => i.key === 'problem'), 'el contexto del proyecto (postulación + Formulación) llega para mostrarse en sólo lectura');
ok((await call('GET', '/portal/video-pitch', portal(B))).data.context.hasFormulation === false, 'sin Formulación, el contexto lo dice');
r = await call('GET', '/portal/video-pitch', portal(C));
ok(r.status === 200 && r.data.available === false && /postulado/.test(r.data.reason), 'un borrador de postulación todavía no puede pedir el video');
r = await call('GET', '/portal/video-pitch', portal(D));
ok(r.data.available === true, 'una postulación archivada SÍ puede pedirlo: archivar es administrativo y la bandeja lo marca');
ok((await call('PUT', '/portal/video-pitch', portal(C), { answers: {} })).status === 403, 'guardar sin disponibilidad: 403');
ok((await call('GET', '/portal/video-pitch', null)).status === 401 && (await call('GET', '/portal/video-pitch', admin)).status === 401, 'sin sesión del panel: 401 (el token de la plataforma no sirve)');

console.log('── Borrador y materiales');
const answers = {
    identification: { responsibleName: 'Nombre FP-A Pérez', email: 'fp-a@club.org', whatsapp: '+57 300 1234567' },
    story: { description: 'Pozos de agua para tres veredas que hoy no tienen agua potable. Beneficia a 450 personas y necesita 25000 USD para completar la obra.', problem: 'No hay agua potable.' },
    preferences: { language: 'es_sub_en', objective: 'funding' },
    consent: { mediaAuthorization: false },
};
r = await call('PUT', '/portal/video-pitch', portal(A), { answers });
ok(r.status === 200 && r.data.status === 'draft' && r.data.completionPct > 40, 'guardar crea el borrador y mide el avance');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.exists && r.data.request.status === 'draft' && r.data.request.number === null && r.data.canEdit, 'el borrador existe sin número y se puede editar');
const reqId = r.data.request.id;
r = await uploadPortal(portal(A), 'foto.jpg', jpg, { width: 1080, height: 1920 });
ok(r.status === 201 && r.data.file.kind === 'image' && r.data.file.warnings.some(w => /vertical/.test(w)), 'una foto vertical se acepta con advertencia');
const photoId = r.data.file.id;
r = await uploadPortal(portal(A), 'disfraz.png', pdf);
ok(r.status === 422 && /contenido/.test(r.data.error) && objects.size === 1, 'un PDF renombrado a .png se rechaza y el objeto se borra');
r = await uploadPortal(portal(A), 'ficha.pdf', pdf);
ok(r.status === 201 && r.data.file.kind === 'document', 'un PDF de apoyo se acepta');
const pdfId = r.data.file.id;
r = await call('PATCH', `/portal/video-pitch/files/${photoId}`, portal(A), { caption: 'La vereda sin agua' });
ok(r.status === 200 && r.data.file.caption === 'La vereda sin agua', 'leyenda del material');
r = await call('GET', `/portal/video-pitch/files/${photoId}/url`, portal(A));
ok(r.status === 200 && /test_bucket/.test(r.data.url), 'el club abre su propio material con un enlace firmado');
ok((await call('GET', `/portal/video-pitch/files/${photoId}/url`, portal(B))).status === 404, 'otro club no ve ese material');
r = await call('DELETE', `/portal/video-pitch/files/${pdfId}`, portal(A));
ok(r.status === 200 && objects.size === 1, 'quitar un material borra el objeto');

console.log('── Envío');
r = await call('POST', '/portal/video-pitch/submit', portal(A), { answers });
ok(r.status === 400 && r.data.errors.some(e => e.field === 'consent.mediaAuthorization'), 'sin consentimiento no se envía');
answers.consent.mediaAuthorization = true;
r = await call('POST', '/portal/video-pitch/submit', portal(A), { answers });
ok(r.status === 200 && /^VP-\d{4}-0001$/.test(r.data.number) && r.data.status === 'submitted', `enviada con número ${r.data.number}`);
const number = r.data.number;
r = await call('POST', '/portal/video-pitch/submit', portal(A), { answers });
ok(r.status === 409, 'un doble envío no duplica (409)');
ok((await call('PUT', '/portal/video-pitch', portal(A), { answers })).status === 409 && (await uploadPortal(portal(A), 'otra.jpg', jpg)).status === 409, 'enviada: ni se edita ni se adjunta');
let ev = await db.query(`SELECT type FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'video_pitch_requested'`, [A.id]);
ok(ev.rows.length === 1, 'queda UNA entrada en el historial de la postulación');
let notif = await db.query(`SELECT kind, status FROM "VideoPitchNotification" WHERE "requestId" = $1 ORDER BY "createdAt"`, [reqId]);
ok(notif.rows.some(x => x.kind === 'received') && notif.rows.every(x => ['sent', 'failed'].includes(x.status)), 'el aviso de recepción se intentó (sin proveedor de correo queda «failed», no «pending»)');
const subRow = (await db.query('SELECT status, "workflowStatus" FROM "ProjectFairSubmission" WHERE id = $1', [A.id])).rows[0];
ok(subRow.status === 'pending_payment' && subRow.workflowStatus === 'received', 'la postulación no cambió: ni pago ni estado del proyecto');

console.log('── Permisos del administrador');
ok((await call('GET', `/admin/video-pitch${EV}`, null)).status === 401, 'sin sesión: 401');
ok((await call('GET', `/admin/video-pitch${EV}`, portal(A))).status === 403, 'el token del club no entra al administrador');
r = await call('GET', `/admin/video-pitch${EV}`, viewer);
ok(r.status === 200 && r.data.access.manage === false && r.data.rows.length === 1, 'un perfil de sólo lectura ve la bandeja');
ok((await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, viewer, { status: 'in_review' })).status === 403, '…pero no cambia estados (403)');
r = await call('GET', `/admin/video-pitch${EV}`, admin);
ok(r.data.kpis.total === 1 && r.data.kpis.new === 1 && r.data.rows[0].number === number && r.data.rows[0].materialCount === 1, 'bandeja: indicadores y fila con sus materiales');
r = await call('GET', `/admin/video-pitch${EV}&q=${encodeURIComponent(number.toLowerCase())}`, admin);
ok(r.data.total === 1 && (await call('GET', `/admin/video-pitch${EV}&q=inexistente`, admin)).data.total === 0, 'búsqueda por número');
r = await call('GET', `/admin/video-pitch/${reqId}${EV}`, admin);
ok(r.status === 200 && r.data.dossier.some(l => /\[Formulación\]/.test(l)) && r.data.files.length === 2 && r.data.files.filter(f => !f.deletedAt).length === 1, 'ficha: expediente con la Formulación y el archivo retirado conservado en el historial');

console.log('── Planes y pago (v4.1296)');
const { routeVideoPitchStripeEvent } = await import(`${REPO}/server/controllers/videoPitchCommerceController.js`);
r = await call('GET', '/portal/video-pitch/plans', portal(A));
ok(r.status === 200 && r.data.plans.length === 2 && r.data.plans[0].code === 'essential' && r.data.plans[0].priceAmount === 99 && r.data.plans[1].priceAmount === 135, 'el catálogo se siembra una vez: Esencial USD 99 e Integral USD 135');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.commercial.status === 'no_plan' && r.data.plans.length === 2 && r.data.card.actions[0].key === 'open', 'enviada sin plan: comercial «sin plan», la tarjeta ofrece ver el seguimiento');
ok((await call('POST', '/portal/video-pitch/plan', portal(A), { planCode: 'inexistente' })).status === 404, 'un plan que no existe: 404');
r = await call('POST', '/portal/video-pitch/plan', portal(A), { planCode: 'integral' });
ok(r.status === 200 && r.data.order.status === 'pending_payment' && r.data.order.amount === 135 && r.data.order.currency === 'USD' && r.data.commercial.status === 'pending_payment', 'elegir plan crea la orden con la fotografía del precio: pendiente de pago');
const orderIntegral = r.data.order.id;
r = await call('POST', '/portal/video-pitch/plan', portal(A), { planCode: 'essential' });
ok(r.status === 200 && r.data.order.id !== orderIntegral && r.data.order.amount === 99, 'cambiar de plan antes de pagar crea otra orden…');
ok((await db.query('SELECT status FROM "VideoPitchOrder" WHERE id = $1', [orderIntegral])).rows[0].status === 'cancelled', '…y cancela la anterior');
const orderEssential = r.data.order.id;
ok((await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'in_review' })).status === 200, 'enviada → en revisión (la revisión no exige pago)');
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'script_in_progress' });
ok(r.status === 409 && /pago confirmado/.test(r.data.error), 'sin pago, el comité NO puede pasar a preparar el guion (409: la compuerta comercial)');
r = await call('GET', `/admin/video-pitch/${reqId}${EV}`, admin);
ok(r.data.commercial.status === 'pending_payment' && r.data.orders.length === 2 && r.data.allowedTransitions.find(t => t.key === 'script_in_progress')?.requirement, 'la ficha muestra la orden vigente, las dos órdenes y el candado de la transición');
// Pagar: Checkout contra el Stripe simulado
r = await call('POST', '/portal/video-pitch/checkout', portal(A), { returnUrl: 'https://feria.test/mi-proyecto?videoPitch=1' });
ok(r.status === 200 && /checkout\.stripe\.test/.test(r.data.url) && r.data.sessionId, 'Checkout creado: la URL de Stripe vuelve al club');
const sessA = stripeState.sessions.get(r.data.sessionId);
ok(sessA.amount_total === 9900 && sessA.currency === 'usd' && sessA.metadata.type === 'video_pitch_order' && sessA.metadata.videoPitchOrderId === orderEssential && !('submissionId' in sessA.metadata), 'la sesión cobra el importe de la ORDEN (9900 centavos), con metadata propia y SIN submissionId (no se confunde con la Feria)');
r = await call('POST', '/portal/video-pitch/checkout', portal(A), {});
ok(r.status === 200 && r.data.reused === true && r.data.sessionId === sessA.id, 'un segundo clic reutiliza la sesión abierta: no hay dos cobros');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.commercial.status === 'processing' && r.data.commercial.canPay, 'con sesión abierta: «pago en proceso», y se puede continuar');
r = await call('POST', '/portal/video-pitch/checkout/sync', portal(A), { sessionId: sessA.id });
ok(r.status === 200 && r.data.outcome === 'open' && r.data.commercial.status === 'processing', 'volver sin pagar: la sesión sigue abierta, nada se marca pagado');
// El webhook con la sesión aún SIN pagar no marca nada
let applied = await routeVideoPitchStripeEvent({ id: 'evt_unpaid_1', type: 'checkout.session.completed', data: { object: { ...sessA, status: 'complete', payment_status: 'unpaid' } } }, 'paid');
ok(applied.applied === false && (await db.query('SELECT status FROM "VideoPitchOrder" WHERE id = $1', [orderEssential])).rows[0].status === 'processing', 'una sesión completa pero NO pagada no marca la orden como pagada');
// Ahora sí: Stripe cobra
stripeState.pay(sessA.id);
applied = await routeVideoPitchStripeEvent({ id: 'evt_paid_1', type: 'checkout.session.completed', data: { object: stripeState.sessions.get(sessA.id) } }, 'paid');
ok(applied.applied === true && applied.status === 'paid', 'el webhook (firma ya verificada por la plataforma) confirma la orden');
applied = await routeVideoPitchStripeEvent({ id: 'evt_paid_1', type: 'checkout.session.completed', data: { object: stripeState.sessions.get(sessA.id) } }, 'paid');
ok(applied.applied === false && /ya procesado/.test(applied.reason), 'el MISMO evento reenviado por Stripe no se procesa dos veces');
applied = await routeVideoPitchStripeEvent({ id: 'evt_paid_2', type: 'payment_intent.succeeded', data: { object: stripeIntents.get(sessA.payment_intent) } }, 'paid');
ok(applied.applied === false && /ya pagada/.test(applied.reason), 'otro evento del mismo cobro tampoco duplica nada');
r = await call('GET', `/admin/video-pitch/${reqId}${EV}`, admin);
ok(r.data.commercial.status === 'paid' && r.data.commercial.order.receiptUrl && r.data.commercial.order.stripePaymentIntentId === sessA.payment_intent, 'pagada: comprobante y referencias de Stripe en la ficha');
ok(r.data.commercial.canChoosePlan === false && (await call('POST', '/portal/video-pitch/plan', portal(A), { planCode: 'integral' })).status === 409, 'pagada: ya no se cambia el plan');
r = await call('POST', '/portal/video-pitch/checkout/sync', portal(A), { sessionId: sessA.id });
ok(r.data.outcome === 'paid' && r.data.commercial.status === 'paid', 'volver de Stripe después del webhook: sincroniza sin duplicar');
notif = await db.query(`SELECT kind FROM "VideoPitchNotification" WHERE "requestId" = $1`, [reqId]);
ok(notif.rows.some(x => x.kind === 'pending_payment') && notif.rows.filter(x => x.kind === 'payment_confirmed').length === 1, 'avisos: pendiente de pago al elegir plan y UN «pago confirmado»');
r = await call('GET', `/admin/video-pitch${EV}&commercial=paid`, admin);
ok(r.data.total === 1 && r.data.rows[0].planName === 'Video Pitch Esencial' && r.data.rows[0].amount === 99 && r.data.kpis.paid === 1 && r.data.kpis.revenue === 99, 'bandeja: plan, precio, filtro por pago e ingresos');

console.log('── Pagar después, pago fallido, precio histórico y exoneración');
// B: borrador con plan («guardar y pagar después»)
r = await call('POST', '/portal/video-pitch/plan', portal(B), { planCode: 'integral', answers });
ok(r.status === 200 && r.data.commercial.status === 'pending_payment', 'guardar y pagar después: el borrador queda pendiente de pago');
r = await call('GET', '/portal/video-pitch', portal(B));
ok(r.data.status === 'draft' && r.data.canEdit && r.data.card.headline === 'Tu solicitud y materiales están guardados. Solo falta completar el pago.' && r.data.card.actions.map(a => a.key).join() === 'pay,open,plan', 'la tarjeta (caso B): pendiente de pago con Pagar, Completar información y Cambiar plan; el formulario sigue editable');
const reqB0 = r.data.request.id;
r = await call('GET', `/admin/video-pitch${EV}`, admin);
ok(r.data.total === 2 && r.data.rows.some(x => x.id === reqB0 && x.status === 'draft' && x.commercialStatus === 'pending_payment') && r.data.kpis.pending_payment === 1, 'el comité ve el borrador con plan como venta por cerrar');
// Pago fallido de B
r = await call('POST', '/portal/video-pitch/checkout', portal(B), {});
const sessB = stripeState.sessions.get(r.data.sessionId);
const orderB = (await db.query('SELECT * FROM "VideoPitchOrder" WHERE "requestId" = $1 AND status = $2', [reqB0, 'processing'])).rows[0];
applied = await routeVideoPitchStripeEvent({ id: 'evt_fail_1', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_fail', object: 'payment_intent', metadata: { type: 'video_pitch_order', videoPitchOrderId: orderB.id }, last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds', message: 'Fondos insuficientes.' } } } }, 'failed');
ok(applied.applied === true && applied.status === 'failed', 'un pago rechazado deja la orden «fallida»…');
r = await call('GET', '/portal/video-pitch', portal(B));
ok(r.data.commercial.status === 'failed' && r.data.commercial.canPay && r.data.commercial.order.failureMessage === 'Fondos insuficientes.' && r.data.status === 'draft', '…el club ve el motivo y puede reintentar; nada se perdió');
r = await call('POST', '/portal/video-pitch/checkout', portal(B), {});
ok(r.status === 200 && r.data.url && (await call('GET', '/portal/video-pitch', portal(B))).data.commercial.status === 'processing', 'reintentar vuelve a abrir el pago (la sesión abierta se reutiliza, como hace Stripe con una tarjeta rechazada) y el estado vuelve a «en proceso»');
// Precio histórico: el admin cambia el precio del Integral; la orden de B conserva 135
r = await call('GET', `/admin/video-pitch/plans${EV}`, admin);
const integral = r.data.plans.find(p => p.code === 'integral');
ok(r.status === 200 && integral.versions.length === 1 && integral.orders === 2, 'configuración: el plan con su versión y sus órdenes');
ok((await call('PUT', `/admin/video-pitch/plans/${integral.id}${EV}`, viewer, { priceAmount: 1 })).status === 403, 'un perfil de lectura no cambia precios');
r = await call('PUT', `/admin/video-pitch/plans/${integral.id}${EV}`, admin, { priceAmount: 149 });
ok(r.status === 200 && r.data.plan.priceAmount === 149 && r.data.newVersion === true, 'el administrador cambia el precio: versión nueva del plan');
r = await call('GET', `/admin/video-pitch/${reqB0}${EV}`, admin);
ok(r.data.commercial.order.amount === 135, 'la orden existente conserva su precio (135), aunque el catálogo diga 149');
ok((await call('GET', '/portal/video-pitch/plans', portal(B))).data.plans.find(p => p.code === 'integral').priceAmount === 149, 'un club que elija el plan AHORA ve 149');
ok((await call('PUT', `/admin/video-pitch/plans/${integral.id}${EV}`, admin, { badge: 'Nuevo' })).data.newVersion === false, 'cambiar sólo la etiqueta no crea versión');
r = await call('PUT', `/admin/video-pitch/plans/${integral.id}${EV}`, admin, { priceAmount: -5 });
ok(r.status === 400, 'un precio negativo se rechaza');
r = await call('POST', `/admin/video-pitch/plans${EV}`, admin, { code: 'essential', name: 'Duplicado', priceAmount: 10, deliverables: ['16:9'] });
ok(r.status === 409, 'un código repetido se rechaza');
r = await call('POST', `/admin/video-pitch/plans${EV}`, admin, { code: 'pro', name: 'Video Pitch Pro', priceAmount: 200, currency: 'USD', deliverables: ['16:9', '9:16'], features: ['Todo', 'Más'], active: false });
ok(r.status === 201 && (await call('GET', '/portal/video-pitch/plans', portal(B))).data.plans.length === 2, 'un plan inactivo no se ofrece a los clubes');
r = await call('GET', `/admin/video-pitch/plans/history${EV}`, admin);
ok(r.data.history.some(h => h.type === 'plan_price_changed') && r.data.history.some(h => h.type === 'plan_created'), 'el historial del catálogo registra precios y planes nuevos');
// Exoneración administrativa: B sin pagar → producción autorizada
ok((await call('POST', `/admin/video-pitch/${reqB0}/payment/waive${EV}`, admin, {})).status === 400, 'exonerar sin motivo: 400');
r = await call('POST', `/admin/video-pitch/${reqB0}/payment/waive${EV}`, admin, { note: 'Proyecto patrocinado por el Distrito.' });
ok(r.status === 200 && r.data.commercial.paymentWaived === true, 'el administrador autoriza la producción sin pago, con motivo');
r = await call('GET', `/admin/video-pitch/${reqB0}${EV}`, admin);
ok(r.data.request.status === 'submitted' && r.data.request.number && r.data.events.some(e => e.type === 'payment_waived'), 'exonerado: el borrador se envía solo, con número, y queda auditado');
// Limpieza de subidas huérfanas
const pre = await call('POST', '/portal/video-pitch/files/presign', portal(B), { filename: 'huerfana.jpg', size: 100 });
ok(pre.status === 409, 'B ya no está en borrador: no admite materiales nuevos (la limpieza se prueba con lo que quedó)');
await db.query(`UPDATE "VideoPitchUploadIntent" SET "createdAt" = NOW() - INTERVAL '3 days' WHERE registered = FALSE`);
r = await call('POST', `/admin/video-pitch/maintenance/cleanup${EV}`, admin, { confirm: false });
ok(r.status === 200 && r.data.planned === true && r.data.candidates >= 1, 'la limpieza primero cuenta los huérfanos (la subida disfrazada que se rechazó)');
r = await call('POST', `/admin/video-pitch/maintenance/cleanup${EV}`, admin, { confirm: true });
ok(r.status === 200 && r.data.planned === false && (await db.query('SELECT COUNT(*)::int AS n FROM "VideoPitchUploadIntent" WHERE registered = FALSE AND "cleanedAt" IS NULL')).rows[0].n === 0, 'confirmada: los huérfanos se marcan limpios y ningún archivo registrado se toca');
ok(objects.size === 1 && r.data.deleted === 0 && r.data.missing >= 1, 'el único material registrado (la foto) sigue en el almacenamiento; el huérfano ya no existía (se borró al rechazarlo)');
// Ediciones simultáneas
r = await call('PUT', '/portal/video-pitch', portal(C), { answers });
ok(r.status === 403, 'C sigue sin poder (borrador de postulación)');

console.log('── Revisión e información requerida');
ok((await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'in_production' })).status === 409, 'saltar a producción desde la revisión: 409');
r = await call('GET', `/admin/video-pitch/${reqId}${EV}`, admin);
ok(r.data.request.status === 'in_review', 'sigue en revisión (pasó ahí en la sección de pago)');
ok((await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'info_required' })).status === 400, 'pedir información sin decir cuál: 400');
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'info_required', note: 'Necesitamos fotos de la comunidad.' });
ok(r.status === 200 && r.data.request.infoRequest === 'Necesitamos fotos de la comunidad.', 'información requerida, con lo que se pide');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.canEdit && r.data.request.infoRequest && r.data.events.some(e => /Información adicional requerida/.test(e.title)), 'el club vuelve a poder editar y ve lo pedido en su historial');
r = await uploadPortal(portal(A), 'comunidad.jpg', jpg, { width: 1920, height: 1080 });
ok(r.status === 201 && r.data.file.warnings.length === 0, 'adjunta una foto Full HD sin advertencias');
r = await call('POST', '/portal/video-pitch/submit', portal(A), { answers });
ok(r.status === 200 && r.data.number === number && r.data.status === 'submitted', 'reenvía: mismo número, vuelve a «enviada»');
r = await call('GET', `/admin/video-pitch/${reqId}${EV}`, admin);
ok(r.data.request.infoRequest === null && r.data.events.some(e => e.metadata?.resubmission === true), 'el pedido de información se limpia y el reenvío queda marcado');
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'in_review' });
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'script_in_progress' });
ok(r.status === 200 && r.data.request.status === 'script_in_progress', 'en revisión → guion en preparación (pagada: la compuerta deja pasar)');

console.log('── Guion');
r = await call('POST', `/admin/video-pitch/${reqId}/scripts/generate${EV}`, admin, { language: 'es' });
ok(r.status === 502 && /IA no pudo/.test(r.data.error), 'sin proveedor de IA configurado la generación falla con un 502 claro, no un 500');
const files = (await call('GET', `/admin/video-pitch/${reqId}${EV}`, admin)).data.files.filter(f => !f.deletedAt);
const scenes = [1, 2, 3, 4, 5].map(i => ({ number: i, narration: `Narración de la escena ${i} para 450 personas.`, visual: 'Comunidad', materials: i === 1 ? [files[0].id, 'no-existe'] : [], onScreenText: '', notes: '' }));
r = await call('POST', `/admin/video-pitch/${reqId}/scripts${EV}`, admin, { content: { title: 'Agua para la vereda', scenes, targetSeconds: 150 }, note: 'Primera redacción' });
ok(r.status === 201 && r.data.scripts.length === 1 && r.data.scripts[0].versionNumber === 1 && r.data.request.currentScriptId === r.data.scripts[0].id, 'guion manual guardado como versión 1 y vigente');
ok(r.data.scripts[0].content.scenes[0].materials.join() === files[0].id && r.data.scripts[0].content.audit.ok === true, 'un material inexistente no se cita; las cifras están en el expediente');
const script1 = r.data.scripts[0].id;
ok((await call('POST', `/admin/video-pitch/${reqId}/scripts${EV}`, admin, { content: { scenes: scenes.slice(0, 2) } })).status === 400, 'un guion con dos escenas no vale');
r = await call('GET', `/admin/video-pitch/${reqId}/scripts/${script1}${EV}`, admin);
ok(r.status === 200 && r.data.fit.length === 5 && r.data.fit.every(f => f.fits), 'la lectura de una versión dice si cada narración cabe');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.scripts.length === 0 && !r.data.canDecideScript, 'el club NO ve un guion que todavía es borrador interno');
r = await call('POST', `/admin/video-pitch/${reqId}/scripts/${script1}/send${EV}`, admin, {});
ok(r.status === 200 && r.data.request.status === 'script_pending_approval' && r.data.scripts[0].status === 'sent_to_participant', 'enviado al club: pendiente de aprobación');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.canDecideScript && r.data.scripts.length === 1 && r.data.scripts[0].content.scenes.length === 5, 'el club ve el guion y puede decidir');
ok((await call('POST', '/portal/video-pitch/script/decision', portal(A), { decision: 'changes' })).status === 400, 'pedir ajustes sin decir cuáles: 400');
r = await call('POST', '/portal/video-pitch/script/decision', portal(A), { decision: 'changes', comment: 'Mencionen la escuela.' });
ok(r.status === 200 && (await call('GET', '/portal/video-pitch', portal(A))).data.status === 'script_in_progress', 'el club pide ajustes: vuelve a «guion en preparación»');
r = await call('POST', `/admin/video-pitch/${reqId}/scripts${EV}`, admin, { content: { title: 'Agua para la vereda y la escuela', scenes, targetSeconds: 150 }, basedOnId: script1 });
const script2 = r.data.scripts[0].id;
ok(r.data.scripts.length === 2 && r.data.scripts[0].versionNumber === 2 && r.data.scripts[0].basedOnId === script1, 'versión 2 basada en la 1');
r = await call('POST', `/admin/video-pitch/${reqId}/scripts/${script2}/approve${EV}`, admin, {});
ok(r.status === 200 && r.data.request.status === 'script_approved' && r.data.request.approvedScriptId === script2 && r.data.scripts.find(s => s.id === script2).approved, 'el comité aprueba la versión 2');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.scripts.length === 1 && r.data.scripts[0].id === script2 && !r.data.canDecideScript, 'el club ve sólo el guion aprobado');

console.log('── Producción y entrega');
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'in_production' });
ok(r.status === 200 && r.data.request.status === 'in_production', 'con guion aprobado, entra en producción');
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'finished' });
ok(r.status === 200, 'producción → finalizado');
ok((await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'delivered' })).status === 409, 'entregar sin video: 409');
r = await uploadAdmin(reqId, 'deliverable', 'pitch-final.mp4', mp4, { width: 1920, height: 1080, durationSec: 148 });
ok(r.status === 201 && r.data.request.deliverableFileId && r.data.files.some(f => f.role === 'deliverable'), 'video final cargado y vigente');
const deliverableId = r.data.request.deliverableFileId;
ok((await call('GET', `/portal/video-pitch/files/${deliverableId}/url`, portal(A))).status === 403, 'antes de entregar, el club no ve el video');
ok((await uploadAdmin(reqId, 'deliverable', 'pitch.pdf', pdf)).status === 400, 'un PDF no puede ser el video final');
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'delivered' });
ok(r.status === 200 && r.data.request.status === 'delivered' && r.data.request.deliveredAt, 'entregado');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.data.status === 'delivered' && r.data.deliverable?.id === deliverableId && !r.data.canEdit, 'el club ve la entrega');
r = await call('GET', `/portal/video-pitch/files/${deliverableId}/url?download=1`, portal(A));
ok(r.status === 200 && /test_bucket/.test(r.data.url), 'y abre el video con un enlace firmado');
ev = await db.query(`SELECT type FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'video_pitch_delivered'`, [A.id]);
ok(ev.rows.length === 1, 'la entrega queda en el historial de la postulación');
notif = await db.query(`SELECT kind FROM "VideoPitchNotification" WHERE "requestId" = $1`, [reqId]);
ok(['received', 'info_required', 'script_ready', 'script_approved', 'in_production', 'finished', 'delivered'].every(k => notif.rows.some(x => x.kind === k)), 'cada hito avisó al club una vez');
ok(notif.rows.filter(x => x.kind === 'received').length === 2 && notif.rows.filter(x => x.kind === 'delivered').length === 1, 'dos envíos (el inicial y el reenvío) = dos avisos de recepción; una entrega = un aviso');
r = await call('POST', '/portal/video-pitch/messages', portal(A), { text: '¡Gracias!' });
ok(r.status === 201 && (await call('GET', `/admin/video-pitch/${reqId}${EV}`, admin)).data.events.some(e => e.type === 'message' && e.detail === '¡Gracias!'), 'el mensaje del club llega al historial del comité');
r = await call('POST', `/admin/video-pitch/${reqId}/comments${EV}`, admin, { text: 'Nota privada', internal: true });
ok(r.status === 201 && !(await call('GET', '/portal/video-pitch', portal(A))).data.events.some(e => e.detail === 'Nota privada'), 'una nota interna no la ve el club');

console.log('── Bloque, asignación y CSV');
const reqB = reqB0;
ok(/0002$/.test((await call('GET', '/portal/video-pitch', portal(B))).data.request.number), 'segunda solicitud: número consecutivo');
ok((await call('POST', '/portal/video-pitch/submit', portal(B), { answers })).status === 409, 'ya enviada por la exoneración: un envío manual no duplica');
r = await call('POST', `/admin/video-pitch/bulk${EV}`, admin, { ids: [reqId, reqB], action: 'status', status: 'in_review', confirm: false });
ok(r.status === 200 && r.data.planned === true && r.data.done === 1 && r.data.skipped.length === 1, 'el plan en bloque dice cuál sí y cuál no, sin tocar nada');
ok((await call('GET', `/admin/video-pitch/${reqB}${EV}`, admin)).data.request.status === 'submitted', '…y de verdad no tocó nada');
r = await call('POST', `/admin/video-pitch/bulk${EV}`, admin, { ids: [reqId, reqB], action: 'status', status: 'in_review', confirm: true });
ok(r.data.done === 1 && (await call('GET', `/admin/video-pitch/${reqB}${EV}`, admin)).data.request.status === 'in_review', 'confirmado: sólo la compatible cambió');
r = await call('POST', `/admin/video-pitch/bulk${EV}`, admin, { ids: [reqB], action: 'assign', assigneeName: 'productor@feria.org', confirm: true });
ok(r.data.done === 1 && (await call('GET', `/admin/video-pitch${EV}&assignee=productor%40feria.org`, admin)).data.total === 1, 'asignar en bloque y filtrar por responsable');
r = await call('PATCH', `/admin/video-pitch/${reqB}${EV}`, admin, { assigneeName: '', adminNotes: 'Prioridad alta' });
ok(r.data.request.assigneeName === null && r.data.request.adminNotes === 'Prioridad alta' && (await call('GET', `/admin/video-pitch${EV}&assignee=__none__`, admin)).data.total === 2, 'retirar responsable y notas internas (A nunca tuvo: dos sin responsable)');
r = await call('GET', `/admin/video-pitch${EV}&district=4281`, admin);
ok(r.data.total === 1 && r.data.rows[0].district === '4281', 'filtro por distrito');
ok((await call('GET', `/admin/video-pitch/export.csv${EV}`, viewer)).status === 403, 'exportar exige el permiso de exportación');
r = await call('GET', `/admin/video-pitch/export.csv${EV}`, admin);
ok(r.status === 200 && /text\/csv/.test(r.headers.get('content-type')) && r.data.includes(number) && r.data.includes('Entregado'), 'CSV con las dos solicitudes');

console.log(`\n✅ ${n} comprobaciones, todas en verde (Postgres real, S3 simulado, router real).`);
srv.close(); s3.close(); stripeSrv.close();
await db.end?.().catch(() => {});
process.exit(0);
