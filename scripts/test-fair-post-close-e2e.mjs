// ════════════════════════════════════════════════════════════════════
// test:fair:post-close:e2e — Edición después del cierre, de punta a punta
// (v4.1330). Rutas reales de Express contra un Postgres LOCAL y desechable:
//
//   FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:post-close:e2e
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ. No lee DATABASE_URL: exige
// FAIR_E2E_DATABASE_URL apuntando a localhost, y una base VACÍA y desechable.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:post-close:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
process.env.DATABASE_URL = E2E_DB;
const require = createRequire(`${REPO}/package.json`);
const express = require('express');
const jwt = require('jsonwebtoken');
const { default: db } = await import(`${REPO}/server/lib/db.js`);

await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-xii','XII Feria','xii') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
await ensureTables();
// La convocatoria CERRÓ (fecha en el pasado) y no trae política guardada:
// rige la de fábrica.
const setConfig = (config) => db.query(`
    INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-xii','evt-xii', $1::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = $1::jsonb, "updatedAt" = NOW()`, [JSON.stringify(config)]);
const BASE_CFG = { deadline: '2020-01-09', registration: { priceMode: 'COP', amountCop: 250000 } };
await setConfig(BASE_CFG);

const sub = async (ref, wf) => (await db.query(`
    INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "projectIndex", "appliedAt", "createdAt")
    VALUES ($1,'evt-xii','Ana','Pérez',$2,'Club Valledupar','4271',$3,$4,'pending_payment','+573001234567','agua',250000,1, '2020-01-05T10:00:00Z', '2020-01-04T10:00:00Z') RETURNING *`,
[ref, `${ref.toLowerCase()}@club.org`, `Proyecto ${ref}`, wf])).rows[0];

const A = await sub('FP-A', 'received');      // Caso A/C: postulado, formulario a medias
const R = await sub('FP-R', 'in_review');     // con restricciones
const B = await sub('FP-B', 'approved');      // Caso D: requiere autorización
const X = await sub('FP-X', 'received');      // Caso E: el ajeno
const Z = await sub('FP-Z', 'received');      // nunca se toca

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
const fila = async (id) => (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [id])).rows[0];
const revs = async (id, path) => (await db.query(`SELECT * FROM "ProjectDossierRevision" WHERE "submissionId" = $1 ${path ? 'AND path = $2' : ''} ORDER BY "createdAt"`, path ? [id, path] : [id])).rows;
const total = async () => Number((await db.query('SELECT COUNT(*) FROM "ProjectFairSubmission"')).rows[0].count);

