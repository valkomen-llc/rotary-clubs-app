// ════════════════════════════════════════════════════════════════════
// test:fair:users:e2e — Usuarios de la Feria de punta a punta (v4.1342).
// Rutas reales de Express contra un Postgres LOCAL y desechable:
//
//   FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:users:e2e
//
// ⚠️ ESCRIBE EN LA BASE QUE SE LE DÉ. No lee DATABASE_URL: exige
// FAIR_E2E_DATABASE_URL apuntando a localhost, y una base VACÍA y desechable.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('[test:fair:users:e2e] Sin FAIR_E2E_DATABASE_URL local: se omite (nunca corre contra una base remota).');
    process.exit(0);
}
process.env.DATABASE_URL = E2E_DB;
const require = createRequire(`${REPO}/package.json`);
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { default: db } = await import(`${REPO}/server/lib/db.js`);

await db.query(`CREATE TABLE IF NOT EXISTS "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, slug TEXT, "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ, location TEXT, image TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
await db.query(`INSERT INTO "CalendarEvent" (id, title, slug) VALUES ('evt-xii','XII Feria','xii'), ('evt-xi','XI Feria','xi') ON CONFLICT DO NOTHING`);

const { default: router } = await import(`${REPO}/server/routes/project-fair.js`);
const { ensureTables } = await import(`${REPO}/server/controllers/projectFairController.js`);
const { ensureEventRegistrationSchema } = await import(`${REPO}/server/lib/ensureEventRegistrationSchema.js`);
const { authenticateAttendee } = await import(`${REPO}/server/controllers/eventAttendeeController.js`);
await ensureTables();
await ensureEventRegistrationSchema();
await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('edition:evt-xii','evt-xii', $1::jsonb)
    ON CONFLICT ("eventId") WHERE "eventId" IS NOT NULL DO UPDATE SET config = $1::jsonb`,
[JSON.stringify({ deadline: '2026-11-09', access: { reviewers: ['revisora@feria.org'] } })]);

const OLD = 'ClaveVieja2026';
const sub = async (ref, email, eventId, first, last) => (await db.query(`
    INSERT INTO "ProjectFairSubmission" ("publicRef", "eventId", "firstName", "lastName", email, "clubName", district, "projectName", "workflowStatus", status, phone, "focusArea", "amountCop", "projectIndex")
    VALUES ($1,$2,$3,$4,$5,'Cali','4281',$6,'received','paid','+57 3126198537','salud',250000,1) RETURNING *`,
[ref, eventId, first, last, email, `Proyecto ${ref}`])).rows[0];
const account = async (s) => (await db.query(`
    INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName") VALUES ($1,$2,$3,'Cali') RETURNING *`,
[s.id, s.email, await bcrypt.hash(OLD, 10)])).rows[0];

const M = await sub('FP-J2WJZQ', 'mgaitanr77@gmail.com', 'evt-xii', 'Mónica', 'Gaitán');
const accM = await account(M);
const O = await sub('FP-OTRA', 'otra@club.org', 'evt-xi', 'Otra', 'Edición');
const accO = await account(O);
// Asistentes: uno propio y uno VINCULADO al gestor.
const att = (await db.query(`INSERT INTO "EventAttendeeAccount" (email, "passwordHash", "firstName", "lastName", status) VALUES ('asistente@club.org', $1, 'Ana', 'Asistente', 'active') RETURNING *`, [await bcrypt.hash(OLD, 10)])).rows[0];
const linked = (await db.query(`INSERT INTO "EventAttendeeAccount" (email, "passwordHash", "firstName", "lastName", status, "linkedRealm", "linkedId") VALUES ('vinculada@club.org', '!', 'Vera', 'Vinculada', 'active', 'portal', $1) RETURNING *`, [accM.id])).rows[0];
for (const a of [att, linked]) {
    await db.query(`INSERT INTO "EventRegistration" ("eventId", email, "firstName", "lastName", "accountId", status, "clubName") VALUES ('evt-xii', $1, $2, $3, $4, 'confirmed', 'Cali')`, [a.email, a.firstName, a.lastName, a.id]);
}

const app = express();
app.use('/api/project-fair', router);
const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API = `http://127.0.0.1:${srv.address().port}/api/project-fair`;
const SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const admin = jwt.sign({ id: 'u-admin', email: 'admin@feria.org', role: 'administrator', clubId: 'c1' }, SECRET);
const reviewer = jwt.sign({ id: 'u-rev', email: 'revisora@feria.org', role: 'club_admin', clubId: 'otro-club' }, SECRET);
const EV = '?evento=evt-xii';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const call = async (method, path, token, body) => {
    const r = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: 'https://feria.test' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
};
const login = (email, password) => call('POST', '/portal/login', null, { email, password });

