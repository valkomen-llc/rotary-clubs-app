#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Formulario institucional de programas — de EXTREMO A EXTREMO — v4.1286.0
// PROGRAMAS_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:programas:formulario:e2e
//
// Postgres REAL + un S3 simulado (path-style, con multiparte y copia) + los
// controladores reales: guardado y recuperación, envíos parciales, carga
// directa y multiparte reanudable, validación por contenido real,
// separación entre programas y entre envíos, protección de lo privado,
// revisión por ítem, ajustes y reenvío, aplicar hacia el flujo editorial sin
// publicar, publicación sin cambiar la dirección, actualización sin
// duplicados, versión web sin metadatos y canales autorizados de historias.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige una base LOCAL y desechable.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const E2E_DB = process.env.PROGRAMAS_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:programas:formulario:e2e] Sin PROGRAMAS_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);

// ── S3 simulado: objetos, multiparte (crear, partes, listar, completar, abortar) y copia ──
const objects = new Map();
const uploads = new Map();
let seq = 0;
const xml = (res, body, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/xml' }); res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`); };
const s3 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const key = decodeURIComponent(u.pathname.replace(/^\/test_bucket\//, ''));
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
        const body = Buffer.concat(chunks);
        const uploadId = u.searchParams.get('uploadId');
        if (req.method === 'POST' && u.searchParams.has('uploads')) {
            const id = `up${++seq}`; uploads.set(id, { key, parts: new Map(), type: req.headers['content-type'] });
            return xml(res, `<InitiateMultipartUploadResult><Bucket>test_bucket</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
        }
        if (req.method === 'PUT' && uploadId) {
            const up = uploads.get(uploadId); if (!up) return xml(res, '<Error><Code>NoSuchUpload</Code></Error>', 404);
            const n = Number(u.searchParams.get('partNumber')); up.parts.set(n, body);
            res.writeHead(200, { ETag: `"etag${n}"` }); return res.end();
        }
        if (req.method === 'GET' && uploadId) {
            const up = uploads.get(uploadId); if (!up) return xml(res, '<Error><Code>NoSuchUpload</Code></Error>', 404);
            const parts = [...up.parts.entries()].sort((a, b) => a[0] - b[0]).map(([n, b]) => `<Part><PartNumber>${n}</PartNumber><ETag>"etag${n}"</ETag><Size>${b.length}</Size></Part>`).join('');
            return xml(res, `<ListPartsResult><Bucket>test_bucket</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId><IsTruncated>false</IsTruncated>${parts}</ListPartsResult>`);
        }
        if (req.method === 'POST' && uploadId) {
            const up = uploads.get(uploadId); if (!up) return xml(res, '<Error><Code>NoSuchUpload</Code></Error>', 404);
            objects.set(key, { body: Buffer.concat([...up.parts.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1])), type: up.type });
            uploads.delete(uploadId);
            return xml(res, `<CompleteMultipartUploadResult><Bucket>test_bucket</Bucket><Key>${key}</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>`);
        }
        if (req.method === 'DELETE' && uploadId) { uploads.delete(uploadId); res.writeHead(204); return res.end(); }
        if (req.method === 'PUT' && req.headers['x-amz-copy-source']) {
            const src = decodeURIComponent(String(req.headers['x-amz-copy-source'])).replace(/^\/?test_bucket\//, '');
            const o = objects.get(src); if (!o) return xml(res, '<Error><Code>NoSuchKey</Code></Error>', 404);
            objects.set(key, { body: o.body, type: req.headers['content-type'] });
            return xml(res, '<CopyObjectResult><ETag>"c"</ETag><LastModified>2026-11-06T00:00:00.000Z</LastModified></CopyObjectResult>');
        }
        if (req.method === 'PUT') { objects.set(key, { body, type: req.headers['content-type'] }); res.writeHead(200, { ETag: '"x"' }); return res.end(); }
        const o = objects.get(key);
        if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
        if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>'); }
        if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type || 'application/octet-stream' }); return res.end(); }
        if (req.method === 'GET') {
            const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
            const b = m ? o.body.subarray(Number(m[1]), Number(m[2]) + 1) : o.body;
            res.writeHead(m ? 206 : 200, { 'Content-Length': b.length, 'Content-Type': o.type || 'application/octet-stream' }); return res.end(b);
        }
        res.writeHead(405); res.end();
    });
});
await new Promise(r => s3.listen(0, '127.0.0.1', r));
process.env.DATABASE_URL = E2E_DB;
process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${s3.address().port}`;
process.env.AWS_BUCKET_NAME = 'test_bucket';
process.env.AWS_ACCESS_KEY_ID = 'test'; process.env.AWS_SECRET_ACCESS_KEY = 'test'; process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prueba-local';
process.env.RESEND_API_KEY = '';
process.env.PROGRAMAS_NOTIFY = 'off';

const sharp = require('sharp');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const C = await import(`${REPO}/server/controllers/programController.js`);
const IC = await import(`${REPO}/server/controllers/programIntakeController.js`);
const S = await import(`${REPO}/server/lib/programStore.js`);

let ok = 0; const malos = [];
const check = async (n, fn) => { try { await fn(); ok++; console.log(`  ✓ ${n}`); } catch (e) { malos.push(n); console.log(`  ✗ ${n} — ${e.message}`); } };
const grupo = t => console.log(`\n${t}`);
const call = async (handler, { user = null, params = {}, query = {}, body = {}, headers = {} } = {}) => {
    const req = { user, params, query, body, headers: { 'user-agent': 'Mozilla/5.0 Chrome/120', host: 'rotary4281.test', ...headers }, ip: '10.0.0.1', method: 'X', originalUrl: '/x' };
    let status = 200; let out = null;
    const res = { status(c) { status = c; return res; }, json(v) { out = v; return res; }, setHeader() {} };
    await handler(req, res);
    return { status, body: out };
};
const put = async (url, body, headers = {}) => { const r = await fetch(url, { method: 'PUT', body, headers }); if (!r.ok) throw new Error(`PUT ${r.status}`); return r.headers.get('etag'); };

// ── Base desechable ──
await db.query(`CREATE TABLE IF NOT EXISTS "District" (id TEXT PRIMARY KEY, number INT, subdomain TEXT, domain TEXT, governor TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'club', category TEXT DEFAULT 'club', district TEXT, "districtId" TEXT, domain TEXT, subdomain TEXT, status TEXT DEFAULT 'active', "organizationType" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Media" (id TEXT PRIMARY KEY, filename TEXT, url TEXT, type TEXT, size INT, bucket TEXT, region TEXT, "clubId" TEXT, "s3Key" TEXT, "folderId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE IF NOT EXISTS "MediaFolder" (id TEXT PRIMARY KEY, name TEXT, "clubId" TEXT, "parentId" TEXT, "createdBy" TEXT, "sourceType" TEXT, "sourceId" TEXT, "campaignId" TEXT, "updatedAt" TIMESTAMPTZ)`);
await db.query(`DELETE FROM "District"; DELETE FROM "Club"; DELETE FROM "User"; DELETE FROM "Media"; DELETE FROM "MediaFolder";`);
await db.query(`DROP TABLE IF EXISTS "Program", "ProgramDistrictLink", "ProgramClubActivation", "ProgramMember", "ProgramContent", "ProgramContentVersion", "ProgramChangeRequest", "ProgramRequest", "ProgramSubscriber", "ProgramFile", "ProgramAuditLog", "ProgramMetricDaily", "ProgramVisitor", "ProgramLanding", "ProgramLandingVersion", "ProgramIntake", "ProgramIntakeFile"`);
await db.query(`INSERT INTO "District" (id, number) VALUES ('d4281', 4281), ('d4290', 4290)`);
await db.query(`INSERT INTO "Club" (id, name, type, district, "districtId") VALUES ('site-4281', 'Distrito 4281', 'district', '4281', 'd4281'), ('site-4290', 'Distrito 4290', 'district', '4290', 'd4290'), ('club-cali', 'Rotary Club Cali', 'club', '4281', 'd4281')`);
await db.query(`INSERT INTO "User" (id, email, name, role, "clubId") VALUES ('u-4281', 'admin@d4281.org', 'Admin 4281', 'district_admin', 'site-4281'), ('u-4290', 'admin@d4290.org', 'Admin 4290', 'district_admin', 'site-4290'), ('u-cali', 'sec@cali.org', 'Secretaría Cali', 'club_admin', 'club-cali'), ('u-ana', 'ana@ponseti.org', 'Ana Ruiz', 'institutional_user', NULL)`);
const D4281 = { id: 'u-4281', email: 'admin@d4281.org', name: 'Admin 4281', role: 'district_admin', clubId: 'site-4281' };
const D4290 = { id: 'u-4290', email: 'admin@d4290.org', name: 'Admin 4290', role: 'district_admin', clubId: 'site-4290' };
const CALI = { id: 'u-cali', email: 'sec@cali.org', name: 'Secretaría Cali', role: 'club_admin', clubId: 'club-cali' };

const crear = async (user, body) => { const r = await call(C.adminCreate, { user, body }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.program; };
const ponseti = await crear(D4281, { name: 'Clínicas Ponseti', slug: 'clinicas-ponseti', category: 'salud', summary: 'Resumen vigente del programa para el catálogo del distrito.', districtNumber: 4281 });
const corazon = await crear(D4281, { name: 'Fundación Pequeño Corazón', slug: 'pequeno-corazon', category: 'comunidad', districtNumber: 4281 });
const ajeno = await crear(D4290, { name: 'Programa del 4290', slug: 'programa-4290', category: 'educacion', districtNumber: 4290 });

const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Camara', Copyright: 'GPS-PRIVADO' } } }).toBuffer();
const SENDER = { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@ponseti.org', phone: '+57 300 1234567', role: 'Coordinadora', relation: 'coordinacion', clubMode: 'sin_club', organization: 'Fundación Ponseti' };
let token = ''; let intakeId = ''; let fileId = ''; let bigId = ''; let ref = '';
const T = (t = token) => ({ 'x-intake-token': t });

grupo('── Programas reales y formulario adaptado');
await check('el formulario lista sólo los programas vinculados al distrito (no el del 4290)', async () => {
    const r = await call(IC.publicIntakePrograms, { query: { district: '4281' } });
    assert.deepEqual(r.body.programs.map(p => p.slug).sort(), ['clinicas-ponseti', 'pequeno-corazon']);
});
await check('Ponseti es de salud; Pequeño Corazón usa vocabulario general sin campos clínicos', async () => {
    const a = await call(IC.publicIntakeForm, { params: { slug: 'clinicas-ponseti' } });
    const b = await call(IC.publicIntakeForm, { params: { slug: 'pequeno-corazon' } });
    assert.equal(a.body.form.health, true); assert.equal(b.body.form.health, false);
    assert.ok(!JSON.stringify(b.body.form).includes('careProcess'));
    assert.ok(/MB/.test(a.body.limits.label), 'los límites se explican antes de cargar');
});
await check('un programa con el formulario apagado desde el administrador desaparece', async () => {
    const r = await call(IC.adminSaveIntakeConfig, { user: D4281, params: { id: corazon.id }, body: { config: { enabled: false } } });
    assert.equal(r.status, 200);
    const l = await call(IC.publicIntakePrograms, { query: { district: '4281' } });
    assert.deepEqual(l.body.programs.map(p => p.slug), ['clinicas-ponseti']);
    await call(IC.adminSaveIntakeConfig, { user: D4281, params: { id: corazon.id }, body: { config: { enabled: true } } });
});
await check('otro distrito no configura el formulario de un programa ajeno', async () => {
    const r = await call(IC.adminSaveIntakeConfig, { user: D4290, params: { id: ponseti.id }, body: { config: { enabled: false } } });
    assert.equal(r.status, 403);
});

grupo('── Empezar, guardar y recuperar');
await check('sin correo no se empieza (es la única forma de recuperar el borrador)', async () => {
    const r = await call(IC.publicIntakeStart, { body: { slug: 'clinicas-ponseti', submissionType: 'carga_inicial', sender: { ...SENDER, email: '' } } });
    assert.equal(r.status, 400);
});
await check('empezar crea un borrador con un secreto de acceso', async () => {
    const r = await call(IC.publicIntakeStart, { body: { slug: 'clinicas-ponseti', submissionType: 'carga_inicial', sender: SENDER, consents: {} } });
    assert.equal(r.status, 201); token = r.body.token; intakeId = r.body.intake.id; ref = r.body.intake.publicRef;
    assert.ok(token.length >= 40 && /^FP-\d{4}-/.test(ref));
    const row = (await db.query(`SELECT "tokenHashes" FROM "ProgramIntake" WHERE id = $1`, [intakeId])).rows[0];
    assert.ok(!JSON.stringify(row).includes(token), 'el secreto no se guarda, sólo su hash');
});
await check('ni la referencia pública ni un secreto inventado abren el borrador', async () => {
    assert.equal((await call(IC.publicIntakeDraft, { headers: T(ref) })).status, 404);
    assert.equal((await call(IC.publicIntakeDraft, { headers: T('A'.repeat(43)) })).status, 404);
    assert.equal((await call(IC.publicIntakeDraft, {})).status, 404);
});
await check('guardar una sección es parcial y se recupera tal cual', async () => {
    const r = await call(IC.publicIntakeSaveSection, { headers: T(), params: { key: 'identidad' }, body: { data: { name: 'Clínicas Ponseti Colombia', tagline: 'Pasos firmes', mission: { status: 'pendiente' }, website: 'nota válida' } } });
    assert.equal(r.status, 200);
    assert.ok(r.body.warnings.some(w => w.field === 'website'), 'el formato inválido se avisa sin bloquear el guardado');
    const d = await call(IC.publicIntakeDraft, { headers: T() });
    assert.equal(d.body.intake.data.identidad.tagline, 'Pasos firmes');
    assert.equal(d.body.intake.data.identidad.mission.status, 'pendiente');
});
await check('recuperar por correo: misma respuesta exista o no, y un secreto NUEVO sin invalidar el anterior', async () => {
    const a = await call(IC.publicIntakeRecover, { body: { email: 'nadie@nada.org' } });
    const b = await call(IC.publicIntakeRecover, { body: { email: 'ana@ponseti.org' } });
    assert.deepEqual(a.body, b.body);
    const row = (await db.query(`SELECT jsonb_array_length("tokenHashes") AS n FROM "ProgramIntake" WHERE id = $1`, [intakeId])).rows[0];
    assert.equal(row.n, 2);
    assert.equal((await call(IC.publicIntakeDraft, { headers: T() })).status, 200);
});

grupo('── Archivos: carga directa, multiparte reanudable y contenido real');
await check('una foto se sube directo y se valida por sus bytes', async () => {
    const p = await call(IC.publicIntakePresign, { headers: T(), body: { filename: 'sofia.jpg', size: jpeg.length, purpose: 'photo' } });
    assert.equal(p.body.mode, 'single'); fileId = p.body.fileId;
    await put(p.body.uploadUrl, jpeg, { 'Content-Type': 'image/jpeg' });
    const c = await call(IC.publicIntakeComplete, { headers: T(), body: { fileId } });
    assert.equal(c.status, 200); assert.equal(c.body.file.status, 'ready'); assert.equal(c.body.file.format, 'jpg');
});
await check('un PDF disfrazado de .jpg se rechaza y se borra', async () => {
    const pdf = Buffer.from('%PDF-1.7 contenido');
    const p = await call(IC.publicIntakePresign, { headers: T(), body: { filename: 'falso.jpg', size: pdf.length, purpose: 'photo' } });
    await put(p.body.uploadUrl, pdf, { 'Content-Type': 'image/jpeg' });
    const c = await call(IC.publicIntakeComplete, { headers: T(), body: { fileId: p.body.fileId } });
    assert.equal(c.status, 400);
    assert.equal((await db.query(`SELECT status FROM "ProgramIntakeFile" WHERE id = $1`, [p.body.fileId])).rows[0].status, 'deleted');
});
await check('un video grande va por multiparte y, tras cortarse, se REANUDA desde las partes que ya estaban', async () => {
    const size = 70 * 1024 * 1024;
    const big = Buffer.alloc(size, 7); Buffer.from('\0\0\0\x18ftypisom').copy(big, 0);
    const p = await call(IC.publicIntakePresign, { headers: T(), body: { filename: 'jornada.mp4', size, purpose: 'media' } });
    assert.equal(p.body.mode, 'multipart'); assert.equal(p.body.parts, 5); bigId = p.body.fileId;
    const u1 = await call(IC.publicIntakeParts, { headers: T(), body: { fileId: bigId, partNumbers: [1, 2] } });
    await put(u1.body.urls[0].url, big.subarray(0, 16 * 1024 * 1024));
    await put(u1.body.urls[1].url, big.subarray(16 * 1024 * 1024, 32 * 1024 * 1024));
    // «Se cortó la conexión»: el navegador vuelve a pedir la carga del MISMO archivo.
    const again = await call(IC.publicIntakePresign, { headers: T(), body: { filename: 'jornada.mp4', size, purpose: 'media' } });
    assert.equal(again.body.fileId, bigId); assert.equal(again.body.resumed, true); assert.deepEqual(again.body.done, [1, 2]);
    const u2 = await call(IC.publicIntakeParts, { headers: T(), body: { fileId: bigId, partNumbers: [3, 4, 5] } });
    for (const [i, x] of u2.body.urls.entries()) await put(x.url, big.subarray((i + 2) * 16 * 1024 * 1024, Math.min(size, (i + 3) * 16 * 1024 * 1024)));
    const c = await call(IC.publicIntakeComplete, { headers: T(), body: { fileId: bigId } });
    assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(c.body.file.bytes, size);
});
await check('un tope configurable rechaza lo que lo supera (con el enlace externo como alternativa)', async () => {
    process.env.PROGRAM_INTAKE_VIDEO_MB = '10';
    const r = await call(IC.publicIntakePresign, { headers: T(), body: { filename: 'grande.mp4', size: 11 * 1024 * 1024, purpose: 'media' } });
    delete process.env.PROGRAM_INTAKE_VIDEO_MB;
    assert.equal(r.status, 400); assert.ok(/enlace/.test(r.body.error));
});
let otherToken = '';
await check('separación: un envío no ve ni cita archivos de otro (ni de otro programa)', async () => {
    const o = await call(IC.publicIntakeStart, { body: { slug: 'pequeno-corazon', submissionType: 'aporte', sections: ['multimedia'], sender: { ...SENDER, email: 'otro@corazon.org' } } });
    otherToken = o.body.token;
    assert.equal((await call(IC.publicIntakeFileUrl, { headers: T(otherToken), params: { fileId } })).status, 404);
    const s = await call(IC.publicIntakeSaveSection, { headers: T(otherToken), params: { key: 'multimedia' }, body: { data: { items: [{ _id: 'm1', title: 'Robada', file: [{ id: fileId }] }] } } });
    assert.equal(s.status, 400);
});

grupo('── Completar y enviar');
await check('se completan secciones con archivos, sedes, historias y documentos', async () => {
    const save = async (key, data) => { const r = await call(IC.publicIntakeSaveSection, { headers: T(), params: { key }, body: { data } }); assert.equal(r.status, 200, `${key}: ${JSON.stringify(r.body)}`); };
    await save('identidad', { name: 'Clínicas Ponseti Colombia', tagline: 'Pasos firmes', summary: 'Programa que acompaña a familias de niños con pie equino varo en el Distrito 4281.', mission: { status: 'pendiente' } });
    await save('sedes', { clinics: [{ _id: 'c1', name: 'Hospital Infantil Los Ángeles', city: 'Pasto', region: 'Nariño', phone: '+57 602 7000000', verifiedAt: '2026-10-01', internalName: 'Enfermera jefe', internalPhone: '+57 300 1112233' }] });
    await save('historias', { stories: [{ _id: 's1', title: 'Los pasos de Sofía', summary: 'Una historia de acompañamiento y familia en Pasto.', body: 'Sofía comenzó su tratamiento a los dos meses.', identityMode: 'seudonimo', publicName: 'Sofía', personName: 'Laura Pérez', authStory: true, authImage: true, photos: [{ id: fileId, caption: 'Primeros pasos', alt: 'Niña caminando' }], channels: ['programa'] }] });
    await save('documentos', { operatorName: 'Fundación Ponseti Colombia', legalStatus: 'entidad_anfitriona', docs: [{ _id: 'doc1', title: 'Convenio 2026', docType: 'convenio', access: 'propuesto_publico', file: [] }] });
    await save('multimedia', { items: [{ _id: 'mm1', title: 'Jornada en Pasto', file: [{ id: bigId }], permission: 'interno', uses: ['galeria'] }] });
});
await check('enviar sin consentimiento de datos se rechaza y dice qué falta', async () => {
    const r = await call(IC.publicIntakeSubmit, { headers: T(), body: { consents: { rights: true } } });
    assert.equal(r.status, 400); assert.ok(r.body.errors.some(e => e.field === 'consents.data'));
});
await check('con los consentimientos separados, se envía (novedades sólo si se marca)', async () => {
    const r = await call(IC.publicIntakeSubmit, { headers: T(), body: { consents: { data: true, rights: true, newsletter: false } } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.intake.status, 'enviado');
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramSubscriber"`)).rows[0].n, 0);
});
await check('enviado, ya no se edita', async () => {
    assert.equal((await call(IC.publicIntakeSaveSection, { headers: T(), params: { key: 'identidad' }, body: { data: { tagline: 'x' } } })).status, 409);
});
await check('nada cambió en el programa por recibir el envío', async () => {
    const p = await S.getProgram(ponseti.id);
    assert.equal(p.name, 'Clínicas Ponseti'); assert.equal(p.profile?.tagline || '', '');
});

grupo('── Revisión por ítem');
let detalle;
await check('otro distrito no ve los envíos; el del programa sí, con lo vigente al lado', async () => {
    assert.equal((await call(IC.adminListIntakes, { user: D4290, params: { id: ponseti.id } })).status, 403);
    const l = await call(IC.adminListIntakes, { user: D4281, params: { id: ponseti.id } });
    assert.equal(l.body.rows.length, 1);
    detalle = (await call(IC.adminGetIntake, { user: D4281, params: { id: ponseti.id, intakeId } })).body;
    const id = detalle.items.find(i => i.key === 'identidad');
    assert.equal(id.current.name, 'Clínicas Ponseti');
    assert.equal(id.data.name, 'Clínicas Ponseti Colombia');
});
await check('una sede no se aprueba sin confirmar la fuente; un ajuste exige motivo', async () => {
    assert.equal((await call(IC.adminDecideItem, { user: D4281, params: { id: ponseti.id, intakeId }, body: { key: 'sedes:clinics:c1', status: 'aprobado' } })).status, 400);
    assert.equal((await call(IC.adminDecideItem, { user: D4281, params: { id: ponseti.id, intakeId }, body: { key: 'historias:stories:s1', status: 'ajustes', note: '' } })).status, 400);
});
await check('aprobar parcialmente: identidad, sede y documento aprobados; la historia pide ajuste', async () => {
    for (const [key, extra] of [['identidad', {}], ['sedes:clinics:c1', { sourceVerified: true }], ['documentos:docs:doc1', {}], ['documentos', {}], ['multimedia:items:mm1', {}]]) {
        const r = await call(IC.adminDecideItem, { user: D4281, params: { id: ponseti.id, intakeId }, body: { key, status: 'aprobado', ...extra } });
        assert.equal(r.status, 200, `${key}: ${JSON.stringify(r.body)}`);
    }
    const r = await call(IC.adminDecideItem, { user: D4281, params: { id: ponseti.id, intakeId }, body: { key: 'historias:stories:s1', status: 'ajustes', note: 'Falta el relato completo.' } });
    assert.equal(r.status, 200);
});
let crIdentidad;
await check('aplicar crea solicitudes del flujo editorial con el envío como origen, y NO publica', async () => {
    const r = await call(IC.adminApplyIntake, { user: D4281, params: { id: ponseti.id, intakeId }, body: {} });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const crs = (await db.query(`SELECT * FROM "ProgramChangeRequest" WHERE "intakeId" = $1`, [intakeId])).rows;
    assert.ok(crs.length >= 3);
    crIdentidad = crs.find(c => c.intakeItemKey === 'identidad');
    assert.equal(crIdentidad.status, 'enviado');
    assert.ok(crIdentidad.history[0].detail.includes(ref));
    const clinic = crs.find(c => c.kind === 'clinic');
    assert.equal(clinic.payload.internal.phone, '+57 300 1112233');
    assert.equal((await S.getProgram(ponseti.id)).name, 'Clínicas Ponseti', 'lo aprobado sigue siendo lo vigente hasta publicar');
});
await check('el documento queda PRIVADO del programa aunque se propuso público; el video interno no se publica', async () => {
    const d = (await call(IC.adminGetIntake, { user: D4281, params: { id: ponseti.id, intakeId } })).body;
    const doc = d.items.find(i => i.key === 'documentos:docs:doc1');
    assert.equal(doc.decision.status, 'aplicado'); assert.ok(doc.decision.warnings.some(w => /privado/.test(w)));
    const mm = d.files.find(f => f.id === bigId);
    assert.equal(mm.mediaUrl, null); assert.ok(mm.programFileId, 'el original queda como archivo privado del programa');
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM "Media"`)).rows[0].n, 0);
});
await check('publicar la solicitud cambia el nombre y el perfil, NO la dirección; «Pendiente» no se publica', async () => {
    const r = await call(C.adminPublishChange, { user: D4281, params: { id: ponseti.id, reqId: crIdentidad.id } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = await S.getProgram(ponseti.id);
    assert.equal(p.name, 'Clínicas Ponseti Colombia'); assert.equal(p.slug, 'clinicas-ponseti'); assert.equal(p.profile.tagline, 'Pasos firmes');
    assert.equal(p.summary, 'Programa que acompaña a familias de niños con pie equino varo en el Distrito 4281.');
    assert.equal(p.profile.mission.status, 'pendiente');
});
await check('la auditoría registra origen y quién aplicó, sin datos del remitente', async () => {
    const a = (await db.query(`SELECT action, detail::text AS d FROM "ProgramAuditLog" WHERE "programId" = $1 AND "entityType" IN ('intake','change_request')`, [ponseti.id])).rows;
    assert.ok(a.some(x => x.action === 'applied'));
    assert.ok(a.every(x => !x.d.includes('ana@ponseti.org') && !x.d.includes('300 1234567')));
});

grupo('── Ajustes y reenvío');
let tokenAjustes = '';
await check('pedir ajustes devuelve un enlace NUEVO para quien envió', async () => {
    const r = await call(IC.adminIntakeStatus, { user: D4281, params: { id: ponseti.id, intakeId }, body: { to: 'ajustes', note: 'Completa el relato de la historia.' } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); tokenAjustes = new URL(r.body.link).searchParams.get('continuar');
    const d = await call(IC.publicIntakeDraft, { headers: T(tokenAjustes) });
    assert.equal(d.body.intake.status, 'ajustes'); assert.ok(d.body.intake.adjustments.some(a => a.key === 'historias:stories:s1'));
});
await check('quien envía ajusta y reenvía: lo pedido vuelve a «Sin revisar»; lo aplicado no se toca', async () => {
    const s = await call(IC.publicIntakeSaveSection, { headers: T(tokenAjustes), params: { key: 'historias' }, body: { data: { stories: [{ _id: 's1', title: 'Los pasos de Sofía', summary: 'Una historia de acompañamiento y familia en Pasto.', body: 'Sofía comenzó su tratamiento a los dos meses y hoy camina.', identityMode: 'seudonimo', publicName: 'Sofía', personName: 'Laura Pérez', authStory: true, authImage: true, photos: [{ id: fileId, caption: 'Primeros pasos', alt: 'Niña caminando' }], channels: ['programa'] }] } } });
    assert.equal(s.status, 200);
    const r = await call(IC.publicIntakeSubmit, { headers: T(tokenAjustes), body: { consents: { data: true, rights: true } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const d = (await call(IC.adminGetIntake, { user: D4281, params: { id: ponseti.id, intakeId } })).body;
    assert.equal(d.items.find(i => i.key === 'historias:stories:s1').decision.status, 'pendiente');
    assert.equal(d.items.find(i => i.key === 'identidad').decision.status, 'aplicado');
});
await check('la historia aprobada publica su foto como versión web SIN metadatos y conserva el original privado', async () => {
    await call(IC.adminDecideItem, { user: D4281, params: { id: ponseti.id, intakeId }, body: { key: 'historias:stories:s1', status: 'aprobado' } });
    const r = await call(IC.adminApplyIntake, { user: D4281, params: { id: ponseti.id, intakeId }, body: { keys: ['historias:stories:s1'] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const f = (await db.query(`SELECT * FROM "ProgramIntakeFile" WHERE id = $1`, [fileId])).rows[0];
    assert.ok(f.mediaUrl.endsWith('.webp') && f.mediaId);
    const key = decodeURIComponent(new URL(f.mediaUrl).pathname.replace(/^\/test_bucket\//, ''));
    const meta = await sharp(objects.get(key).body).metadata();
    assert.equal(meta.exif, undefined, 'la versión web no lleva EXIF');
    assert.ok(objects.has(f.storageKey), 'el original sigue en su prefijo privado');
    assert.ok(f.storageKey.startsWith(`private/programs/${ponseti.id}/intake/${intakeId}/`));
});

grupo('── Actualización sin duplicados y canales autorizados');
let clinicId;
await check('publicar la sede y luego actualizarla desde otro envío NO la duplica', async () => {
    const cr = (await db.query(`SELECT * FROM "ProgramChangeRequest" WHERE "intakeId" = $1 AND kind = 'clinic'`, [intakeId])).rows[0];
    // La sede trae condiciones de atención → necesitaría revisión médica; ésta no las trae.
    const pub = await call(C.adminPublishChange, { user: D4281, params: { id: ponseti.id, reqId: cr.id } });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    clinicId = pub.body.request.resultContentId;
    const st = await call(IC.publicIntakeStart, { body: { slug: 'clinicas-ponseti', submissionType: 'actualizacion', sections: ['sedes'], sender: SENDER } });
    const t2 = st.body.token;
    const f = await call(IC.publicIntakeForm, { params: { slug: 'clinicas-ponseti' } });
    assert.ok(f.body.records.some(x => x.id === clinicId), 'la sede existente se ofrece para elegirla');
    await call(IC.publicIntakeSaveSection, { headers: T(t2), params: { key: 'sedes' }, body: { data: { clinics: [{ _id: 'u1', _action: 'actualizar', _ref: clinicId, name: 'Hospital Infantil Los Ángeles', city: 'Pasto', region: 'Nariño', phone: '+57 602 7111111', verifiedAt: '2026-11-01' }] } } });
    assert.equal((await call(IC.publicIntakeSubmit, { headers: T(t2), body: { consents: { data: true } } })).status, 200);
    const i2 = st.body.intake.id;
    await call(IC.adminDecideItem, { user: D4281, params: { id: ponseti.id, intakeId: i2 }, body: { key: 'sedes:clinics:u1', status: 'aprobado', sourceVerified: true } });
    await call(IC.adminApplyIntake, { user: D4281, params: { id: ponseti.id, intakeId: i2 }, body: {} });
    const cr2 = (await db.query(`SELECT * FROM "ProgramChangeRequest" WHERE "intakeId" = $1`, [i2])).rows[0];
    assert.equal(cr2.operation, 'actualizar'); assert.equal(cr2.contentId, clinicId);
    await call(C.adminPublishChange, { user: D4281, params: { id: ponseti.id, reqId: cr2.id } });
    const n = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramContent" WHERE "programId" = $1 AND kind = 'clinic'`, [ponseti.id])).rows[0].n;
    assert.equal(n, 1);
    assert.equal((await S.getContent(clinicId)).data.phone, '+57 602 7111111');
});
await check('una historia autorizada sólo para el programa no se distribuye al sitio de un club', async () => {
    const cr = (await db.query(`SELECT * FROM "ProgramChangeRequest" WHERE "intakeId" = $1 AND kind = 'story'`, [intakeId])).rows[0];
    const pub = await call(C.adminPublishChange, { user: D4281, params: { id: ponseti.id, reqId: cr.id } });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    await db.query(`UPDATE "Program" SET status = 'activo' WHERE id = $1`, [ponseti.id]);
    const link = (await S.listLinks(ponseti.id))[0];
    await S.activateClub({ programId: ponseti.id, link, clubId: 'club-cali', clubName: 'Rotary Club Cali', data: { localContact: {}, localNote: '', showInMenu: true }, actor: { id: 'u-cali', name: 'Cali' } });
    const distrito = await S.publicProgramForSite('clinicas-ponseti', 'site-4281');
    const club = await S.publicProgramForSite('clinicas-ponseti', 'club-cali');
    assert.equal(distrito.content.story.length, 1);
    assert.equal(club.content.story.length, 0);
    assert.ok(!JSON.stringify(distrito.content.story).includes('Laura'), 'el nombre real no sale en la página');
    assert.equal(distrito.content.story[0].personLabel, 'Sofía');
});
await check('el club no revisa envíos del programa (la selección de club no da permisos)', async () => {
    assert.equal((await call(IC.adminListIntakes, { user: CALI, params: { id: ponseti.id } })).status, 403);
});
await check('los archivos privados se abren sólo con enlace firmado y auditado de quien revisa', async () => {
    const r = await call(IC.adminIntakeFileUrl, { user: D4281, params: { id: ponseti.id, intakeId, fileId: bigId } });
    assert.equal(r.status, 200); assert.ok(/X-Amz-Expires=120/.test(r.body.url));
    assert.equal((await call(IC.adminIntakeFileUrl, { user: D4290, params: { id: ponseti.id, intakeId, fileId: bigId } })).status, 403);
});

console.log(`\n${malos.length ? '❌' : '✅'} test:programas:formulario:e2e — ${ok} comprobaciones OK${malos.length ? `, ${malos.length} fallidas:\n   · ${malos.join('\n   · ')}` : ''}`);
await db.pool?.end?.().catch(() => {});
s3.close();
process.exit(malos.length ? 1 : 0);
