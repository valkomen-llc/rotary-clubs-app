#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Videos de proyectos — recorrido de EXTREMO A EXTREMO (v4.1298.0)
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:project-videos:e2e
//
// Postgres REAL + S3 simulado + el router real. Las doce pruebas del pedido:
// subir y reproducir, permisos de otro club, carga interrumpida y reintento,
// sin Stripe ni cobro, el Video Pitch pendiente de pago intacto, el comité
// recibe el video correcto, las observaciones llegan al club, el reemplazo
// conserva el historial, nada público, archivos inválidos rechazados, volver
// a entrar y encontrar el estado real, y el Video Pitch sin regresiones.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige FAIR_E2E_DATABASE_URL local y vacía.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) { console.log('[test:project-videos:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite.'); process.exit(0); }
const require = createRequire(`${REPO}/package.json`);

const objects = new Map();
const s3 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const key = decodeURIComponent(u.pathname.replace(/^\/test_bucket\//, ''));
    if (req.method === 'PUT') { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(200, { ETag: '"x"' }); res.end(); }); return; }
    const o = objects.get(key);
    if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
    if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>'); }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type || 'application/octet-stream' }); return res.end(); }
    if (req.method === 'GET') {
        let body = o.body; const range = req.headers.range;
        if (range) { const m = /bytes=(\d*)-(\d*)/.exec(range); body = m[1] === '' ? o.body.subarray(-Number(m[2])) : o.body.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined); res.writeHead(206, { 'Content-Length': body.length, 'Content-Type': o.type }); }
        else res.writeHead(200, { 'Content-Length': body.length, 'Content-Type': o.type });
        return res.end(body);
    }
    res.writeHead(405); res.end();
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));
process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket'; process.env.AWS_ACCESS_KEY_ID = 'test'; process.env.AWS_SECRET_ACCESS_KEY = 'test'; process.env.AWS_REGION = 'us-east-1';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake'; process.env.STRIPE_API_BASE = 'http://127.0.0.1:9'; // ningún cobro debe llegar aquí

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
    const { rows } = await db.query(`INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "projectDescription", "workflowStatus", status, phone, "focusArea")
        VALUES ($1,'evt-xii',$2,'Pérez',$3,$4,$5,$6,'Desc',$7,'pending_payment','+57 300','agua') RETURNING id`, [ref, `Nombre ${ref}`, `${ref}@club.org`, extra.club || 'Club Valledupar', extra.district || '4271', `Proyecto ${ref}`, wf]);
    const acc = await db.query(`INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName") VALUES ($1,$2,'!',$3) RETURNING id`, [rows[0].id, `${ref}@club.org`, extra.club || 'Club Valledupar']);
    return { id: rows[0].id, accountId: acc.rows[0].id, email: `${ref}@club.org` };
};
const A = await sub('PV-A', 'received'); const B = await sub('PV-B', 'received', { club: 'Club Cartagena', district: '4281' }); const C = await sub('PV-C', 'draft');
const app = express(); app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api/project-fair`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const admin = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'c1' }, SECRET);
const viewer = jwt.sign({ id: 'u-view', email: 'viewer@x.org', role: 'editor' }, SECRET);
const portal = (s) => jwt.sign({ sub: s.accountId, submissionId: s.id, email: s.email, aud: 'project-fair-portal' }, SECRET);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const EV = '?evento=evt-xii';
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(300000, 1)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20000, 32)]);
const upload = async (token, videoId, filename, bytes, meta = {}, { skipPut = false } = {}) => {
    const pre = await call('POST', `/portal/project-video/${videoId}/presign`, token, { filename, size: bytes.length });
    if (pre.status !== 200) return pre;
    if (!skipPut) { const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes }); assert.equal(put.status, 200); }
    return call('POST', `/portal/project-video/${videoId}/versions`, token, { storageKey: pre.data.storageKey, filename, ...meta });
};

console.log('── Disponibilidad y ficha');
let r = await call('GET', '/portal/project-video', portal(A));
ok(r.status === 200 && r.data.status === 'none' && r.data.canCreate && r.data.card.actions[0].label === 'Subir video del proyecto' && r.data.config.maxSizeMb === 500 && r.data.config.recommendations.length === 6, 'postulado sin video: puede subir; configuración por defecto con sus recomendaciones');
ok((await call('GET', '/portal/project-video', portal(C))).data.canCreate === false, 'un borrador de postulación todavía no puede');
ok((await call('GET', '/portal/project-video', null)).status === 401 && (await call('GET', '/portal/project-video', admin)).status === 401, 'sin sesión del panel: 401');
r = await call('POST', '/portal/project-video', portal(A), { title: 'Agua limpia para tres veredas', description: 'Pozos', language: 'es', productionYear: 2026 });
ok(r.status === 200 && r.data.video.status === 'draft' && r.data.video.title === 'Agua limpia para tres veredas' && r.data.video.productionYear === 2026, 'la ficha se guarda como borrador');
const vidA = r.data.video.id;
ok((await call('POST', '/portal/project-video', portal(A), { title: 'Otro' })).status === 409, 'un segundo video activo supera el máximo (1) por configuración: 409');

console.log('── Prueba 10: archivos inválidos; Prueba 3: carga interrumpida');
r = await upload(portal(A), vidA, 'video.avi', mp4);
ok(r.status === 400 && /Formato no admitido/.test(r.data.error), 'AVI: rechazado con mensaje claro');
r = await upload(portal(A), vidA, 'disfraz.mp4', pdf);
ok(r.status === 422 && /no es un video/.test(r.data.error) && objects.size === 0, 'un PDF renombrado .mp4: rechazado por sus bytes y el objeto se borra');
r = await upload(portal(A), vidA, 'interrumpido.mp4', mp4, {}, { skipPut: true });
ok(r.status === 422 && /No encontramos el archivo/.test(r.data.error), 'una carga que nunca llegó al almacenamiento no se registra (el club puede reintentar)');
r = await call('GET', '/portal/project-video', portal(A));
ok(r.data.main.status === 'draft' && r.data.main.currentVersion === null, 'tras los fallos el estado real sigue siendo «borrador sin archivo»');

console.log('── Prueba 1 y 11: subir, reproducir, volver a entrar');
r = await upload(portal(A), vidA, 'pitch.mp4', mp4, { width: 1920, height: 1080, durationSec: 148 });
ok(r.status === 201 && r.data.version.number === 1 && r.data.version.durationLabel === '2:28' && r.data.version.warnings.length === 0, 'MP4 Full HD de 2:28 registrado como versión 1, sin advertencias');
ok(objects.size === 1 && [...objects.keys()][0].startsWith(`private/project-videos/${vidA}/`), 'el objeto vive en el prefijo privado del video');
r = await call('GET', '/portal/project-video', portal(A));
ok(r.data.main.currentVersion.fileName === 'pitch.mp4' && r.data.main.status === 'draft' && r.data.main.canSubmit && r.data.card.actions[0].label === 'Continuar', 'al volver a entrar el video está, con su estado real');
r = await call('GET', `/portal/project-video/${vidA}/url`, portal(A));
ok(r.status === 200 && /test_bucket/.test(r.data.url) && r.data.contentType === 'video/mp4', 'reproducir: enlace firmado, inline');
r = await upload(portal(A), vidA, 'vertical.mov', Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(200000, 1)]), { width: 1080, height: 1920, durationSec: 400 });
ok(r.status === 201 && r.data.version.number === 2 && r.data.version.warnings.some(w => /vertical/.test(w)) && r.data.version.warnings.some(w => /más de lo sugerido/.test(w)), 'un MOV vertical y largo se acepta con advertencias (versión 2)');
r = await call('GET', '/portal/project-video', portal(A));
ok(r.data.main.versions.length === 2 && r.data.main.currentVersion.number === 2 && objects.size === 2, 'Prueba 8 (parte 1): la versión anterior se conserva');

console.log('── Prueba 2: permisos');
ok((await call('GET', `/portal/project-video/${vidA}/url`, portal(B))).status === 404, 'otro club no ve el video (404, no filtra existencia)');
ok((await upload(portal(B), vidA, 'x.mp4', mp4)).status === 404, 'otro club no sube archivos al video ajeno');
ok((await call('POST', `/portal/project-video/${vidA}/submit`, portal(B), {})).status === 404, 'otro club no envía el video ajeno');

console.log('── Prueba 4 y 5: sin Stripe; el Video Pitch pendiente de pago intacto');
r = await call('POST', '/portal/video-pitch/plan', portal(A), { planCode: 'essential', answers: { identification: { responsibleName: 'N', email: 'pv-a@club.org', whatsapp: '3001234567' }, story: { description: 'x' }, preferences: { language: 'es', objective: 'funding' }, consent: { mediaAuthorization: true } } });
ok(r.status === 200 && r.data.commercial.status === 'pending_payment', 'el club tiene un Video Pitch pendiente de pago');
const vpBefore = (await db.query('SELECT status, "commercialStatus", "currentOrderId", "planId" FROM "VideoPitchRequest" WHERE "submissionId" = $1', [A.id])).rows[0];
r = await call('POST', `/portal/project-video/${vidA}/submit`, portal(A), {});
ok(r.status === 400 && r.data.errors.some(e => e.field === 'consent'), 'enviar sin aceptar la autorización: 400');
r = await call('POST', `/portal/project-video/${vidA}/submit`, portal(A), { consentAccepted: true });
ok(r.status === 200 && r.data.status === 'received', 'con la autorización aceptada, el video queda «recibido»');
const vpAfter = (await db.query('SELECT status, "commercialStatus", "currentOrderId", "planId" FROM "VideoPitchRequest" WHERE "submissionId" = $1', [A.id])).rows[0];
ok(JSON.stringify(vpBefore) === JSON.stringify(vpAfter), 'el Video Pitch (borrador, pendiente de pago, su plan y su orden) no cambió');
ok((await db.query('SELECT COUNT(*)::int AS n FROM "VideoPitchOrder" WHERE "submissionId" = $1', [A.id])).rows[0].n === 1 && (await db.query('SELECT COUNT(*)::int AS n FROM "VideoPitchStripeEvent"')).rows[0].n === 0, 'ninguna orden ni evento de Stripe nuevos: el video propio no cobra');
r = await call('GET', '/portal/project-video', portal(A));
ok(r.data.main.consentAccepted && r.data.main.consentVersion && r.data.main.consentAt && !r.data.main.canEdit && r.data.main.canWithdraw, 'la autorización queda con versión y fecha; enviado, la ficha se bloquea y se puede retirar');
ok((await upload(portal(A), vidA, 'otro.mp4', mp4)).status === 409, 'en manos del comité no se reemplaza el archivo');
const ev = await db.query(`SELECT type FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'project_video_received'`, [A.id]);
ok(ev.rows.length === 1, 'queda UNA entrada en el historial de la postulación');

console.log('── Prueba 6 y 7: el comité recibe, revisa y las observaciones llegan al club');
ok((await call('GET', `/admin/project-videos${EV}`, portal(A))).status === 403 && (await call('GET', `/admin/project-videos${EV}`, null)).status === 401, 'el token del club no entra al administrador');
r = await call('GET', `/admin/project-videos${EV}`, viewer);
ok(r.status === 200 && r.data.access.manage === false && r.data.rows.length === 1, 'un perfil de lectura ve la bandeja');
ok((await call('POST', `/admin/project-videos/${vidA}/status${EV}`, viewer, { status: 'approved' })).status === 403, '…pero no revisa');
r = await call('GET', `/admin/project-videos${EV}`, admin);
ok(r.data.kpis.total === 1 && r.data.kpis.received === 1 && r.data.rows[0].title === 'Agua limpia para tres veredas' && r.data.rows[0].versionNumber === 2 && r.data.rows[0].format === 'mov', 'bandeja: indicadores y el video correcto con su versión vigente');
r = await call('GET', `/admin/project-videos/${vidA}${EV}`, admin);
ok(r.status === 200 && r.data.versions.length === 2 && r.data.video.consentAccepted && r.data.allowedTransitions.find(t => t.key === 'changes_requested')?.needsNote, 'ficha: versiones, autorización y transiciones (pedir correcciones exige motivo)');
const vA = r.data.versions.find(v => v.current);
r = await call('GET', `/admin/project-videos/${vidA}/versions/${vA.id}/url${EV}`, admin);
ok(r.status === 200 && /test_bucket/.test(r.data.url), 'el comité reproduce la versión vigente con enlace firmado');
ok((await call('POST', `/admin/project-videos/${vidA}/status${EV}`, admin, { status: 'changes_requested' })).status === 400, 'pedir correcciones sin motivo: 400');
r = await call('POST', `/admin/project-videos/${vidA}/status${EV}`, admin, { status: 'changes_requested', note: 'El audio se escucha bajo; suban una versión con mejor sonido.' });
ok(r.status === 200 && r.data.video.status === 'changes_requested' && r.data.video.reviewNote.startsWith('El audio'), 'correcciones solicitadas con motivo');
r = await call('GET', '/portal/project-video', portal(A));
ok(r.data.status === 'changes_requested' && r.data.main.reviewNote.startsWith('El audio') && r.data.main.canReplace && r.data.card.actions.map(a => a.key).join() === 'open,replace', 'el club ve las observaciones y puede reemplazar el video');
let notif = await db.query('SELECT kind, status FROM "ProjectVideoNotification" WHERE "videoId" = $1', [vidA]);
ok(notif.rows.some(x => x.kind === 'received') && notif.rows.some(x => x.kind === 'changes_requested') && notif.rows.every(x => x.status !== 'pending'), 'avisos de recibido y de correcciones, intentados');

console.log('── Prueba 8: reemplazo conserva el historial; reenvío y aprobación');
r = await upload(portal(A), vidA, 'pitch-v3.mp4', mp4, { width: 1920, height: 1080, durationSec: 150 });
ok(r.status === 201 && r.data.version.number === 3, 'nueva versión tras las correcciones (3)');
r = await call('POST', `/portal/project-video/${vidA}/submit`, portal(A), {});
ok(r.status === 200 && r.data.status === 'received', 'reenviado sin volver a aceptar la autorización (ya estaba)');
r = await call('GET', `/admin/project-videos/${vidA}${EV}`, admin);
ok(r.data.versions.length === 3 && r.data.events.filter(e => e.type === 'status_changed').length >= 3 && objects.size === 3, 'las tres versiones y todo el historial siguen; ningún objeto se borró');
r = await call('POST', `/admin/project-videos/${vidA}/status${EV}`, admin, { status: 'approved', note: 'Excelente.' });
ok(r.status === 200 && r.data.video.status === 'approved' && r.data.video.approvedAt, 'aprobado');
ok((await upload(portal(A), vidA, 'v4.mp4', mp4)).status === 409, 'aprobado: por política no se reemplaza');
ok((await db.query(`SELECT type FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'project_video_approved'`, [A.id])).rows.length === 1, 'la aprobación queda en el historial de la postulación');

console.log('── Prueba 9: nada público; configuración');
ok(!JSON.stringify(await call('GET', `/admin/project-videos/config${EV}`, admin)).includes('"publicVisibility":true'), 'la visibilidad pública está apagada por defecto');
ok((await call('PUT', `/admin/project-videos/config${EV}`, viewer, { maxSizeMb: 1 })).status === 403, 'un perfil de lectura no configura');
r = await call('PUT', `/admin/project-videos/config${EV}`, admin, { maxSizeMb: 1, replacementPolicy: 'always', recommendations: ['Sólo horizontal'], consentText: 'Texto nuevo de autorización' });
ok(r.status === 200 && r.data.config.maxSizeMb === 10 && r.data.config.replacementPolicy === 'always' && r.data.config.recommendations.join() === 'Sólo horizontal', 'la configuración se guarda acotada (mínimo 10 MB) por edición');
r = await call('GET', '/portal/project-video', portal(A));
ok(r.data.config.maxSizeMb === 10 && r.data.config.recommendations.join() === 'Sólo horizontal' && r.data.config.consentText === 'Texto nuevo de autorización' && r.data.main.canReplace, 'el club ve la configuración nueva; con política «siempre» el aprobado se puede reemplazar');
ok((await upload(portal(A), vidA, 'grande.mp4', Buffer.alloc(11 * 1024 * 1024, 1))).status === 400, 'más de 10 MB con el tope nuevo: rechazado antes de subir');
r = await upload(portal(A), vidA, 'v4.mp4', mp4, { width: 1920, height: 1080, durationSec: 150 });
ok(r.status === 201 && r.data.video.status === 'in_review', 'reemplazar un aprobado (política «siempre») lo devuelve a revisión: lo aprobado era OTRO archivo');
ok((await upload(portal(A), vidA, 'v5.mp4', mp4)).status === 409, 'en revisión no se reemplaza: primero se retira');

console.log('── Retiro y búsqueda');
r = await call('POST', `/portal/project-video/${vidA}/withdraw`, portal(A), {});
ok(r.status === 200 && r.data.status === 'withdrawn', 'el club retira el video de la revisión');
r = await call('GET', `/admin/project-videos${EV}&q=cartagena`, admin);
ok(r.data.total === 0 && (await call('GET', `/admin/project-videos${EV}&q=veredas`, admin)).data.total === 1, 'búsqueda por club y por título');

console.log('── Prueba 12: el Video Pitch sigue funcionando');
r = await call('GET', '/portal/video-pitch', portal(A));
ok(r.status === 200 && r.data.commercial.status === 'pending_payment' && r.data.plans.length === 2 && r.data.card.actions[0].key === 'pay', 'el Video Pitch del mismo club: pendiente de pago, con sus planes y su tarjeta');
r = await call('GET', `/admin/video-pitch${EV}`, admin);
ok(r.status === 200 && r.data.total === 1 && r.data.kpis.pending_payment === 1, 'la bandeja del Video Pitch sigue respondiendo');

console.log(`\n✅ ${n} comprobaciones, todas en verde (Postgres real, S3 simulado, router real).`);
srv.close(); s3.close();
await db.end?.().catch(() => {});
process.exit(0);
