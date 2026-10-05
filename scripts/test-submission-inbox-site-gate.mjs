// ════════════════════════════════════════════════════════════════════════════
// Verificación del aislamiento del módulo de Solicitudes de Contenido (Rotary en Acción)
// v4.1162.0
//
// Regla: El módulo de solicitudes de contenido / Rotary en Acción está reservado
// a la capa de administración central y a las entidades principales:
//   0. Super Admin global de Club Platform (rol `superadmin` o marca
//      `isSuperAdmin`): acceso GLOBAL sin depender de sitio/distrito asociado
//      ni del host desde el que abra el módulo.
//   1. Club Platform (app.clubplatform.org, localhost / operador sin club)
//   2. Rotary 4281 (rotary4281.org / entidad distrital 4281)
//   3. Feria de Proyectos (feriadeproyectos.org)
//   4. Colrotarios (colrotarios.org)
//
// Los clubes regulares (ej. Rotary Nuevo Cali, Pereira del Café, Quimbaya, etc.)
// NO deben tener acceso al módulo, NO deben ver el icono en el encabezado,
// NO deben ver la tarjeta en el editor de campañas, y las rutas de backend
// deben bloquear el acceso con 403 o respuestas vacías en polling.
//
// ⚠️ El Super Admin con rol `administrator` conserva la regla de siempre (sin
// club asignado). Un `administrator` CON club asignado sigue siendo un
// administrador LOCAL y se rechaza en host de plataforma: esa es la línea que
// impide ampliar por accidente los permisos de usuarios locales.
// ════════════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isContentSubmissionsAllowedSite, PLATFORM_HOSTS } from '../server/lib/submissionInbox.js';
import { isOperator } from '../server/lib/campaignScope.js';
import { resolveScope } from '../server/lib/rotaryDashboard.js';
import { campaignIdsInScope } from '../server/controllers/contributionCampaignController.js';
import { requireSubmissionInboxAccess, isSubmissionInboxAllowed } from '../server/middleware/submissionInboxGuard.js';

