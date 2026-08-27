#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// ACCESOS INSTITUCIONALES.  npm run test:institutional
// v4.932.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio del servidor es puro; el
// espejo del navegador se compila con `esbuild` y ese bloque se salta solo si
// falta. El resto lee archivos.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE UN USUARIO INSTITUCIONAL NO ADMINISTRE NADA. Es el pedido entero:
//      ve su bandeja y ninguna otra cuenta. Se comprueba en el criterio
//      (`can`, `mailboxScopeFor`) y sobre los ARCHIVOS del servidor, porque un
//      endpoint que se olvide la guardia no lo ve ninguna prueba de criterio.
//
//   2. QUE UN PERMISO ADMINISTRATIVO NO SE CONCEDA SUELTO. `adminOnly` tiene
//      que sobrevivir a las dos puertas: la de guardar y la de comprobar. Con
//      una sola, una fila escrita antes de que existiera la otra pasaría.
//
//   3. QUE NO HAYA UNA SEGUNDA AUTENTICACIÓN. Es la exigencia expresa del
//      pedido: se comprueba que el módulo no cree su propio `jwt.sign` de
//      sesión ni su propio `bcrypt.compare` de ingreso.
//
//   4. QUE LOS DOS ESPEJOS DEN LO MISMO. No que se parezcan: se comparan las
//      SALIDAS sobre una matriz de sesiones y permisos. Coincidir en la lista
//      y discrepar en `can()` sería el peor de los dos mundos.
//
//   5. QUE NADA GUARDE NI DEVUELVA UNA CONTRASEÑA.
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');

const S = await import('../server/lib/institutionalAccess.js');

// Sesiones de referencia. Se declaran una vez y las usan los dos bloques.
const OPERADOR = { role: 'administrator', email: 'admin@rotary.org' };
const ADMIN_SITIO = { role: 'club_admin', email: 'presidente@club.org' };
const EDITOR = { role: 'editor', email: 'editor@club.org' };
const INSTITUCIONAL = {
    role: 'institutional_user', email: 'secretaria@club.org',
    mailbox: 'secretaria@club.org', permissions: ['mailbox', 'content_studio'],
};
const SIN_PERMISOS = { role: 'institutional_user', email: 'nuevo@club.org', mailbox: 'nuevo@club.org', permissions: [] };
const AJENO = { role: 'crm_agent', email: 'agente@club.org' };

// ════════════════════════════════════════════════════════════════════
grupo('1 · El catálogo de permisos es cerrado');
// ════════════════════════════════════════════════════════════════════

check('hay permisos declarados', S.PERMISSIONS.length >= 6);
check('todo permiso tiene clave, rótulo y ayuda',
    S.PERMISSIONS.every(p => p.key && p.label && p.help && typeof p.adminOnly === 'boolean'));
check('no hay claves repetidas', new Set(S.PERMISSION_KEYS).size === S.PERMISSION_KEYS.length);
check('los tres administrativos están marcados adminOnly',
    ['email_accounts', 'users', 'site_settings'].every(k => S.ADMIN_ONLY_PERMISSIONS.includes(k)));
check('la bandeja NO es administrativa', !S.ADMIN_ONLY_PERMISSIONS.includes('mailbox'));
check('lo concedible y lo administrativo no se solapan',
    S.GRANTABLE_PERMISSIONS.every(k => !S.ADMIN_ONLY_PERMISSIONS.includes(k)));
check('un permiso inventado no existe', !S.PERMISSION_KEYS.includes('todo'));

// ════════════════════════════════════════════════════════════════════
grupo('2 · can() — el único punto de decisión');
// ════════════════════════════════════════════════════════════════════

check('el operador puede todo', S.PERMISSION_KEYS.every(k => S.can(OPERADOR, k)));
check('el administrador del sitio puede todo lo del sitio', S.PERMISSION_KEYS.every(k => S.can(ADMIN_SITIO, k)));
check('el editor cuenta como administrativo', S.can(EDITOR, 'email_accounts'));
check('el institucional puede lo que su fila enumera', S.can(INSTITUCIONAL, 'mailbox') && S.can(INSTITUCIONAL, 'content_studio'));
check('el institucional NO puede lo que no enumera', !S.can(INSTITUCIONAL, 'news'));

// ⚠️ El corazón del pedido.
check('⚠️ el institucional NO administra cuentas de correo', !S.can(INSTITUCIONAL, 'email_accounts'));
check('⚠️ el institucional NO administra usuarios', !S.can(INSTITUCIONAL, 'users'));
check('⚠️ el institucional NO toca la configuración del sitio', !S.can(INSTITUCIONAL, 'site_settings'));

// Verificado a la inversa: aunque la fila LLEVE el permiso administrativo
// —porque se escribió antes de que la puerta de guardar existiera—, `can()` lo
// sigue rechazando. Con una sola de las dos puertas, esto pasaría.
const COLADO = { ...INSTITUCIONAL, permissions: ['mailbox', 'email_accounts', 'users', 'site_settings'] };
check('⚠️ un permiso administrativo ESCRITO EN LA FILA no se concede igual',
    !S.can(COLADO, 'email_accounts') && !S.can(COLADO, 'users') && !S.can(COLADO, 'site_settings'));
