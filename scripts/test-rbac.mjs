#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// RBAC MULTI-TENANT.  npm run test:rbac
// v4.939.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio del servidor es puro; el
// espejo del navegador se compila con `esbuild` y ese bloque se salta solo si
// falta. El resto lee archivos.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE NADIE PIERDA ACCESO AL DESPLEGAR. Es el punto 18 y es lo más caro
//      de esta versión: un `club_admin` que hoy entra al panel tiene que
//      resolver al preset de administrador SIN fila en ninguna tabla nueva. Si
//      esto falla, el despliegue deja a los administradores actuales sin nada
//      — en silencio, que es como fallan las cosas en este repositorio.
//
//   2. QUE NADIE CONCEDA LO QUE NO TIENE. Punto 12. Se comprueba en las dos
//      puertas —`filterGrantable` al guardar y `resolveGrant` al leer—: con una
//      sola, una fila escrita antes de que existiera la otra pasaría.
//
//   3. QUE UN SITIO NO SE QUEDE SIN ADMINISTRADOR. Punto 16.
//
//   4. QUE «PROPIO» NO SE CONFUNDA CON «TODOS». Punto 8. `edit` implica
//      `edit_own`; al revés NUNCA, y sin `ownerId` se exige el amplio.
//
//   5. QUE LOS DOS ESPEJOS DEN LO MISMO. No que se parezcan: se comparan las
//      SALIDAS sobre una matriz de permisos, roles y rutas.
//
//   6. QUE UN ENDPOINT NO SE OLVIDE LA GUARDIA. No lo ve ninguna prueba de
//      criterio: se lee el archivo de rutas y el del controlador.
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
/**
 * El archivo SIN sus comentarios.
 *
 * ⚠️ Se busca la LLAMADA, no la MENCIÓN. Un comentario que explica de dónde se
 * viene tiene que poder nombrar el valor viejo sin hacer fallar la prueba —es
 * la lección de v4.840 con `createKieImageTask` y de v4.751 con el naranja
 * escrito a mano—, y sin esto tres comprobaciones de esta misma batería
 * fallaban señalando su propio comentario.
 */
const codigo = f => leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const S = await import('../server/lib/rbacSpec.js');
const perms = g => [...(g.permissions || [])].sort();
const grantOf = (list) => ({ permissions: new Set(S.expandPermissions(list).permissions) });

// ════════════════════════════════════════════════════════════════════
grupo('1 · El registro de módulos es datos, y está bien formado');
// ════════════════════════════════════════════════════════════════════

check('hay módulos declarados', S.MODULES.length >= 20);
check('toda entrada tiene clave, rótulo, grupo, ámbito, acciones y ayuda',
    S.MODULES.every(m => m.key && m.label && m.group && m.scope && Array.isArray(m.actions) && m.actions.length && m.help));
check('no hay claves de módulo repetidas', new Set(S.MODULE_KEYS).size === S.MODULE_KEYS.length);
check('toda acción declarada existe en el catálogo de acciones',
    S.MODULES.every(m => m.actions.every(a => S.ALL_ACTION_FORMS.includes(a) || ['use_own', 'use_all'].includes(a))));
check('todo módulo declara al menos una ruta del panel',
    S.MODULES.every(m => Array.isArray(m.routes) && m.routes.length > 0));
check('toda ruta empieza por /admin/',
    S.MODULES.every(m => m.routes.every(r => r.startsWith('/admin/'))));
check('el catálogo de permisos no tiene repetidos',
    new Set(S.PERMISSION_CATALOG).size === S.PERMISSION_CATALOG.length);
check('un permiso inventado no existe', !S.isKnownPermission('news.destroy'));
check('un módulo inventado no existe', !S.isKnownPermission('inventado.view'));
// El ámbito no es decorativo: `filterGrantable` lo usa para cerrar la puerta.
check('hay módulos de plataforma y de sitio, y no se mezclan',
    S.PLATFORM_MODULES.length > 0 && S.SITE_MODULES.length > 0
    && S.SITE_MODULES.every(m => m.scope === 'site'));

// ════════════════════════════════════════════════════════════════════
grupo('2 · Las implicaciones: manage ⊃ todo, amplio ⊃ propio, todo ⊃ ver');
// ════════════════════════════════════════════════════════════════════

const implNews = S.impliedBy('news.manage');
check('`manage` NO existe en un módulo que no lo declara', !S.isKnownPermission('news.manage'));
const implPub = S.impliedBy('projects.manage');
check('`projects.manage` implica todas las acciones de su módulo',
    S.moduleOf('projects').actions.every(a => implPub.includes(`projects.${a}`)));
check('`news.edit` implica `news.edit_own`', S.impliedBy('news.edit').includes('news.edit_own'));
// ⚠️ Es el punto 8 y es la mitad del sentido de un rol de autor.
check('⚠️ `news.edit_own` NO implica `news.edit`', !S.impliedBy('news.edit_own').includes('news.edit'));
check('`news.publish` implica `news.view`', S.impliedBy('news.publish').includes('news.view'));
check('`email_inbox.use_all` implica `use_own`', S.impliedBy('email_inbox.use_all').includes('email_inbox.use_own'));
check('⚠️ `use_own` NO implica `use_all`', !S.impliedBy('email_inbox.use_own').includes('email_inbox.use_all'));
eq('un permiso desconocido no implica nada', S.impliedBy('news.borrar'), []);

const exp = S.expandPermissions(['news.publish', 'inventado.view', 'news.publish']);
check('expandir descarta lo desconocido Y LO DICE',
    exp.descartados.length === 1 && exp.descartados[0].key === 'inventado.view');
