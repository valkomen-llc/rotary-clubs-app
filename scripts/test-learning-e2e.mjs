#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones (LMS) — recorrido de EXTREMO A EXTREMO (v4.1302.0)
// LEARNING_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:learning:e2e
//
// Postgres REAL + S3 simulado + el router real. El caso de prueba
// obligatorio del pedido: una colección del proyecto GG2349313 con DOCE
// cursos; el representante del club crea tres, sube video y documento, sale,
// vuelve y lo encuentra todo; agrega nueve más; envía los completos; el
// comité aprueba unos y pide ajustes en otros; lo aprobado y publicado
// aparece en la biblioteca; los visitantes entran según la modalidad; otro
// club no ve nada ajeno; nada se pierde por el camino.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige LEARNING_E2E_DATABASE_URL local.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.LEARNING_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) { console.log('[test:learning:e2e] Sin LEARNING_E2E_DATABASE_URL local: se omite.'); process.exit(0); }
const require = createRequire(`${REPO}/package.json`);

// ─── S3 simulado ──────────────────────────────────────────────────────
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
process.env.LEARNING_NOTIFY = process.env.LEARNING_NOTIFY || 'off'; // sin proveedor de correo en la prueba: el aviso se REGISTRA, no se simula

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
// Lo mínimo del resto de la plataforma que el módulo consulta.
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, category TEXT, district TEXT, "districtId" TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, role TEXT, "clubId" TEXT, name TEXT)`);
for (const t of ['LearningCollection', 'LearningCourse', 'LearningModule', 'LearningLesson', 'LearningResource', 'LearningFile', 'LearningEvent', 'LearningNotification', 'LearningConfig']) await db.query(`DROP TABLE IF EXISTS "${t}"`);
await db.query(`DELETE FROM "Club"; DELETE FROM "User";`);
await db.query(`INSERT INTO "Club" (id,name,type,district) VALUES
    ('site-d4281','Distrito 4281','district','4281'),
    ('club-cali','Rotary Club Cali','club','4281'),
    ('club-palmira','Rotary Club Palmira','club','4281'),
    ('club-bogota','Rotary Club Bogotá','club','4271'),
    ('site-d4271','Distrito 4271','district','4271')`);
await db.query(`INSERT INTO "User" (id,email,role,"clubId",name) VALUES
    ('u-cali','cali@club.org','club_admin','club-cali','Ana Cali'),
    ('u-palmira','palmira@club.org','club_admin','club-palmira','Pedro Palmira'),
    ('u-d4281','comite@d4281.org','district_admin','site-d4281','Comité 4281'),
    ('u-d4271','comite@d4271.org','district_admin','site-d4271','Comité 4271'),
    ('u-super','super@platform.org','superadmin',NULL,'Operador')`);

const { default: router } = await import(`${REPO}/server/routes/learning.js`);
const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/api/cursos', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${srv.address().port}/api/cursos`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const tok = (id, role, clubId, extra = {}) => jwt.sign({ id, email: `${id}@x.org`, role, clubId, aud: 'rotary-platform', ...extra }, SECRET);
const CALI = tok('u-cali', 'club_admin', 'club-cali'), PALMIRA = tok('u-palmira', 'club_admin', 'club-palmira'), D4281 = tok('u-d4281', 'district_admin', 'site-d4281'), D4271 = tok('u-d4271', 'district_admin', 'site-d4271'), SUPER = tok('u-super', 'superadmin', null);
const ATTENDEE = jwt.sign({ sub: 'att-1', aud: 'event-attendee-portal' }, SECRET);
const FAIR = jwt.sign({ sub: 'acc-1', aud: 'project-fair-portal' }, SECRET);

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body, headers = {}) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(300000, 1)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20000, 32)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 7)]);
const upload = async (token, courseId, filename, bytes, purpose, { skipPut = false } = {}) => {
    const pre = await call('POST', `/mis/cursos/${courseId}/archivos/presign`, token, { filename, size: bytes.length, purpose });
    if (pre.status !== 200) return pre;
    if (!skipPut) await fetch(pre.data.uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': pre.data.contentType, 'Cache-Control': pre.data.cacheControl || 'no-store' } });
    const done = await call('POST', `/mis/cursos/${courseId}/archivos/completar`, token, { fileId: pre.data.fileId, meta: { durationSeconds: 600 } });
    return { ...done, fileId: pre.data.fileId, publicUrl: pre.data.publicUrl };
};

try {
    console.log('\n1. El representante del club entra y crea la colección del proyecto GG2349313');
    let r = await call('GET', '/mis/resumen', CALI);
    ok(r.status === 200 && r.data.site.id === 'club-cali' && r.data.collections.length === 0, 'resumen vacío del club');
    r = await call('GET', '/mis/resumen', null);
    ok(r.status === 401, 'sin sesión no hay portal');
    r = await call('GET', '/mis/resumen', FAIR);
    ok(r.status === 403, 'el token del portal de la feria no entra al gestor de cursos');
    r = await call('POST', '/mis/colecciones', CALI, { name: 'Programa de formación en seguridad alimentaria', description: 'Aprender a cultivar en espacios urbanos.', projectRef: 'GG2349313', audience: ['comunidad', 'beneficiarios'], accessMode: 'public', areaFocus: 'desarrollo-economico' });
    ok(r.status === 201 && r.data.collection.projectRef === 'GG2349313' && r.data.collection.districtNumber === '4281' && r.data.collection.ownerClubName === 'Rotary Club Cali', 'colección creada con club, distrito y proyecto');
    const COL = r.data.collection.id; const COL_SLUG = r.data.collection.slug;
    r = await call('POST', '/mis/colecciones', CALI, { name: '' });
    ok(r.status === 400, 'una colección exige nombre');

    console.log('\n2. Tres cursos, con video, documento y portada');
    const cursos = [];
    for (const t of ['Introducción a la seguridad alimentaria', 'Huertas urbanas y comunitarias', 'Técnicas de siembra']) {
        r = await call('POST', '/mis/cursos', CALI, { collectionId: COL, title: t });
        ok(r.status === 201 && r.data.course.collectionId === COL && r.data.course.status === 'draft' && r.data.course.projectRef === 'GG2349313', `curso «${t}» nace como borrador en la colección`);
        cursos.push(r.data.course);
    }
    const C1 = cursos[0].id;
    r = await call('PATCH', `/mis/cursos/${C1}`, CALI, { shortDescription: 'Conceptos básicos para cultivar alimentos sanos en casa.', fullDescription: 'Un recorrido por los principios de la seguridad alimentaria.', learningObjective: 'Reconocer los pilares de la seguridad alimentaria.', level: 'basico', instructorName: 'Ing. María Pérez', tags: ['seguridad alimentaria', 'huertas'], accessMode: 'public', status: 'published', inviteToken: 'robado' });
    ok(r.status === 200 && r.data.course.status === 'draft' && r.data.course.inviteToken !== 'robado' && r.data.displayStatus === 'incompleto', 'PATCH guarda la ficha e ignora status/inviteToken');
    r = await call('POST', `/mis/cursos/${C1}/modulos`, CALI, { title: 'Conceptos fundamentales' });
    const M1 = r.data.module.id; ok(r.status === 201, 'módulo creado');
    r = await call('POST', `/mis/cursos/${C1}/lecciones`, CALI, { moduleId: M1, title: 'Introducción', durationMinutes: 12 });
    const L1 = r.data.lesson.id; ok(r.status === 201 && r.data.lesson.moduleId === M1, 'lección creada en el módulo');
    r = await call('POST', `/mis/cursos/${C1}/lecciones`, CALI, { moduleId: M1, title: 'Principios básicos', body: 'Texto educativo de la lección con más de cuarenta caracteres de contenido real.', durationMinutes: 8 });
    const L2 = r.data.lesson.id; ok(r.status === 201, 'segunda lección (texto)');
    let up = await upload(CALI, C1, 'introduccion.mp4', mp4, 'lesson_video');
    ok(up.status === 200 && up.data.file.status === 'ready' && up.data.file.format === 'mp4' && up.data.file.bytes === mp4.length, 'video recibido y confirmado por el servidor (peso y tipo reales)');
    const VIDEO1 = up.fileId;
    r = await call('PATCH', `/mis/cursos/${C1}/lecciones/${L1}`, CALI, { videoFileId: VIDEO1 });
    ok(r.status === 200 && r.data.lesson.videoFileId === VIDEO1, 'el video queda en la lección');
    up = await upload(CALI, C1, 'guia-de-estudio.pdf', pdf, 'document');
    ok(up.status === 200 && up.data.file.kind === 'document', 'documento PDF recibido');
    r = await call('POST', `/mis/cursos/${C1}/recursos`, CALI, { fileId: up.fileId, lessonId: L2, title: 'Guía de estudio' });
    ok(r.status === 201 && r.data.resource.kind === 'file', 'recurso de la lección creado');
    r = await call('POST', `/mis/cursos/${C1}/recursos`, CALI, { url: 'https://www.fao.org/home/es', title: 'FAO' });
    ok(r.status === 201 && r.data.resource.kind === 'link', 'recurso-enlace del curso');
    up = await upload(CALI, C1, 'portada.jpg', jpg, 'cover');
    ok(up.status === 200 && up.data.file.visibility === 'public' && up.publicUrl, 'portada pública confirmada');
    r = await call('PATCH', `/mis/cursos/${C1}`, CALI, { coverUrl: up.publicUrl, rightsAccepted: true });
    ok(r.status === 200 && r.data.course.rightsAccepted && r.data.course.rightsText && r.data.readiness.ready && r.data.displayStatus === 'listo', 'derechos declarados con el texto vigente → listo para enviar');
    ok(r.data.durationMinutes === 20, 'duración automática = 12 + 8');

    console.log('\n3. Archivos inválidos e interrumpidos');
    up = await upload(CALI, C1, 'falso.mp4', pdf, 'lesson_video');
    ok(up.status === 400 && /no corresponde/.test(up.data.error), 'un PDF disfrazado de MP4 se rechaza y se borra');
    up = await upload(CALI, C1, 'cortado.mp4', mp4, 'lesson_video', { skipPut: true });
    ok(up.status === 409, 'una carga que nunca llegó devuelve 409 para reintentar');
    r = await call('POST', `/mis/cursos/${C1}/archivos/presign`, CALI, { filename: 'virus.exe', size: 100, purpose: 'resource' });
    ok(r.status === 400, 'un ejecutable no se prefirma');
    r = await call('GET', `/mis/cursos/${C1}`, CALI);
    ok(r.data.files.filter(f => f.status === 'ready').length === 3 && r.data.files.filter(f => f.status === 'uploading').length === 1, 'tres archivos válidos y la carga cortada queda pendiente para reanudar');
    ok(r.data.readiness.warnings.some(w => /en carga/.test(w)), 'la preparación avisa de la carga pendiente');
    r = await call('POST', `/mis/cursos/${C1}/enviar`, CALI);
    ok(r.status === 422 && /en carga/.test(r.data.error), 'con una carga pendiente reciente no se envía');
    r = await call('DELETE', `/mis/cursos/${C1}/archivos/${up.fileId}`, CALI);
    ok(r.status === 200, 'el club quita la carga cortada («Quitar» del cargador)');
    r = await call('GET', `/mis/cursos/${C1}`, CALI);
    ok(r.data.files.length === 3 && r.data.files.every(f => f.status === 'ready'), 'quedan exactamente los tres archivos válidos');

    console.log('\n4. Sale de la plataforma y regresa: todo está');
    r = await call('GET', `/mis/colecciones/${COL}`, CALI);
    ok(r.status === 200 && r.data.courses.length === 3 && r.data.courses[0].displayStatus === 'listo' && r.data.courses[1].displayStatus === 'borrador', 'la colección muestra los tres cursos con su estado real');
    r = await call('GET', `/mis/cursos/${C1}`, CALI);
    ok(r.data.course.shortDescription.startsWith('Conceptos') && r.data.modules.length === 1 && r.data.lessons.length === 2 && r.data.resources.length === 2 && r.data.files.length === 3 && r.data.course.coverUrl, 'ficha, módulo, lecciones, recursos, archivos y portada recuperados');

    console.log('\n5. Nueve cursos más: doce en total; algunos completos, otros en borrador');
    const mas = ['Compostaje doméstico', 'Riego eficiente', 'Semillas y germinación', 'Plagas y control natural', 'Cosecha y conservación', 'Nutrición familiar', 'Huerta en balcones', 'Huerta escolar', 'Comercialización local'];
    for (const t of mas) { r = await call('POST', '/mis/cursos', CALI, { collectionId: COL, title: t }); ok(r.status === 201, `curso «${t}» agregado`); cursos.push(r.data.course); }
    ok(cursos.length === 12, 'doce cursos registrados');
    const completar = async (k, { accessMode = 'public', withVideo = false } = {}) => {
        await call('PATCH', `/mis/cursos/${k.id}`, CALI, { shortDescription: `Descripción breve del curso ${k.title}, suficiente.`, accessMode, rightsAccepted: true, level: 'intermedio' });
        const l = await call('POST', `/mis/cursos/${k.id}/lecciones`, CALI, { title: 'Lección única', body: 'Contenido educativo de la lección, con más de cuarenta caracteres de texto.', durationMinutes: 15 });
        if (withVideo) { const u = await upload(CALI, k.id, 'clase.mp4', mp4, 'lesson_video'); await call('PATCH', `/mis/cursos/${k.id}/lecciones/${l.data.lesson.id}`, CALI, { videoFileId: u.fileId }); }
    };
    await completar(cursos[1], { accessMode: 'registered', withVideo: true });
    await completar(cursos[2], { accessMode: 'private' });
    await completar(cursos[3]); await completar(cursos[4]); await completar(cursos[5]);
    r = await call('GET', `/mis/colecciones/${COL}`, CALI);
    ok(r.data.courses.filter(k => k.displayStatus === 'listo').length === 6 && r.data.courses.filter(k => k.displayStatus === 'borrador').length === 6, 'seis listos, seis en borrador, en la misma colección');
    r = await call('POST', `/mis/cursos/${cursos[6].id}/enviar`, CALI);
    ok(r.status === 422 && r.data.missing.length >= 3 && r.data.missing.some(m => m.key === 'lesson'), 'un borrador incompleto no se puede enviar y se dice qué falta');

    console.log('\n6. Orden, duplicado y archivo');
    const orden = [cursos[2].id, cursos[0].id, cursos[1].id, ...cursos.slice(3).map(k => k.id)];
    r = await call('POST', `/mis/colecciones/${COL}/orden`, CALI, { ids: orden });
    ok(r.status === 200, 'reordenado');
    r = await call('GET', `/mis/colecciones/${COL}`, CALI);
    ok(r.data.courses[0].id === cursos[2].id && r.data.courses[1].id === C1, 'el orden persiste');
    r = await call('POST', `/mis/cursos/${C1}/duplicar`, CALI);
    ok(r.status === 201 && r.data.course.title.endsWith('(copia)'), 'estructura duplicada como borrador');
    const DUP = r.data.course.id;
    r = await call('GET', `/mis/cursos/${DUP}`, CALI);
    ok(r.data.modules.length === 1 && r.data.lessons.length === 2 && r.data.files.length === 0 && r.data.resources.length === 1, 'la copia trae módulos y lecciones, sin archivos (sólo el enlace)');
    r = await call('POST', `/mis/cursos/${DUP}/estado`, CALI, { to: 'archived' });
    ok(r.status === 200 && r.data.course.status === 'archived', 'la copia se archiva');
    r = await call('POST', `/mis/cursos/${DUP}/estado`, CALI, { to: 'published' });
    ok(r.status === 409 && Array.isArray(r.data.allowed), 'el club no puede publicar: 409 con las salidas posibles');

    console.log('\n7. Envío a revisión, curso por curso');
    for (const k of cursos.slice(0, 6)) { r = await call('POST', `/mis/cursos/${k.id}/enviar`, CALI); ok(r.status === 200 && r.data.course.status === 'in_review', `«${k.title}» en revisión`); }
    r = await call('PATCH', `/mis/cursos/${C1}`, CALI, { title: 'Cambio prohibido' });
    ok(r.status === 409, 'en revisión el club no edita');
    r = await call('POST', `/mis/cursos/${C1}/archivos/presign`, CALI, { filename: 'x.pdf', size: 100, purpose: 'document' });
    ok(r.status === 409, 'en revisión tampoco sube archivos');
    const { rows: notis } = await db.query(`SELECT * FROM "LearningNotification" WHERE "dedupeKey" LIKE 'submitted:%'`);
    ok(notis.length === 6 && notis.every(x => x.sent === false && x.reason === 'desactivado'), 'seis avisos de envío registrados (sin proveedor: registrados, no simulados)');

    console.log('\n8. Otro club y otro distrito no ven nada ajeno');
    r = await call('GET', `/mis/cursos/${C1}`, PALMIRA); ok(r.status === 404, 'Palmira no abre el curso de Cali');
    r = await call('PATCH', `/mis/cursos/${cursos[6].id}`, PALMIRA, { title: 'hackeado' }); ok(r.status === 404, 'Palmira no edita el curso de Cali');
    r = await call('GET', `/mis/colecciones/${COL}`, PALMIRA); ok(r.status === 404, 'Palmira no abre la colección de Cali');
    r = await call('POST', '/mis/cursos', PALMIRA, { collectionId: COL, title: 'intruso' }); ok(r.status === 404, 'Palmira no agrega cursos a la colección de Cali');
    r = await call('GET', '/admin/cursos?status=in_review', D4271); ok(r.status === 200 && r.data.total === 0, 'el comité de D4271 no ve los cursos de D4281');
    r = await call('GET', `/admin/cursos/${C1}`, D4271); ok(r.status === 404, 'ni abre uno por id');
    r = await call('POST', `/admin/cursos/${C1}/estado`, D4271, { to: 'approved' }); ok(r.status === 404, 'ni lo aprueba');
    r = await call('GET', '/admin/resumen', CALI); ok(r.status === 200 && r.data.summary.total === 13, 'el club ve su propio resumen administrativo (su alcance)');
    r = await call('GET', '/mis/resumen', D4281); ok(r.status === 200 && r.data.collections.length === 1, 'el sitio distrital alcanza las colecciones de sus clubes');

    console.log('\n9. El comité revisa: aprueba, pide ajustes, publica');
    r = await call('GET', '/admin/cursos?status=in_review', D4281);
    ok(r.status === 200 && r.data.total === 6 && r.data.courses.every(k => k.ownerClubName === 'Rotary Club Cali'), 'seis cursos pendientes del club');
    r = await call('GET', '/admin/resumen', D4281);
    ok(r.data.summary.inReview === 6 && r.data.summary.total === 13 && r.data.collections.length === 1, 'resumen del comité');
    r = await call('POST', `/admin/cursos/${C1}/estado`, D4281, { to: 'published' });
    ok(r.status === 409, 'no se publica sin aprobar antes');
    for (const k of cursos.slice(0, 4)) { r = await call('POST', `/admin/cursos/${k.id}/estado`, D4281, { to: 'approved', note: 'Material de calidad.' }); ok(r.status === 200 && r.data.course.status === 'approved' && r.data.course.publishedAt === null, `«${k.title}» aprobado (sin publicar)`); }
    r = await call('POST', `/admin/cursos/${cursos[4].id}/estado`, D4281, { to: 'changes_requested' });
    ok(r.status === 400, 'pedir correcciones sin motivo se rechaza');
    r = await call('POST', `/admin/cursos/${cursos[4].id}/estado`, D4281, { to: 'changes_requested', note: 'Falta la fuente de la lección 1 y una portada.' });
    ok(r.status === 200 && r.data.course.status === 'changes_requested' && /portada/.test(r.data.course.reviewNote), 'correcciones pedidas con motivo');
    for (const k of cursos.slice(0, 3)) { r = await call('POST', `/admin/cursos/${k.id}/estado`, D4281, { to: 'published' }); ok(r.status === 200 && r.data.course.status === 'published' && r.data.course.publishedAt, `«${k.title}» publicado`); }
    r = await call('POST', `/admin/cursos/${C1}/comentarios`, D4281, { text: 'Excelente trabajo, equipo de Cali.' });
    ok(r.status === 201, 'observación al club sin cambiar el estado');
    r = await call('GET', `/admin/cursos/${C1}`, D4281);
    ok(r.data.events.some(e => e.action === 'status:published') && r.data.events.some(e => e.action === 'status:approved') && r.data.events.some(e => e.action === 'status:in_review'), 'trazabilidad completa de la decisión');
    const { rows: decis } = await db.query(`SELECT * FROM "LearningNotification" WHERE "dedupeKey" LIKE 'status:%'`);
    ok(decis.length === 8, 'un aviso por cada decisión (4 aprobados + 1 correcciones + 3 publicados), sin duplicados');
    const { rows: statusWrites } = await db.query(`SELECT COUNT(*)::int AS n FROM "LearningEvent" WHERE action LIKE 'status:%'`);
    ok(statusWrites[0].n === 6 + 1 + 4 + 1 + 3, 'cada cambio de estado dejó exactamente un evento');

    console.log('\n10. El club recibe las observaciones, corrige y reenvía');
    r = await call('GET', `/mis/cursos/${cursos[4].id}`, CALI);
    ok(r.data.course.status === 'changes_requested' && /portada/.test(r.data.course.reviewNote) && r.data.editable === true, 'el club lee el motivo y puede editar');
    r = await call('PATCH', `/mis/cursos/${cursos[4].id}`, CALI, { fullDescription: 'Ahora con la fuente citada.' });
    ok(r.status === 200, 'corrige');
    r = await call('POST', `/mis/cursos/${cursos[4].id}/enviar`, CALI);
    ok(r.status === 200 && r.data.course.status === 'in_review' && r.data.course.reviewNote === null, 'reenviado: la observación anterior se limpia');
    r = await call('GET', `/mis/cursos/${C1}`, CALI);
    ok(r.data.events.some(e => e.action === 'comment' && /Excelente/.test(e.detail.text)), 'el club ve la observación del comité');

    console.log('\n11. La biblioteca pública y las modalidades de acceso');
    r = await call('GET', '/public/catalogo?clubId=site-d4281');
    ok(r.status === 200 && r.data.courses.length === 2 && r.data.collections.length === 1 && r.data.collections[0].publishedCount === 3, 'la biblioteca del distrito lista los publicados no privados y la colección');
    ok(r.data.courses.every(k => k.accessMode !== 'private'), 'el curso privado no se lista');
    ok(r.data.facets.projects.includes('GG2349313') && r.data.facets.clubs.includes('Rotary Club Cali'), 'facetas de proyecto y club');
    r = await call('GET', '/public/catalogo?clubId=site-d4281&q=huertas');
    ok(r.data.courses.length === 2, 'búsqueda por texto alcanza título y etiquetas (dos cursos hablan de huertas)');
    r = await call('GET', '/public/catalogo?clubId=site-d4281&q=urbanas');
    ok(r.data.courses.length === 1 && /Huertas urbanas/.test(r.data.courses[0].title), 'búsqueda por texto acotada');
    r = await call('GET', '/public/catalogo?clubId=club-cali');
    ok(r.data.courses.length === 2, 'el sitio del club ve los suyos');
    r = await call('GET', '/public/catalogo?clubId=club-bogota');
    ok(r.data.courses.length === 0 && r.data.collections.length === 0, 'un club de otro distrito no ve nada');
    r = await call('GET', '/public/catalogo?clubId=site-d4271');
    ok(r.data.courses.length === 0, 'el otro distrito tampoco');
    const slug1 = cursos[0].slug, slug2 = cursos[1].slug, slug3 = cursos[2].slug;
    r = await call('GET', `/public/cursos/${slug1}`);
    ok(r.status === 200 && r.data.access.allowed && r.data.syllabus[0].lessons.length === 2 && r.data.course.lessonCount === 2 && r.data.course.coverUrl, 'ficha pública del curso público con temario');
    r = await call('GET', `/public/cursos/${slug1}/aprender`);
    ok(r.status === 200 && r.data.modules[0].lessons[0].videoFile && r.data.modules[0].lessons[1].body.length > 40 && r.data.modules[0].lessons[1].resources.length === 1, 'aula: video, texto y recursos de la lección');
    const vf = r.data.modules[0].lessons[0].videoFile.id;
    r = await call('GET', `/public/cursos/${slug1}/archivos/${vf}/url`);
    ok(r.status === 200 && /^http/.test(r.data.url) && r.data.expiresIn === 1200, 'enlace firmado del video (20 min)');
    const bytes = await fetch(r.data.url).then(x => x.arrayBuffer());
    ok(bytes.byteLength === mp4.length, 'el video se reproduce desde el enlace firmado');
    r = await call('GET', `/public/cursos/${slug2}/aprender`);
    ok(r.status === 403 && r.data.reason === 'login', 'curso para registrados: anónimo recibe 403 y la razón');
    r = await call('GET', `/public/cursos/${slug2}`);
    ok(r.status === 200 && r.data.access.allowed === false && r.data.access.reason === 'login', 'la ficha del curso para registrados se ve, con el aviso de iniciar sesión');
    r = await call('GET', `/public/cursos/${slug2}/aprender`, ATTENDEE);
    ok(r.status === 200, 'con cuenta del portal de eventos entra');
    r = await call('GET', `/public/cursos/${slug2}/aprender`, PALMIRA);
    ok(r.status === 200, 'con cuenta del panel también');
    r = await call('GET', `/public/cursos/${slug3}`);
    ok(r.status === 403 && r.data.reason === 'invite', 'el curso privado no muestra ni la ficha sin invitación');
    const inv = cursos[2].inviteToken;
    r = await call('GET', `/public/cursos/${slug3}?invite=${inv}`);
    ok(r.status === 200 && r.data.access.allowed, 'con la invitación se abre la ficha');
    r = await call('GET', `/public/cursos/${slug3}/aprender?invite=${inv}`);
    ok(r.status === 200, 'y el aula');
    r = await call('GET', `/public/cursos/${slug3}/aprender?invite=otro`);
    ok(r.status === 403, 'una invitación equivocada no sirve');
    r = await call('GET', `/public/cursos/${slug3}/aprender`, CALI);
    ok(r.status === 200, 'el club dueño entra a su curso privado sin invitación');
    r = await call('GET', `/public/colecciones/${COL_SLUG}`);
    ok(r.status === 200 && r.data.courses.length === 2, 'la colección pública muestra dos (el privado oculto)');
    r = await call('GET', `/public/colecciones/${COL_SLUG}?invite=${inv}`);
    ok(r.data.courses.length === 3, 'con la invitación del curso, tres');
    r = await call('GET', `/public/cursos/${cursos[3].slug}`);
    ok(r.status === 404, 'un curso aprobado pero NO publicado no existe para el público');
    r = await call('GET', `/public/cursos/${cursos[6].slug}`);
    ok(r.status === 404, 'un borrador tampoco');
    r = await call('GET', `/public/cursos/${cursos[6].slug}/archivos/${VIDEO1}/url`);
    ok(r.status === 404, 'ni sus archivos');

    console.log('\n12. Despublicar y archivar');
    r = await call('POST', `/admin/cursos/${C1}/estado`, D4281, { to: 'approved' });
    ok(r.status === 200 && r.data.course.status === 'approved' && r.data.course.publishedAt === null, 'despublicado: vuelve a aprobado');
    r = await call('GET', `/public/cursos/${slug1}`);
    ok(r.status === 404, 'y deja de verse en público');
    r = await call('GET', '/public/catalogo?clubId=site-d4281');
    ok(r.data.courses.length === 1, 'la biblioteca lo quita al instante');
    r = await call('POST', `/admin/colecciones/${COL}/estado`, D4281, { status: 'archived' });
    ok(r.status === 200 && r.data.collection.status === 'archived', 'el comité archiva la colección');
    r = await call('GET', `/public/colecciones/${COL_SLUG}`);
    ok(r.status === 404, 'la colección archivada no se abre en público');
    r = await call('POST', `/mis/colecciones/${COL}/estado`, CALI, { status: 'active' });
    ok(r.status === 200 && r.data.collection.status === 'active', 'el club la restaura');

    console.log('\n13. Configuración del comité');
    r = await call('PUT', '/admin/config', CALI, { config: { enabled: false } });
    ok(r.status === 403, 'un club no cambia la configuración del Distrito');
    r = await call('PUT', '/admin/config', D4281, { config: { maxCoursesPerCollection: 13, categories: ['Seguridad alimentaria'], notifyEmails: ['comite@d4281.org'] } });
    ok(r.status === 200 && r.data.config.maxCoursesPerCollection === 13, 'el Distrito fija un tope');
    r = await call('POST', '/mis/cursos', CALI, { collectionId: COL, title: 'Curso 13' });
    ok(r.status === 201, 'con 12 activos (la copia archivada no cuenta) cabe el 13.º');
    r = await call('POST', '/mis/cursos', CALI, { collectionId: COL, title: 'Curso 14' });
    ok(r.status === 409, 'el 14.º se rechaza por el tope configurado');
    r = await call('PUT', '/admin/config', SUPER, { config: { maxCoursesPerCollection: 0 } });
    ok(r.status === 200 && r.data.config.maxCoursesPerCollection === 0, 'el operador lo quita: sin tope');
    r = await call('GET', '/admin/config', D4281);
    ok(r.data.config.categories[0] === 'Seguridad alimentaria' && r.data.config.notifyEmails[0] === 'comite@d4281.org', 'lo demás se conserva');

    console.log('\n14. Borrar un archivo suelta sus referencias');
    r = await call('POST', `/mis/cursos/${cursos[6].id}/lecciones`, CALI, { title: 'Con video' });
    const LX = r.data.lesson.id;
    up = await upload(CALI, cursos[6].id, 'clase.mp4', mp4, 'lesson_video');
    await call('PATCH', `/mis/cursos/${cursos[6].id}/lecciones/${LX}`, CALI, { videoFileId: up.fileId });
    r = await call('DELETE', `/mis/cursos/${cursos[6].id}/archivos/${up.fileId}`, CALI);
    ok(r.status === 200, 'archivo eliminado');
    r = await call('GET', `/mis/cursos/${cursos[6].id}`, CALI);
    ok(r.data.lessons.find(l => l.id === LX).videoFileId === null && r.data.files.length === 0, 'la lección quedó sin video y el archivo no aparece');
    r = await call('PATCH', `/mis/cursos/${cursos[6].id}/lecciones/${LX}`, CALI, { videoFileId: VIDEO1 });
    ok(r.status === 400, 'una lección no puede apuntar al archivo de OTRO curso');

    const { rows: cnt } = await db.query(`SELECT (SELECT COUNT(*)::int FROM "LearningCourse" WHERE "collectionId"=$1) AS cursos, (SELECT COUNT(*)::int FROM "LearningFile" WHERE status='ready') AS archivos, (SELECT COUNT(*)::int FROM "LearningFile" WHERE status='deleted') AS borrados`, [COL]);
    ok(cnt[0].cursos === 14 && cnt[0].archivos === 4 && cnt[0].borrados === 3, 'nada se perdió: 14 filas de curso (12 + copia archivada + el 13.º), 4 archivos listos, 3 borrados a propósito');

    console.log(`\n✅ test:learning:e2e — ${n} comprobaciones en verde.`);
} finally {
    srv.close(); s3.close();
    await db.pool.end().catch(() => {});
}