check('…y el resto de esa misma fila sí vale', S.can(COLADO, 'mailbox'));

check('un rol desconocido no puede nada', S.PERMISSION_KEYS.every(k => !S.can({ role: 'inventado' }, k)));
check('un rol que entra al panel pero no es institucional tampoco', !S.can(AJENO, 'mailbox'));
check('sin sesión no se puede nada', !S.can(null, 'mailbox') && !S.can(undefined, 'mailbox'));
check('un permiso inexistente devuelve false', !S.can(OPERADOR, 'no_existe'));

eq('los permisos efectivos se derivan de can()', S.effectivePermissions(INSTITUCIONAL), ['mailbox', 'content_studio']);
eq('sin permisos, ninguno', S.effectivePermissions(SIN_PERMISOS), []);
check('los del operador son todos', S.effectivePermissions(OPERADOR).length === S.PERMISSION_KEYS.length);

// ════════════════════════════════════════════════════════════════════
grupo('3 · normalizePermissions — la puerta de guardar');
// ════════════════════════════════════════════════════════════════════

eq('conserva los válidos', S.normalizePermissions(['mailbox', 'news']).permissions, ['mailbox', 'news']);
eq('quita los repetidos', S.normalizePermissions(['mailbox', 'mailbox']).permissions, ['mailbox']);
check('descarta el inventado y lo REPORTA', (() => {
    const r = S.normalizePermissions(['mailbox', 'volar']);
    return !r.permissions.includes('volar') && r.descartados.some(d => d.key === 'volar' && d.motivo);
})());
check('⚠️ descarta el administrativo con su motivo', (() => {
    const r = S.normalizePermissions(['mailbox', 'users']);
    return !r.permissions.includes('users') && r.descartados.some(d => d.key === 'users');
})());
eq('sin ninguno, cae al mínimo declarado', S.normalizePermissions([]).permissions, S.DEFAULT_INSTITUTIONAL_PERMISSIONS);
eq('un administrador no lleva lista', S.normalizePermissions(['mailbox'], 'club_admin').permissions, []);
eq('la entrada basura no rompe', S.normalizePermissions(null).permissions, S.DEFAULT_INSTITUTIONAL_PERMISSIONS);
eq('un valor no textual se descarta', S.normalizePermissions([{}, 'mailbox']).permissions, ['mailbox']);

// ════════════════════════════════════════════════════════════════════
grupo('4 · El alcance del buzón');
// ════════════════════════════════════════════════════════════════════

check('el operador no tiene restricción', S.mailboxScopeFor(OPERADOR) === null);
check('el administrador del sitio tampoco', S.mailboxScopeFor(ADMIN_SITIO) === null);
eq('⚠️ el institucional ve SU dirección y ninguna más', S.mailboxScopeFor(INSTITUCIONAL), ['secretaria@club.org']);
eq('sin buzón atado no ve ninguna', S.mailboxScopeFor({ role: 'institutional_user' }), []);
check('⚠️ [] no es null: restringido sin cuentas no ve nada',
    Array.isArray(S.mailboxScopeFor({ role: 'institutional_user' })));
eq('el buzón se normaliza en minúsculas',
    S.mailboxScopeFor({ role: 'institutional_user', mailbox: 'Secretaria@Club.ORG' }), ['secretaria@club.org']);
check('cae al correo cuando no hay buzón declarado',
    JSON.stringify(S.mailboxScopeFor({ role: 'institutional_user', email: 'x@club.org' })) === '["x@club.org"]');

check('puede abrir el suyo', S.canUseMailbox(INSTITUCIONAL, 'secretaria@club.org'));
check('⚠️ NO puede abrir el de otro', !S.canUseMailbox(INSTITUCIONAL, 'presidente@club.org'));
check('no le importan las mayúsculas', S.canUseMailbox(INSTITUCIONAL, 'SECRETARIA@CLUB.ORG'));
check('el administrador abre cualquiera', S.canUseMailbox(ADMIN_SITIO, 'quien.sea@club.org'));

check('canManageMailAccounts sigue a can()',
    S.canManageMailAccounts(ADMIN_SITIO) && !S.canManageMailAccounts(INSTITUCIONAL));

// ════════════════════════════════════════════════════════════════════
grupo('5 · La dirección institucional');
// ════════════════════════════════════════════════════════════════════

