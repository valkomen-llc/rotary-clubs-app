#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// ¿Quién administra el módulo de la Feria de Proyectos? — v4.1325.0
// Y quien no tiene perfil no ve NADA (v4.1326.0).
// npm run test:fair:site-admin
//
// Hasta v4.1324 un `club_admin` de CUALQUIER club resolvía como `admin` del
// módulo: su grant de `site_admin` tiene `project_fair.view` en SU sitio y el
// guardián no miraba de qué sitio era. Esta prueba fija la regla nueva —el
// grant cuenta sólo si es del sitio de la Feria— y, sobre todo, que nadie de
// los que hoy administran el módulo desde el sitio de la Feria se quede fuera.
//
//   1. CRITERIO PURO (`server/lib/projectFairSiteAccess.js`): sin base.
//   2. DE EXTREMO A EXTREMO con Postgres REAL y el `resolveUserGrant` real:
//      FAIR_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:fair:site-admin
//      Escribe en esa base: sólo localhost y una base desechable. Sin la
//      variable, ese bloque se omite.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import {
    decideFairSiteAdmin, userIsOnFairSite, isFairSiteRow, grantAdministersFair,
} from '../server/lib/projectFairSiteAccess.js';
import { hasPermission, resolveGrant } from '../server/lib/rbacSpec.js';

// La base de la prueba e2e se fija ANTES de importar nada que cargue `db.js`
// (el pool lee DATABASE_URL al crearse). Sólo localhost: nunca una remota.
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
const E2E_ON = /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB);
if (E2E_ON) process.env.DATABASE_URL = E2E_DB;

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log(`  ✓ ${name}`); };

const FAIR = { id: 'club-feria', name: 'Feria de Proyectos Rotary Colombia', type: 'Feria de Proyectos', organizationType: null, category: null, domain: 'rotaryprojectfair.org', subdomain: 'feria' };
const OTRO = { id: 'club-otro', name: 'Rotary Club Nuevo Cali', type: 'club', organizationType: 'club', category: null, domain: 'rotarynuevocali.org', subdomain: 'nuevocali' };
const grantOf = (user, siteId) => resolveGrant({ user, siteId });

console.log('1. Criterio puro');

t('el sitio de la Feria se reconoce por tipo, dominio o nombre; un club no', () => {
    assert.equal(isFairSiteRow(FAIR), true);
    assert.equal(isFairSiteRow({ id: 'x', type: 'project_fair' }), true);
    assert.equal(isFairSiteRow({ id: 'x', type: 'club', domain: 'rotaryprojectfair.org' }), true);
    assert.equal(isFairSiteRow({ id: 'x', type: 'club', name: 'Feria de Proyectos Rotarios' }), true);
    assert.equal(isFairSiteRow(OTRO), false);
    assert.equal(isFairSiteRow(null), false);
});

t('EL ARREGLO: un club_admin de otro sitio NO administra la Feria aunque su grant tenga project_fair.*', () => {
    const user = { id: 'u1', role: 'club_admin', clubId: OTRO.id };
    const grant = grantOf(user, OTRO.id);
    // Es exactamente lo que el reporte reproduce: site_admin con manage.
    assert.equal(grant.roleKey, 'site_admin');
    assert.equal(hasPermission(grant, 'project_fair.manage'), true);
    assert.equal(decideFairSiteAdmin({ user, ownSite: OTRO, grant, hasPermission }), false);
});

t('lo mismo para district_admin y editor de otro sitio', () => {
    for (const role of ['district_admin', 'editor']) {
        const user = { id: 'u', role, clubId: OTRO.id };
        assert.equal(decideFairSiteAdmin({ user, ownSite: OTRO, grant: grantOf(user, OTRO.id), hasPermission }), false, role);
    }
});

t('un grant con project_fair.view de una membresía de otro sitio no cuenta', () => {
    const user = { id: 'u', role: 'institutional_user', clubId: OTRO.id };
    const grant = { roleKey: 'custom', permissions: new Set(['project_fair.view', 'project_fair.manage']) };
    assert.equal(decideFairSiteAdmin({ user, ownSite: OTRO, grant, hasPermission }), false);
    // …ni aunque el rol se llame project_fair_manager (sólo se asigna en la Feria).
    assert.equal(decideFairSiteAdmin({ user, ownSite: OTRO, grant: { roleKey: 'project_fair_manager', permissions: new Set() }, hasPermission }), false);
});