let passed = 0;
const test = (name, fn) => {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        console.error(`  ✗ ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
};

const leer = (rel) => readFileSync(rel, 'utf8');

console.log('── 1 · Criterio de entidades permitidas (isContentSubmissionsAllowedSite) ──');

test('Rotary 4281 por dominio distrital está permitido', () => {
    assert.equal(isContentSubmissionsAllowedSite({ host: 'rotary4281.org' }), true);
    assert.equal(isContentSubmissionsAllowedSite({ host: 'www.rotary4281.org' }), true);
    assert.equal(isContentSubmissionsAllowedSite({ host: 'rotary4281.clubplatform.org' }), true);
});

test('Rotary 4281 por entidad Club distrital está permitido', () => {
    assert.equal(isContentSubmissionsAllowedSite({
        club: { type: 'district', name: 'Distrito 4281', district: '4281' },
    }), true);
});

test('Feria de Proyectos por dominio o club está permitida', () => {
    assert.equal(isContentSubmissionsAllowedSite({ host: 'feriadeproyectos.org' }), true);
    assert.equal(isContentSubmissionsAllowedSite({
        club: { type: 'project_fair', name: 'Feria de Proyectos Rotary Colombia' },
    }), true);
});

test('Colrotarios por dominio o club está permitido', () => {
    assert.equal(isContentSubmissionsAllowedSite({ host: 'colrotarios.org' }), true);
    assert.equal(isContentSubmissionsAllowedSite({
        club: { type: 'colrotarios', name: 'Colrotarios' },
    }), true);
});

test('Club Platform superadmin sin club está permitido', () => {
    assert.equal(isContentSubmissionsAllowedSite({
        host: 'app.clubplatform.org',
        user: { role: 'administrator', clubId: null },
    }), true);
    assert.equal(isContentSubmissionsAllowedSite({
        host: 'localhost',
        user: { role: 'administrator', clubId: null },
    }), true);
    // Caso real: useClub() resuelve el club maestro por defecto (con club.id no nulo)
    assert.equal(isContentSubmissionsAllowedSite({
        host: 'app.clubplatform.org',
        user: { role: 'administrator', clubId: null },
        club: { id: 'master-club-id', name: 'Rotary Club Origen', subdomain: 'origen' },
    }), true, 'Superadmin en app.clubplatform.org con contexto de club maestro debe estar permitido');
    assert.equal(isContentSubmissionsAllowedSite({
        host: 'app.clubplatform.org',
        user: { role: 'administrator', isSuperAdmin: true },
        club: { id: 'master-club-id', name: 'Rotary Club Origen' },
    }), true, 'Superadmin con isSuperAdmin flag en app.clubplatform.org debe estar permitido');
});

test('Super Admin (rol superadmin) entra SIN depender de sitio/distrito asociado', () => {
    // Con club asignado y en host de plataforma: global igual.
    assert.equal(isContentSubmissionsAllowedSite({
        host: 'app.clubplatform.org',
        user: { role: 'superadmin', clubId: 'club-nuevo-cali' },
        club: { id: 'club-nuevo-cali', type: 'club', name: 'Rotary Nuevo Cali' },
    }), true, 'El Super Admin no depende de su asociación a un sitio');
    // Y desde el dominio de un club: el alcance global viaja con el rol.
    assert.equal(isContentSubmissionsAllowedSite({
        host: 'rotarynuevocali.org',
        user: { role: 'superadmin', clubId: 'club-nuevo-cali' },
        club: { id: 'club-nuevo-cali', type: 'club', name: 'Rotary Nuevo Cali' },
    }), true);
    // Marca isSuperAdmin con rol administrator: también global.
    assert.equal(isContentSubmissionsAllowedSite({
        host: 'app.clubplatform.org',
        user: { role: 'administrator', clubId: 'club-nuevo-cali', isSuperAdmin: true },
    }), true);
});

console.log('\n── 2 · Bloqueo estricto para clubes regulares ──');

test('Rotary Nuevo Cali (rotarynuevocali.org) es RECHAZADO aunque pertenezca al distrito 4281', () => {
    const allowed = isContentSubmissionsAllowedSite({
        host: 'rotarynuevocali.org',
        user: { role: 'administrator', clubId: 'club-nuevo-cali' },
        club: {
            id: 'club-nuevo-cali',
            name: 'Rotary Club Nuevo Cali',
            type: 'club',
            district: '4281',
            subdomain: 'rotarynuevocali',
            domain: 'rotarynuevocali.org',
        },
    });
    assert.equal(allowed, false, 'Un club regular del 4281 NO es el sitio distrital');
});

test('Clubes regulares varios son RECHAZADOS', () => {
    assert.equal(isContentSubmissionsAllowedSite({ host: 'rotarypereiradelcafe.org' }), false);
    assert.equal(isContentSubmissionsAllowedSite({ host: 'rotaryquimbaya.org' }), false);
    assert.equal(isContentSubmissionsAllowedSite({ host: 'rotarymedellin.org' }), false);
});

test('Administrador de club regular accediendo por host de plataforma es RECHAZADO', () => {
    const allowed = isContentSubmissionsAllowedSite({
        host: 'app.clubplatform.org',
        user: { role: 'administrator', clubId: 'club-nuevo-cali' },
        club: { id: 'club-nuevo-cali', type: 'club', name: 'Rotary Nuevo Cali' },
    });
    assert.equal(allowed, false, 'Un administrador con clubId asignado no es platform superadmin');
});

test('district_admin / club_admin / editor con club NUNCA heredan lo global', () => {
    for (const role of ['district_admin', 'club_admin', 'editor', 'member']) {
        assert.equal(isContentSubmissionsAllowedSite({
            host: 'app.clubplatform.org',
            user: { role, clubId: 'club-nuevo-cali' },
            club: { id: 'club-nuevo-cali', type: 'club', name: 'Rotary Nuevo Cali' },
        }), false, `rol ${role} con club no es global`);
    }
});

console.log('\n── 3 · Aislamiento del operador de plataforma (campaignScope & dashboard) ──');

test('isOperator solo es true para administradores globales SIN clubId, o Super Admin', () => {
    assert.equal(isOperator({ user: { role: 'administrator' } }), true);
    assert.equal(isOperator({ user: { role: 'administrator', clubId: 'club-nuevo-cali' } }), false);
    assert.equal(isOperator({ user: { role: 'club_admin', clubId: 'club-nuevo-cali' } }), false);
    assert.equal(isOperator({ user: { role: 'superadmin', clubId: 'club-nuevo-cali' } }), true, 'Super Admin global aun con club asignado');
    assert.equal(isOperator({ user: { role: 'administrator', clubId: 'club-nuevo-cali', isSuperAdmin: true } }), true);
    assert.equal(isOperator({ user: { role: 'district_admin', clubId: 'club-4281' } }), false, 'Distrito nunca es operador global');
});

test('resolveScope en rotaryDashboard no otorga alcance global a administradores con clubId', async () => {
    const scopeOp = await resolveScope({ user: { role: 'administrator' } }, null);
    assert.equal(scopeOp.isOperator, true);
    assert.equal(scopeOp.campaigns, null);

    const scopeClubAdmin = await resolveScope({ user: { role: 'administrator', clubId: 'club-123' } }, ['camp-1']);
    assert.equal(scopeClubAdmin.isOperator, false);
    assert.equal(scopeClubAdmin.clubId, 'club-123');

    const scopeSuper = await resolveScope({ user: { role: 'superadmin', clubId: 'club-123' } }, ['camp-1']);
    assert.equal(scopeSuper.isOperator, true, 'Super Admin con club: alcance global');
    assert.equal(scopeSuper.campaigns, null);
});

test('campaignIdsInScope devuelve null (todas) para el Super Admin con club asignado', async () => {
    assert.equal(await campaignIdsInScope({ user: { role: 'superadmin', clubId: 'club-nuevo-cali' } }), null);
    assert.equal(await campaignIdsInScope({ user: { role: 'administrator' } }), null);
});

console.log('\n── 4 · Middleware de protección backend (requireSubmissionInboxAccess) ──');

test('requireSubmissionInboxAccess bloquea con 403 a clubes regulares', async () => {
    let statusCode = null;
    let jsonBody = null;
    let nextCalled = false;

    const mockReq = {
        headers: { host: 'rotarynuevocali.org' },
        user: { role: 'administrator', clubId: 'club-nuevo-cali' },
        club: { id: 'club-nuevo-cali', type: 'club', name: 'Rotary Nuevo Cali', domain: 'rotarynuevocali.org' },
    };
    const mockRes = {
        status: (c) => { statusCode = c; return mockRes; },
        json: (b) => { jsonBody = b; return mockRes; },
    };
    const mockNext = () => { nextCalled = true; };

    await requireSubmissionInboxAccess(mockReq, mockRes, mockNext);

    assert.equal(statusCode, 403);
    assert.equal(jsonBody?.code, 'SUBMISSION_INBOX_FORBIDDEN');
    assert.equal(nextCalled, false);
});

test('requireSubmissionInboxAccess permite el paso a entidades autorizadas', async () => {
    let nextCalled = false;

    const mockReq = {
        headers: { host: 'rotary4281.org' },
        user: { role: 'administrator' },
        club: { id: 'distrito-4281', type: 'district', name: 'Distrito 4281' },
    };
    const mockRes = {
        status: () => mockRes,
        json: () => mockRes,
    };
    const mockNext = () => { nextCalled = true; };

    await requireSubmissionInboxAccess(mockReq, mockRes, mockNext);
    assert.equal(nextCalled, true);
});

console.log('\n── 5 · Comprobación de integración de código fuente ──');

test('server/routes/contribution-campaigns.js protege la bandeja transversal', () => {
    const src = leer('server/routes/contribution-campaigns.js');
    assert.ok(/requireSubmissionInboxAccess/.test(src), 'debe importar y usar requireSubmissionInboxAccess');
    assert.ok(/gateSubmissionInboxPolling/.test(src), 'debe importar y usar gateSubmissionInboxPolling');
    assert.ok(/\/submissions\/inbox', authMiddleware, siteRead, requireSubmissionInboxAccess/.test(src));
});

test('server/routes/rotary-en-accion.js protege stats y dashboard', () => {
    const src = leer('server/routes/rotary-en-accion.js');
    assert.ok(/requireSubmissionInboxAccess/.test(src));
    assert.ok(/\/stats', requireSubmissionInboxAccess/.test(src));
    assert.ok(/\/dashboard', requireSubmissionInboxAccess/.test(src));
});

test('src/components/admin/AdminLayout.tsx protege el icono y el buzón', () => {
    const src = leer('src/components/admin/AdminLayout.tsx');
    assert.ok(/isContentSubmissionsAllowedSite/.test(src));
    assert.ok(/isSubmissionsAllowed/.test(src));
    assert.ok(/const puedeVerSolicitudes = menuItems\.some/.test(src));
});

test('src/pages/admin/SubmissionsInbox.tsx protege la pantalla transversal', () => {
    const src = leer('src/pages/admin/SubmissionsInbox.tsx');
    assert.ok(/isContentSubmissionsAllowedSite/.test(src));
    assert.ok(/navigate\('\/admin\/analytics'/.test(src));
});

test('src/pages/admin/ContributionCampaigns.tsx protege la tarjeta de solicitudes', () => {
    const src = leer('src/pages/admin/ContributionCampaigns.tsx');
    assert.ok(/isContentSubmissionsAllowedSite/.test(src));
    assert.ok(/\{canSeeSubmissions && \(\s*<Card id="solicitudes"/.test(src));
});

test('src/components/admin/contribution/CampaignBoard.tsx protege la tarjeta de métricas', () => {
    const src = leer('src/components/admin/contribution/CampaignBoard.tsx');
    assert.ok(/isContentSubmissionsAllowedSite/.test(src));
    assert.ok(/canSeeSubmissions/.test(src));
});

test('src/pages/admin/RotaryEnAccionAdmin.tsx protege la pantalla y redirige sitios no autorizados', () => {
    const src = leer('src/pages/admin/RotaryEnAccionAdmin.tsx');
    assert.ok(/isContentSubmissionsAllowedSite/.test(src));
    assert.ok(/navigate\('\/admin\/analytics'/.test(src));
});

test('el Super Admin ve Rotary en Acción en el menú central (Management, sin duplicar)', () => {
    const layout = leer('src/components/admin/AdminLayout.tsx');
    assert.ok(/label: 'Rotary en Acción', path: '\/admin\/rotary-en-accion', category: 'Management'/.test(layout));
    assert.ok(/label: 'Solicitudes de Contenido', path: '\/admin\/campanas-contribucion\/solicitudes', category: 'Management'/.test(layout));
    const apariciones = (layout.match(/path: '\/admin\/rotary-en-accion'/g) || []).length;
    assert.equal(apariciones, 2, 'una entrada para el operador (Management) y una para sitios habilitados (Contenido), no dos módulos');
    const plat = leer('src/lib/platformAdmin.ts');
    assert.ok(/role === 'superadmin'/.test(plat), 'isPlatformSuperAdmin reconoce el rol superadmin');
});

console.log(`\n────────────────────────────────────────────────────────────`);
if (!process.exitCode) {
    console.log(`✅ ${passed} pruebas superadas. Aislamiento y control de acceso garantizados.`);
} else {
    console.error('❌ Hubo fallos en la verificación de seguridad.');
}