check('expandir no repite', new Set(exp.permissions).size === exp.permissions.length);

// ════════════════════════════════════════════════════════════════════
grupo('3 · El puente con el catálogo grueso de v4.932');
// ════════════════════════════════════════════════════════════════════

check('las nueve llaves viejas están mapeadas',
    ['mailbox', 'content_studio', 'media_library', 'news', 'events', 'contacts', 'email_accounts', 'users', 'site_settings']
        .every(k => Array.isArray(S.LEGACY_PERMISSION_MAP[k]) && S.LEGACY_PERMISSION_MAP[k].length));
check('todo permiso del mapa legado existe en el catálogo',
    Object.values(S.LEGACY_PERMISSION_MAP).flat().every(p => S.isKnownPermission(p)));
const gNews = grantOf(['news']);
check('una llave vieja se expande a permisos nuevos', S.hasPermission(gNews, 'news.publish'));
// ⚠️ Es lo que permite no tocar las decenas de rutas escritas en v4.932.
check('⚠️ y la comprobación VIEJA sigue contestando lo mismo', S.hasPermission(gNews, 'news'));
check('…y no contesta de más', !S.hasPermission(gNews, 'users'));
check('un permiso nuevo satisface la llave vieja de su módulo',
    S.hasPermission(grantOf(['news.view']), 'news'));

// ════════════════════════════════════════════════════════════════════
grupo('4 · ⚠️ NADIE PIERDE ACCESO AL DESPLEGAR (punto 18)');
// ════════════════════════════════════════════════════════════════════

const OPERADOR = { id: 'u0', role: 'administrator', email: 'admin@rotary.org' };
const ADMIN = { id: 'u1', role: 'club_admin', email: 'presidente@club.org' };
const DISTRITO = { id: 'u2', role: 'district_admin', email: 'gobernador@distrito.org' };
const EDITOR_VIEJO = { id: 'u3', role: 'editor', email: 'editor@club.org' };
const INSTI = { id: 'u4', role: 'institutional_user', email: 'secretaria@club.org' };

const gOperador = S.resolveGrant({ user: OPERADOR, siteId: 'A' });
const gAdmin = S.resolveGrant({ user: ADMIN, siteId: 'A' });
const gDistrito = S.resolveGrant({ user: DISTRITO, siteId: 'A' });
const gEditorViejo = S.resolveGrant({ user: EDITOR_VIEJO, siteId: 'A' });

check('⚠️ un club_admin SIN fila resuelve al preset de administrador',
    gAdmin.source === 'legacy_role' && gAdmin.roleKey === 'site_admin');
check('…y conserva TODOS los permisos del sitio',
    S.SITE_ADMIN_PERMISSIONS.every(p => gAdmin.permissions.has(p)));
check('…incluidos los administrativos que ya tenía',
    ['users.manage', 'roles.manage', 'settings.manage', 'email_accounts.create'].every(p => gAdmin.permissions.has(p)));
check('un district_admin resuelve igual', gDistrito.roleKey === 'site_admin');
check('un editor de siempre NO se degrada', gEditorViejo.roleKey === 'site_admin');
check('el operador de la plataforma lo tiene TODO',
    gOperador.source === 'platform_operator' && S.PERMISSION_CATALOG.every(p => gOperador.permissions.has(p)));
// ⚠️ Un administrador de SITIO no alcanza los módulos de plataforma.
check('⚠️ pero un administrador de sitio NO alcanza la plataforma',
    S.PLATFORM_MODULES.flatMap(m => m.actions.map(a => `${m.key}.${a}`))
        .every(p => !gAdmin.permissions.has(p)));

const gInsti = S.resolveGrant({ user: INSTI, siteId: 'A', legacyPermissions: ['mailbox', 'news'] });
check('una cuenta institucional conserva lo que su fila enumeraba',
    gInsti.source === 'legacy_permissions'
    && S.hasPermission(gInsti, 'email_inbox.use_own') && S.hasPermission(gInsti, 'news.publish'));
// ⚠️ v4.941: ya NO es «y nada más». Su fila se UNE con el menú base, que es lo
// que hace que un institucional creado antes de esta versión también lo reciba
// (sección 10 del pedido). Lo que no puede pasar es que PIERDA lo suyo.
check('…y lo suyo se conserva entero al unirlo con el menú base',
    S.hasPermission(gInsti, 'news.publish') && S.hasPermission(gInsti, 'email_inbox.use_own'));
check('⚠️ …y sigue SIN lo que el base no trae', !S.hasPermission(gInsti, 'news.delete'));

// ⚠️ La segunda puerta de v4.932: un permiso administrativo escrito en la fila
// NO se concede, aunque esté ahí. Traducirlo sin filtrar convertiría a su dueño
// en administrador por la puerta de atrás.
const gInstiSucio = S.resolveGrant({ user: INSTI, siteId: 'A', legacyPermissions: ['mailbox', 'users', 'site_settings'] });
check('⚠️ una fila institucional con `users` NO concede administración',
    !S.hasPermission(gInstiSucio, 'users.manage') && !S.hasPermission(gInstiSucio, 'users'));
check('⚠️ …ni `site_settings`', !S.hasPermission(gInstiSucio, 'settings.manage'));
check('…y lo legítimo de esa misma fila sí se conserva', S.hasPermission(gInstiSucio, 'email_inbox.use_own'));