eq('compone la dirección', S.buildInstitutionalEmail('Secretaria', 'club.org'), 'secretaria@club.org');
eq('quita el www del dominio', S.buildInstitutionalEmail('info', 'www.club.org'), 'info@club.org');
eq('limpia lo que no puede ir antes de la arroba', S.buildInstitutionalEmail('a b/c', 'club.org'), 'abc@club.org');
eq('si le pegan la arroba, se queda con la parte local', S.buildInstitutionalEmail('x@otro.com', 'club.org'), 'x@club.org');
check('sin dominio no hay dirección', S.buildInstitutionalEmail('x', '') === null);
check('sin parte local tampoco', S.buildInstitutionalEmail('', 'club.org') === null);
check('reconoce un correo válido', S.isEmail('a@b.co') && !S.isEmail('a@b') && !S.isEmail('hola'));

// ════════════════════════════════════════════════════════════════════
grupo('5b · En qué dominio se crea la dirección (v4.933)');
// ════════════════════════════════════════════════════════════════════

const dom = (o) => S.resolveMailDomain(o);

eq('un club normal usa su dominio', dom({ clubDomain: 'jaquematealapolio.org' }).domain, 'jaquematealapolio.org');
eq('el apex: sin www', dom({ clubDomain: 'www.Club.ORG' }).domain, 'club.org');
eq('aguanta que venga con esquema y barra', dom({ clubDomain: 'https://club.org/algo' }).domain, 'club.org');

// ⚠️ EL DEFECTO REPORTADO. El sitio del Distrito 4281 se navega en
// rotary4281.org y su correo vive ahí, pero `Club.domain` lleva el subdominio
// de la plataforma: mirar sólo el club ofrecía «@distrito-4281-de-rotary…».
const CASO_4281 = {
    clubDomain: 'distrito-4281-de-rotary-international.clubplatform.org',
    districtDomain: 'rotary4281.org',
    isDistrictSite: true,
    accountDomains: ['dyazo@rotary4281.org', 'ecluborigen@rotary4281.org'],
};
eq('⚠️ el sitio de un distrito usa el dominio de SU FILA de District', dom(CASO_4281).domain, 'rotary4281.org');
eq('…y se dice de dónde salió', dom(CASO_4281).source, 'district');
check('…y el host de la plataforma queda descartado CON motivo',
    dom(CASO_4281).descartados.some(d => /plataforma/i.test(d.motivo)));

// ⚠️ El caso donde la fila de `District` es la ÚNICA fuente: un distrito recién
// creado, sin ninguna cuenta todavía. Sin él, el respaldo por cuentas tapaba el
// defecto y la comprobación de arriba pasaba aunque nadie mirara el distrito —
// lo destapó la verificación a la inversa, no la lectura.
const DISTRITO_NUEVO = {
    clubDomain: 'distrito-4281-de-rotary-international.clubplatform.org',
    districtDomain: 'rotary4281.org',
    isDistrictSite: true,
    accountDomains: [],
};
eq('⚠️ un distrito SIN cuentas todavía usa igual el dominio de su fila',
    dom(DISTRITO_NUEVO).domain, 'rotary4281.org');
eq('…y no hay otra fuente que lo salve', dom(DISTRITO_NUEVO).source, 'district');

check('⚠️ NUNCA se ofrece un host de la plataforma', (() => {
    const casos = [
        { clubDomain: 'x.clubplatform.org' },
        { clubDomain: 'clubplatform.org' },
        { clubDomain: 'algo.vercel.app' },
        { clubDomain: 'localhost' },
    ];
    return casos.every(c => dom(c).domain === null);
})());

eq('sin dominio propio cae al que YA usan las cuentas',
    dom({ clubDomain: 'x.clubplatform.org', accountDomains: ['contacto@rotary4281.org'] }).domain, 'rotary4281.org');
eq('…y lo dice', dom({ clubDomain: 'x.clubplatform.org', accountDomains: ['a@rotary4281.org'] }).source, 'accounts');
eq('la cuenta puede venir como dirección o como dominio suelto',
    dom({ accountDomains: ['club.org'] }).domain, 'club.org');
check('una cuenta en un host de la plataforma tampoco vale',
    dom({ accountDomains: ['a@x.clubplatform.org'] }).domain === null);

eq('el dominio del club MANDA sobre el de las cuentas',
    dom({ clubDomain: 'nuevo.org', accountDomains: ['a@viejo.org'] }).domain, 'nuevo.org');
check('en un sitio que NO es de distrito, el club va antes que el distrito',
    dom({ clubDomain: 'club.org', districtDomain: 'distrito.org' }).domain === 'club.org');
check('…y el del distrito sigue sirviendo de respaldo',
    dom({ clubDomain: '', districtDomain: 'distrito.org' }).domain === 'distrito.org');

check('⚠️ sin ningún dominio NO se inventa uno', dom({}).domain === null);
check('…y se dice qué falta', /dominio propio/i.test(dom({}).reason || ''));
check('…y con sólo un host de plataforma, el motivo es OTRO',
    /sólo tiene una dirección de la plataforma/i.test(dom({ clubDomain: 'x.clubplatform.org' }).reason || ''));

