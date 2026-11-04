#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Programas — de EXTREMO A EXTREMO — v4.1280.0
// PROGRAMAS_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:programas:e2e
//
// Postgres REAL con el controlador real: separación entre distritos y entre
// clubes, transiciones editoriales, conservación de la versión publicada
// mientras se revisa el reemplazo, protección de las solicitudes y sus datos,
// consentimiento independiente de novedades, propagación del contenido
// central a los clubes activos, restricción de los cambios locales y
// visibilidad pública exclusiva de lo autorizado.
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ: exige una base LOCAL y desechable.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const E2E_DB = process.env.PROGRAMAS_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:programas:e2e] Sin PROGRAMAS_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
process.env.DATABASE_URL = E2E_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prueba-local';
process.env.RESEND_API_KEY = '';
process.env.PROGRAMAS_NOTIFY = 'off';

const { default: db } = await import('../server/lib/db.js');
const C = await import('../server/controllers/programController.js');
const S = await import('../server/lib/programStore.js');

let ok = 0; const malos = [];
const check = async (n, fn) => { try { await fn(); ok++; console.log(`  ✓ ${n}`); } catch (e) { malos.push(n); console.log(`  ✗ ${n} — ${e.message}`); } };
const grupo = t => console.log(`\n${t}`);
const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120';

/** Llama a un manejador con una petición simulada y devuelve { status, body }. */
const call = async (handler, { user = null, params = {}, query = {}, body = {}, headers = {}, ip = '10.0.0.1' } = {}) => {
    const req = { user, params, query, body, headers: { 'user-agent': UA, host: 'test.local', ...headers }, ip, method: 'X', originalUrl: '/x' };
    let status = 200; let out = null;
    const res = { status(c) { status = c; return res; }, json(v) { out = v; return res; }, setHeader() {} };
    await handler(req, res);
    return { status, body: out };
};

