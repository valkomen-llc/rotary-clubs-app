// ════════════════════════════════════════════════════════════════════
// test:fair:users — Usuarios de la Feria (v4.1342), sin base ni red.
//
//   1. El criterio (`server/lib/fairUsersSpec.js`): estados de acceso, a
//      quién se le puede asignar contraseña y qué contraseña sirve.
//   2. Invariantes leídas de los archivos: sólo el perfil admin, sólo el hash
//      en la base, la contraseña nunca en la bitácora, rutas montadas, y la
//      pestaña que sólo aparece con el permiso.
//
// La prueba contra Postgres es `test:fair:users:e2e`.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    passwordProblem, accessStateOf, canSetPassword, accessStateMeta, resetLinkPath, realmLabel, PASSWORD_MIN,
} from '../server/lib/fairUsersSpec.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('\n1. El criterio');
ok('mínimo de 8 caracteres', PASSWORD_MIN === 8 && !!passwordProblem('corta') && passwordProblem('Rotary2026') === null);
ok('no puede ser el correo ni su usuario', !!passwordProblem('mgaitanr77@gmail.com', { email: 'mgaitanr77@gmail.com' }) && !!passwordProblem('mgaitanr77', { email: 'mgaitanr77@gmail.com' }));
ok('nada trivial (12345678, aaaaaaaa, password)', !!passwordProblem('12345678') && !!passwordProblem('aaaaaaaa') && !!passwordProblem('password'));
ok('sin espacios al principio o al final', !!passwordProblem(' Rotary2026') && !!passwordProblem('Rotary2026 '));
ok('tope de largo', !!passwordProblem('x'.repeat(129)));

ok('gestor con contraseña → «Con acceso»', accessStateOf({ realm: 'project', hasPassword: true }) === 'active');
ok('gestor sin contraseña → «Sin contraseña»', accessStateOf({ realm: 'project', hasPassword: false }) === 'no_password');
ok('gestor suspendido (reembolso) → «Suspendida»', accessStateOf({ realm: 'project', role: 'suspended', hasPassword: true }) === 'suspended');
ok('asistente vinculado sin clave propia → «Vinculada»', accessStateOf({ realm: 'attendee', linkedRealm: 'portal', hasPassword: false, status: 'active' }) === 'linked');
ok('asistente por activar → «Por activar»', accessStateOf({ realm: 'attendee', status: 'pending_activation', hasPassword: false }) === 'pending');
ok('cada estado tiene etiqueta', ['active', 'no_password', 'linked', 'pending', 'suspended'].every(k => accessStateMeta(k).label && accessStateMeta(k).tone));

ok('a un gestor (caso Mónica Gaitán) se le puede asignar contraseña', canSetPassword({ realm: 'project', hasPassword: true }).ok);
ok('también a uno que nunca la definió', canSetPassword({ realm: 'project', hasPassword: false }).ok);
const vinc = canSetPassword({ realm: 'attendee', linkedRealm: 'portal', hasPassword: false });
ok('NO a un asistente vinculado (sería una segunda credencial)', !vinc.ok && vinc.code === 'linked_account');
ok('NO a una cuenta suspendida (no la reactiva)', !canSetPassword({ realm: 'attendee', status: 'suspended' }).ok && !canSetPassword({ realm: 'project', role: 'suspended' }).ok);
ok('el enlace abre el panel de cada cuenta', resetLinkPath('project', {}) === '/mi-proyecto' && resetLinkPath('project', { portal: { path: '/panel' } }) === '/panel' && resetLinkPath('attendee') === '/mi-inscripcion');
ok('etiquetas de tipo', realmLabel('project') === 'Gestor de proyecto' && realmLabel('attendee') === 'Asistente al evento');

console.log('\n2. Invariantes');
const ctrl = read('server/controllers/projectFairUsersController.js');
const admin = read('server/controllers/projectFairAdminController.js');
const routes = read('server/routes/project-fair.js');
const ui = read('src/components/admin/feria/UsuariosFeria.tsx');
const page = read('src/pages/admin/PostulacionesPagos.tsx');
const portal = read('server/controllers/projectFairPortalController.js');

const caps = admin.slice(admin.indexOf('const ROLE_CAPABILITIES = {'), admin.indexOf('};', admin.indexOf('const ROLE_CAPABILITIES = {')));
ok('sólo el perfil admin tiene `manageUsers`', /admin:\s+\{[^}]*manageUsers: true/.test(caps) && (caps.match(/manageUsers: true/g) || []).length === 1 && (caps.match(/manageUsers: false/g) || []).length === 6); // v4.1356: + el perfil cadre
ok('las cuatro rutas pasan por withAccess(…, \'manageUsers\')', (ctrl.match(/withAccess\(\w+, 'manageUsers'\)/g) || []).length === 4);
ok('las rutas existen con la guardia de gestión', /'\/admin\/usuarios', authMiddleware, fairManage/.test(routes) && /'\/admin\/usuarios\/:realm\/:id\/password', authMiddleware, fairManage/.test(routes) && /'\/admin\/usuarios\/:realm\/:id\/reset-link', authMiddleware, fairManage/.test(routes));
ok('en la base sólo queda el hash bcrypt', /bcrypt\.hash\(password, 10\)/.test(ctrl) && !/"passwordHash" = \$1[^,]*password\b(?!Hash)/.test(ctrl));
const auditCalls = ctrl.match(/await audit\([^;]*\);/g) || [];
ok('la contraseña NUNCA va a la bitácora', auditCalls.length === 2 && auditCalls.every(c => !/\bpassword\b(?!_set)/.test(c.replace(/'password_set'/g, ''))));
ok('el correo de aviso no incluye la contraseña', !/\$\{password\}/.test(ctrl));
ok('la contraseña sólo vuelve si la generó el sistema', /password: generated \? password : null/.test(ctrl));
ok('asignar invalida un enlace de restablecimiento pendiente', (ctrl.match(/"resetToken" = NULL, "resetExpiry" = NULL/g) || []).length === 2);
ok('la cuenta debe ser de la EDICIÓN abierta', /PROJECT_EDITION/.test(ctrl) && /ATTENDEE_EDITION/.test(ctrl) && /loadAccount\(realm, id, eventId\)/.test(ctrl));
ok('el «Olvidé mi contraseña» del club ya no descarta el fallo del correo', /NO salió/.test(portal) && !/html: `<div[\s\S]{0,900}Restablece tu contraseña[\s\S]{0,900}\}\)\.catch\(\(\) => \{\}\);/.test(portal));
ok('la pestaña «Usuarios» sólo aparece con el permiso', /access\?\.manageUsers \? \[\['users', 'Usuarios', Users\]\]/.test(page) && /tab === 'users' && \(access\?\.manageUsers/.test(page));
ok('la pantalla no declara componentes dentro de otros', !/=> \{\s*\n\s*const [A-Z]\w+ = \(/.test(ui));
ok('la pantalla avisa que la contraseña no se vuelve a ver', /no se puede volver a ver/.test(ui));

console.log(`\n${fail ? '❌' : '✅'} test:fair:users — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