try {
    console.log('── El listado de la edición');
    let r = await call('GET', `/admin/usuarios${EV}`, admin);
    ok(r.status === 200, 'el comité (admin) abre «Usuarios»');
    const emails = r.data.users.map(u => u.email);
    ok(emails.includes('mgaitanr77@gmail.com') && emails.includes('asistente@club.org') && emails.includes('vinculada@club.org'), 'gestores y asistentes de la edición');
    ok(!emails.includes('otra@club.org'), 'no aparecen cuentas de OTRA edición');
    ok(r.data.counts.project === 1 && r.data.counts.attendee === 2, 'cuenta por tipo');
    r = await call('GET', `/admin/usuarios${EV}&q=gaitan`, admin);
    ok(r.data.users.length === 1 && r.data.users[0].email === 'mgaitanr77@gmail.com', 'buscar «gaitan» (sin tilde) encuentra a Mónica Gaitán');
    r = await call('GET', `/admin/usuarios${EV}&q=${encodeURIComponent('MÓNICA')}`, admin);
    ok(r.data.users.length === 1 && r.data.users[0].name === 'Mónica Gaitán', '«MÓNICA» también (sin mayúsculas ni tildes)');
    r = await call('GET', `/admin/usuarios${EV}&q=${encodeURIComponent("o'brien%_\\")}`, admin);
    ok(r.status === 200 && r.data.users.length === 0, 'una búsqueda con comillas o comodines no rompe ni trae todo');
    r = await call('GET', `/admin/usuarios${EV}&q=Gait`, admin);
    ok(r.data.users.length === 1 && r.data.users[0].name === 'Mónica Gaitán' && r.data.users[0].projects[0].publicRef === 'FP-J2WJZQ', 'buscar por nombre trae su perfil y su proyecto');
    r = await call('GET', `/admin/usuarios${EV}&tipo=attendee`, admin);
    ok(r.data.users.every(u => u.realm === 'attendee'), 'filtro por tipo');
    const vincRow = r.data.users.find(u => u.email === 'vinculada@club.org');
    ok(vincRow.access.key === 'linked' && !vincRow.canSetPassword, 'el asistente vinculado se ve como «Vinculada» y sin asignar contraseña');
    ok(!JSON.stringify(r.data).includes('passwordHash') && !JSON.stringify(r.data).includes('$2'), 'el listado no expone hashes');

    console.log('── Permisos');
    r = await call('GET', `/admin/usuarios${EV}`, reviewer);
    ok(r.status === 403, 'otro perfil no ve «Usuarios»');
    r = await call('POST', `/admin/usuarios/project/${accM.id}/password${EV}`, reviewer, { password: 'Intento2026' });
    ok(r.status === 403, '… ni cambia contraseñas');
    r = await call('GET', `/admin/usuarios${EV}`, null);
    ok(r.status === 401, 'sin sesión, nada');
    r = await call('POST', `/admin/usuarios/project/${accO.id}/password${EV}`, admin, { password: 'Intento2026' });
    ok(r.status === 404, 'una cuenta de otra edición no se toca desde esta');

    console.log('── Caso Mónica Gaitán: el comité le asigna una contraseña');
    r = await call('POST', `/admin/usuarios/project/${accM.id}/password${EV}`, admin, { password: 'corta' });
    ok(r.status === 400 && /8 caracteres/.test(r.data.error), 'una contraseña corta se rechaza');
    r = await call('POST', `/admin/usuarios/project/${accM.id}/password${EV}`, admin, { password: 'mgaitanr77@gmail.com' });
    ok(r.status === 400, 'el correo como contraseña se rechaza');
    r = await call('POST', `/admin/usuarios/project/${accM.id}/password${EV}`, admin, { password: 'FeriaCali2026' });
    ok(r.status === 200 && r.data.password === null, 'escrita por el comité: se guarda y no se devuelve');
    ok((await login('mgaitanr77@gmail.com', 'FeriaCali2026')).status === 200, 'Mónica entra con la contraseña nueva');
    ok((await login('mgaitanr77@gmail.com', OLD)).status === 401, 'la anterior ya no sirve');
    const stored = (await db.query('SELECT "passwordHash" FROM "ProjectFairAccount" WHERE id = $1', [accM.id])).rows[0].passwordHash;
    ok(stored.startsWith('$2') && !stored.includes('FeriaCali2026'), 'en la base sólo hay un hash bcrypt');

    r = await call('POST', `/admin/usuarios/project/${accM.id}/password${EV}`, admin, { generate: true });
    ok(r.status === 200 && typeof r.data.password === 'string' && r.data.password.length >= 12, 'generada: vuelve UNA vez para copiarla');
    const generated = r.data.password;
    ok((await login('mgaitanr77@gmail.com', generated)).status === 200, 'y con ella se entra');

    const logRows = (await db.query('SELECT * FROM "FairUserAccessLog" WHERE "accountId" = $1', [accM.id])).rows;
    ok(logRows.length === 2 && logRows.every(x => x.action === 'password_set' && x.actorEmail === 'admin@feria.org'), 'cada cambio queda en la bitácora con quién lo hizo');
    ok(!JSON.stringify(logRows).includes(generated) && !JSON.stringify(logRows).includes('FeriaCali2026'), 'la bitácora NO guarda la contraseña');
    const timeline = (await db.query(`SELECT * FROM "ProjectFairEvent" WHERE "submissionId" = $1 AND type = 'account_password_set'`, [M.id])).rows;
    ok(timeline.length === 2, 'y aparece en la línea de tiempo del proyecto');

    console.log('── Enlace de restablecimiento para mandar por WhatsApp');
    r = await call('POST', `/admin/usuarios/project/${accM.id}/reset-link${EV}`, admin, { sendEmail: false });
    ok(r.status === 200 && /^https:\/\/feria\.test\/mi-proyecto\?reset=/.test(r.data.link) && r.data.expiresInHours === 24, 'el enlace abre /mi-proyecto en el sitio de la Feria y dura 24 horas');
    const token = decodeURIComponent(r.data.link.split('reset=')[1]);
    r = await call('POST', '/portal/reset', null, { token, password: 'MiPropia2026' });
    ok(r.status === 200 && !!r.data.token, 'la persona crea su contraseña con el enlace');
    ok((await login('mgaitanr77@gmail.com', 'MiPropia2026')).status === 200, 'y entra con ella');
    r = await call('POST', '/portal/reset', null, { token, password: 'OtraVez2026' });
    ok(r.status === 400, 'el enlace sirve una sola vez');
    r = await call('POST', `/admin/usuarios/project/${accM.id}/reset-link${EV}`, admin, { sendEmail: false });
    const pendiente = decodeURIComponent(r.data.link.split('reset=')[1]);
    await call('POST', `/admin/usuarios/project/${accM.id}/password${EV}`, admin, { password: 'FeriaCali2027' });
    r = await call('POST', '/portal/reset', null, { token: pendiente, password: 'Tarde2026x' });
    ok(r.status === 400, 'asignar una contraseña invalida el enlace que estaba pendiente');

    console.log('── Asistentes al evento');
    r = await call('POST', `/admin/usuarios/attendee/${linked.id}/password${EV}`, admin, { password: 'Vinculada2026' });
    ok(r.status === 409 && r.data.code === 'linked_account', 'a la cuenta vinculada no se le crea una segunda clave');
    r = await call('POST', `/admin/usuarios/attendee/${att.id}/password${EV}`, admin, { password: 'Asistente2026' });
    ok(r.status === 200, 'al asistente sí');
    ok((await authenticateAttendee('asistente@club.org', 'Asistente2026')).ok === true, 'y entra a /mi-inscripcion con ella');
    r = await call('GET', `/admin/usuarios/attendee/${att.id}${EV}`, admin);
    ok(r.status === 200 && r.data.history[0]?.action === 'password_set' && r.data.user.registrations.length === 1, 'su ficha muestra la inscripción y el historial');
    r = await call('GET', `/admin/usuarios/attendee/${linked.id}${EV}`, admin);
    ok(r.data.user.linkedTo?.id === accM.id, 'la vinculada lleva a su cuenta de origen');

    console.log('── El correo, cuando se pide, informa si salió');
    r = await call('POST', `/admin/usuarios/project/${accM.id}/reset-link${EV}`, admin, { sendEmail: true });
    ok(r.status === 200 && r.data.email && typeof r.data.email.sent === 'boolean' && (r.data.email.sent || !!r.data.email.error), 'el resultado del correo vuelve a la pantalla (sin proveedor aquí: dice por qué no salió)');
} finally {
    srv.close();
    await db.end?.().catch(() => {});
}
console.log(`\n✅ test:fair:users:e2e — ${n} comprobaciones contra Postgres real.`);
process.exit(0);
