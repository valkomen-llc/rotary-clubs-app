#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// ¿Quién administra el módulo de la Feria de Proyectos? — v4.1325.0
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

// ── 2. De extremo a extremo ────────────────────────────────────────
const E2E_DB = process.env.FAIR_E2E_DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB)) {
    console.log('\n2. Extremo a extremo: sin FAIR_E2E_DATABASE_URL local, se omite (nunca corre contra una base remota).');
    console.log(`\n✅ ${ok} comprobaciones del criterio.`);
    process.exit(0);
}
process.env.DATABASE_URL = E2E_DB;
console.log('\n2. Extremo a extremo (Postgres real, resolveUserGrant real)');

const { default: db } = await import('../server/lib/db.js');
await db.query(`CREATE TABLE IF NOT EXISTS "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT, "organizationType" TEXT, category TEXT, domain TEXT, subdomain TEXT)`);
for (const c of [FAIR, OTRO]) {
    await db.query(`INSERT INTO "Club" (id, name, type, "organizationType", category, domain, subdomain) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, domain = EXCLUDED.domain, subdomain = EXCLUDED.subdomain`,
    [c.id, c.name, c.type, c.organizationType, c.category, c.domain, c.subdomain]);
}
const { isProjectFairSiteAdmin, resolveAccess } = await import('../server/controllers/projectFairAdminController.js');
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

await db.end?.();
console.log(`\n✅ ${ok} comprobaciones.`);
process.exit(0);