// ── Base desechable ──
await db.query(`CREATE TABLE IF NOT EXISTS "District" (id TEXT PRIMARY KEY, number INT, subdomain TEXT, domain TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'club', category TEXT DEFAULT 'club', district TEXT, "districtId" TEXT, domain TEXT, subdomain TEXT, status TEXT DEFAULT 'active', "organizationType" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`DELETE FROM "District" WHERE id LIKE 'e2e-%'; DELETE FROM "Club" WHERE id LIKE 'e2e-%'; DELETE FROM "User" WHERE id LIKE 'e2e-%';`);
await db.query(`INSERT INTO "District" (id, number, subdomain) VALUES ('e2e-d4281', 4281, 'd4281'), ('e2e-d4290', 4290, 'd4290')`);
await db.query(`INSERT INTO "Club" (id, name, type, district, "districtId", subdomain) VALUES
    ('e2e-site-4281', 'Distrito 4281', 'district', '4281', 'e2e-d4281', 'rotary4281'),
    ('e2e-site-4290', 'Distrito 4290', 'district', '4290', 'e2e-d4290', 'rotary4290'),
    ('e2e-club-cali', 'Rotary Club Cali', 'club', '4281', 'e2e-d4281', 'cali'),
    ('e2e-club-pasto', 'Rotary Club Pasto', 'club', '4281', 'e2e-d4281', 'pasto'),
    ('e2e-club-bogota', 'Rotary Club Bogotá', 'club', '4290', 'e2e-d4290', 'bogota')`);
await db.query(`INSERT INTO "User" (id, email, name, role, "clubId") VALUES
    ('e2e-u-d4281', 'admin@d4281.org', 'Admin 4281', 'district_admin', 'e2e-site-4281'),
    ('e2e-u-d4290', 'admin@d4290.org', 'Admin 4290', 'district_admin', 'e2e-site-4290'),
    ('e2e-u-cali', 'sec@cali.org', 'Secretaría Cali', 'club_admin', 'e2e-club-cali'),
    ('e2e-u-pasto', 'sec@pasto.org', 'Secretaría Pasto', 'club_admin', 'e2e-club-pasto'),
    ('e2e-u-bogota', 'sec@bogota.org', 'Secretaría Bogotá', 'club_admin', 'e2e-club-bogota'),
    ('e2e-u-medico', 'medico@ponseti.org', 'Dra. Revisora', 'institutional_user', 'e2e-site-4281'),
    ('e2e-u-gestor', 'gestor@ponseti.org', 'Gestor Solicitudes', 'institutional_user', 'e2e-site-4281'),
    ('e2e-u-op', 'op@clubplatform.org', 'Operador', 'superadmin', NULL)`);
await db.query(`DROP TABLE IF EXISTS "Program", "ProgramDistrictLink", "ProgramClubActivation", "ProgramMember", "ProgramContent", "ProgramContentVersion", "ProgramChangeRequest", "ProgramRequest", "ProgramSubscriber", "ProgramFile", "ProgramAuditLog", "ProgramMetricDaily", "ProgramVisitor"`);

const u = async (id) => (await db.query(`SELECT id, email, name, role, "clubId" FROM "User" WHERE id = $1`, [id])).rows[0];
const D4281 = await u('e2e-u-d4281'); const D4290 = await u('e2e-u-d4290'); const CALI = await u('e2e-u-cali'); const PASTO = await u('e2e-u-pasto'); const BOGOTA = await u('e2e-u-bogota');
const MEDICO = await u('e2e-u-medico'); const GESTOR = await u('e2e-u-gestor'); const OP = await u('e2e-u-op');
let programId; let slug = 'clinicas-ponseti-e2e';

grupo('1. Crear y separar entre distritos');
await check('el distrito 4281 crea el programa en borrador con su vinculación', async () => {
    const r = await call(C.adminCreate, { user: D4281, body: { name: 'Clínicas Ponseti E2E', slug, category: 'salud' } });
    assert.equal(r.status, 201, JSON.stringify(r.body)); programId = r.body.program.id;
    assert.equal(r.body.program.status, 'borrador');
    const links = await S.listLinks(programId); assert.equal(links.length, 1); assert.equal(links[0].districtNumber, 4281); assert.equal(links[0].districtClubId, 'e2e-site-4281');
});
await check('un club no crea programas', async () => { const r = await call(C.adminCreate, { user: CALI, body: { name: 'X' } }); assert.equal(r.status, 403); });
await check('el distrito 4290 no ve ni abre el programa', async () => {
    const l = await call(C.adminList, { user: D4290 }); assert.equal(l.body.total, 0);
    const g = await call(C.adminGet, { user: D4290, params: { id: programId } }); assert.equal(g.status, 403);
});
await check('un club de 4281 todavía no lo ve (borrador) y uno de 4290 nunca', async () => {
    assert.equal((await call(C.adminList, { user: CALI })).body.total, 0);
    assert.equal((await call(C.adminGet, { user: BOGOTA, params: { id: programId } })).status, 403);
});
await check('el operador lo ve con todas las capacidades', async () => { const g = await call(C.adminGet, { user: OP, params: { id: programId } }); assert.equal(g.status, 200); assert.ok(g.body.grant.all); });
await check('la página pública no existe mientras es borrador', async () => { const r = await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281' } }); assert.equal(r.status, 404); });

grupo('2. Completar y publicar');
const ficha = {
    name: 'Clínicas Ponseti E2E', slug, category: 'salud', summary: 'Tratamiento del pie equinovaro con el método Ponseti, con orientación a familias.'.padEnd(60, '.'), description: 'd'.repeat(140),
    heroImageUrl: 'https://cdn.example.org/ponseti.jpg', heroImageAlt: 'Equipo Ponseti', governance: { coordinator: { name: 'Coordinadora', email: 'coord@ponseti.org', public: true }, institutionalEmail: 'info@ponseti.org', institutionalEmailPublic: true, lastVerifiedAt: '2026-11-01', lastVerifiedBy: 'Admin 4281', medicalReviewer: { name: 'Dra. Revisora', email: 'medico@ponseti.org' } },
    care: { audience: 'Familias con niños con pie equinovaro', guidancePath: 'Ruta de orientación inicial.', costsText: 'Texto de costos aprobado', costsApproved: true, costsApprovedBy: 'Junta', costsApprovedAt: '2026-11-01' },
    participation: { waysToSupport: 'Formas de apoyar', donationsEnabled: true }, pendingValidation: ['Confirmar número de clínicas'],
};
await check('con pendientes de validación no se publica', async () => {
    const p = await call(C.adminUpdate, { user: D4281, params: { id: programId }, body: ficha }); assert.equal(p.status, 200, JSON.stringify(p.body));
    const s = await call(C.adminStatus, { user: D4281, params: { id: programId }, body: { status: 'activo' } }); assert.equal(s.status, 400); assert.ok(s.body.errors.some(e => e.field === 'pendingValidation'));
});
await check('resueltos los pendientes, se publica (lo hace quien tiene publish)', async () => {
    await call(C.adminUpdate, { user: D4281, params: { id: programId }, body: { ...ficha, pendingValidation: [] } });
    assert.equal((await call(C.adminStatus, { user: CALI, params: { id: programId }, body: { status: 'activo' } })).status, 403);
    const s = await call(C.adminStatus, { user: D4281, params: { id: programId }, body: { status: 'activo' } }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.program.status, 'activo');
});
await check('con el programa activo, el texto clínico no se pisa en caliente', async () => {
    const p = await call(C.adminUpdate, { user: D4281, params: { id: programId }, body: { ...ficha, pendingValidation: [], care: { ...ficha.care, guidancePath: 'Otra ruta' } } });
    assert.equal(p.status, 409); assert.equal(p.body.code, 'CLINICAL_LOCKED');
});
await check('la página pública existe en el sitio del distrito y sin contenido sólo pinta lo que hay', async () => {
    const r = await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281' } }); assert.equal(r.status, 200);
    const keys = r.body.sections.map(s => s.key);
    assert.ok(keys.includes('inicio') && keys.includes('programa') && keys.includes('contacto') && !keys.includes('clinicas') && !keys.includes('historias'));
    assert.equal(r.body.program.contact.email, 'info@ponseti.org'); assert.equal(r.body.program.care.costsText, 'Texto de costos aprobado');
    assert.equal(r.body.link.districtNumber, 4281); assert.equal(r.body.program.requestRouting, undefined);
});
await check('en el sitio de un club NO activado la página no existe', async () => { assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-cali' } })).status, 404); });
await check('la vista previa firmada abre un borrador y una firma falsa no', async () => {
    await S.setProgramStatus(programId, 'borrador', { actor: { id: 'e2e' } });
    const t = await call(C.adminPreviewToken, { user: D4281, params: { id: programId } });
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281', t: t.body.token } })).status, 200);
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281', t: '9999999999999.abc' } })).status, 404);
    await S.setProgramStatus(programId, 'activo', { actor: { id: 'e2e' } });
});

grupo('3. Activación por clubes');
let actCali; let actPasto;
await check('Cali (4281) activa; Bogotá (4290) no puede', async () => {
    const a = await call(C.adminActivateClub, { user: CALI, params: { id: programId }, body: { localContact: { name: 'Contacto Cali', email: 'c@cali.org', public: true }, localNote: 'Nota local de Cali' } });
    assert.equal(a.status, 201, JSON.stringify(a.body)); actCali = a.body.activation; assert.equal(actCali.clubName, 'Rotary Club Cali');
    assert.equal((await call(C.adminActivateClub, { user: BOGOTA, params: { id: programId }, body: {} })).status, 403);
    const p = await call(C.adminActivateClub, { user: PASTO, params: { id: programId }, body: {} }); assert.equal(p.status, 201); actPasto = p.body.activation;
});
await check('ahora el programa aparece en el catálogo y la página del sitio de Cali, con su contacto local', async () => {
    const cat = await call(C.publicCatalog, { query: { clubId: 'e2e-club-cali' } }); assert.equal(cat.body.programs.length, 1);
    const r = await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-cali' } }); assert.equal(r.status, 200);
    assert.equal(r.body.activation.clubName, 'Rotary Club Cali'); assert.equal(r.body.activation.localContact.email, 'c@cali.org');
    assert.equal((await S.programsNavFor('e2e-club-cali')).count, 1); assert.equal((await S.programsNavFor('e2e-club-bogota')).count, 0);
});
await check('el distrito ve las dos activaciones; Cali sólo la suya', async () => {
    assert.equal((await call(C.adminListClubs, { user: D4281, params: { id: programId } })).body.activations.length, 2);
    const c = await call(C.adminListClubs, { user: CALI, params: { id: programId } }); assert.equal(c.body.activations.length, 1); assert.equal(c.body.activations[0].clubId, 'e2e-club-cali');
});
await check('Cali no toca la activación de Pasto', async () => {
    assert.equal((await call(C.adminUpdateActivation, { user: CALI, params: { id: programId, activationId: actPasto.id }, body: { localNote: 'hack' } })).status, 403);
    assert.equal((await call(C.adminDeactivateClub, { user: CALI, params: { id: programId, activationId: actPasto.id }, body: {} })).status, 403);
});

grupo('4. Flujo editorial: contenido central con revisión médica');
let reqClinica;
await check('Cali no propone una clínica ni información institucional; sí equipo local', async () => {
    const base = { scopeType: 'club', clubActivationId: actCali.id, title: 'Propuesta local', responsibleName: 'Sec', responsibleEmail: 'sec@cali.org', submit: true };
    assert.equal((await call(C.adminCreateChange, { user: CALI, params: { id: programId }, body: { ...base, kind: 'clinic', payload: { name: 'Clínica X', city: 'Cali', region: 'Valle', verifiedAt: '2026-10-01', verifiedBy: 'x' }, authorizations: { sourceVerified: true } } })).status, 403);
    assert.equal((await call(C.adminCreateChange, { user: CALI, params: { id: programId }, body: { ...base, kind: 'team', scopeType: 'central', clubActivationId: null, payload: { name: 'Alguien', role: 'Voluntario', publishAuthorized: true }, authorizations: { imageRights: true } } })).status, 403);
    assert.equal((await call(C.adminCreateChange, { user: CALI, params: { id: programId }, body: { ...base, kind: 'team', scopeType: 'club', clubActivationId: actPasto.id, payload: { name: 'Alguien', role: 'Voluntario', publishAuthorized: true }, authorizations: { imageRights: true } } })).status, 403);
    const r = await call(C.adminCreateChange, { user: CALI, params: { id: programId }, body: { ...base, kind: 'team', payload: { name: 'Voluntaria Cali', role: 'Voluntaria', publishAuthorized: true }, authorizations: { imageRights: true } } });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.request.status, 'enviado'); assert.equal(r.body.request.requiresMedicalReview, false);
});
await check('el distrito envía una clínica con condiciones de atención → requiere revisión médica', async () => {
    const r = await call(C.adminCreateChange, { user: D4281, params: { id: programId }, body: { kind: 'clinic', operation: 'crear', scopeType: 'central', title: 'Clínica Hospital Universitario', responsibleName: 'Admin', responsibleEmail: 'admin@d4281.org', submit: true,
        payload: { name: 'Hospital Universitario', institution: 'HUV', city: 'Cali', region: 'Valle del Cauca', phone: '602 555', careConditions: 'Se atiende con remisión', verifiedAt: '2026-10-01', verifiedBy: 'Admin', internal: { phone: '300 interno', notes: 'nota interna' } }, authorizations: { sourceVerified: true } } });
    assert.equal(r.status, 201, JSON.stringify(r.body)); reqClinica = r.body.request; assert.equal(reqClinica.requiresMedicalReview, true); assert.match(reqClinica.publicRef, /^PC-\d{4}-/);
});
await check('un borrador se guarda incompleto y se retoma', async () => {
    const r = await call(C.adminCreateChange, { user: D4281, params: { id: programId }, body: { kind: 'story', title: 'Historia a medias', submit: false } });
    assert.equal(r.status, 201); assert.equal(r.body.request.status, 'borrador');
    const g = await call(C.adminGetChange, { user: D4281, params: { id: programId, reqId: r.body.request.id } }); assert.ok(g.body.canEdit);
    const a = await call(C.adminTransitionChange, { user: D4281, params: { id: programId, reqId: r.body.request.id }, body: { to: 'archivado', reason: 'No va' } }); assert.equal(a.status, 200);
});
await check('sin aprobación médica no se aprueba ni se publica', async () => {
    assert.equal((await call(C.adminTransitionChange, { user: D4281, params: { id: programId, reqId: reqClinica.id }, body: { to: 'aprobado' } })).status, 409);
    assert.equal((await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: reqClinica.id } })).status, 409);
});
await check('el administrador distrital no es revisor médico; el perfil lo es', async () => {
    assert.equal((await call(C.adminMedicalReview, { user: D4281, params: { id: programId, reqId: reqClinica.id }, body: { approved: true } })).status, 403);
    const m = await call(C.adminUpsertMember, { user: D4281, params: { id: programId }, body: { email: 'medico@ponseti.org', roles: ['revisor_medico'], scopeType: 'central' } }); assert.equal(m.status, 200);
    const r = await call(C.adminMedicalReview, { user: MEDICO, params: { id: programId, reqId: reqClinica.id }, body: { approved: true, note: 'Conforme' } }); assert.equal(r.status, 200); assert.ok(r.body.request.medicalReviewedAt);
    assert.equal((await call(C.adminTransitionChange, { user: MEDICO, params: { id: programId, reqId: reqClinica.id }, body: { to: 'aprobado' } })).status, 403);
});
await check('Cali no ve la solicitud central del distrito; sí la suya', async () => {
    assert.equal((await call(C.adminGetChange, { user: CALI, params: { id: programId, reqId: reqClinica.id } })).status, 403);
    const l = await call(C.adminListChanges, { user: CALI, params: { id: programId } }); assert.equal(l.body.total, 1); assert.equal(l.body.rows[0].title, 'Propuesta local');
});
await check('ajustes exigen motivo y vuelven a quien envió; reenviar vuelve a «Enviado»', async () => {
    assert.equal((await call(C.adminTransitionChange, { user: D4281, params: { id: programId, reqId: reqClinica.id }, body: { to: 'ajustes', reason: '' } })).status, 400);
    const a = await call(C.adminTransitionChange, { user: D4281, params: { id: programId, reqId: reqClinica.id }, body: { to: 'ajustes', reason: 'Falta el horario' } }); assert.equal(a.body.request.status, 'ajustes');
    const e = await call(C.adminUpdateChange, { user: D4281, params: { id: programId, reqId: reqClinica.id }, body: { payload: { ...reqClinica.payload, schedule: 'L-V 8-12' }, submit: true } });
    assert.equal(e.status, 200, JSON.stringify(e.body)); assert.equal(e.body.request.status, 'enviado'); assert.equal(e.body.request.payload.schedule, 'L-V 8-12');
    assert.ok(e.body.request.medicalReviewedAt, 'la aprobación médica se conserva al reenviar con ajustes');
});
await check('aprobar y publicar: el registro existe y lo interno no sale al público', async () => {
    const ap = await call(C.adminTransitionChange, { user: D4281, params: { id: programId, reqId: reqClinica.id }, body: { to: 'aprobado' } }); assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281' } })).body.content.clinic.length, 0, 'aprobado no es publicado');
    const pub = await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: reqClinica.id } }); assert.equal(pub.status, 200, JSON.stringify(pub.body)); assert.equal(pub.body.request.status, 'publicado');
    const r = await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281' } });
    assert.equal(r.body.content.clinic.length, 1); assert.equal(r.body.content.clinic[0].name, 'Hospital Universitario'); assert.ok(r.body.sections.some(s => s.key === 'clinicas'));
    assert.ok(!JSON.stringify(r.body).includes('nota interna') && !JSON.stringify(r.body).includes('300 interno'));
    assert.deepEqual(r.body.clinicFacets, [{ region: 'Valle del Cauca', cities: ['Cali'] }]);
});
let clinicId;
await check('el contenido central llega a Cali y a Pasto sin copiarse (una sola fila)', async () => {
    const c = await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-cali' } }); const p = await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-pasto' } });
    assert.equal(c.body.content.clinic.length, 1); assert.equal(p.body.content.clinic.length, 1); clinicId = c.body.content.clinic[0].id;
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramContent" WHERE kind = 'clinic'`)).rows[0].n, 1);
});

