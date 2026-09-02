#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL MENÚ BASE DE UN USUARIO INSTITUCIONAL.  npm run test:institutional-menu
// v4.941.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro; el menú se arma
// sobre las rutas REALES declaradas en `AdminLayout.tsx`, no sobre una lista
// inventada para la prueba — si alguien mueve una entrada, esto se entera.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE EL SUPER ADMIN Y LOS ADMINISTRADORES NO CAMBIEN. Es lo más caro:
//      este menú es de los usuarios institucionales y no puede recortar el de
//      nadie más. Se comprueba entrada por entrada sobre las 66 del panel.
//
//   2. QUE EL MENÚ BASE SEA EXACTAMENTE EL PEDIDO. Ni una entrada de más
//      —«Bloques de Pago», «Eventos», «Configuración» no están— ni una de
//      menos.
//
//   3. QUE ESCONDER NO SEA LA SEGURIDAD. `news.delete` no está en el base, así
//      que el endpoint tiene que rechazarlo aunque se llame a mano.
//
//   4. QUE LOS QUE YA EXISTEN LO RECIBAN, sin perder lo suyo (sección 10).
//
//   5. QUE «MI PERFIL» SALGA DEL SIDEBAR Y NO DE LA APLICACIÓN: la ruta sigue,
//      y sus dos accesos —avatar del encabezado y tarjeta de abajo— también.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const S = await import('../server/lib/rbacSpec.js');
const IA = await import('../server/lib/institutionalAccess.js');

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
/** El archivo SIN comentarios: se busca la LLAMADA, no la MENCIÓN (v4.840). */
const codigo = f => leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const LAYOUT = leer('src/components/admin/AdminLayout.tsx');
/** Las rutas REALES del menú, leídas del propio archivo. */
const RUTAS = [...new Set([...LAYOUT.matchAll(/path:\s*'(\/admin[^']*)'/g)].map(m => m[1]))];

const INSTI = { id: 'in', role: 'institutional_user', email: 'presidencia@club.org', clubId: 'A' };
const ADMIN = { id: 'ad', role: 'club_admin', email: 'presidente@club.org', clubId: 'A' };
const EDITOR = { id: 'ed', role: 'editor', email: 'editor@club.org', clubId: 'A' };
const CROWD = { id: 'cw', role: 'crowdfunder', email: 'inversor@club.org', clubId: 'A' };
const OPERADOR = { id: 'op', role: 'administrator', email: 'plataforma@clubplatform.org', clubId: 'A' };

/** El filtro REAL de la barra lateral, con el grant ya resuelto. */
const menuDe = (user, extra = {}) => {
    const g = S.resolveGrant({ user, siteId: 'A', ...extra });
    const acotado = S.isRestrictedGrant(g);
    return RUTAS.filter(p => (acotado ? S.canOpenPath(g, p) : IA.canOpenPath(user, p)));
};

// ════════════════════════════════════════════════════════════════════
grupo('1 · ⚠️ NADIE MÁS CAMBIA (criterio 13 del pedido)');
// ════════════════════════════════════════════════════════════════════

check(`el operador de la plataforma ve las ${RUTAS.length} entradas`, menuDe(OPERADOR).length === RUTAS.length);
check('un administrador de sitio también', menuDe(ADMIN).length === RUTAS.length);
check('un editor de siempre también', menuDe(EDITOR).length === RUTAS.length);
check('⚠️ y un crowdfunder también', menuDe(CROWD).length === RUTAS.length);
// Su menú salía igual CON y SIN el mapa de respaldo, así que contarlo no
// comprobaba nada: sin el mapa cae en `canOpenPath` de v4.932, que no recorta.
// Lo que de verdad depende del mapa es su GRANT — de ahi sale si las rutas de
// contenido, que ahora piden permiso, le siguen abriendo.
const gCrowd = S.resolveGrant({ user: CROWD, siteId: 'A' });
check('⚠️ …y su grant resuelve a administrador del sitio, o perderia el contenido',
    gCrowd.roleKey === 'site_admin' && S.hasPermission(gCrowd, 'news.delete') && S.hasPermission(gCrowd, 'projects.edit'));
check('⚠️ ninguno de ellos ve el menú recortado',
    [OPERADOR, ADMIN, EDITOR, CROWD].every(u => !S.isRestrictedGrant(S.resolveGrant({ user: u, siteId: 'A' }))));
check('⚠️ y el rótulo de siempre no cambia para ellos',
    S.menuLabelFor('/admin/email', 'Bandeja de Entrada') === 'Bandeja de Entrada');

// ════════════════════════════════════════════════════════════════════
grupo('2 · ⚠️ EL MENÚ BASE ES EXACTAMENTE EL PEDIDO');
// ════════════════════════════════════════════════════════════════════

const BASE_ESPERADO = [
    // GENERAL
    '/admin/analytics', '/admin/leads', '/admin/email', '/admin/proyectos', '/admin/noticias',
    // CONTENIDO
    '/admin/miembros', '/admin/media', '/admin/imagenes-sitio', '/admin/descargas',
    // v4.986 — «Campañas de Contribución». La ruta VIEJA ya no es una entrada
    // del menú (redirige), así que no sale acá; que siga siendo ALCANZABLE se
    // comprueba en el grupo 8.
    '/admin/campanas-contribucion',
    // FINANZAS
    '/admin/inversion', '/admin/boveda',
    // `/admin/perfil` NO está: dejó de ser una entrada del menú en v4.941. Que
    // la ruta siga alcanzable se comprueba aparte, en el grupo 7.
];
const visto = menuDe(INSTI);
eq('⚠️ el usuario institucional ve exactamente los módulos base', visto.slice().sort(), BASE_ESPERADO.slice().sort());

// ⚠️ `/admin/bloques-pago` SIGUE fuera y es la mitad que hace defendible el
// cambio de v4.986: las campañas se separaron de los bloques de pago en dos
// módulos justamente para poder darle una al usuario institucional sin darle
// los importes de la página de aportes (regla de v4.941 — un permiso es tan
// ancho como las rutas de su módulo).
for (const fuera of ['/admin/bloques-pago', '/admin/eventos',
    '/admin/configuracion', '/admin/usuarios-permisos', '/admin/content-studio',
    '/admin/tienda', '/admin/integraciones', '/admin/faqs', '/admin/publicaciones']) {
    check(`⚠️ …y NO ${fuera}`, !visto.includes(fuera));
}
check('⚠️ tampoco los módulos de la plataforma',
    !visto.some(p => ['/admin/clubes', '/admin/distritos', '/admin/usuarios', '/admin/donaciones'].includes(p)));

// ════════════════════════════════════════════════════════════════════
grupo('3 · «Correo Institucional» es un RÓTULO, no un módulo nuevo');
// ════════════════════════════════════════════════════════════════════

eq('el rótulo cambia para el usuario institucional',
    S.menuLabelFor('/admin/email', 'Bandeja de Entrada', { institutional: true }), 'Correo Institucional');
check('⚠️ la RUTA no cambia: es la misma pantalla', visto.includes('/admin/email'));
check('⚠️ y el módulo tampoco: no se creó uno nuevo',
    S.moduleOf('email_inbox').routes.includes('/admin/email')
    && !S.MODULE_KEYS.some(k => /correo_institucional|institutional_mail/.test(k)));
check('cualquier otra entrada conserva su nombre',
    S.menuLabelFor('/admin/noticias', 'Noticias', { institutional: true }) === 'Noticias');
check('la tabla de rótulos vive en el criterio, no suelta en el JSX',
    /menuLabelFor\(item\.path, item\.label/.test(codigo('src/components/admin/AdminLayout.tsx'))
    && !/'Correo Institucional'/.test(codigo('src/components/admin/AdminLayout.tsx')));
check('⚠️ …y los dos espejos la comparten',
    /MENU_LABEL_OVERRIDES/.test(leer('src/lib/rbacSpec.ts')));

// ════════════════════════════════════════════════════════════════════
grupo('4 · ⚠️ ESCONDER NO ES LA SEGURIDAD (criterios 9 y 10)');
// ════════════════════════════════════════════════════════════════════

const gInsti = S.resolveGrant({ user: INSTI, siteId: 'A' });
check('puede LEER noticias', S.hasPermission(gInsti, 'news.view'));
check('puede crearlas y publicarlas', S.hasPermission(gInsti, 'news.create') && S.hasPermission(gInsti, 'news.publish'));
check('⚠️ y NO puede eliminarlas', !S.hasPermission(gInsti, 'news.delete'));
check('⚠️ ni eliminar proyectos', !S.hasPermission(gInsti, 'projects.delete'));
check('⚠️ puede MIRAR la Bóveda y NO mover dinero',
    S.hasPermission(gInsti, 'finance.view') && !S.hasPermission(gInsti, 'finance.manage'));
check('⚠️ ni administrar usuarios, roles, configuración o cuentas de correo',
    ['users.view', 'roles.view', 'settings.manage', 'email_accounts.view', 'audit.view', 'integrations.manage']
        .every(p => !S.hasPermission(gInsti, p)));

const rutasAdmin = codigo('server/routes/admin.js');
const rutasPay = codigo('server/routes/payouts.js');
check('⚠️ el DELETE de noticias comprueba `news.delete` en el servidor',
    /router\.delete\('\/posts\/:id',\s*requireRoleOrPermission\(contentRoles,\s*'news\.delete'\)/.test(rutasAdmin));
check('…y el borrado en bloque también',
    /router\.post\('\/posts\/bulk-delete',\s*requireRoleOrPermission\(contentRoles,\s*'news\.delete'\)/.test(rutasAdmin));
check('⚠️ leer y borrar NO comparten permiso',
    /router\.get\('\/posts',\s*requireRoleOrPermission\(contentRoles,\s*'news\.view'\)/.test(rutasAdmin));
check('crear y editar declaran el suyo',
    /'news\.create'/.test(rutasAdmin) && /'news\.edit'/.test(rutasAdmin));
check('proyectos declara las cuatro acciones',
    ['projects.view', 'projects.create', 'projects.edit', 'projects.delete'].every(p => rutasAdmin.includes(`'${p}'`)));
check('el directorio de socios comprueba `members.edit`', /'members\.edit'/.test(rutasAdmin));
check('⚠️ la Bóveda se LEE con `finance.view`…', /'finance\.view'/.test(rutasPay));
check('⚠️ …y el retiro sigue exigiendo administrador del sitio',
    /router\.post\('\/request',\s*requireSiteAdmin/.test(rutasPay));

const guardia = codigo('server/middleware/institutionalGuard.js');
check('⚠️ el guardia nuevo pasa por el ROL de siempre o por el permiso',
    /export const requireRoleOrPermission/.test(guardia)
    && /permitidos\.includes\(req\.user\?\.role\)/.test(guardia));
check('…y aun con el rol, una cuenta suspendida no pasa',
    /requireRoleOrPermission[\s\S]{0,700}sessionRejection\(req, grant\)/.test(guardia));

// ════════════════════════════════════════════════════════════════════
grupo('5 · ⚠️ LOS QUE YA EXISTEN (sección 10)');
// ════════════════════════════════════════════════════════════════════

// Un institucional de v4.932 tiene su lista GRUESA escrita en la fila y no pasa
// por el preset: sin la unión, el menú base no le llegaría jamás.
const viejo = S.resolveGrant({ user: INSTI, siteId: 'A', legacyPermissions: ['mailbox', 'events', 'content_studio'] });
check('conserva lo que alguien le concedió a mano',
    S.hasPermission(viejo, 'events.create') && S.hasPermission(viejo, 'content_studio.publish'));
check('⚠️ …y RECIBE el menú base sin recrear nada',
    ['news.create', 'projects.view', 'members.view', 'finance.view', 'analytics.view']
        .every(p => S.hasPermission(viejo, p)));
check('⚠️ …sin ganar lo que el base no trae', !S.hasPermission(viejo, 'news.delete'));
check('⚠️ …ni lo administrativo escrito en su fila',
    !S.hasPermission(S.resolveGrant({ user: INSTI, siteId: 'A', legacyPermissions: ['mailbox', 'users', 'site_settings'] }), 'users.manage'));
check('un institucional SIN fila también lo recibe (por el preset)',
    S.presetRole('institutional_user').permissions === S.INSTITUTIONAL_BASE);
check('⚠️ no hace falta migrar ni una fila: se traduce AL LEER',
    !/UPDATE "InstitutionalProfile"[^;]*permissions/.test(codigo('server/lib/rbacSpec.js')));

// ════════════════════════════════════════════════════════════════════
grupo('6 · ⚠️ EL AISLAMIENTO POR SITIO (sección 8)');
// ════════════════════════════════════════════════════════════════════

const mOtro = { siteId: 'B', roleKey: 'site_admin', status: 'active', rolePermissions: S.presetRole('site_admin').permissions };
const gCruzado = S.resolveGrant({ user: INSTI, siteId: 'A', membership: mOtro });
check('⚠️ una membresía de OTRO sitio no concede nada acá', gCruzado.source !== 'membership');
check('…y el usuario se queda con su base del sitio A', S.hasPermission(gCruzado, 'news.view') && !S.hasPermission(gCruzado, 'users.manage'));
check('el alcance de buzones sigue acotado a SU cuenta',
    Array.isArray(IA.mailboxScopeFor({ ...INSTI, mailbox: 'presidencia@club.org' })));
check('⚠️ y el sitio lo manda la BASE, no el token',
    /if \(perfil\.clubId\) req\.user\.clubId = perfil\.clubId/.test(guardia));

// ════════════════════════════════════════════════════════════════════
grupo('7 · «Mi perfil» sale del SIDEBAR, no de la aplicación');
// ════════════════════════════════════════════════════════════════════

const layoutCodigo = codigo('src/components/admin/AdminLayout.tsx');
check('⚠️ ya no se empuja como entrada del menú',
    !/label:\s*'Mi perfil',\s*\n\s*path:\s*'\/admin\/perfil'/.test(layoutCodigo));
check('⚠️ pero la RUTA sigue viva y visible para toda sesión',
    S.ALWAYS_VISIBLE_ROUTES.includes('/admin/perfil') && IA.ALWAYS_VISIBLE_ROUTES.includes('/admin/perfil'));
check('…y sigue alcanzable con cualquier permiso',
    S.canOpenPath(S.resolveGrant({ user: INSTI, siteId: 'A' }), '/admin/perfil')
    && IA.canOpenPath(INSTI, '/admin/perfil'));
check('⚠️ ACCESO A: el avatar del encabezado lleva al perfil',
    /navigate\('\/admin\/perfil'\)/.test(layoutCodigo) && /aria-haspopup="menu"/.test(layoutCodigo));
check('⚠️ ACCESO B: la tarjeta de abajo también',
    (layoutCodigo.match(/navigate\('\/admin\/perfil'\)/g) || []).length >= 2);
check('el desplegable ofrece perfil, contraseña y salir',
    /Mi perfil/.test(layoutCodigo) && /Cambiar contraseña/.test(layoutCodigo) && /Cerrar sesión/.test(layoutCodigo));
check('…y muestra quién es: nombre, correo y rol',
    /displayNameOf\(user as any/.test(layoutCodigo) && /acceso\.grant\?\.roleLabel/.test(layoutCodigo));
check('⚠️ el correo del desplegable es un DATO y no se traduce',
    /data-no-translate>\{user\?\.email\}/.test(layoutCodigo));
check('⚠️ el avatar va DESPUÉS de mensajes y ANTES de «Abrir Sitio»',
    layoutCodigo.indexOf('unreadLeads > 99') < layoutCodigo.indexOf('aria-haspopup="menu"')
    && layoutCodigo.indexOf('aria-haspopup="menu"') < layoutCodigo.indexOf('Abrir Sitio'));
check('el desplegable se cierra al pulsar fuera y con Escape',
    /Escape/.test(layoutCodigo) && /mousedown/.test(layoutCodigo));
check('…y al navegar', /setMenuPerfilAbierto\(false\); \}, \[location\.pathname\]\)/.test(layoutCodigo));
check('⚠️ no hay una segunda pantalla de perfil',
    !/pages\/admin\/(Perfil2|MiPerfil|Profile)/.test(leer('src/App.tsx')));

// ════════════════════════════════════════════════════════════════════
grupo('8 · No se duplicó ningún módulo (sección 9)');
// ════════════════════════════════════════════════════════════════════

// ⚠️ UNA RUTA EN DOS MÓDULOS SÓLO VALE SI SON DE ALCANCE DISTINTO (v4.986).
// `/admin/campanas-contribucion` está en `contribution_campaigns` (sitio) y en
// `platform_global` (plataforma): es UNA dirección con DOS vistas según el rol,
// y `canOpenPath` usa `.some`, así que cada uno la abre por el suyo. Dos
// módulos del MISMO alcance para una ruta sí serían dos conceptos otra vez.
const rutasDeclaradas = S.MODULES.flatMap(m => m.routes);
const repetidasMismoAlcance = [...new Set(rutasDeclaradas)]
    .filter(r => r !== '/admin/email' && r !== '/admin/usuarios-permisos')
    .filter(r => {
        const alcances = S.MODULES.filter(m => m.routes.includes(r)).map(m => m.scope);
        return alcances.length !== new Set(alcances).size;
    });
eq('⚠️ ninguna ruta pertenece a dos módulos del mismo alcance', repetidasMismoAlcance, []);
check('⚠️ …y la de campañas está en los DOS alcances a propósito',
    S.moduleOf('contribution_campaigns').scope === 'site'
    && S.moduleOf('contribution_campaigns').routes.includes('/admin/campanas-contribucion')
    && S.moduleOf('platform_global').routes.includes('/admin/campanas-contribucion'));
check('⚠️ los bloques de pago quedaron en SU propio módulo, aparte de las campañas',
    S.moduleOf('contributions').routes.includes('/admin/bloques-pago')
    && !S.moduleOf('contributions').routes.includes('/admin/campanas-contribucion')
    && !S.moduleOf('contribution_campaigns').routes.includes('/admin/bloques-pago'));
check('`members` salió de `users`, no se creó un directorio nuevo',
    S.moduleOf('members').routes.includes('/admin/miembros')
    && !S.moduleOf('users').routes.includes('/admin/miembros'));
check('⚠️ …y un administrador de sitio no perdió nada al separarlo',
    ['members.view', 'members.create', 'members.edit', 'members.delete']
        .every(p => S.SITE_ADMIN_PERMISSIONS.includes(p)));
check('`contribution_campaigns` recoge la pantalla que NADIE clasificaba',
    S.moduleOf('contribution_campaigns').routes.includes('/admin/maneras-de-contribuir'));
check('…y `finance` le cedió los bloques de pago',
    !S.moduleOf('finance').routes.includes('/admin/bloques-pago'));
check('`investment` reutiliza la ruta que ya existía',
    S.moduleOf('investment').routes.includes('/admin/inversion')
    && /path="\/admin\/inversion"/.test(leer('src/App.tsx')));
check('⚠️ el menú NO es una lista aparte: se filtra la de siempre',
    (layoutCodigo.match(/getMenuItems\(\)/g) || []).length === 1);
check('⚠️ y «Mi Inversión» se abre por permiso, sin una segunda condición escrita a mano',
    /acceso\.has\('investment\.view'\)/.test(layoutCodigo));

// ⚠️ Todo módulo del base tiene que existir de verdad en el catálogo.
check('⚠️ ningún permiso del menú base apunta a un módulo inexistente',
    S.expandPermissions(S.INSTITUTIONAL_BASE).descartados.length === 0);

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