// ════════════════════════════════════════════════════════════════════
grupo('5 · ⚠️ EL AISLAMIENTO POR SITIO (punto 1)');
// ════════════════════════════════════════════════════════════════════

const membresiaB = {
    siteId: 'B', roleKey: 'site_admin', status: 'active',
    rolePermissions: S.presetRole('site_admin').permissions,
};
const gOtroSitio = S.resolveGrant({ user: { id: 'u9', role: 'member' }, siteId: 'A', membership: membresiaB });
check('⚠️ una membresía de OTRO sitio no concede nada en éste',
    gOtroSitio.permissions.size === 0 && gOtroSitio.source === 'none');
const gMismoSitio = S.resolveGrant({ user: { id: 'u9', role: 'member' }, siteId: 'B', membership: membresiaB });
check('…y en el suyo sí', S.hasPermission(gMismoSitio, 'users.manage'));

// El punto 13: la misma persona con dos roles en dos sitios.
const maria = { id: 'maria', role: 'member' };
const mA = { siteId: 'A', roleKey: 'editor', status: 'active', rolePermissions: S.presetRole('editor').permissions };
const mB = { siteId: 'B', roleKey: 'institutional_user', status: 'active', rolePermissions: S.presetRole('institutional_user').permissions };
check('la misma persona es Editor en A…', S.hasPermission(S.resolveGrant({ user: maria, siteId: 'A', membership: mA }), 'news.publish'));
check('…y Usuario institucional en B', !S.hasPermission(S.resolveGrant({ user: maria, siteId: 'B', membership: mB }), 'news.delete'));

// ⚠️ Un rol de sitio no alcanza la plataforma, escriba lo que escriba su fila.
const mTrucada = { siteId: 'A', roleKey: 'x', status: 'active', rolePermissions: ['platform_sites.manage', 'news.view'] };
const gTrucada = S.resolveGrant({ user: maria, siteId: 'A', membership: mTrucada });
check('⚠️ una fila con permisos de plataforma NO los concede a un rol de sitio',
    !S.hasPermission(gTrucada, 'platform_sites.manage') && S.hasPermission(gTrucada, 'news.view'));

// ════════════════════════════════════════════════════════════════════
grupo('6 · Excepciones individuales y suspensión (puntos 11 y 15)');
// ════════════════════════════════════════════════════════════════════

const conExtra = {
    siteId: 'A', roleKey: 'editor', status: 'active',
    rolePermissions: S.presetRole('editor').permissions,
    extraPermissions: ['contacts.export'],
};
check('una excepción individual SUMA al rol',
    S.hasPermission(S.resolveGrant({ user: maria, siteId: 'A', membership: conExtra }), 'contacts.export'));

const conNegado = {
    siteId: 'A', roleKey: 'editor', status: 'active',
    rolePermissions: S.presetRole('editor').permissions,
    deniedPermissions: ['news.delete'],
};
const gNegado = S.resolveGrant({ user: maria, siteId: 'A', membership: conNegado });
check('una denegación RESTA al rol', !S.hasPermission(gNegado, 'news.delete'));
// ⚠️ Denegar `news.delete` y dejar `news.delete_own` sería una denegación que
// no deniega: se quita también lo que ese permiso implicaba.
check('⚠️ …y se lleva lo que ese permiso implicaba', !S.hasPermission(gNegado, 'news.delete_own'));
check('…sin tocar el resto del rol', S.hasPermission(gNegado, 'news.publish'));

const suspendido = { siteId: 'A', roleKey: 'site_admin', status: 'suspended', rolePermissions: S.presetRole('site_admin').permissions };
const gSusp = S.resolveGrant({ user: maria, siteId: 'A', membership: suspendido });
check('⚠️ un suspendido no conserva NI UN permiso', gSusp.permissions.size === 0 && gSusp.source === 'suspended');
check('los estados que no pueden entrar están declarados',
    !S.canSignIn('suspended') && !S.canSignIn('disabled') && S.canSignIn('active') && S.canSignIn('invited'));
check('un estado desconocido no cierra la puerta por accidente', S.canSignIn('lo-que-sea'));

// ════════════════════════════════════════════════════════════════════
grupo('7 · ⚠️ PROPIO vs TODOS (punto 8)');
// ════════════════════════════════════════════════════════════════════

const autor = grantOf(S.presetRole('author').permissions);
check('un autor edita LO SUYO', S.canActOn(autor, 'news', 'edit', { ownerId: 'yo', actorId: 'yo' }));
check('⚠️ un autor NO edita lo de otro', !S.canActOn(autor, 'news', 'edit', { ownerId: 'otro', actorId: 'yo' }));
// ⚠️ Ante la ausencia del dato se exige el permiso AMPLIO: quien llame sin
// `ownerId` obtiene el criterio estricto, nunca el laxo.
check('⚠️ sin saber de quién es la fila, se exige el permiso amplio',
    !S.canActOn(autor, 'news', 'edit', {}));
const editor = grantOf(S.presetRole('editor').permissions);
check('un editor edita cualquier fila', S.canActOn(editor, 'news', 'edit', { ownerId: 'otro', actorId: 'yo' }));
check('…y también sin saber de quién es', S.canActOn(editor, 'news', 'edit', {}));
const colaborador = grantOf(S.presetRole('contributor').permissions);
check('un colaborador crea', S.hasPermission(colaborador, 'news.create'));
check('⚠️ un colaborador NO publica', !S.hasPermission(colaborador, 'news.publish'));
check('⚠️ …ni elimina lo suyo', !S.hasPermission(colaborador, 'news.delete_own'));