grupo('5. La versión publicada se conserva mientras se revisa el reemplazo');
let reqUpd;
await check('una actualización enviada no cambia lo publicado', async () => {
    const r = await call(C.adminCreateChange, { user: D4281, params: { id: programId }, body: { kind: 'clinic', operation: 'actualizar', contentId: clinicId, scopeType: 'central', title: 'Nuevo teléfono', responsibleName: 'Admin', responsibleEmail: 'admin@d4281.org', submit: true,
        payload: { ...reqClinica.payload, schedule: 'L-V 8-12', phone: '602 999', careConditions: 'Se atiende con remisión' }, authorizations: { sourceVerified: true } } });
    assert.equal(r.status, 201, JSON.stringify(r.body)); reqUpd = r.body.request;
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281' } })).body.content.clinic[0].phone, '602 555');
});
await check('editar una solicitud aprobada invalida la aprobación (vuelve a revisión, nunca en silencio)', async () => {
    await call(C.adminMedicalReview, { user: MEDICO, params: { id: programId, reqId: reqUpd.id }, body: { approved: true } });
    const ap = await call(C.adminTransitionChange, { user: D4281, params: { id: programId, reqId: reqUpd.id }, body: { to: 'aprobado' } }); assert.equal(ap.status, 200, JSON.stringify(ap.body));
    const e = await call(C.adminUpdateChange, { user: D4281, params: { id: programId, reqId: reqUpd.id }, body: { payload: { ...reqUpd.payload, phone: '602 777' } } });
    assert.equal(e.status, 200); assert.equal(e.body.approvalInvalidated, true); assert.equal(e.body.request.status, 'en_revision'); assert.equal(e.body.request.approvedAt, null);
    assert.equal(e.body.request.medicalReviewedAt, null, 'un cambio tras la aprobación también retira la aprobación médica');
    assert.equal((await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: reqUpd.id } })).status, 409);
});
await check('re-aprobada y publicada, el registro pasa a v2 y la página muestra el nuevo dato', async () => {
    await call(C.adminMedicalReview, { user: MEDICO, params: { id: programId, reqId: reqUpd.id }, body: { approved: true } });
    const pub = await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: reqUpd.id } }); assert.equal(pub.status, 200, JSON.stringify(pub.body)); assert.equal(pub.body.request.resultVersion, 2);
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-pasto' } })).body.content.clinic[0].phone, '602 777');
    assert.equal((await S.contentVersions(clinicId)).length, 2);
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramContent" WHERE kind = 'clinic'`)).rows[0].n, 1);
});
await check('retirar: el registro se archiva y desaparece de todos los sitios', async () => {
    const r = await call(C.adminCreateChange, { user: D4281, params: { id: programId }, body: { kind: 'clinic', operation: 'retirar', contentId: clinicId, scopeType: 'central', title: 'Retirar clínica', responsibleName: 'Admin', responsibleEmail: 'admin@d4281.org', submit: true, payload: { reason: 'La clínica cerró el servicio' } } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pub = await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: r.body.request.id } }); assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-cali' } })).body.content.clinic.length, 0);
    assert.equal((await S.getContent(clinicId)).status, 'archivado');
});