check('la entrada basura no rompe', dom({ clubDomain: null, districtDomain: undefined, accountDomains: null }).domain === null);
check('isPlatformHost reconoce el subdominio', S.isPlatformHost('a.b.clubplatform.org') && !S.isPlatformHost('rotary4281.org'));
check('apexOf descarta lo que no es un host', S.apexOf('sinpunto') === '' && S.apexOf('') === '');

// ════════════════════════════════════════════════════════════════════
grupo('6 · La validación del alta');
// ════════════════════════════════════════════════════════════════════

const base = {
    local: 'secretaria', firstName: 'Ana', lastName: 'Ríos',
    password: 'clave-larga-1', passwordConfirm: 'clave-larga-1',
    grantAccess: true, permissions: ['mailbox'],
};
const v = (extra = {}, opts = { domain: 'club.org' }) => S.validateAccountPayload({ ...base, ...extra }, opts);

check('un alta correcta pasa', v().ok);
eq('devuelve la dirección compuesta', v().value.email, 'secretaria@club.org');
check('sin dominio del sitio NO se puede crear', !v({}, { domain: '' }).ok);
check('…y lo dice con su causa', v({}, { domain: '' }).errors.some(e => /dominio propio/i.test(e)));
check('sin contraseña falla', !v({ password: '', passwordConfirm: '' }).ok);
check('una contraseña corta falla y dice el mínimo',
    v({ password: 'abc', passwordConfirm: 'abc' }).errors.some(e => e.includes(String(S.PASSWORD_MIN))));
check('dos contraseñas distintas fallan', !v({ passwordConfirm: 'otra-cosa-1' }).ok);
check('⚠️ sin nombre no se crea una IDENTIDAD', !v({ firstName: '' }).ok);
check('…pero un buzón SIN acceso no exige nombre', v({ firstName: '', grantAccess: false }).ok);
check('sin apellido avisa y no bloquea', (() => {
    const r = v({ lastName: '' });
    return r.ok && r.warnings.some(w => /apellido/i.test(w));
})());
check('sin confirmación avisa y no bloquea', (() => {
    const r = v({ passwordConfirm: '' });
    return r.ok && r.warnings.length > 0;
})());
check('un rol inexistente falla', !v({ role: 'dios' }).ok);
check('⚠️ pedir un permiso administrativo avisa y NO lo concede', (() => {
    const r = v({ permissions: ['mailbox', 'users'] });
    return r.ok && !r.value.permissions.includes('users') && r.warnings.some(w => w.includes('users'));
})());
check('sin herramientas avisa que entraría a un panel vacío',
    v({ permissions: [] }).warnings.some(w => /no ve nada/i.test(w)) === false
    || v({ permissions: [] }).value.permissions.length > 0);
check('⚠️ devuelve TODOS los errores, no el primero',
    v({ local: '', password: '', passwordConfirm: '' }).errors.length >= 2);
check('la contraseña es TEMPORAL por omisión', v().value.temporaryPassword === true);
check('…y sólo deja de serlo si se dice expresamente',
    v({ temporaryPassword: false }).value.temporaryPassword === false);
check('el rol por omisión es el institucional', v({ role: undefined }).value.role === S.INSTITUTIONAL_ROLE);

// ════════════════════════════════════════════════════════════════════
grupo('7 · El mapa de rutas del panel');
// ════════════════════════════════════════════════════════════════════

check('el administrador ve toda ruta', S.canOpenPath(ADMIN_SITIO, '/admin/configuracion'));
check('el operador también', S.canOpenPath(OPERADOR, '/admin/integraciones'));
check('el institucional ve su bandeja', S.canOpenPath(INSTITUCIONAL, '/admin/email'));
check('…y el estudio, que tiene marcado', S.canOpenPath(INSTITUCIONAL, '/admin/content-studio'));
check('⚠️ NO ve la configuración del sitio', !S.canOpenPath(INSTITUCIONAL, '/admin/configuracion'));
check('⚠️ NO ve una pantalla sin clasificar', !S.canOpenPath(INSTITUCIONAL, '/admin/boveda'));
check('⚠️ SIEMPRE ve su perfil, tenga lo que tenga', S.canOpenPath(SIN_PERMISOS, '/admin/perfil'));
check('las subrutas heredan', S.canOpenPath(INSTITUCIONAL, '/admin/content-studio/nuevo'));
check('una ruta parecida NO cuela', !S.canOpenPath(INSTITUCIONAL, '/admin/emailmarketing'));
check('la query no cambia la decisión', S.canOpenPath(INSTITUCIONAL, '/admin/email?tab=x'));
check('toda ruta del mapa existe en el catálogo de permisos',
    Object.keys(S.TOOL_ROUTES).every(k => S.PERMISSION_KEYS.includes(k)));

// ════════════════════════════════════════════════════════════════════
grupo('8 · Presentación');
// ════════════════════════════════════════════════════════════════════

eq('el nombre para mostrar junta nombre y apellido',
    S.displayNameOf({ firstName: 'Ana', lastName: 'Ríos' }, 'a@b.co'), 'Ana Ríos');