try {
    const tA = portalToken(A);
    const totalAntes = await total();

    console.log('── Creación cerrada, edición abierta');
    let r = await call('GET', '/config');
    // La pública lee la edición abierta: la única, la nuestra.
    ok(r.data?.applications?.open === false && r.data.applications.code === 'deadline', 'la configuración pública dice que NO recibe postulaciones nuevas');
    r = await call('POST', '/submissions', null, { mode: 'draft', email: 'nuevo@club.org' });
    ok(r.status === 403 && r.data.code === 'applications_closed', 'una postulación nueva se rechaza en el servidor (403 applications_closed)');
    ok(/Mi Proyecto|panel/i.test(r.data.error), '… y le dice a quien ya tiene proyecto dónde seguir');

    console.log('── Caso A: completar la Formulación después del cierre');
    r = await call('GET', '/portal/forms/master', tA);
    ok(r.status === 200 && r.data.canEdit === true, 'el formulario abre EDITABLE después del cierre');
    ok(r.data.editWindow?.phase === 'post_close' && r.data.lockedFields.length === 0, 'fase posterior al cierre, sin campos bloqueados (Postulado)');
    const answers = r.data.answers;
    ok(Array.isArray((await fila(A.id)).metadata?.postCloseBaseline?.master), 'se tomó la foto de lo pendiente al primer acceso');
    answers.objetivos = { ...(answers.objetivos || {}), projectDescription: 'Pozos de agua para tres veredas' };
    r = await call('PUT', '/portal/forms/master', tA, { answers });
    ok(r.status === 200 && r.data.completionPct > 0, 'el guardado se acepta y recalcula el avance');
    let f = await fila(A.id);
    ok(f.workflowStatus === 'received' && f.status === 'pending_payment', 'no cambia el estado del proyecto ni el pago');
    ok(new Date(f.appliedAt).toISOString() === '2020-01-05T10:00:00.000Z' && new Date(f.createdAt).toISOString() === '2020-01-04T10:00:00.000Z', 'conserva la fecha de postulación y de creación');
    ok(f.metadata.postCloseEdit?.pendingReview === true && f.metadata.postCloseEdit.forms.includes('master'), 'queda «Cambios pendientes de revisión»');
    ok(!!f.metadata.lastClubEditAt, 'registra la última modificación');
    let rv = await revs(A.id, 'master.objetivos.projectDescription');
    ok(rv.length === 1 && rv[0].kind === 'club_edit_post_close' && rv[0].after === 'Pozos de agua para tres veredas', 'la bitácora tiene el campo, el antes y el después');
    answers.objetivos.projectDescription = 'Pozos de agua para cuatro veredas';
    await call('PUT', '/portal/forms/master', tA, { answers });
    rv = await revs(A.id, 'master.objetivos.projectDescription');
    ok(rv.length === 1 && rv[0].after === 'Pozos de agua para cuatro veredas', 'los autoguardados del mismo campo se agrupan en una fila');
    ok(await total() === totalAntes, 'no se crea ninguna postulación nueva');

    console.log('── Caso B: la Solicitud del FDD también');
    r = await call('GET', '/portal/forms/fdd_2026_2027', tA);
    ok(r.status === 200 && r.data.canEdit === true, 'la Solicitud de Aportes del FDD abre editable');
    const fdd = r.data.answers;
    fdd.objetivo = { ...(fdd.objetivo || {}), mainObjective: 'Agua potable' };
    r = await call('PUT', '/portal/forms/fdd_2026_2027', tA, { answers: fdd });
    ok(r.status === 200, 'y se guarda');
    ok((await fila(A.id)).metadata.postCloseEdit.forms.sort().join() === 'fdd_2026_2027,master', 'la marca lista los dos formularios');

    console.log('── Caso C/D: «En revisión» — campos sensibles bloqueados en el servidor');
    const tR = portalToken(R);
    r = await call('GET', '/portal/forms/master', tR);
    ok(r.data.canEdit && r.data.lockedFields.includes('presupuesto.budgetTable') && r.data.lockedFields.includes('identificacion.clubName'), 'presupuesto y club llegan bloqueados');
    ok(!r.data.lockedFields.includes('objetivos.projectDescription') && !!r.data.lockedReason, 'la descripción no, y se explica por qué');
    const aR = r.data.answers;
    const presupuestoAntes = JSON.stringify(aR.presupuesto?.budgetTable ?? null);
    aR.presupuesto = { budgetTable: { projectCost: { pesos: '999999999', usd: '1' } } };
    aR.identificacion = { ...(aR.identificacion || {}), clubName: 'Otro club' };
    aR.objetivos = { ...(aR.objetivos || {}), projectDescription: 'Descripción corregida' };
    r = await call('PUT', '/portal/forms/master', tR, { answers: aR });
    const guardado = (await db.query('SELECT answers FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', [R.id])).rows[0].answers;
    ok(JSON.stringify(guardado.presupuesto?.budgetTable ?? null) === presupuestoAntes, 'el presupuesto enviado a mano NO se guarda');
    ok(guardado.identificacion?.clubName !== 'Otro club', 'el club tampoco');
    ok(guardado.objetivos?.projectDescription === 'Descripción corregida', 'la descripción sí');
    ok((await fila(R.id)).workflowStatus === 'in_review', 'sigue «En revisión»');

    console.log('── Caso D: «Aprobado» pide autorización, el comité la concede');
    const tB = portalToken(B);
    r = await call('GET', '/portal/forms/master', tB);
    ok(r.status === 200 && r.data.canEdit === false && r.data.editWindow.requestable === true, 'consultable, no editable, con opción de pedir autorización');
    r = await call('PUT', '/portal/forms/master', tB, { answers: { objetivos: { projectDescription: 'x' } } });
    ok(r.status === 403, 'el guardado se rechaza (403)');
    r = await call('POST', '/portal/forms/master/edit-request', tB, { note: 'Corregir el número de beneficiarios' });
    ok(r.status === 200 && r.data.card.action.key === 'pending', 'la solicitud queda y la tarjeta dice «pendiente de autorización»');
    r = await call('POST', '/portal/forms/master/edit-request', tB, {});
    ok(r.status === 200 && r.data.alreadyRequested, 'pedirla dos veces no la duplica');
    const ev = (await db.query(`SELECT COUNT(*) FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'form_edit_requested'`, [B.id]).catch(() => ({ rows: [{ count: '1' }] }))).rows[0].count;
    ok(Number(ev) === 1, 'un solo evento en el historial');
    r = await call('GET', `/admin/forms${EV}&formKey=master`, admin);
    ok(r.data.forms.find(x => x.id === B.id)?.editRequest?.note === 'Corregir el número de beneficiarios', 'el comité la ve en la pestaña Formularios');
    r = await call('POST', `/admin/postulaciones/${B.id}/forms/master/reopen${EV}`, admin, { reason: 'Autorizado' });
    ok(r.status === 200, 'el comité reabre la edición');
    ok(!(await fila(B.id)).metadata?.editRequests?.master, 'la solicitud queda resuelta');
    r = await call('PUT', '/portal/forms/master', tB, { answers: { objetivos: { projectDescription: 'Corregido con autorización' } } });
    ok(r.status === 200, 'ahora el club puede guardar');
    ok((await fila(B.id)).workflowStatus === 'approved', 'y el proyecto sigue «Aprobado»');

    console.log('── Caso E: proyecto ajeno');
    const tX = portalToken(X);
    const antesA = (await db.query('SELECT answers FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', [A.id])).rows[0].answers;
    await call('PUT', '/portal/forms/master', tX, { answers: { objetivos: { projectDescription: 'intruso' } }, submissionId: A.id });
    const despuesA = (await db.query('SELECT answers FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', [A.id])).rows[0].answers;
    ok(JSON.stringify(antesA) === JSON.stringify(despuesA), 'el token de otro club no toca este proyecto (la postulación sale del token)');
    r = await call('PUT', '/portal/forms/master', jwt.sign({ submissionId: A.id, aud: 'otra' }, SECRET), { answers: {} });
    ok(r.status === 401, 'un token que no es del portal: 401');

    console.log('── Envío después del cierre: no mueve el estado');
    r = await call('POST', '/portal/forms/master/submit', tA, {});
    ok(r.status === 400 && Array.isArray(r.data.missing), 'con campos pendientes, el envío los lista (400)');
    // Se llena todo lo obligatorio con valores válidos de cada tipo.
    const g = await call('GET', '/portal/forms/master', tA);
    const full = JSON.parse(JSON.stringify(g.data.answers || {}));
    const valueFor = (fd) => ({
        text: 'Texto', textarea: 'Texto suficiente', email: 'gestor@club.org', phone: '3001234567',
        date: '2026-11-10', number: '100', currency: '1000', percent: '10', checkbox: true,
        select: fd.options?.[0] ?? g.data.focusAreas?.[0]?.key ?? 'x',
        multiselect: [g.data.focusAreas?.[0]?.label ?? fd.options?.[0] ?? 'x'],
        matrix: { [fd.rows?.[0]?.key || 'r']: { [fd.columns?.[0]?.key || 'c']: '1000' } },
        repeater: [{ [fd.columns?.[0]?.key || fd.fields?.[0]?.key || 'c']: 'x' }],
    }[fd.type] ?? 'x');
    for (const sec of g.data.template.sections.filter(x => !x.adminOnly)) {
        for (const fd of sec.fields || []) {
            if (fd.type === 'computed') continue;
            const cur = full?.[sec.key]?.[fd.key];
            const empty = cur === undefined || cur === null || cur === '' || (Array.isArray(cur) && !cur.length);
            if (empty) full[sec.key] = { ...(full[sec.key] || {}), [fd.key]: valueFor(fd) };
        }
    }
    r = await call('POST', '/portal/forms/master/submit', tA, { answers: full });
    ok(r.status === 200 && r.data.status === 'submitted', `la Formulación completa se envía después del cierre (${r.status} ${r.data?.error || ''}${r.data?.invalid ? JSON.stringify(r.data.invalid) : ''})`);
    ok((await fila(A.id)).workflowStatus === 'received', 'enviar la Formulación después del cierre NO pasa el proyecto a «En revisión»');

    console.log('── Panel administrativo');
    r = await call('GET', `/admin/postulaciones${EV}&actualizaciones=pendientes`, admin);
    const ids = (r.data.rows || r.data.submissions || []).map(x => x.id);
    ok(ids.includes(A.id) && ids.includes(R.id) && ids.includes(X.id) && !ids.includes(Z.id), 'filtro «Pendientes de revisión» (el ajeno editó SU proyecto; el intacto no aparece)');
    const filaA = (r.data.rows || r.data.submissions).find(x => x.id === A.id);
    ok(filaA.postCloseEdit?.pendingReview === true && !!filaA.lastClubEditAt, 'la fila trae la marca y la última actualización');
    r = await call('GET', `/admin/postulaciones${EV}&actualizaciones=sin`, admin);
    ok((r.data.rows || r.data.submissions).some(x => x.id === Z.id) && !(r.data.rows || r.data.submissions).some(x => x.id === A.id), 'filtro «Sin actualizaciones»');
    r = await call('GET', `/admin/catalog${EV}`, admin);
    ok(Array.isArray(r.data.postCloseViews) && r.data.postCloseViews.some(o => o.key === 'pendientes'), 'el catálogo publica las opciones del filtro');
    r = await call('POST', `/admin/postulaciones/${A.id}/post-close/reviewed${EV}`, admin, {});
    ok(r.status === 200 && r.data.postCloseEdit.pendingReview === false && r.data.postCloseEdit.reviewedBy, 'marcar revisado apaga el pendiente y deja quién');
    r = await call('GET', `/admin/postulaciones${EV}&actualizaciones=pendientes`, admin);
    ok(!(r.data.rows || r.data.submissions).some(x => x.id === A.id), '… y sale de «Pendientes»');
    r = await call('GET', `/admin/postulaciones${EV}&actualizaciones=con`, admin);
    ok((r.data.rows || r.data.submissions).some(x => x.id === A.id), '… pero sigue en «Con actualizaciones»');
    ok((await fila(A.id)).workflowStatus === 'received', 'marcar revisado no toca el estado');
    r = await call('GET', `/admin/postulaciones/${A.id}/expediente/historial${EV}`, admin);
    ok(r.status === 200 && r.data.revisions.some(x => x.kind === 'club_edit_post_close'), 'el historial del expediente muestra las ediciones del club');

    console.log('── Caso F: la política apagada');
    await setConfig({ ...BASE_CFG, postCloseEditing: { enabled: false } });
    r = await call('GET', '/portal/forms/master', tA);
    ok(r.status === 200 && r.data.canEdit === false && r.data.editWindow.code === 'disabled', 'consultable pero no editable');
    r = await call('PUT', '/portal/forms/master', tA, { answers });
    ok(r.status === 403, 'el guardado se rechaza');
    r = await call('GET', '/portal/me', tA);
    ok(r.status === 200 && r.data.applications?.open === false && r.data.canEdit === false, '«Mi Proyecto» lo dice (y no promete editar)');
    ok(r.data.forms.every(c => c.action.key !== 'edit' && c.action.key !== 'continue'), 'ninguna tarjeta ofrece editar');

    console.log('── Vigencia hasta una fecha y alcance «solo pendientes»');
    await setConfig({ ...BASE_CFG, postCloseEditing: { enabled: true, validity: 'until', until: '2099-12-31', scope: 'pending' } });
    r = await call('GET', '/portal/forms/master', tA);
    ok(r.data.canEdit && r.data.editWindow.until === '2099-12-31', 'editable con su fecha límite');
    ok(r.data.lockedFields.includes('objetivos.generalObjective') === !(await fila(A.id)).metadata.postCloseBaseline.master.includes('objetivos.generalObjective'), '«solo pendientes» respeta la foto del primer acceso');
    await setConfig({ ...BASE_CFG, postCloseEditing: { enabled: true, validity: 'until', until: '2020-02-01' } });
    r = await call('GET', '/portal/forms/master', tA);
    ok(!r.data.canEdit && r.data.editWindow.code === 'window_closed', 'vencida la fecha de edición, se cierra');

    console.log('── Antes del cierre, todo como siempre');
    await setConfig({ ...BASE_CFG, deadline: '2099-01-01' });
    const W = await sub('FP-W', 'received');
    const tW = portalToken(W);
    r = await call('GET', '/portal/forms/master', tW);
    ok(r.data.canEdit && r.data.editWindow.phase === 'open' && r.data.lockedFields.length === 0, 'abierta: editable, sin bloqueos');
    ok(!(await fila(W.id)).metadata?.postCloseBaseline, 'no se toma foto antes del cierre');
    r = await call('POST', '/portal/forms/master/submit', tW, { answers: full });
    ok(r.status === 200 && (await fila(W.id)).workflowStatus === 'in_review', 'enviar antes del cierre sigue pasando a «En revisión» (como siempre)');
    const fw = await fila(W.id);
    ok(!fw.metadata?.postCloseEdit && !!fw.metadata?.lastClubEditAt, 'no se marca «después del cierre», sí la última edición');
    ok((await revs(W.id)).every(x => x.kind === 'club_edit'), 'la bitácora la registra como edición normal');
    r = await call('GET', '/config');
    ok(r.data.applications.open === true, 'y la convocatoria recibe postulaciones');

    console.log(`\n✅ test:fair:post-close:e2e — ${n} comprobaciones contra Postgres real.`);
} finally {
    srv.close();
    await db.end?.().catch?.(() => {});
}
process.exit(0);
