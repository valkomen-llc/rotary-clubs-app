// ════════════════════════════════════════════════════════════════════
// test:fair:document-tracking:e2e — Seguimiento documental, de punta a punta
// (v4.1332). Rutas reales de Express contra un Postgres LOCAL y desechable,
// S3 simulado y el correo interceptado:
//
//   FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:document-tracking:e2e
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige una URL a localhost.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:document-tracking:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
const require = createRequire(`${REPO}/package.json`);

// ── S3 simulado ──────────────────────────────────────────────────────
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

const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);

// ── Correo interceptado ──────────────────────────────────────────────
const { default: EmailService } = await import(`${REPO}/server/services/EmailService.js`);
const mails = [];
let failFor = null;
EmailService.sendPlatformEmail = async ({ to, subject, html }) => {
    if (failFor && to === failFor) return { success: false, error: 'buzón rechazado (simulado)' };
    mails.push({ to, subject, html });
    return { success: true, id: `m${mails.length}` };
};

await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-xii','XII Feria','xii') ON CONFLICT DO NOTHING`);
const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
const { ensureProjectVideoSchema } = await import(`${REPO}/server/lib/ensureProjectVideoSchema.js`);
const { ensureVideoPitchSchema } = await import(`${REPO}/server/lib/ensureVideoPitchSchema.js`);
const { resolveForms } = await import(`${REPO}/server/lib/projectFormsRegistry.js`);
const { applicantFields } = await import(`${REPO}/server/lib/projectFormEngine.js`);
await ensureTables();
await ensureProjectVideoSchema();
await ensureVideoPitchSchema();

const DEADLINE = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-xii','evt-xii',$1::jsonb)
                ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = $1::jsonb`,
[JSON.stringify({ registration: { requirePayment: false }, documentTracking: { deadline: DEADLINE } })]);

const sub = async (ref, wf, { email, club = 'Club Valledupar', archived = false } = {}) => {
    const { rows } = await db.query(`
        INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "projectIndex", "appliedAt", "archivedAt")
        VALUES ($1,'evt-xii','Ana',$2,$3,$4,'4271',$5,$6,'pending_payment','+573001234567','agua',250000,1,NOW(),$7) RETURNING *`,
    [ref, `Pérez ${ref}`, email || `${ref.toLowerCase()}@club.org`, club, `Proyecto ${ref}`, wf, archived ? new Date() : null]);
    await db.query(`INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName") VALUES ($1,$2,'!',$3)`, [rows[0].id, `acc-${ref.toLowerCase()}@club.org`, club]);
    return rows[0];
};

// Respuestas VÁLIDAS para todos los campos del club de una plantilla.
const valueFor = (f) => {
    switch (f.type) {
        case 'textarea': return 'Texto largo de prueba';
        case 'number': case 'currency': return '1500';
        case 'percent': return '40';
        case 'date': return '2026-02-10';
        case 'select': return Array.isArray(f.options) && f.options.length ? f.options[0] : 'Opción';
        case 'multiselect': return [Array.isArray(f.options) && f.options.length ? f.options[0] : 'Opción'];
        case 'checkbox': return true;
        case 'url': case 'file': return 'https://ejemplo.org/doc.pdf';
        case 'email': return 'contacto@club.org';
        case 'phone': return '+57 300 123 4567';
        case 'repeater': return [{ a: 'fila' }];
        case 'matrix': return { r1: { c1: '10' } };
        default: return 'Texto';
    }
};
const fullAnswers = (template) => {
    const out = {};
    for (const f of applicantFields(template)) (out[f.sectionKey] ||= {})[f.key] = valueFor(f);
    return out;
};
const FORMS = resolveForms({});
const MASTER_T = FORMS.find(f => f.key === 'master').template;
const FDD_T = FORMS.find(f => f.key === 'fdd_2026_2027').template;