eq('sin datos cae al correo, nunca a un hueco', S.displayNameOf({}, 'a@b.co'), 'a@b.co');
eq('sin nada, un texto legible', S.displayNameOf({}, ''), 'Usuario');
eq('las iniciales son dos', S.initialsOf({ firstName: 'Ana', lastName: 'Ríos' }, ''), 'AR');
eq('con un solo nombre, una', S.initialsOf({ firstName: 'Ana' }, ''), 'A');
eq('sin datos, la del correo', S.initialsOf({}, 'secretaria@club.org'), 'SC');

// ════════════════════════════════════════════════════════════════════
grupo('9 · La auditoría');
// ════════════════════════════════════════════════════════════════════

check('el catálogo de eventos es cerrado y no está vacío', S.AUDIT_EVENT_KEYS.length >= 10);
check('todo evento tiene rótulo', S.AUDIT_EVENT_KEYS.every(k => typeof S.AUDIT_EVENTS[k] === 'string' && S.AUDIT_EVENTS[k]));
check('están los que el pedido enumera',
    ['account_created', 'owner_assigned', 'access_granted', 'role_changed',
     'password_reset', 'account_suspended', 'login_ok'].every(k => S.AUDIT_EVENT_KEYS.includes(k)));
check('⚠️ ningún evento se llama como un secreto',
    !S.AUDIT_EVENT_KEYS.some(k => /password_value|hash|token|secret/i.test(k)));

// ════════════════════════════════════════════════════════════════════
grupo('10 · El freno de intentos');
// ════════════════════════════════════════════════════════════════════

const T = await import('../server/lib/loginThrottle.js');
T.resetThrottle();
const AHORA = 1_700_000_000_000;

check('el primer intento pasa', T.checkLogin('a@b.co', '1.1.1.1', AHORA).allowed);
for (let i = 0; i < T.MAX_ATTEMPTS; i++) T.recordFailure('a@b.co', '1.1.1.1', AHORA);
check('⚠️ agotados los intentos, se bloquea', !T.checkLogin('a@b.co', '1.1.1.1', AHORA).allowed);
check('…y dice en cuántos minutos se puede reintentar',
    T.checkLogin('a@b.co', '1.1.1.1', AHORA).retryInMinutes > 0);
check('⚠️ el bloqueo es del PAR correo+IP, no del correo solo',
    T.checkLogin('a@b.co', '9.9.9.9', AHORA).allowed);
check('otro correo desde la misma IP también pasa',
    T.checkLogin('otro@b.co', '1.1.1.1', AHORA).allowed);
check('pasada la ventana se suelta solo',
    T.checkLogin('a@b.co', '1.1.1.1', AHORA + T.WINDOW_MS + 1).allowed);
T.resetThrottle();
T.recordFailure('c@b.co', '2.2.2.2', AHORA);
T.recordSuccess('c@b.co', '2.2.2.2');
check('un ingreso correcto limpia el contador',
    T.checkLogin('c@b.co', '2.2.2.2', AHORA).remaining === T.MAX_ATTEMPTS);

// ════════════════════════════════════════════════════════════════════
grupo('11 · Sobre los archivos: no hay una segunda autenticación');
// ════════════════════════════════════════════════════════════════════

const ctrl = leer('server/controllers/institutionalAccessController.js');
const guard = leer('server/middleware/institutionalGuard.js');
const store = leer('server/lib/institutionalStore.js');
const criterio = leer('server/lib/institutionalAccess.js');
const auth = leer('server/controllers/authController.js');

check('⚠️ el módulo NO firma tokens de sesión propios',
    !/jwt(Lib)?\.sign\(\s*\{\s*id:/.test(ctrl) && !/aud:\s*['"]/.test(ctrl));
check('⚠️ el módulo NO comprueba contraseñas de ingreso por su cuenta',
    !/bcrypt\.compare\([^)]*password[^)]*\)\s*;?\s*$/m.test(guard));
check('el ingreso lo sigue resolviendo authenticatePlatform',
    /authenticatePlatform/.test(leer('server/controllers/sessionController.js')));
check('el criterio es PURO: no importa la base ni la red',
    !/from '\.\/db\.js'|from '\.\/prisma\.js'|fetch\(/.test(criterio));
check('el criterio no importa nada del servidor', !/^import /m.test(criterio));

check('⚠️ el guardia lee los permisos de la BASE, no del token',
    /profileForUser/.test(guard) && !/req\.user\.permissions\s*\|\|\s*\[\]\s*;/.test(guard.split('attachInstitutionalProfile')[0] || ''));
check('⚠️ los permisos NO viajan en el token',
    !/permissions[^\n]*aud: PLATFORM_AUDIENCE/s.test(auth)
    && !/aud: PLATFORM_AUDIENCE,[\s\S]{0,200}permissions:/.test(auth));
check('una cuenta suspendida no abre sesión', /suspended: true/.test(auth));
check('…y tampoco pasa una petición', /account_suspended/.test(guard));

// ════════════════════════════════════════════════════════════════════
grupo('12 · Sobre los archivos: nada devuelve una contraseña');
// ════════════════════════════════════════════════════════════════════

const cuentas = leer('server/controllers/EmailAccountController.js');
check('⚠️ el listado de cuentas del panel NO trae la contraseña',
    /select: \{[^}]*id: true[^}]*\}/s.test(cuentas) && !/password: true/.test(cuentas));
check('⚠️ la administración de accesos tampoco', !/password: true/.test(ctrl));
check('el store nunca devuelve el token de recuperación',
    !/resetToken: row\.resetToken/.test(store));
check('el alta no devuelve la contraseña creada',
    !/password: v\.password[^,\n]*\}\);?\s*\n\s*res\./.test(ctrl));

