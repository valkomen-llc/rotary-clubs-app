#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Plantilla oficial de presentación — recorrido de EXTREMO A EXTREMO (v4.1264.0)
// FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:resources:e2e
//
// Postgres REAL + un S3 simulado en memoria + el router real del módulo:
// sin configurar → permisos → subir (y rechazar un DOCX disfrazado) →
// publicar → descargar (enlace firmado, fila «delivered», evento de
// auditoría) → fallo del almacenamiento → reemplazo de versión → analítica →
// independencia del pago, del proyecto y de los formularios.
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
    console.log('[test:fair:resources:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
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

const express = require('express');
const jwt = require('jsonwebtoken');
const JSZip = require('jszip');
const { default: db } = await import(`${REPO}/server/lib/db.js`);

// Tablas mínimas de la plataforma que el módulo consulta.
await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-xii','XII Feria','xii') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();

await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-xii','evt-xii','{}') ON CONFLICT DO NOTHING`);
const sub = async (ref, wf, extra = {}) => {
    const { rows } = await db.query(`INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, "archivedAt", phone, "focusArea")
        VALUES ($1,'evt-xii',$2,'Pérez',$3,$4,$5,$6,$7,'pending_payment',$8,'+57300','agua') RETURNING id`,
        [ref, `Nombre ${ref}`, `${ref}@club.org`, extra.club || 'Club Valledupar', extra.district || '4271', `Proyecto ${ref}`, wf, extra.archived ? new Date() : null]);
    const id = rows[0].id;
    const acc = await db.query(`INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName") VALUES ($1,$2,'!',$3) RETURNING id`, [id, `${ref}@club.org`, extra.club || 'Club Valledupar']);
    return { id, accountId: acc.rows[0].id, email: `${ref}@club.org` };
};
const A = await sub('FP-A', 'received');
const B = await sub('FP-B', 'in_review', { club: 'Club Cartagena', district: '4281' });
const C = await sub('FP-C', 'draft');
const D = await sub('FP-D', 'received', { archived: true });

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
const zip = async (files) => { const z = new JSZip(); for (const [k, v] of Object.entries(files)) z.file(k, v); return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }); };
const pptx = await zip({ '[Content_Types].xml': '<Types/>', 'ppt/presentation.xml': '<p/>', 'ppt/media/img.bin': Buffer.alloc(200000, 7) });
const docx = await zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<w/>' });
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(50000, 32), Buffer.from('\n%%EOF')]);

const uploadVersion = async (filename, bytes, note) => {
    const pre = await call('POST', `/admin/recursos/presentation_template/presign${EV}`, admin, { filename, size: bytes.length });
    assert.equal(pre.status, 200, JSON.stringify(pre.data));
    const put = await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': pre.data.contentType }, body: bytes });
    assert.equal(put.status, 200);
    return call('POST', `/admin/recursos/presentation_template/versions${EV}`, admin, { storageKey: pre.data.storageKey, filename, note });
};
const downloadsOf = async (s) => (await db.query('SELECT * FROM "ProjectFairResourceDownload" WHERE "submissionId" = $1 ORDER BY "requestedAt"', [s.id])).rows;

console.log('── Sin configurar');
let r = await call('GET', '/portal/resources', portal(A));
ok(r.status === 200 && r.data.resources[0].available === false && r.data.resources[0].message === 'La plantilla oficial estará disponible próximamente.', 'el club ve «disponible próximamente»');
r = await call('POST', '/portal/resources/presentation_template/download', portal(A), {});
ok(r.status === 409 && r.data.code === 'not_configured', 'descargar sin plantilla: 409, sin entrega');
r = await call('GET', `/admin/recursos${EV}`, admin);
ok(r.status === 200 && r.data.resources[0].status === 'empty' && r.data.access.config, 'el administrador ve «Sin archivo» y puede configurar');

console.log('── Permisos');
ok((await call('GET', '/portal/resources', null)).status === 401, 'sin sesión: 401');
ok((await call('POST', '/portal/resources/presentation_template/download', admin, {})).status === 401, 'un token de la plataforma no sirve en el panel del club');
ok((await call('POST', '/portal/resources/presentation_template/download', jwt.sign({ sub: B.accountId, submissionId: A.id, email: 'x', aud: 'project-fair-portal' }, SECRET), {})).status === 403, 'cuenta que no es de esa postulación: 403');
ok((await call('GET', `/admin/recursos${EV}`, portal(A))).status === 403, 'el token del club no entra al administrador');
r = await call('PUT', `/admin/recursos/presentation_template${EV}`, viewer, { title: 'Hackeado' });
ok(r.status === 403, 'un perfil de sólo lectura no edita (403)');
ok((await call('POST', `/admin/recursos/presentation_template/presign${EV}`, viewer, { filename: 'a.pdf', size: 10 })).status === 403, 'ni sube');