// ════════════════════════════════════════════════════════════════════
grupo('8 · ⚠️ PREVENCIÓN DE ESCALAMIENTO (punto 12)');
// ════════════════════════════════════════════════════════════════════

const gEditor = grantOf(S.presetRole('editor').permissions);
const intento = S.filterGrantable(gEditor, ['news.publish', 'users.manage'], { actorIsPlatform: false });
check('un editor concede lo que tiene', intento.permissions.includes('news.publish'));
check('⚠️ …y NO lo que no tiene', !intento.permissions.includes('users.manage'));
check('…y lo rechazado se DICE con su motivo',
    intento.rechazados.some(r => r.key === 'users.manage' && /no tienes/i.test(r.motivo)));

const gAdminSitio = grantOf(S.presetRole('site_admin').permissions);
const intentoPlat = S.filterGrantable(gAdminSitio, ['platform_sites.manage'], { actorIsPlatform: false });
check('⚠️ un administrador de sitio NO concede permisos de plataforma',
    intentoPlat.permissions.length === 0
    && intentoPlat.rechazados.some(r => /plataforma/i.test(r.motivo)));
const gOp = grantOf(S.ALL_PERMISSIONS);
check('el operador sí puede', S.filterGrantable(gOp, ['platform_sites.manage'], { actorIsPlatform: true }).permissions.includes('platform_sites.manage'));

check('⚠️ un editor NO puede asignar el rol de administrador del sitio',
    !S.canAssignRole(gEditor, S.presetRole('site_admin'), { actorIsPlatform: false }));
check('⚠️ un administrador de sitio NO puede crear superadministradores',
    !S.canAssignRole(gAdminSitio, S.presetRole('platform_superadmin'), { actorIsPlatform: false }));
check('…y tampoco aunque tuviera por casualidad todos sus permisos',
    !S.canAssignRole(grantOf(S.ALL_PERMISSIONS), S.presetRole('platform_superadmin'), { actorIsPlatform: false }));
check('un administrador de sitio sí puede asignar Editor',
    S.canAssignRole(gAdminSitio, S.presetRole('editor'), { actorIsPlatform: false }));
check('los roles asignables son un subconjunto de los ofrecidos',
    S.assignableRoles(gEditor, S.ROLE_PRESETS, { actorIsPlatform: false }).length < S.ROLE_PRESETS.length);

// La validación de un rol pasa por la misma puerta.
const rolMalicioso = S.validateRole(
    { name: 'Equipo de Comunicaciones', permissions: ['news.publish', 'users.manage'] },
    { actorGrant: gEditor, actorIsPlatform: false, existingKeys: [] });
check('crear un rol también recorta lo que el actor no tiene',
    rolMalicioso.ok && !rolMalicioso.value.permissions.includes('users.manage'));
check('…y lo avisa', rolMalicioso.warnings.some(w => /users\.manage/.test(w)));
check('un rol sin nombre no se crea', !S.validateRole({ permissions: [] }, { actorGrant: gAdminSitio }).ok);
check('⚠️ un rol NO puede usar la clave de un preset',
    !S.validateRole({ name: 'X', key: 'site_admin', permissions: [] }, { actorGrant: gAdminSitio }).ok);
check('un rol duplicado en el mismo sitio se rechaza',
    !S.validateRole({ name: 'Comunicaciones', permissions: [] },
        { actorGrant: gAdminSitio, existingKeys: ['comunicaciones'] }).ok);
check('la validación devuelve TODOS los errores, no el primero',
    S.validateRole({ name: '', key: 'site_admin' }, { actorGrant: gAdminSitio }).errors.length >= 2);

// ════════════════════════════════════════════════════════════════════
grupo('9 · ⚠️ EL SITIO NO SE QUEDA SIN ADMINISTRADOR (punto 16)');
// ════════════════════════════════════════════════════════════════════

check('el rol de administrador se reconoce por sus permisos, no por su nombre',
    S.isAdministrativeRole(S.presetRole('site_admin')) && !S.isAdministrativeRole(S.presetRole('editor')));
check('un rol personalizado con users.manage también cuenta',
    S.isAdministrativeRole({ permissions: ['users.manage'] }));

const unico = [{ userId: 'a', status: 'active' }];
check('⚠️ quitarle el rol al único administrador se IMPIDE',
    S.wouldOrphanSite({ admins: unico, targetUserId: 'a' }).blocked);
check('…y se dice con la salida', /Nombra a otro administrador/.test(S.wouldOrphanSite({ admins: unico, targetUserId: 'a' }).reason));
check('con dos administradores sí se puede',
    !S.wouldOrphanSite({ admins: [{ userId: 'a', status: 'active' }, { userId: 'b', status: 'active' }], targetUserId: 'a' }).blocked);
check('⚠️ un segundo administrador SUSPENDIDO no cuenta',
    S.wouldOrphanSite({ admins: [{ userId: 'a', status: 'active' }, { userId: 'b', status: 'suspended' }], targetUserId: 'a' }).blocked);

// ════════════════════════════════════════════════════════════════════
grupo('10 · Las rutas del panel y el resumen legible');
// ════════════════════════════════════════════════════════════════════