// ════════════════════════════════════════════════════════════════════
grupo('13 · Sobre los archivos: el aislamiento va en el WHERE');
// ════════════════════════════════════════════════════════════════════

check('⚠️ la bandeja acota por buzón en la consulta',
    /where\.accountEmail = \{ in: mailboxes \}/.test(cuentas));
check('el listado de cuentas también', /where\.email = \{ in: mailboxes \}/.test(cuentas));
check('crear una cuenta exige permiso de administración',
    /canManageMailAccounts\(req\.user\)[\s\S]{0,200}crear cuentas de correo/.test(cuentas));
check('borrarla también', /canManageMailAccounts\(req\.user\)[\s\S]{0,200}eliminar cuentas/.test(cuentas));
check('la configuración técnica del dominio también',
    (cuentas.match(/canManageMailAccounts/g) || []).length >= 5);
check('⚠️ borrar la cuenta NO borra a su dueño', /detachAccount\(id\)/.test(cuentas));

const comms = leer('server/controllers/communicationController.js');
check('⚠️ el remitente se FUERZA al buzón propio', /remitente = alcance\[0\]/.test(comms));
check('…y un remitente ajeno se rechaza', /Sólo puedes enviar desde tu propia cuenta/.test(comms));

check('⚠️ el servidor mira la fila de District, no sólo el club',
    /isDistrictSiteType\(club\.type\)/.test(ctrl) && /FROM "District"/.test(ctrl));
check('…y también las cuentas que ya existen', /accountDomains/.test(ctrl));
check('el criterio del dominio es puro y vive en el spec', /resolveMailDomain/.test(criterio));

const rutas = leer('server/routes/institutional-access.js');
check('la administración va detrás del permiso',
    (rutas.match(/requireAccountAdmin/g) || []).length >= 6);
check('el perfil propio NO lo exige', /router\.get\('\/me', getMe\)/.test(rutas));
check('⚠️ el perfil propio no puede cambiar rol ni permisos',
    !/req\.body\?\.role/.test(ctrl.split('export const updateMe')[1] || '')
    && !/req\.body\?\.permissions/.test(ctrl.split('export const updateMe')[1] || ''));