console.log('── Subir, validar, publicar');
r = await call('PUT', `/admin/recursos/presentation_template${EV}`, admin, { active: true });
ok(r.status === 409, 'publicar sin archivo: 409');
r = await call('POST', `/admin/recursos/presentation_template/presign${EV}`, admin, { filename: 'plantilla.key', size: 10 });
ok(r.status === 400, 'Keynote: rechazado antes de subir');
r = await uploadVersion('plantilla.pptx', docx);
ok(r.status === 422 && /no corresponde/.test(r.data.error), 'un DOCX renombrado a .pptx: 422');
ok(![...objects.keys()].length, 'y el objeto rechazado se borró del almacenamiento');
r = await uploadVersion('Plantilla Feria 2027.pptx', pptx, 'Versión inicial');
ok(r.status === 201 && r.data.current.number === 1 && r.data.current.format === 'pptx' && r.data.current.sizeBytes === pptx.length, 'PPTX real: versión 1 registrada con su peso REAL');
ok(r.data.status === 'inactive', 'subida pero sin publicar: «Desactivada»');
r = await call('POST', '/portal/resources/presentation_template/download', portal(A), {});
ok(r.status === 409 && r.data.code === 'not_available', 'sin publicar el club no descarga');
ok((await downloadsOf(A)).at(-1).status === 'failed', 'ese intento queda registrado como FALLIDO');
r = await call('PUT', `/admin/recursos/presentation_template${EV}`, admin, { active: true, title: 'Plantilla de presentación del proyecto', maxSizeMb: 30 });
ok(r.status === 200 && r.data.status === 'published' && r.data.maxSizeMb === 30, 'publicada, con tope configurable');

console.log('── Descarga autenticada y auditada');
r = await call('GET', '/portal/resources', portal(A));
ok(r.data.resources[0].available && !r.data.resources[0].downloaded && r.data.resources[0].version.number === 1, 'el club ve la tarjeta disponible, versión 1');
r = await call('POST', '/portal/resources/presentation_template/download', portal(A), {});
ok(r.status === 200 && r.data.url && r.data.versionNumber === 1 && r.data.ref, 'A descarga: enlace firmado');
const signed = new URL(r.data.url);
ok(signed.searchParams.get('X-Amz-Expires') === '120' && /attachment/.test(signed.searchParams.get('response-content-disposition') || ''), 'el enlace caduca en 2 minutos y fuerza la descarga');
ok(signed.pathname.includes('private/project-fair-resources/evt-xii/presentation_template/'), 'el objeto vive en el prefijo privado de la edición');
const got = await fetch(r.data.url);
ok(got.status === 200 && Buffer.from(await got.arrayBuffer()).equals(pptx), 'el archivo entregado es exactamente el publicado');
let rowsA = await downloadsOf(A);
const last = rowsA.at(-1);
ok(last.status === 'delivered' && last.deliveredAt && last.versionNumber === 1 && last.accountId === A.accountId, 'fila «delivered» con versión, cuenta y hora');
const audit = await db.query('SELECT * FROM "ProjectFairEvent" WHERE id = $1', [last.auditEventId]);
ok(audit.rows[0]?.type === 'template_downloaded' && audit.rows[0].submissionId === A.id, 'evento de auditoría en el historial de la postulación');
r = await call('POST', '/portal/resources/presentation_template/download', portal(A), {});
ok(r.status === 200, 'descargar otra vez no se bloquea');
r = await call('GET', '/portal/resources', portal(A));
ok(r.data.resources[0].downloaded && r.data.resources[0].lastDownloadedAt, '«Ya descargaste esta plantilla»');

console.log('── Fallo del almacenamiento');
const [vkey] = [...objects.keys()];
const saved = objects.get(vkey); objects.delete(vkey);
r = await call('POST', '/portal/resources/presentation_template/download', portal(B), {});
ok(r.status === 503 && r.data.error === 'No fue posible descargar la plantilla. Inténtalo nuevamente.' && /^[0-9A-F]{8}$/.test(r.data.ref), '503 con el mensaje del pedido y una referencia rastreable');
ok((await downloadsOf(B)).at(-1).status === 'failed' && (await downloadsOf(B)).at(-1).errorCode === 'storage_missing', 'queda FALLIDO con su motivo, no como descarga');
objects.set(vkey, saved);

console.log('── Analítica (antes de que B descargue)');
r = await call('GET', `/admin/recursos/presentation_template/analytics${EV}`, admin);
let k = r.data.kpis;
ok(k.eligibleProjects === 2 && k.projectsWithDownload === 1 && k.pendingProjects === 1, 'elegibles: A y B (C es borrador, D archivada); pendiente: B');
ok(k.totalDelivered === 2 && k.totalFailed === 2 && k.uniqueUsers === 1 && k.adoptionPct === 50, '2 entregas, 2 fallidos no contados, 1 usuario, 50 %');
r = await call('GET', `/admin/recursos/presentation_template/analytics${EV}&estado=pending`, admin);
ok(r.data.rows.length === 1 && r.data.rows[0].publicRef === 'FP-B', '«No han descargado» = B, aunque B tenga un intento fallido');