t('NADIE SE QUEDA FUERA: los administradores del sitio de la Feria siguen siendo admin', () => {
    for (const role of ['club_admin', 'district_admin', 'editor']) {
        const user = { id: 'u', role, clubId: FAIR.id };
        assert.equal(decideFairSiteAdmin({ user, ownSite: FAIR, grant: grantOf(user, FAIR.id), hasPermission }), true, role);
    }
});

t('un institucional del sitio de la Feria con project_fair.view sigue siendo admin', () => {
    const user = { id: 'u', role: 'institutional_user', clubId: FAIR.id };
    const grant = { roleKey: 'project_fair_manager', permissions: new Set(['project_fair.view']) };
    assert.equal(grantAdministersFair(grant, hasPermission), true);
    assert.equal(decideFairSiteAdmin({ user, ownSite: FAIR, grant, hasPermission }), true);
});

t('operadores de plataforma y el rol de usuario project_fair_manager: admin en cualquier sitio', () => {
    for (const role of ['administrator', 'superadmin', 'project_fair_manager']) {
        assert.equal(decideFairSiteAdmin({ user: { id: 'u', role, clubId: OTRO.id }, ownSite: OTRO }), true, role);
        assert.equal(decideFairSiteAdmin({ user: { id: 'u', role, clubId: null } }), true, `${role} sin sitio`);
    }
});

t('cfg.clubId: la convocatoria declara su sitio', () => {
    const user = { id: 'u', role: 'club_admin', clubId: OTRO.id };
    assert.equal(decideFairSiteAdmin({ user, cfg: { clubId: OTRO.id }, ownSite: OTRO }), true);
    assert.equal(decideFairSiteAdmin({ user, cfg: { clubId: FAIR.id }, ownSite: OTRO, grant: grantOf(user, OTRO.id), hasPermission }), false);
});

t('respaldo por dominio: sólo si el sitio de la petición ES el del usuario', () => {
    const user = { id: 'u', role: 'club_admin', clubId: FAIR.id };
    // El tipo del sitio propio no se pudo leer, pero la petición llega por el dominio de la Feria.
    assert.equal(userIsOnFairSite({ user, ownSite: null, hostSite: FAIR }), true);
    // Un admin de otro club que abre el panel en el dominio de la Feria NO pasa.
    const ajeno = { id: 'u', role: 'club_admin', clubId: OTRO.id };
    assert.equal(userIsOnFairSite({ user: ajeno, ownSite: OTRO, hostSite: FAIR }), false);
    assert.equal(decideFairSiteAdmin({ user: ajeno, ownSite: OTRO, hostSite: FAIR, grant: grantOf(ajeno, OTRO.id), hasPermission }), false);
});

t('sin sesión o sin sitio: no', () => {
    assert.equal(decideFairSiteAdmin({ user: null }), false);
    assert.equal(decideFairSiteAdmin({ user: { id: 'u', role: 'club_admin', clubId: null } }), false);
});

// ── 1b. resolveAccess: sin perfil no se ve nada (v4.1326) ───────────
// El controlador se importa sin base (el pool no conecta hasta la primera
// consulta). Se silencian sus registros de arranque.
const logOriginal = console.log;
console.log = () => {};
const { resolveAccess, withAccess, listSubmissions, NO_FAIR_PROFILE_MESSAGE } = await import('../server/controllers/projectFairAdminController.js');
console.log = logOriginal;
const CAPS = ['view', 'managePayments', 'viewPayments', 'comment', 'edit', 'changeStatus', 'manageTags', 'export', 'config', 'remove', 'translate', 'approveTranslation'];
const listas = { access: { admins: [], finance: ['finanzas@ejemplo.org'], reviewers: ['jurado@ejemplo.org'], translators: ['traductora@ejemplo.org'] } };

t('v4.1326: un viewer (otro sitio, sin lista) no tiene NINGUNA capacidad, tampoco view', () => {
    for (const role of ['club_admin', 'district_admin', 'editor', 'institutional_user', 'member']) {
        const a = resolveAccess({ role, email: 'presi@nuevocali.org' }, listas, { ownsFairSite: false });
        assert.equal(a.role, 'viewer', role);
        for (const c of CAPS) assert.equal(a[c], false, `${role}.${c}`);
    }
});

