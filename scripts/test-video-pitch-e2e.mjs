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

console.log('── Revisión e información requerida');
ok((await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'in_production' })).status === 409, 'saltar a producción desde enviada: 409');
r = await call('POST', `/admin/video-pitch/${reqId}/status${EV}`, admin, { status: 'in_review' });
ok(r.status === 200 && r.data.request.status === 'in_review', 'enviada → en revisión');
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
ok(r.status === 200 && r.data.request.status === 'script_in_progress', 'en revisión → guion en preparación');

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
r = await call('PUT', '/portal/video-pitch', portal(B), { answers });
r = await call('POST', '/portal/video-pitch/submit', portal(B), { answers });
ok(r.status === 200 && /0002$/.test(r.data.number), 'segunda solicitud: número consecutivo');
const reqB = (await call('GET', '/portal/video-pitch', portal(B))).data.request.id;
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
srv.close(); s3.close();
await db.end?.().catch(() => {});
process.exit(0);