console.log('── Reemplazo de versión');
r = await uploadVersion('Plantilla v2.pdf', pdf, 'Ajuste de logos');
ok(r.status === 201 && r.data.current.number === 2 && r.data.versions.length === 2 && r.data.status === 'published', 'v2 vigente y publicada; v1 conservada');
ok(r.data.versions.find(v => v.number === 1).deliveredCount === 2, 'las descargas de v1 siguen asociadas a v1');
ok(r.data.history.some(h => h.type === 'version_replaced') && r.data.history.some(h => h.type === 'published'), 'el registro dice quién reemplazó y publicó');
r = await call('GET', '/portal/resources', portal(A));
ok(r.data.resources[0].updated && r.data.resources[0].newerSinceDownload && r.data.resources[0].version.format === 'pdf', 'A ve «actualizada» y que hay una versión más reciente');
r = await call('POST', '/portal/resources/presentation_template/download', portal(B), {});
ok(r.status === 200 && r.data.versionNumber === 2 && r.data.fileName.endsWith('v2.pdf'), 'B recibe la versión vigente (v2)');
r = await call('POST', '/portal/resources/presentation_template/download', portal(C), {});
ok(r.status === 200, 'un borrador con acceso al panel también descarga (no depende del pago ni de postular)');

console.log('── Analítica final');
r = await call('GET', `/admin/recursos/presentation_template/analytics${EV}`, admin);
k = r.data.kpis;
ok(k.projectsWithDownload === 2 && k.pendingProjects === 0 && k.adoptionPct === 100, 'adopción 100 % de los elegibles');
ok(k.uniqueUsers === 3 && k.totalDelivered === 4, 'usuarios únicos 3 (A, B, C) y 4 descargas exitosas');
ok(r.data.rows.length === 3 && r.data.rows.find(x => x.publicRef === 'FP-C').eligible === false, 'tabla: A, B y el borrador C marcado como no elegible; D archivada fuera');
ok(r.data.timeline.length === 1 && r.data.timeline[0].delivered === 4, 'evolución diaria');
ok(r.data.byDistrict.find(d => d.district === '4281').adoptionPct === 100, 'por distrito');
r = await call('GET', `/admin/recursos/presentation_template/analytics${EV}&version=1`, admin);
ok(r.data.kpis.totalDelivered === 2 && r.data.kpis.projectsWithDownload === 1, 'filtro por versión 1');
r = await call('GET', `/admin/recursos/presentation_template/analytics${EV}&q=cartagena`, admin);
ok(r.data.rows.length === 1 && r.data.rows[0].publicRef === 'FP-B', 'búsqueda por club');
r = await call('GET', `/admin/recursos/presentation_template/analytics${EV}&desde=2000-01-01&hasta=2000-01-02`, admin);
ok(r.data.kpis.totalDelivered === 0 && r.data.kpis.pendingProjects === 2, 'rango de fechas sin descargas: todos pendientes');
r = await call('GET', `/admin/recursos/presentation_template/analytics.csv${EV}`, admin);
ok(r.status === 200 && /text\/csv/.test(r.headers.get('content-type')) && String(r.data).includes('FP-A'), 'exportación CSV');
ok((await call('GET', `/admin/recursos/presentation_template/analytics.csv${EV}`, viewer)).status === 403, 'sin permiso de exportar: 403');
ok((await call('GET', `/admin/recursos/presentation_template/analytics${EV}`, viewer)).status === 200, 'el perfil de lectura sí consulta la analítica');

console.log('── Independencia');
const after = await db.query('SELECT "publicRef", status, "workflowStatus", "paidAt" FROM "ProjectFairSubmission" ORDER BY "publicRef"');
ok(after.rows.every(x => x.status === 'pending_payment' && !x.paidAt), 'el pago de nadie cambió');
ok(after.rows.map(x => x.workflowStatus).join() === 'received,in_review,draft,received', 'el estado de ningún proyecto cambió');
ok((await db.query('SELECT COUNT(*)::int AS c FROM "ProjectFairMasterForm"')).rows[0].c === 0, 'ningún formulario se creó ni se marcó');

console.log('── Otra edición no ve esta plantilla');
r = await call('GET', `/admin/recursos?evento=evt-xiii`, admin);
ok(r.data.resources[0].status === 'empty', 'la XIII empieza sin plantilla');

r = await call('GET', `/admin/recursos${EV}`, admin);
const v1 = r.data.resources[0].versions.find(v => v.number === 1);
r = await call('GET', `/admin/recursos/presentation_template/versions/${v1.id}/download${EV}`, admin);
ok(r.status === 200 && r.data.fileName.endsWith('v1.pptx'), 'el administrador descarga una versión anterior');
const d0 = (await db.query(`SELECT COUNT(*)::int AS c FROM "ProjectFairResourceDownload" WHERE status='delivered'`)).rows[0].c;
ok(d0 === 4, 'la descarga del administrador no cuenta como descarga de un club');

console.log(`\n✅ ${n} comprobaciones de extremo a extremo, todas en verde.`);
srv.close(); s3.close(); process.exit(0);