grupo('6. Contenido local: sólo en el club que lo propuso');
await check('publicado el equipo local de Cali, lo ve Cali y no Pasto ni el distrito', async () => {
    const l = await call(C.adminListChanges, { user: D4281, params: { id: programId }, query: { kind: 'team' } }); const id = l.body.rows[0].id;
    const pub = await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: id } }); assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-cali' } })).body.content.team.length, 1);
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-pasto' } })).body.content.team.length, 0);
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281' } })).body.content.team.length, 0);
});
await check('Pasto no lista ni abre el contenido local de Cali', async () => {
    const l = await call(C.adminListContent, { user: PASTO, params: { id: programId }, query: { kind: 'team' } }); assert.equal(l.body.rows.length, 0);
    const teamId = (await db.query(`SELECT id FROM "ProgramContent" WHERE kind = 'team'`)).rows[0].id;
    assert.equal((await call(C.adminGetContent, { user: PASTO, params: { id: programId, contentId: teamId } })).status, 403);
    assert.equal((await call(C.adminGetContent, { user: CALI, params: { id: programId, contentId: teamId } })).status, 200);
});
await check('una persona sin autorización de publicación no se ve aunque esté publicada', async () => {
    await db.query(`UPDATE "ProgramContent" SET data = data || '{"publishAuthorized": false}'::jsonb WHERE kind = 'team'`);
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-cali' } })).body.content.team.length, 0);
});
await check('desactivada la participación de Cali, su sitio deja de mostrar el programa', async () => {
    const d = await call(C.adminDeactivateClub, { user: CALI, params: { id: programId, activationId: actCali.id }, body: { reason: 'Pausa' } }); assert.equal(d.status, 200);
    assert.equal((await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-cali' } })).status, 404);
    assert.equal((await call(C.adminCreateChange, { user: CALI, params: { id: programId }, body: { kind: 'team', scopeType: 'club', clubActivationId: actCali.id, title: 'Otra persona', responsibleName: 'S', responsibleEmail: 's@cali.org', submit: true, payload: { name: 'X', role: 'Y' }, authorizations: { imageRights: true } } })).status, 403);
    await call(C.adminActivateClub, { user: CALI, params: { id: programId }, body: {} });
});

grupo('7. Solicitudes públicas');
let refOri;
await check('orientación desde el sitio de Pasto: se guarda sin los campos prohibidos y se atribuye al club', async () => {
    const r = await call(C.publicSubmitRequest, { params: { slug }, query: { clubId: 'e2e-club-pasto' }, body: { type: 'orientacion', adultName: 'María López', city: 'Pasto', contactMeans: 'whatsapp', phone: '+57 300 123 4567', reason: 'Mi bebé nació con pie equinovaro y no sé a dónde ir', dataConsent: true, historiaClinica: 'detalle', fotos: ['x'] } });
    assert.equal(r.status, 201, JSON.stringify(r.body)); refOri = r.body.receipt.publicRef; assert.match(refOri, /^SP-/);
    const row = await S.getPublicRequest(refOri); assert.equal(row.originClubId, 'e2e-club-pasto'); assert.equal(row.originActivationId, actPasto.id); assert.equal(row.data.historiaClinica, undefined); assert.equal(row.data.fotos, undefined);
    assert.equal(row.status, 'nueva');
});
await check('sin consentimiento o con la trampa para bots no entra nada', async () => {
    assert.equal((await call(C.publicSubmitRequest, { params: { slug }, body: { type: 'apoyo', contactName: 'Luis', email: 'l@x.org', supportType: 'donacion' } })).status, 400);
    const bot = await call(C.publicSubmitRequest, { params: { slug }, body: { type: 'apoyo', contactName: 'Bot', email: 'b@x.org', supportType: 'donacion', dataConsent: true, website_url: 'http://spam' } });
    assert.equal(bot.status, 200); assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramRequest" WHERE type = 'apoyo'`)).rows[0].n, 0);
});
await check('quien pide orientación NO queda suscrito; novedades es aparte y con su consentimiento', async () => {
    assert.equal(await S.subscriberCount(programId), 0);
    assert.equal((await call(C.publicSubscribe, { params: { slug }, body: { name: 'Ana', email: 'ana@x.org' } })).status, 400);
    assert.equal((await call(C.publicSubscribe, { params: { slug }, body: { name: 'Ana', email: 'ana@x.org', newsletterConsent: true } })).status, 201);
    assert.equal(await S.subscriberCount(programId), 1);
});
await check('la consulta pública de estado sólo devuelve referencia, tipo y estado', async () => {
    const r = await call(C.publicRequestStatus, { params: { slug, ref: refOri } }); assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['publicRef', 'receivedAt', 'status', 'statusLabel', 'type']);
});
await check('Pasto (club de origen) ve referencia y estado, nunca los datos de la familia', async () => {
    const r = await call(C.adminListRequests, { user: PASTO, params: { id: programId } }); assert.equal(r.body.mode, 'origin'); assert.equal(r.body.rows.length, 1);
    assert.ok(!JSON.stringify(r.body).includes('María') && !JSON.stringify(r.body).includes('4567'));
    assert.equal((await call(C.adminGetRequest, { user: PASTO, params: { id: programId, reqId: refOri } })).status, 403);
    assert.equal((await call(C.adminListRequests, { user: CALI, params: { id: programId } })).body.rows.length, 0, 'Cali no ve lo de Pasto');
});
await check('el gestor de solicitudes (perfil) sí los ve; asignar, contactar y cerrar quedan en el historial', async () => {
    await call(C.adminUpsertMember, { user: D4281, params: { id: programId }, body: { email: 'gestor@ponseti.org', roles: ['gestor_solicitudes'], scopeType: 'central' } });
    const g = await call(C.adminGetRequest, { user: GESTOR, params: { id: programId, reqId: refOri } }); assert.equal(g.status, 200); assert.equal(g.body.request.data.adultName, 'María López');
    assert.equal((await call(C.adminGetRequest, { user: MEDICO, params: { id: programId, reqId: refOri } })).status, 403, 'el revisor médico no ve solicitudes');
    const a = await call(C.adminAssignRequest, { user: GESTOR, params: { id: programId, reqId: refOri }, body: { assignToMe: true } }); assert.equal(a.body.request.status, 'asignada'); assert.equal(a.body.request.assigneeUserId, 'e2e-u-gestor');
    const c = await call(C.adminTransitionRequest, { user: GESTOR, params: { id: programId, reqId: refOri }, body: { to: 'en_contacto' } }); assert.ok(c.body.request.firstContactAt);
    assert.equal((await call(C.adminTransitionRequest, { user: GESTOR, params: { id: programId, reqId: refOri }, body: { to: 'cerrada', reason: '' } })).status, 400);
    const z = await call(C.adminTransitionRequest, { user: GESTOR, params: { id: programId, reqId: refOri }, body: { to: 'cerrada', reason: 'Orientada y remitida' } }); assert.equal(z.body.request.status, 'cerrada'); assert.equal(z.body.request.history.length, 4);
});
await check('la asignación automática por tipo deja la solicitud «Asignada» al llegar', async () => {
    const cur = await S.getProgram(programId);
    await S.updateProgram(programId, (await import('../server/lib/programSpec.js')).shapeProgram({ ...cur, requestRouting: { apoyo: { assigneeUserId: 'e2e-u-gestor', assigneeName: 'Gestor Solicitudes' } } }), { actor: { id: 'e2e' } });
    const r = await call(C.publicSubmitRequest, { params: { slug }, query: { clubId: 'e2e-site-4281' }, body: { type: 'apoyo', contactName: 'Luis', email: 'l@x.org', supportType: 'empresa', entityKind: 'empresa', organization: 'ACME', dataConsent: true } });
    assert.equal(r.status, 201); assert.equal((await S.getPublicRequest(r.body.receipt.publicRef)).status, 'asignada');
});
await check('la auditoría registra la consulta de datos y nunca los datos', async () => {
    const a = await S.auditList(programId, { entityType: 'public_request' });
    assert.ok(a.rows.some(r => r.action === 'viewed')); assert.ok(!JSON.stringify(a.rows).includes('María'));
});

grupo('8. Métricas, donación por enlace y auditoría');
await check('las visitas y los clics se agregan por día sin IP; una vista previa no cuenta', async () => {
    const antes = (await S.metricsSummary(programId)).totals.find(t => t.metric === 'view')?.total || 0;
    await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-pasto' }, ip: '1.1.1.1' });
    await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-pasto' }, ip: '1.1.1.1' });
    await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-pasto' }, headers: { 'user-agent': 'Googlebot/2.1' } });
    const t = await call(C.adminPreviewToken, { user: D4281, params: { id: programId } });
    await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-club-pasto', t: t.body.token } });
    await call(C.publicMetric, { params: { slug }, query: { clubId: 'e2e-club-pasto' }, body: { metric: 'donation_click' } });
    assert.equal((await call(C.publicMetric, { params: { slug }, body: { metric: 'view' } })).status, 400);
    const m = await S.metricsSummary(programId);
    assert.equal((m.totals.find(x => x.metric === 'view')?.total || 0) - antes, 2, `antes=${antes} totals=${JSON.stringify(m.totals)}`); assert.equal(m.totals.find(x => x.metric === 'donation_click')?.total, 1);
    assert.equal(m.totals.find(x => x.metric === 'form_orientacion')?.total, 1); assert.equal(m.activeClubs, 2);
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM "ProgramVisitor" WHERE "visitorKey" LIKE '%1.1.1.1%'`)).rows[0].n, 0);
});
await check('un enlace de donación sin verificación no se publica; con ella, sale con receptor y aviso', async () => {
    const r = await call(C.adminCreateChange, { user: D4281, params: { id: programId }, body: { kind: 'donation', operation: 'crear', scopeType: 'central', title: 'Donar a la fundación', responsibleName: 'Admin', responsibleEmail: 'admin@d4281.org', submit: true, payload: { buttonLabel: 'Donar', url: 'https://fundacion.org/donar', receiver: 'Fundación Ponseti', purpose: 'Pasajes de familias', disclaimer: 'Texto aprobado' }, authorizations: { sourceVerified: true } } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: r.body.request.id } })).status, 400);
    const e = await call(C.adminUpdateChange, { user: D4281, params: { id: programId, reqId: r.body.request.id }, body: { payload: { ...r.body.request.payload, verifiedBy: 'Tesorería', verifiedAt: '2026-11-01' } } }); assert.equal(e.status, 200);
    const p = await call(C.adminPublishChange, { user: D4281, params: { id: programId, reqId: r.body.request.id } }); assert.equal(p.status, 200, JSON.stringify(p.body));
    const pub = await call(C.publicProgram, { params: { slug }, query: { clubId: 'e2e-site-4281' } });
    assert.equal(pub.body.content.donation[0].receiver, 'Fundación Ponseti'); assert.ok(pub.body.sections.some(s => s.key === 'ayudar'));
});
await check('el historial del programa recoge todo, por entidad, con paginación', async () => {
    const a = await call(C.adminAudit, { user: D4281, params: { id: programId }, query: { perPage: 10 } }); assert.equal(a.status, 200); assert.ok(a.body.total > 20); assert.equal(a.body.rows.length, 10);
    assert.equal((await call(C.adminAudit, { user: CALI, params: { id: programId } })).status, 403);
    const n = await call(C.adminAudit, { user: D4281, params: { id: programId }, query: { entityType: 'notification' } }); assert.ok(n.body.rows.every(r => r.action === 'notification:skipped'), 'sin proveedor de correo no se simula ningún envío');
});
await check('el operador lista todo; el distrito, lo suyo; el responsable con perfil, su programa', async () => {
    assert.equal((await call(C.adminList, { user: OP })).body.total, 1);
    assert.equal((await call(C.adminList, { user: D4281 })).body.total, 1);
    assert.equal((await call(C.adminList, { user: GESTOR })).body.total, 1);
    assert.equal((await call(C.adminList, { user: BOGOTA })).body.total, 0);
});

await db.end?.().catch(() => {});
await db.pool?.end?.().catch(() => {});
console.log(`\n${malos.length ? '❌' : '✅'} test:programas:e2e — ${ok} comprobaciones OK${malos.length ? `, ${malos.length} fallidas:\n   · ${malos.join('\n   · ')}` : ''}`);
process.exit(malos.length ? 1 : 0);