t('v4.1326: los perfiles con lista siguen viendo (finance, reviewer, translator) y admin todo', () => {
    assert.equal(resolveAccess({ role: 'club_admin', email: 'finanzas@ejemplo.org' }, listas).view, true);
    assert.equal(resolveAccess({ role: 'club_admin', email: 'jurado@ejemplo.org' }, listas).view, true);
    assert.equal(resolveAccess({ role: 'club_admin', email: 'traductora@ejemplo.org' }, listas).view, true);
    const admin = resolveAccess({ role: 'club_admin', email: 'x@y.z' }, listas, { ownsFairSite: true });
    for (const c of CAPS) assert.equal(admin[c], true, `admin.${c}`);
});

t('v4.1326: el 403 explica cómo pedir acceso', () => {
    assert.match(NO_FAIR_PROFILE_MESSAGE, /sitio de la Feria/);
    assert.match(NO_FAIR_PROFILE_MESSAGE, /convocatoria/);
});

// ── 2. De extremo a extremo ────────────────────────────────────────
if (!E2E_ON) {
    console.log('\n2. Extremo a extremo: sin FAIR_E2E_DATABASE_URL local, se omite (nunca corre contra una base remota).');
    console.log(`\n✅ ${ok} comprobaciones del criterio.`);
    process.exit(0);
}
console.log('\n2. Extremo a extremo (Postgres real, resolveUserGrant real)');

const { default: db } = await import('../server/lib/db.js');
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
for (const c of [FAIR, OTRO]) {
    await db.query(`INSERT INTO "Club" (id, name, type, "organizationType", category, domain, subdomain) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, domain = EXCLUDED.domain, subdomain = EXCLUDED.subdomain`,
    [c.id, c.name, c.type, c.organizationType, c.category, c.domain, c.subdomain]);
}
const { isProjectFairSiteAdmin } = await import('../server/controllers/projectFairAdminController.js');
const { resolveUserGrant } = await import('../server/lib/rbacStore.js');

const cfg = { clubId: null, access: { admins: [], finance: ['finanzas@ejemplo.org'], reviewers: ['jurado@ejemplo.org'], translators: ['traductora@ejemplo.org'] } };
const roleOf = async (user, host = '') => {
    const req = { user, headers: { host } };
    return resolveAccess(user, cfg, { ownsFairSite: await isProjectFairSiteAdmin(req, cfg) }).role;
};
const e2e = async (name, fn) => { await fn(); ok++; console.log(`  ✓ ${name}`); };

await e2e('el reporte: el grant de un club_admin de otro club SIGUE teniendo project_fair.manage…', async () => {
    const g = await resolveUserGrant({ id: 'u-otro', role: 'club_admin', clubId: OTRO.id }, OTRO.id);
    assert.equal(g.roleKey, 'site_admin');
    assert.equal(hasPermission(g, 'project_fair.manage'), true);
});
await e2e('…pero ya no lo hace admin de la Feria: resuelve como viewer', async () => {
    assert.equal(await roleOf({ id: 'u-otro', role: 'club_admin', clubId: OTRO.id, email: 'presi@nuevocali.org' }), 'viewer');
    assert.equal(await roleOf({ id: 'u-otro', role: 'district_admin', clubId: OTRO.id, email: 'gob@distrito.org' }), 'viewer');
    assert.equal(await roleOf({ id: 'u-otro', role: 'editor', clubId: OTRO.id, email: 'ed@nuevocali.org' }), 'viewer');
});
await e2e('…ni aunque abra el panel desde el dominio de la Feria', async () => {
    assert.equal(await roleOf({ id: 'u-otro', role: 'club_admin', clubId: OTRO.id, email: 'presi@nuevocali.org' }, 'rotaryprojectfair.org'), 'viewer');
});
await e2e('el administrador del sitio de la Feria y el operador de la plataforma siguen como admin', async () => {
    assert.equal(await roleOf({ id: 'u-feria', role: 'club_admin', clubId: FAIR.id, email: 'comite@feria.org' }), 'admin');
    assert.equal(await roleOf({ id: 'u-feria', role: 'editor', clubId: FAIR.id, email: 'comite2@feria.org' }), 'admin');
    assert.equal(await roleOf({ id: 'u-op', role: 'administrator', clubId: OTRO.id, email: 'op@plataforma.org' }), 'admin');
    assert.equal(await roleOf({ id: 'u-op', role: 'superadmin', clubId: null, email: 'op2@plataforma.org' }), 'admin');
});
await e2e('las listas por correo vuelven a aplicar: translator, finance y reviewer', async () => {
    assert.equal(await roleOf({ id: 'u-t', role: 'club_admin', clubId: OTRO.id, email: 'traductora@ejemplo.org' }), 'translator');
    assert.equal(await roleOf({ id: 'u-t2', role: 'member', clubId: null, email: 'Traductora@Ejemplo.org' }), 'translator');
    assert.equal(await roleOf({ id: 'u-f', role: 'club_admin', clubId: OTRO.id, email: 'finanzas@ejemplo.org' }), 'finance');
    assert.equal(await roleOf({ id: 'u-r', role: 'district_admin', clubId: OTRO.id, email: 'jurado@ejemplo.org' }), 'reviewer');
});
await e2e('un correo en access.admins sigue siendo admin desde cualquier sitio', async () => {
    const conAdmins = { ...cfg, access: { ...cfg.access, admins: ['comite@valledupar.org'] } };
    const user = { id: 'u-c', role: 'district_admin', clubId: OTRO.id, email: 'comite@valledupar.org' };
    const owns = await isProjectFairSiteAdmin({ user, headers: {} }, conAdmins);
    assert.equal(owns, false);
    assert.equal(resolveAccess(user, conAdmins, { ownsFairSite: owns }).role, 'admin');
});