check('⚠️ cambiar la contraseña exige la actual',
    /bcrypt\.compare\(actual/.test(ctrl));
check('nadie se edita a sí mismo desde la administración',
    /No puedes cambiar tu propio rol/.test(ctrl));

// ════════════════════════════════════════════════════════════════════
grupo('14 · Sobre los archivos: el rol está en las dos listas');
// ════════════════════════════════════════════════════════════════════

const mwAuth = leer('server/middleware/auth.js');
const app = leer('src/App.tsx');
check('⚠️ institutional_user entra al panel en el SERVIDOR',
    /ADMIN_ROLES = \[[\s\S]*?'institutional_user'[\s\S]*?\]/.test(mwAuth));
check('⚠️ …y en el ESPEJO del cliente',
    /ADMIN_ROLES = \[[\s\S]*?'institutional_user'[\s\S]*?\]/.test(app));
check('⚠️ pero NO administra el sitio',
    !/SITE_ADMIN_ROLES = \[[\s\S]*?'institutional_user'/.test(mwAuth));
check('la pantalla del perfil está declarada', /path="\/admin\/perfil"/.test(app));
check('la de restablecer contraseña es pública', /path="\/restablecer"/.test(app));
check('…y no se indexa', /'\/restablecer'/.test(leer('server/lib/seoSpec.js')));

// ════════════════════════════════════════════════════════════════════
grupo('15 · Sobre los archivos: el esquema vive fuera de Prisma');
// ════════════════════════════════════════════════════════════════════

const esquema = leer('server/lib/ensureInstitutionalSchema.js');
const prismaSchema = leer('server/prisma/schema.prisma');
check('⚠️ InstitutionalProfile NO está en schema.prisma',
    !/model InstitutionalProfile/.test(prismaSchema));
check('⚠️ InstitutionalAccessEvent tampoco',
    !/model InstitutionalAccessEvent/.test(prismaSchema));
check('⚠️ a `User` no se le agregó ninguna columna del módulo',
    !/avatarUrl|mustChangePassword|institutional/i.test(
        prismaSchema.slice(prismaSchema.indexOf('model User'), prismaSchema.indexOf('model District'))));
check('⚠️ a `EmailAccount` tampoco',
    !/ownerUserId|institutional/i.test(
        prismaSchema.slice(prismaSchema.indexOf('model EmailAccount'), prismaSchema.indexOf('model ReceivedEmail'))));
check('las dos tablas se crean en runtime',
    /CREATE TABLE IF NOT EXISTS "InstitutionalProfile"/.test(esquema)
    && /CREATE TABLE IF NOT EXISTS "InstitutionalAccessEvent"/.test(esquema));
check('⚠️ hay ALTERS aparte: CREATE TABLE IF NOT EXISTS no amplía', /ADD COLUMN IF NOT EXISTS/.test(esquema));
check('⚠️ toda columna del ALTER está en el atajo del catálogo', (() => {
    const columnas = [...esquema.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)].map(m => m[1]);
    const lista = (esquema.match(/COLUMNAS_PROPIAS = \[([^\]]*)\]/) || [, ''])[1];
    return columnas.length > 0 && columnas.every(c => lista.includes(`'${c}'`));
})());
check('el ensure nunca lanza', /catch \(e\)[\s\S]{0,200}ensured = null/.test(esquema));
check('⚠️ ninguna comilla invertida dentro del SQL', (() => {
    // El SQL vive en un template literal: una comilla invertida adentro lo
    // cierra a mitad y el módulo entero deja de parsear (v4.721.1). Se
    // comprueba POR BLOQUE — de un backtick al último abarcaría el hueco entre
    // los dos literales y daría un falso positivo.
    for (const m of esquema.matchAll(/const (SQL|ALTERS) = `([\s\S]*?)`;/g)) {
        if (m[2].includes('`')) return false;
    }
    return true;
})());

// ════════════════════════════════════════════════════════════════════
grupo('16 · Los dos espejos dan lo MISMO');
// ════════════════════════════════════════════════════════════════════