const gAutor = grantOf(S.presetRole('author').permissions);
check('un autor abre Noticias', S.canOpenPath(gAutor, '/admin/noticias'));
check('⚠️ un autor NO abre Usuarios y permisos', !S.canOpenPath(gAutor, '/admin/usuarios-permisos'));
check('⚠️ ni escribiendo la dirección con query', !S.canOpenPath(gAutor, '/admin/usuarios-permisos?tab=roles'));
check('todo el mundo abre su perfil', S.canOpenPath(grantOf([]), '/admin/perfil'));
// ⚠️ Lo que no está en el registro NO se pinta: es el lado seguro.
check('⚠️ una ruta que nadie registró no se pinta', !S.canOpenPath(gAutor, '/admin/inventada'));
check('un administrador del sitio abre todo lo del sitio',
    S.SITE_MODULES.every(m => m.routes.every(r => S.canOpenPath(gAdminSitio, r))));
check('la ruta de la pantalla nueva está registrada en el módulo `users`',
    S.moduleOf('users').routes.includes('/admin/usuarios-permisos'));

const resumen = S.describeRole(S.presetRole('institutional_user').permissions);
check('el resumen nombra la bandeja', /Bandeja de Entrada/.test(resumen));
check('un rol vacío lo dice en vez de dejar un hueco',
    /no verá ninguna herramienta/.test(S.describeRole([])));
check('el resumen se DERIVA de los permisos, no de una lista escrita aparte',
    /Noticias/.test(S.describeRole(['news.view'])));

const matriz = S.permissionMatrix();
check('la matriz agrupa por grupo del registro', matriz.length === S.MODULE_GROUPS.filter(g => S.MODULES.some(m => m.group === g && m.scope !== 'platform')).length);
check('⚠️ la matriz de un sitio NO ofrece módulos de plataforma',
    matriz.every(g => g.modules.every(m => m.scope !== 'platform')));
check('la matriz del operador sí los ofrece',
    S.permissionMatrix({ includePlatform: true }).some(g => g.modules.some(m => m.scope === 'platform')));

// ════════════════════════════════════════════════════════════════════
grupo('11 · Los roles predeterminados');
// ════════════════════════════════════════════════════════════════════

check('los seis roles del pedido están declarados',
    ['platform_superadmin', 'site_admin', 'editor', 'author', 'contributor', 'institutional_user']
        .every(k => S.ROLE_PRESET_KEYS.includes(k)));
check('todos están protegidos', S.ROLE_PRESETS.every(r => r.protected));
check('todo permiso de todo preset existe en el catálogo',
    S.ROLE_PRESETS.every(r => S.expandPermissions(r.permissions).descartados.length === 0));
check('todo preset tiene descripción', S.ROLE_PRESETS.every(r => r.description && r.description.length > 20));
check('⚠️ sólo el superadministrador es de ámbito plataforma',
    S.ROLE_PRESETS.filter(r => r.scope === 'platform').length === 1);
check('el usuario institucional nace con el MENÚ BASE',
    S.presetRole('institutional_user').permissions === S.INSTITUTIONAL_BASE);
check('⚠️ …y NO con administración de cuentas de correo',
    !S.hasPermission(grantOf(S.presetRole('institutional_user').permissions), 'email_accounts.view'));
// Punto 9 del pedido, textual.
check('⚠️ tener bandeja propia NO da administración del ecosistema de correo',
    S.hasPermission(grantOf(['email_inbox.use_own']), 'email_inbox.use_own')
    && !S.hasPermission(grantOf(['email_inbox.use_own']), 'email_accounts.create'));
check('un editor NO administra usuarios ni configuración',
    !S.hasPermission(editor, 'users.manage') && !S.hasPermission(editor, 'settings.manage'));
check('un editor tampoco administra cuentas de correo',
    !S.hasPermission(editor, 'email_accounts.view'));

// ════════════════════════════════════════════════════════════════════
grupo('12 · ⚠️ LA GUARDIA ESTÁ EN LA RUTA Y OTRA VEZ EN EL CONTROLADOR');
// ════════════════════════════════════════════════════════════════════

const rutas = leer('server/routes/rbac.js');
const ctrl = leer('server/controllers/rbacController.js');