// v4.1326 — Por el guardián REAL (`withAccess`), con la convocatoria real.
const fakeRes = () => {
    const r = { statusCode: 200, body: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.setHeader = () => r; r.send = (b) => { r.body = b; return r; }; r.end = () => r;
    return r;
};
const { ensureTables } = await import('../server/controllers/projectFairController.js');
await ensureTables();
// Una postulación con datos personales: lo que NO debe salir.
await db.query(`INSERT INTO "ProjectFairSubmission" (id, "publicRef", "firstName", "lastName", email, phone, "idNumber", "clubName", "projectName", status)
    VALUES ('sub-e2e-1', 'FP-E2E001', 'Ana', 'Pérez', 'ana@club.org', '+57 300 000 0000', '1234567890', 'RC Prueba', 'Proyecto de prueba', 'pending_payment')
    ON CONFLICT (id) DO NOTHING`);

let llamado = 0;
const sonda = withAccess(async (_req, res) => { llamado++; return res.json({ ok: true }); });
const pasar = async (user, host = '') => { const res = fakeRes(); await sonda({ user, headers: { host }, query: {} }, res); return res; };

await e2e('v4.1326: un club_admin de otro club recibe 403 NO_FAIR_PROFILE y el manejador NO corre', async () => {
    const antes = llamado;
    const r = await pasar({ id: 'u-otro', role: 'club_admin', clubId: OTRO.id, email: 'presi@nuevocali.org' });
    assert.equal(r.statusCode, 403);
    assert.equal(r.body.code, 'NO_FAIR_PROFILE');
    assert.equal(llamado, antes);
    // …tampoco desde el dominio de la Feria.
    const r2 = await pasar({ id: 'u-otro', role: 'district_admin', clubId: OTRO.id, email: 'gob@distrito.org' }, 'rotaryprojectfair.org');
    assert.equal(r2.statusCode, 403);
});
await e2e('v4.1326: el listado real NO devuelve datos personales a quien viene de otro club', async () => {
    const res = fakeRes();
    await listSubmissions({ user: { id: 'u-otro', role: 'club_admin', clubId: OTRO.id, email: 'presi@nuevocali.org' }, headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 403);
    const texto = JSON.stringify(res.body);
    for (const dato of ['ana@club.org', '1234567890', '+57 300', 'Pérez']) assert.equal(texto.includes(dato), false, dato);
});
await e2e('v4.1326: el administrador del sitio de la Feria sí lista (y ve el dato que el otro no)', async () => {
    const res = fakeRes();
    await listSubmissions({ user: { id: 'u-feria', role: 'club_admin', clubId: FAIR.id, email: 'comite@feria.org' }, headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(JSON.stringify(res.body).includes('ana@club.org'), true);
});
await e2e('v4.1326: el operador de la plataforma pasa el guardián', async () => {
    const antes = llamado;
    const r = await pasar({ id: 'u-op', role: 'administrator', clubId: OTRO.id, email: 'op@plataforma.org' });
    assert.equal(r.statusCode, 200);
    assert.equal(llamado, antes + 1);
});

await db.end?.();
console.log(`\n✅ ${ok} comprobaciones.`);
process.exit(0);