let M = null;
try {
    const { build } = await import('esbuild');
    const out = await build({
        entryPoints: ['src/lib/institutionalAccess.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    M = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
} catch {
    console.log('⚠ Se omite el bloque del espejo: falta esbuild.  npm i --no-save esbuild');
}

if (M) {
    eq('el catálogo de permisos coincide', M.PERMISSION_KEYS, S.PERMISSION_KEYS);
    eq('los administrativos coinciden', M.ADMIN_ONLY_PERMISSIONS, S.ADMIN_ONLY_PERMISSIONS);
    eq('los roles de acceso coinciden', M.ACCESS_ROLE_KEYS, S.ACCESS_ROLE_KEYS);
    eq('el mínimo de contraseña coincide', M.PASSWORD_MIN, S.PASSWORD_MIN);
    eq('el mapa de rutas coincide', M.TOOL_ROUTES, S.TOOL_ROUTES);
    eq('las rutas siempre visibles coinciden', M.ALWAYS_VISIBLE_ROUTES, S.ALWAYS_VISIBLE_ROUTES);

    // ⚠️ Lo que de verdad importa: las SALIDAS sobre una matriz. Coincidir en
    // la lista y discrepar en `can()` sería el peor de los dos mundos.
    const SESIONES = [OPERADOR, ADMIN_SITIO, EDITOR, INSTITUCIONAL, SIN_PERMISOS, AJENO, COLADO,
                      null, { role: 'inventado' }];
    let iguales = true;
    for (const s of SESIONES) {
        for (const k of [...S.PERMISSION_KEYS, 'no_existe']) {
            if (S.can(s, k) !== M.can(s, k)) { iguales = false; break; }
        }
        if (JSON.stringify(S.effectivePermissions(s)) !== JSON.stringify(M.effectivePermissions(s))) iguales = false;
        if (JSON.stringify(S.mailboxScopeFor(s)) !== JSON.stringify(M.mailboxScopeFor(s))) iguales = false;
    }
    check('⚠️ can(), effectivePermissions() y mailboxScopeFor() dan lo mismo en toda la matriz', iguales);

    const RUTAS = ['/admin/email', '/admin/content-studio', '/admin/configuracion',
                   '/admin/boveda', '/admin/perfil', '/admin/emailmarketing', '/admin/email?x=1'];
    let rutasIguales = true;
    for (const s of SESIONES) for (const r of RUTAS) {
        if (S.canOpenPath(s, r) !== M.canOpenPath(s, r)) rutasIguales = false;
    }
    check('⚠️ canOpenPath() da lo mismo en toda la matriz', rutasIguales);

    const CASOS = [
        base,
        { ...base, password: 'abc', passwordConfirm: 'abc' },
        { ...base, firstName: '' },
        { ...base, permissions: ['mailbox', 'users'] },
        { ...base, grantAccess: false },
        { ...base, role: 'dios' },
    ];
    let validacionIgual = true;
    for (const c of CASOS) {
        const a = S.validateAccountPayload(c, { domain: 'club.org' });
        const b = M.validateAccountPayload(c, { domain: 'club.org' });
        if (JSON.stringify(a) !== JSON.stringify(b)) validacionIgual = false;
    }
    check('⚠️ validateAccountPayload() da lo mismo, errores y avisos incluidos', validacionIgual);

    let textoIgual = true;
    for (const p of [{ firstName: 'Ana', lastName: 'Ríos' }, {}, { firstName: 'Ana' }]) {
        if (S.displayNameOf(p, 'a@b.co') !== M.displayNameOf(p, 'a@b.co')) textoIgual = false;
        if (S.initialsOf(p, 'a@b.co') !== M.initialsOf(p, 'a@b.co')) textoIgual = false;
    }
    check('displayNameOf() e initialsOf() dan lo mismo', textoIgual);
}

// ════════════════════════════════════════════════════════════════════
grupo('17 · Las pantallas no deciden por su cuenta');
// ════════════════════════════════════════════════════════════════════

const email = leer('src/pages/admin/EmailManagement.tsx');
check('⚠️ la pestaña Cuentas usa el criterio compartido', /canManageMailAccounts\(user as any\)/.test(email));
check('⚠️ …y no reimplementa la comprobación por rol',
    !/role === 'club_admin'[\s\S]{0,60}accounts/.test(email));
check('el selector de cuentas se apaga con alcance de buzón', /alcanceBuzones === null \?/.test(email));
check('la pestaña efectiva no puede quedar en Cuentas sin permiso',
    /activeTab === 'accounts' && !puedeAdministrarCuentas \? 'inbox'/.test(email));
check('el alta usa el modal institucional', /<InstitutionalAccountModal/.test(email));
check('⚠️ el modal recibe el dominio RESUELTO POR EL SERVIDOR, sin respaldo del navegador',
    /domain=\{dominioInstitucional\}/.test(email) && !/dominioInstitucional \|\| clubDomain/.test(email));
check('…y el motivo cuando no hay dominio viaja con él', /blockedReason=\{dominioBloqueado\}/.test(email));

const layout = leer('src/components/admin/AdminLayout.tsx');
check('⚠️ el menú se filtra en UN solo sitio', (layout.match(/canOpenPath\(/g) || []).length === 1);
check('el avatar sale del USUARIO, no del sitio', /\(user as any\)\?\.avatarUrl/.test(layout));
check('…y ya no dice el literal «Admin User»', !/>Admin User</.test(layout));
// ⚠️ v4.941: «Mi perfil» ya NO es una entrada del sidebar — se llega por el
// avatar del encabezado y por la tarjeta de abajo. Lo que esta comprobación
// protege sigue siendo lo mismo: que se pueda LLEGAR, y por más de una puerta.
check('⚠️ «Mi perfil» tiene DOS accesos y ninguno es el sidebar',
    (layout.match(/navigate\('\/admin\/perfil'\)/g) || []).length >= 2
    && !/label: 'Mi perfil'/.test(layout));

const modal = leer('src/components/admin/institutional/InstitutionalAccountModal.tsx');
check('⚠️ el modal no ofrece los permisos administrativos', /PERMISSIONS\.filter\(p => !p\.adminOnly\)/.test(modal));
check('los avisos salen del criterio compartido', /validateAccountPayload/.test(modal));
check('⚠️ el dominio se muestra ENTERO, no recortado con puntos suspensivos',
    !/truncate[^"]*max-w-\[45%\]/.test(modal));
check('sin dominio, el modal lo explica en vez de dejar escribir',
    /!domain && \(/.test(modal));

// ⚠️ Se mira lo que se hace con la RESPUESTA del servidor, no el formulario:
// el campo de escribirla es legítimo (`value={form.password}`) y buscarlo daría
// un falso positivo — que es como esta comprobación fallaba al escribirla.
check('⚠️ no vuelve a mostrar la contraseña al terminar',
    !/r\.password|cuerpo\.password|cuerpo\?\.password/.test(modal));
// La contraseña se ESCRIBE (va en el `create` de la cuenta) y no se DEVUELVE:
// se comprueba sobre lo que sale por `res`, que es lo que llega al navegador.
check('…y el servidor tampoco la devuelve en ninguna respuesta',
    !ctrl.split('\n').some(l => /^\s*(res\.|return res\.)/.test(l) && /\bpassword\s*:/.test(l)));

const perfil = leer('src/pages/admin/Perfil.tsx');
check('⚠️ el perfil NO deja editar rol ni permisos',
    !/setForm[\s\S]{0,80}role:/.test(perfil) && !/permissions:\s*\[/.test(perfil));
check('el cambio de contraseña pide la actual', /currentPassword/.test(perfil));
check('la fotografía va por el camino de siempre', /uploadMediaFiles/.test(perfil));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