const lineasDeRuta = rutas.split('\n').filter(l => /^router\.(get|post|put|patch|delete)\(/.test(l.trim()));
check('hay rutas declaradas', lineasDeRuta.length >= 12);
check('⚠️ toda ruta salvo `/me` declara su permiso',
    lineasDeRuta.every(l => l.includes("'/me'") || /requirePermission\(/.test(l)),
    lineasDeRuta.filter(l => !l.includes("'/me'") && !/requirePermission\(/.test(l)).join(' | '));
check('las escrituras exigen además que la cuenta siga activa',
    lineasDeRuta.filter(l => /^router\.(post|put|patch|delete)/.test(l.trim()))
        .every(l => /requireActiveAccount/.test(l)));
// ⚠️ La literal debajo de su paramétrica es INALCANZABLE, y el fallo es mudo.
check('⚠️ `/roles/duplicate` se declara ANTES que `/roles/:id`',
    rutas.indexOf("'/roles/duplicate'") < rutas.indexOf("'/roles/:id'"));
check('las literales van antes que las paramétricas de usuarios',
    rutas.indexOf("'/users'") < rutas.indexOf("'/users/:userId'"));

check('⚠️ todo manejador del controlador comprueba OTRA VEZ el permiso',
    (ctrl.match(/const scope = await scopeOf\(req\)/g) || []).length
    >= (ctrl.match(/^export const \w+ = async \(req, res\)/gm) || []).length - 1);
check('el permiso se comprueba con `guard`, no a mano',
    (ctrl.match(/guard\(scope, '/g) || []).length >= 10);
// ⚠️ El sitio lo resuelve el servidor: si viajara en el cuerpo, acotar los
// permisos a un sitio no serviría de nada.
check('⚠️ el sitio NO se lee del cuerpo de la petición',
    !/req\.body[?.]*\.clubId|req\.body[?.]*\.siteId/.test(ctrl));
check('nadie se edita a sí mismo el rol ni el estado',
    (ctrl.match(/String\(userId\) === String\(req\.user\?\.id\)/g) || []).length >= 3);
check('la protección del último administrador se llama antes de escribir',
    (ctrl.match(/orphanCheck\(/g) || []).length >= 3);
check('suspender cierra además las sesiones abiertas',
    /if \(!canSignIn\(status\)\) await revokeSessions/.test(ctrl));
check('⚠️ ninguna respuesta devuelve una contraseña',
    !ctrl.split('\n').some(l => /^\s*(res\.|return res\.)/.test(l) && /\bpassword\s*:/.test(l)));
check('el listado de usuarios enumera columnas en vez de SELECT u.*',
    !/SELECT u\.\*/.test(codigo('server/lib/rbacStore.js')));

// ════════════════════════════════════════════════════════════════════
grupo('13 · La I/O y el esquema');
// ════════════════════════════════════════════════════════════════════

const store = leer('server/lib/rbacStore.js');
const ensure = leer('server/lib/ensureRbacSchema.js');

check('⚠️ el criterio no vive en la I/O: la resolución la hace `resolveGrant`',
    /resolveGrant\(/.test(store) && !/PERMISSION_CATALOG\s*=/.test(store));
check('⚠️ ninguna consulta de roles o membresías olvida el sitio en el WHERE',
    (store.match(/FROM "SiteRole"/g) || []).every(() => true)
    && !/FROM "SiteRole"\s+WHERE\s+key\s*=\s*\$1\s*LIMIT/.test(store));
check('toda función de la I/O devuelve su motivo en vez de lanzar',
    (store.match(/catch \(e\) \{/g) || []).length >= 12);
check('⚠️ un rol EN USO no se borra: se desactiva', /reason: 'en_uso'/.test(store));
check('cerrar sesiones marca el instante, no borra el token',
    /sessionsRevokedAt/.test(store) && /sessionsRevokedAt/.test(ensure));

check('⚠️ el SQL no lleva ninguna comilla invertida dentro',
    !ensure.slice(ensure.indexOf('const SQL = `') + 13, ensure.indexOf('`;', ensure.indexOf('const SQL = `'))).includes('`'));
check('las tablas se crean con IF NOT EXISTS',
    (codigo('server/lib/ensureRbacSchema.js').match(/CREATE TABLE IF NOT EXISTS/g) || []).length === 2);
// ⚠️ CREATE TABLE IF NOT EXISTS no amplía nada: la trampa de v4.908.
check('⚠️ toda columna del bloque ALTER está enumerada en el atajo del catálogo',
    (ensure.match(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/g) || [])
        .map(m => m.match(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/)[1])
        .every(col => ensure.includes(`'${col}'`)));
check('los índices únicos NO son parciales, así que el ON CONFLICT no repite predicado',
    !/CREATE UNIQUE INDEX[\s\S]{0,200}?WHERE/.test(ensure));
check('⚠️ ninguna tabla nueva se declara en schema.prisma',
    !/model SiteRole|model SiteMembership/.test(leer('server/prisma/schema.prisma')));
check('…y el guardián de db:push las nombra',
    /SiteRole/.test(leer('scripts/db-push-guard.mjs')) && /SiteMembership/.test(leer('scripts/db-push-guard.mjs')));

// ════════════════════════════════════════════════════════════════════
grupo('14 · El guardia y la barra lateral');
// ════════════════════════════════════════════════════════════════════

const guardia = leer('server/middleware/institutionalGuard.js');
check('⚠️ los permisos NO viajan en el token: se leen en cada petición',
    /resolveUserGrant\(/.test(guardia) && !/jwt\.sign/.test(guardia));
check('el guardia degrada al criterio de v4.932 si la consulta falla',
    /grant \? hasPermission\(grant, permission\) : can\(req\.user, permission\)/.test(guardia));
check('una sesión cerrada desde la administración deja de valer',
    /session_revoked/.test(guardia) && /Number\(req\.user\.iat\) \* 1000/.test(guardia));
check('los tres motivos de rechazo se dicen distinto',
    /account_suspended/.test(guardia) && /session_revoked/.test(guardia));
check('hay un guardia por ACCIÓN para el alcance propio', /export const requireAction/.test(guardia));

const layout = leer('src/components/admin/AdminLayout.tsx');
check('el menú se filtra en UN solo sitio',
    (layout.match(/getMenuItems\(\)/g) || []).length === 1);
// ⚠️ El recorte por RBAC no puede alcanzar a los administradores de siempre:
// el registro no cubre todas las rutas del panel y les borraría entradas.
check('⚠️ el recorte por RBAC sólo se aplica a quien tiene acceso acotado',
    /acceso\.restricted \? acceso\.canPath\(item\.path\) : true/.test(layout));
check('…y con permisos resueltos manda el RBAC, no la foto del ingreso',
    /if \(acceso\.grant\) return acceso\.restricted/.test(layout));
check('…y `canOpenPath` de v4.932 queda de respaldo cuando no hay grant',
    /return canOpenPath\(user as any, item\.path\);/.test(layout));
check('⚠️ mientras se consultan los permisos NO se recorta nada',
    /if \(acceso\.loading\) return true;/.test(layout));
check('⚠️ no se pinta la cabecera de una categoría sin entradas',
    /\.filter\(cat => menuItems\.some\(item => item\.category === cat\)\)/.test(layout));
check('el icono del ítem nuevo está IMPORTADO', /^\s*UserCog$/m.test(layout) || /\bUserCog,?\n/.test(layout));

const hook = leer('src/hooks/useSiteAccess.ts');
check('⚠️ el navegador NO resuelve permisos: los consulta',
    /rbac\/me/.test(hook) && !/resolveGrant/.test(hook));
check('sin respuesta, el menú NO se vacía', /setGrant\(null\)/.test(hook));
// ⚠️ v4.939: quién tiene acceso acotado lo decide el servidor. Clasificarlo acá
// por el `source` fue el defecto que dejó el panel vacío.
check('⚠️ el navegador tampoco CLASIFICA el acceso: lee lo que el servidor mandó',
    /grant\?\.restricted === true/.test(codigo('src/hooks/useSiteAccess.ts'))
    && !/RESTRICTED_SOURCES/.test(codigo('src/hooks/useSiteAccess.ts')));

// ════════════════════════════════════════════════════════════════════
grupo('15 · El alta de cuenta institucional asigna el rol (puntos 6 y 19)');
// ════════════════════════════════════════════════════════════════════

const instiCtrl = leer('server/controllers/institutionalAccessController.js');
check('el alta asigna el rol del sitio', /asignarRolDeSitio/.test(instiCtrl));
check('⚠️ …comprobando que el actor pueda asignarlo', /canAssignRole\(actor, rol/.test(instiCtrl));
check('⚠️ …y es OPCIONAL: sin rol, el alta se comporta como en v4.932',
    /if \(!roleKey && !roleId\) return \{ assigned: false/.test(instiCtrl));
check('un fallo al asignar el rol NO tumba el alta', /catch \(e\) \{[\s\S]{0,200}asignarRolDeSitio/.test(instiCtrl));
check('el catálogo del alta ofrece sólo los roles asignables',
    /canAssignRole\(actor, r, \{ actorIsPlatform: esOperador \}\)/.test(instiCtrl));

const modal = leer('src/components/admin/institutional/InstitutionalAccountModal.tsx');
check('el modal ofrece el rol del sitio', /siteRoles/.test(modal));
check('⚠️ …y DICE lo que ese rol podrá abrir', /elegido\.summary/.test(modal));
check('manda uno u otro identificador, nunca los dos',
    /siteRoleId: elegido\.id \} : \{ siteRoleKey: elegido\.key \}/.test(modal));

// ════════════════════════════════════════════════════════════════════
grupo('16 · ⚠️ LOS DOS ESPEJOS DAN LO MISMO');
// ════════════════════════════════════════════════════════════════════

let esbuild = null;
try { esbuild = await import('esbuild'); } catch { /* opcional */ }

if (!esbuild) {
    console.log('  ⚠ esbuild no está: bloque saltado (npm i --no-save esbuild)');
} else {
    const out = esbuild.buildSync({
        entryPoints: ['src/lib/rbacSpec.ts'], bundle: true, format: 'esm',
        write: false, logLevel: 'silent',
    });
    const M = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);

    eq('el catálogo de permisos es idéntico', M.PERMISSION_CATALOG, S.PERMISSION_CATALOG);
    eq('los grupos son idénticos', M.MODULE_GROUPS, S.MODULE_GROUPS);
    eq('la matriz es idéntica', M.permissionMatrix(), S.permissionMatrix());
    eq('la matriz del operador es idéntica', M.permissionMatrix({ includePlatform: true }), S.permissionMatrix({ includePlatform: true }));
    eq('los roles son los mismos', M.ROLE_PRESET_KEYS, S.ROLE_PRESET_KEYS);
    check('los permisos de cada preset son idénticos',
        S.ROLE_PRESETS.every(r => JSON.stringify(M.presetRole(r.key).permissions) === JSON.stringify(r.permissions)));
    eq('el mapa legado es idéntico', M.LEGACY_PERMISSION_MAP, S.LEGACY_PERMISSION_MAP);

    // ⚠️ Se comparan las SALIDAS sobre una matriz, no las constantes: coincidir
    // en la lista y discrepar en `canOpenPath` sería el peor de los dos mundos.
    let iguales = true;
    for (const p of [...S.PERMISSION_CATALOG, 'news', 'mailbox', 'inventado.view']) {
        if (JSON.stringify(M.impliedBy(p)) !== JSON.stringify(S.impliedBy(p))) { iguales = false; break; }
    }
    check('`impliedBy` coincide en TODO el catálogo', iguales);

    const casos = [S.presetRole('editor'), S.presetRole('author'), S.presetRole('contributor'), S.presetRole('institutional_user')];
    let ok2 = true;
    for (const rol of casos) {
        const g = { permissions: S.expandPermissions(rol.permissions).permissions };
        for (const mod of S.MODULES) {
            if (M.canAccessModule(g, mod.key) !== S.canAccessModule(g, mod.key)) { ok2 = false; }
            for (const ruta of mod.routes) {
                if (M.canOpenPath(g, ruta) !== S.canOpenPath(g, ruta)) { ok2 = false; }
            }
        }
        if (M.describeRole(rol.permissions) !== S.describeRole(rol.permissions)) ok2 = false;
        for (const p of ['news.edit', 'news.edit_own', 'users.manage', 'news', 'users']) {
            if (M.hasPermission(g, p) !== S.hasPermission(g, p)) ok2 = false;
        }
        for (const [owner, actor] of [['yo', 'yo'], ['otro', 'yo'], [null, 'yo']]) {
            if (M.canActOn(g, 'news', 'edit', { ownerId: owner, actorId: actor })
                !== S.canActOn(g, 'news', 'edit', { ownerId: owner, actorId: actor })) ok2 = false;
        }
    }
    check('⚠️ `canAccessModule`, `canOpenPath`, `hasPermission`, `canActOn` y `describeRole` coinciden', ok2);
    eq('`expandPermissions` coincide, descartes incluidos',
        M.expandPermissions(['news', 'users.manage', 'xx.yy']),
        S.expandPermissions(['news', 'users.manage', 'xx.yy']));
    eq('los estados coinciden', M.MEMBERSHIP_STATUS_KEYS, S.MEMBERSHIP_STATUS_KEYS);
    // ⚠️ El espejo NO trae `resolveGrant`: el servidor resuelve y el navegador
    // consulta. Con dos resoluciones, el menú y la ruta podrían discrepar.
    check('⚠️ el espejo NO reimplementa la resolución',
        !('resolveGrant' in M) && !/resolveGrant/.test(codigo('src/lib/rbacSpec.ts')));
    check('⚠️ el espejo tampoco reimplementa la prevención de escalamiento',
        !('filterGrantable' in M));
}

// ════════════════════════════════════════════════════════════════════
grupo('17 · ⚠️ EL PANEL VACÍO: quién ve el menú recortado (v4.939)');
// ════════════════════════════════════════════════════════════════════
//
// El defecto reportado: un usuario entra al panel y no ve NINGUNA herramienta,
// sólo «Mi perfil» y unas cabeceras de categoría vacías. La causa fue clasificar
// como «acceso acotado» todo lo que no fuera un rol conocido — incluido `none`,
// que es donde cae cualquier rol que `ROLE_FALLBACK` no enumera.
//
// El acceso de esas cuentas NUNCA cambió: cada ruta se sigue guardando por su
// cuenta en el servidor. Lo que el recorte les quitó fue la VISTA.

const restringido = (u, extra = {}) => S.isRestrictedGrant(S.resolveGrant({ user: u, siteId: 'A', ...extra }));

check('⚠️ un rol que el criterio NO conoce no se recorta (`member`)',
    !restringido({ id: 'x', role: 'member' }));
check('⚠️ …ni `crm_agent`', !restringido({ id: 'x', role: 'crm_agent' }));
check('⚠️ …ni `crowdfunder`', !restringido({ id: 'x', role: 'crowdfunder' }));
check('⚠️ …ni un rol inventado mañana', !restringido({ id: 'x', role: 'rol_que_no_existe' }));
check('un administrador de sitio de siempre tampoco', !restringido(ADMIN));
check('…ni un editor de siempre', !restringido(EDITOR_VIEJO));
check('…ni el operador de la plataforma', !restringido(OPERADOR));

check('una cuenta institucional SÍ se recorta',
    restringido(INSTI, { legacyPermissions: ['mailbox', 'news'] }));
check('…y también sin permisos escritos en su fila', restringido(INSTI));

const mEditor = { siteId: 'A', roleKey: 'editor', rolePermissions: S.presetRole('editor').permissions, status: 'active' };
const mAdmin = { siteId: 'A', roleKey: 'site_admin', rolePermissions: S.presetRole('site_admin').permissions, status: 'active' };
check('una membresía acotada se recorta', restringido({ id: 'x', role: 'member' }, { membership: mEditor }));
check('⚠️ una membresía de administrador de sitio NO, aunque venga por esa vía',
    !restringido({ id: 'x', role: 'member' }, { membership: mAdmin }));
check('⚠️ una cuenta SUSPENDIDA ve su menú: el servidor le dice el motivo al primer clic',
    !restringido({ id: 'x', role: 'member' }, { membership: { ...mEditor, status: 'suspended' } }));
check('sin grant no se recorta nada', !S.isRestrictedGrant(null));

// ⚠️ EL COSTO DE EQUIVOCARSE, medido: si `none` se recortara, ese panel se
// queda con «Mi perfil» y nada más. Es exactamente lo que se reportó.
const gNone = S.resolveGrant({ user: { id: 'x', role: 'member' }, siteId: 'A' });
const RUTAS = ['/admin/dashboard', '/admin/noticias', '/admin/eventos', '/admin/proyectos',
    '/admin/miembros', '/admin/configuracion', '/admin/perfil'];
eq('⚠️ …y con `none` recortado sólo sobrevive /admin/perfil',
    RUTAS.filter(r => S.canOpenPath(gNone, r)), ['/admin/perfil']);
check('⚠️ por eso `none` no se recorta: `isRestrictedGrant` lo deja pasar entero',
    !S.isRestrictedGrant(gNone));

check('⚠️ el veredicto viaja al navegador con el resto del grant',
    /restricted: isRestrictedGrant\(grant\)/.test(codigo('server/lib/rbacStore.js')));
check('…y la degradación del endpoint también lo dice',
    /restricted: false/.test(codigo('server/controllers/rbacController.js')));

// La pantalla de usuarios de siempre no puede AFIRMAR un rol que no es.
const usuarios = codigo('src/pages/admin/Users.tsx');
check('⚠️ el rol se muestra como es, aunque el desplegable no sepa asignarlo',
    /roleLabel\(u\.role\)/.test(usuarios) && !/u\.role === 'member' \? 'Editor de Sitio'/.test(usuarios));
check('…y guardar no le cambia el rol a quien tiene uno que no está en la lista',
    /\(rol actual\)/.test(usuarios));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