const A = await sub('FP-A', 'received', { email: 'compartido@club.org' });   // incompleto
const D = await sub('FP-D', 'received', { email: 'compartido@club.org' });   // mismo responsable que A
const B = await sub('FP-B', 'received');                                      // completo
const C = await sub('FP-C', 'draft');                                         // borrador
const E = await sub('FP-E', 'received', { archived: true });                  // archivado
const X = await sub('FP-X', 'received', { club: 'Club Ajeno' });              // otro club

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API = `http://127.0.0.1:${srv.address().port}/api/project-fair`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const portalToken = (s) => jwt.sign({ sub: `acc-${s.id}`, submissionId: s.id, email: s.email, aud: 'project-fair-portal' }, SECRET);
const admin = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'c1' }, SECRET);
const EV = '?evento=evt-xii';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const row = async (id) => (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [id])).rows[0];
const listRow = async (id, qs = '') => (await call('GET', `/admin/postulaciones${EV}&pageSize=200${qs}`, admin)).data.submissions.find(s => s.id === id);
const docReq = (s, key) => s.documents.requirements.find(r => r.key === key);
const snapshot = async () => (await db.query('SELECT id, "workflowStatus", status, "amountCop", "paidAt" FROM "ProjectFairSubmission" ORDER BY id')).rows;

const uploadPresentation = async (token, bytes, fileName) => {
    const p = await call('POST', '/portal/presentation/presign', token, { fileName, size: bytes.length });
    if (p.status !== 200) return p;
    const put = await fetch(p.data.uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': p.data.contentType } });
    assert.equal(put.status, 200);
    return call('POST', '/portal/presentation', token, { storageKey: p.data.storageKey, fileName });
};
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 32), Buffer.from('\n%%EOF')]);
const FAKE_DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(500, 1), Buffer.from('word/document.xml[Content_Types].xml')]);

try {
    const before = await snapshot();
    const tA = portalToken(A); const tB = portalToken(B);

    console.log('── El club llena formularios por las rutas reales');
    let r = await call('GET', '/portal/forms/master', tA);
    ok(r.status === 200, 'la Formulación de A abre (crea su borrador precargado)');
    const aAnswers = r.data.answers;
    aAnswers.objetivos = { ...(aAnswers.objetivos || {}), projectDescription: 'Agua para tres veredas' };
    r = await call('PUT', '/portal/forms/master', tA, { answers: aAnswers });
    ok(r.status === 200, 'A guarda su Formulación a medias');
    await call('GET', '/portal/forms/master', tB);
    r = await call('PUT', '/portal/forms/master', tB, { answers: fullAnswers(MASTER_T) });
    ok(r.status === 200 && r.data.completionPct === 100, 'B guarda la Formulación COMPLETA (100 %)');
    await call('GET', '/portal/forms/fdd_2026_2027', tB);
    r = await call('PUT', '/portal/forms/fdd_2026_2027', tB, { answers: fullAnswers(FDD_T) });
    ok(r.status === 200 && r.data.completionPct === 100, 'B guarda el FDD COMPLETO (100 %)');

    console.log('── Criterio 7: la MISMA cifra en «Mi Proyecto» y en el panel');
    const cardsA = (await call('GET', '/portal/forms', tA)).data.forms;
    let lA = await listRow(A.id);
    ok(!!lA.documents, 'cada fila del listado trae su seguimiento documental');
    ok(docReq(lA, 'master').pct === cardsA.find(c => c.key === 'master').completionPct, `Formulación de A: panel ${docReq(lA, 'master').pct} % = «Mi Proyecto» ${cardsA.find(c => c.key === 'master').completionPct} %`);
    ok(docReq(lA, 'master').pct > 0 && docReq(lA, 'master').pct < 100, 'A está a medias (ni 0 ni 100)');
    ok(docReq(lA, 'fdd_2026_2027').pct === 0 && docReq(lA, 'fdd_2026_2027').status.label === 'Sin iniciar', 'el FDD de A dice «Sin iniciar» con 0 %');
    const status = (await call('GET', '/portal/document-status', tA)).data.tracking;
    ok(status.overallPct === lA.documents.overallPct, `el avance documental global coincide (club ${status.overallPct} % = comité ${lA.documents.overallPct} %)`);

    console.log('── Un valor INVÁLIDO en un obligatorio no cuenta como diligenciado');
    const fddBad = fullAnswers(FDD_T); fddBad.presidente.presidentEmail = 'correo-mal-escrito';
    r = await call('PUT', '/portal/forms/fdd_2026_2027', tB, { answers: fddBad });
    ok(r.status === 200 && r.data.completionPct < 100, `con el correo mal escrito, el FDD baja a ${r.data.completionPct} %`);
    const detB = (await call('GET', `/admin/seguimiento-documental/${B.id}${EV}`, admin)).data;
    const fddDet = detB.tracking.requirements.find(x => x.key === 'fdd_2026_2027');
    ok(fddDet.invalid.some(i => i.key === 'presidentEmail'), 'el detalle nombra el campo con formato incorrecto');
    ok(fddDet.sections.some(s => !s.complete && s.key === 'presidente'), '… y la sección incompleta');
    await call('PUT', '/portal/forms/fdd_2026_2027', tB, { answers: fullAnswers(FDD_T) });

    console.log('── Caché del avance: se refresca sola cuando no coincide');
    await db.query(`UPDATE "ProjectFairMasterForm" SET "completionPct" = 7 WHERE "submissionId" = $1`, [B.id]);
    await listRow(B.id);
    ok(Number((await db.query(`SELECT "completionPct" FROM "ProjectFairMasterForm" WHERE "submissionId" = $1`, [B.id])).rows[0].completionPct) === 100, 'la columna guardada vuelve a 100 sin tocar las respuestas');

    console.log('── Presentación: entrega validada por los bytes');
    r = await uploadPresentation(tB, FAKE_DOCX, 'presentacion.pptx');
    ok(r.status === 400 && /no corresponde|contenido/i.test(r.data.error), 'un DOCX disfrazado de .pptx se rechaza');
    ok([...objects.keys()].every(k => !k.includes(B.id) || objects.get(k).body[0] === 0x25), 'el objeto rechazado se borró del almacenamiento');
    r = await uploadPresentation(tB, PDF, 'Presentacion-B.pdf');
    ok(r.status === 201 && r.data.current?.fileName === 'Presentacion-B.pdf' && r.data.requirement.status.key === 'uploaded', 'un PDF real queda «Cargada» sólo tras confirmarlo el servidor');
    let lB = await listRow(B.id);
    ok(docReq(lB, 'presentation').status.label === 'Cargada' && docReq(lB, 'presentation').complete, 'el panel la ve «Cargada» (entregada, NO validada)');
    ok(docReq(lB, 'presentation').review === null, 'cargada no implica validada');
    r = await call('GET', `/portal/presentation/${r.data.current.id}/url`, portalToken(X));
    ok(r.status === 404, 'otro club no puede descargar esa presentación');

    console.log('── Video propio aprobado y Video Pitch con pago pendiente (aparte)');
    await db.query(`INSERT INTO "ProjectVideo" ("submissionId", "eventId", status, "currentVersionId", "approvedAt") VALUES ($1,'evt-xii','approved','ver-1',NOW())`, [B.id]);
    await db.query(`INSERT INTO "VideoPitchRequest" ("submissionId", "eventId", status, "commercialStatus") VALUES ($1,'evt-xii','submitted','pending_payment')`, [B.id]);
    lB = await listRow(B.id);
    ok(docReq(lB, 'video').status.label === 'Validado', 'el video aprobado en su módulo se ve «Validado»');
    ok(lB.documents.pitch.label === 'Pago pendiente', 'el Video Pitch se ve aparte: «Pago pendiente»');
    ok(lB.paymentStatus === 'pending_payment', '… y el pago de la INSCRIPCIÓN no cambia por eso');
    ok(lB.documents.overallPct === 100 && lB.documents.complete, 'B: documentación 100 % (el Video Pitch no suma ni resta)');

    console.log('── Revisión del comité (diligenciado ≠ entregado ≠ validado)');
    r = await call('POST', `/admin/seguimiento-documental/${A.id}/revision${EV}`, admin, { requirement: 'master', status: 'validated' });
    ok(r.status === 409 && /no se puede validar/i.test(r.data.error), 'no se valida un formulario incompleto');
    r = await call('POST', `/admin/seguimiento-documental/${B.id}/revision${EV}`, admin, { requirement: 'presentation', status: 'changes_requested' });
    ok(r.status === 400, 'pedir corrección exige motivo');
    const mailsAntes = mails.length;
    r = await call('POST', `/admin/seguimiento-documental/${B.id}/revision${EV}`, admin, { requirement: 'presentation', status: 'changes_requested', note: 'Falta la diapositiva de presupuesto.' });
    ok(r.status === 200 && r.data.notified === true && mails.length === mailsAntes + 1, 'pedir corrección guarda la decisión y avisa al club');
    lB = await listRow(B.id);
    ok(docReq(lB, 'presentation').status.label === 'Requiere corrección' && !lB.documents.complete, 'la presentación queda «Requiere corrección» y B deja de estar completo');
    const clubB = (await call('GET', '/portal/document-status', tB)).data.tracking;
    ok(clubB.requirements.find(x => x.key === 'presentation').correction === 'Falta la diapositiva de presupuesto.', 'el club ve el motivo en «Mi Proyecto»');
    r = await uploadPresentation(tB, PDF, 'Presentacion-B-v2.pdf');
    ok(r.status === 201 && r.data.versions.length === 2, 'el club atiende la corrección con una versión nueva (la anterior se conserva)');
    lB = await listRow(B.id);
    ok(docReq(lB, 'presentation').status.label === 'Cargada' && docReq(lB, 'presentation').reviewStale, 'con el archivo nuevo, la corrección queda desactualizada: vuelve a «Cargada»');
    r = await call('POST', `/admin/seguimiento-documental/${B.id}/revision${EV}`, admin, { requirement: 'presentation', status: 'validated' });
    ok(r.status === 200, 'el comité la valida');
    r = await uploadPresentation(tB, PDF, 'otra.pdf');
    ok(r.status === 403 && /validó/i.test(r.data.error), 'una presentación validada no se reemplaza sin el comité');
    r = await call('POST', `/admin/seguimiento-documental/${B.id}/revision${EV}`, admin, { requirement: 'master', status: 'validated' });
    ok(r.status === 200, 'el comité valida la Formulación completa de B');
    lB = await listRow(B.id);
    ok(lB.documents.validation.key === 'pending_review', 'B queda «Pendiente de validación» (falta el FDD)');
    r = await call('POST', `/admin/seguimiento-documental/${B.id}/revision${EV}`, admin, { requirement: 'video', status: 'validated' });
    ok(r.status === 409 && r.data.code === 'USE_VIDEO_MODULE', 'el video se revisa en SU módulo, no aquí');
    // El club edita la Formulación validada → la validación queda desactualizada.
    const fa = fullAnswers(MASTER_T); fa.objetivos = { ...(fa.objetivos || {}), projectDescription: 'Cambio posterior a la validación' };
    await call('PUT', '/portal/forms/master', tB, { answers: fa });
    lB = await listRow(B.id);
    ok(docReq(lB, 'master').review === null && docReq(lB, 'master').reviewStale, 'si el club cambia lo validado, la validación queda desactualizada');

    console.log('── «No aplica» por proyecto');
    r = await call('POST', `/admin/seguimiento-documental/${A.id}/aplicabilidad${EV}`, admin, { requirement: 'fdd_2026_2027', applicability: 'not_applicable' });
    ok(r.status === 400, 'marcar «No aplica» exige motivo');
    const pctAntes = (await listRow(A.id)).documents.overallPct;
    r = await call('POST', `/admin/seguimiento-documental/${A.id}/aplicabilidad${EV}`, admin, { requirement: 'fdd_2026_2027', applicability: 'not_applicable', reason: 'El club no solicita FDD este año.' });
    lA = await listRow(A.id);
    ok(r.status === 200 && docReq(lA, 'fdd_2026_2027').status.label === 'No aplica', 'el FDD de A dice «No aplica»');
    ok(lA.documents.overallPct > pctAntes, `y sale del cálculo global (${pctAntes} % → ${lA.documents.overallPct} %)`);
    const ev = (await db.query(`SELECT * FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'document_applicability'`, [A.id])).rows;
    ok(ev.length === 1 && /no solicita FDD/.test(ev[0].detail), 'queda en el historial con su motivo');

    console.log('── Filtros documentales combinados con los de siempre');
    const ids = async (qs) => (await call('GET', `/admin/postulaciones${EV}&pageSize=200${qs}`, admin)).data.submissions.map(s => s.id).sort();
    ok(!(await ids('&doc=completa')).includes(A.id), 'A no aparece en «Documentación completa»');
    ok((await ids('&doc=incompleta')).includes(A.id) && (await ids('&doc=incompleta')).includes(D.id), '«Documentación incompleta» trae a A y D');
    ok((await ids('&doc=formulacion&search=FP-A')).join() === A.id, '«Formulación < 100 %» + búsqueda se combinan');
    ok((await ids('&doc=presentacion&district=4271')).includes(D.id), '«Presentación pendiente» + distrito');
    ok(!(await ids('&doc=incompleta')).includes(E.id), 'lo archivado sigue fuera por defecto');
    const lowFirst = (await call('GET', `/admin/postulaciones${EV}&pageSize=200&sortBy=docOverall&sortDir=asc`, admin)).data.submissions.map(s => s.documents.overallPct);
    ok(lowFirst.every((v, i) => i === 0 || lowFirst[i - 1] <= v), 'ordenar por avance documental (ascendente) funciona');
    const range = (await call('GET', `/admin/postulaciones${EV}&pageSize=200&docMin=100&docMax=100`, admin)).data;
    ok(range.submissions.every(s => s.documents.overallPct === 100), 'el rango de avance filtra en el servidor');
    ok((await ids('&responsable=Pérez FP-D')).join() === D.id, 'filtro por responsable');

    console.log('── Indicadores');
    const kp = (await call('GET', `/admin/seguimiento-documental${EV}`, admin)).data;
    ok(kp.kpis.total === 5 && kp.kpis.incomplete >= 3, `KPIs sobre los activos de la edición (total ${kp.kpis.total})`);
    ok(kp.config.deadline === DEADLINE, 'la fecha límite viene de la configuración de la edición');
    const kpFiltered = (await call('GET', `/admin/seguimiento-documental${EV}&search=FP-B`, admin)).data;
    ok(kpFiltered.kpis.total === 1, 'los indicadores siguen los filtros activos');

    console.log('── Recordatorios: vista previa, un correo por responsable, tope y registro');
    r = await call('POST', `/admin/seguimiento-documental/recordatorios${EV}`, admin, { scope: 'incompletos' });
    ok(r.status === 200 && r.data.preview === true, 'sin confirmar NO se envía: devuelve el plan');
    const shared = r.data.recipients.find(x => x.email === 'compartido@club.org');
    ok(shared && shared.projects.length === 2, 'A y D (mismo responsable) van en UN solo correo con los dos proyectos');
    ok(r.data.plan.find(p => p.id === C.id)?.send === false && r.data.plan.find(p => p.id === C.id)?.code === 'draft', 'el borrador no recibe recordatorio (con motivo)');
    ok(!r.data.plan.some(p => p.id === E.id), 'el archivado no entra');
    ok(!r.data.plan.some(p => p.id === B.id), 'B (documentación completa) no entra en «incompletos»');
    ok(/Proyecto FP-A/.test(r.data.sample.html) && /Mi Proyecto/.test(r.data.sample.html), 'la vista previa nombra el proyecto y enlaza a «Mi Proyecto»');
    ok(r.data.sample.subject === 'Actualización pendiente de documentación — Feria de Proyectos Rotary Colombia', 'asunto del pedido');
    const sentBefore = mails.length;
    failFor = 'fp-x@club.org';
    r = await call('POST', `/admin/seguimiento-documental/recordatorios${EV}`, admin, { scope: 'incompletos', confirm: true });
    ok(r.status === 200 && r.data.sent >= 1 && r.data.failed === 1, `envío confirmado: ${r.data.sent} enviados, ${r.data.failed} fallido (registrado)`);
    ok(mails.slice(sentBefore).filter(m => m.to === 'compartido@club.org').length === 1, 'el responsable compartido recibió UN correo');
    const regs = (await db.query(`SELECT * FROM "ProjectDocumentReminder" ORDER BY "createdAt"`)).rows;
    ok(regs.some(x => x.status === 'sent' && x.submissionIds.length === 2) && regs.some(x => x.status === 'failed' && /rechazado/.test(x.error)), 'el registro guarda destinatario, proyectos, estado y error');
    r = await call('POST', `/admin/seguimiento-documental/recordatorios${EV}`, admin, { scope: 'incompletos' });
    ok(r.data.plan.filter(p => p.email === 'compartido@club.org').every(p => p.send === false && p.code === 'too_soon'), 'un segundo envío inmediato se bloquea por el intervalo mínimo');
    const failed = regs.find(x => x.status === 'failed');
    failFor = null;
    r = await call('POST', `/admin/seguimiento-documental/recordatorios/${failed.id}/reintentar${EV}`, admin, {});
    ok(r.status === 200 && r.data.status === 'sent', 'el fallido se reintenta y sale');
    r = await call('POST', `/admin/seguimiento-documental/recordatorios/${failed.id}/reintentar${EV}`, admin, {});
    ok(r.status === 409, 'un envío ya hecho no se reintenta');
    lA = await listRow(A.id);
    ok(lA.documents.reminderCount === 1 && !!lA.documents.lastReminderAt, 'la fila muestra el último recordatorio');
    ok((await ids('&doc=recordatorio_enviado')).includes(A.id), 'filtro «Recordatorio enviado»');

    console.log('── Configuración (fecha límite por evento, sin fechas en el código)');
    r = await call('PUT', `/admin/seguimiento-documental/config${EV}`, admin, { config: { deadline: '2027-01-20', requirements: { video: { mode: 'optional' } }, reminders: { minDays: 999 } } });
    ok(r.status === 200 && r.data.config.deadline === '2027-01-20' && r.data.config.requirements.video.mode === 'optional', 'se guarda la fecha y el video como opcional');
    ok(r.data.config.reminders.minDays === 60, 'los valores fuera de rango se acotan');
    ok(r.data.history[0].changed.includes('deadline'), 'queda en la bitácora de la configuración');
    lA = await listRow(A.id);
    ok(docReq(lA, 'video').counts === false, 'un requisito opcional deja de contar para el global');
    r = await call('PUT', `/admin/seguimiento-documental/config${EV}`, admin, { config: { deadline: 'mañana' } });
    ok(r.data.config.deadline === null, 'una fecha inválida no se guarda');

    console.log('── Exportación');
    const csv = await fetch(`${API}/admin/export.csv${EV}`, { headers: { Authorization: `Bearer ${admin}` } }).then(x => x.text());
    ok(/Avance documental \(%\)/.test(csv) && /Formulación \(%\)/.test(csv) && /Último recordatorio/.test(csv), 'el CSV trae las columnas documentales');
    const csvDoc = await fetch(`${API}/admin/export.csv${EV}&doc=completa`, { headers: { Authorization: `Bearer ${admin}` } }).then(x => x.text());
    ok(!/Proyecto FP-A/.test(csvDoc), 'y respeta el filtro documental activo');

    console.log('── Permisos');
    ok((await call('GET', `/admin/seguimiento-documental${EV}`, null)).status === 401, 'sin sesión: 401');
    ok([401, 403].includes((await call('GET', `/admin/seguimiento-documental${EV}`, tA)).status), 'el token del club no abre el panel del comité');
    await db.query(`UPDATE "ProjectFairConfig" SET config = config || '{"access":{"translators":["trad@feria.org"]}}'::jsonb WHERE "eventId" = 'evt-xii'`);
    const trad = jwt.sign({ id: 'u-t', email: 'trad@feria.org', role: 'project_fair_reviewer', clubId: null }, SECRET);
    const tr = await call('POST', `/admin/seguimiento-documental/${A.id}/revision${EV}`, trad, { requirement: 'master', status: 'in_review' });
    ok(tr.status === 403, `un perfil sin «changeStatus» no revisa (${tr.status})`);
    ok((await call('GET', '/portal/document-status', null)).status === 401, 'el estado del club exige su sesión');

    console.log('── Nada de esto movió estados ni pagos');
    const after = await snapshot();
    ok(JSON.stringify(after) === JSON.stringify(before), 'estado del proyecto, pago, valor y fecha de pago intactos en las seis postulaciones');
    const written = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProjectFairSubmission" WHERE "eventId" = 'evt-xii'`)).rows[0].n;
    ok(written === 6, 'no se creó ni borró ninguna postulación');

    console.log(`\n✅ ${n} comprobaciones, todas en verde (Postgres real, S3 simulado, router real).`);
} finally {
    srv.close(); s3.close();
    await db.end?.().catch(() => {});
}
process.exit(0);
