#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// ACCIONES SOBRE LAS CUENTAS DEL SITIO.  npm run test:account-actions
// v4.940.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro; el CAMINO de los
// tres endpoints se ejercita con la base, prisma y el servicio de correo
// sustituidos en memoria por un hook de resolución de módulos.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE NO SE CONFUNDAN LAS DOS CONTRASEÑAS. La del BUZÓN es la del cliente
//      de correo; la de ACCESO es la del panel. Cambiar una creyendo que se
//      cambia la otra deja a alguien fuera del panel —o el correo sin
//      entregar— y no falla ruidosamente.
//
//   2. QUE NINGUNA CONTRASEÑA GUARDADA SALGA HACIA EL NAVEGADOR. Es la regla de
//      v4.932 y sigue entera: se puede FIJAR una nueva, jamás LEER la que hay.
//
//   3. QUE FIJARLE LA CONTRASEÑA A ALGUIEN NO SEA UNA ESCALADA. Es poder entrar
//      como él: un administrador de sitio no alcanza a otro administrador ni al
//      operador, y nadie se la fija a sí mismo.
//
//   4. QUE UNA ACCIÓN EN BLOQUE NO MIENTA. Se marcan cinco, se anuncian cinco y
//      se tocaron tres es el defecto; lo omitido se NOMBRA con su motivo.
//
//   5. QUE LA CUENTA PRINCIPAL NO SE BORRE, con la puerta en el SERVIDOR.
//
//   6. QUE EL CRITERIO SEA UNO. La pantalla no reimplementa nada de esto.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-accounts-stub.mjs', HERE).href;
const PRISMA = new URL('./scripts/fixtures/prisma-accounts-stub.mjs', HERE).href;
const MAIL = new URL('./scripts/fixtures/email-service-stub.mjs', HERE).href;

// ⚠️ Se compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'` y con el sufijo largo no
// casarían — y no fallaría ruidosamente: se conectaría a un Postgres que no
// está y todo daría error de conexión (la lección de `test:ledger:write`).
register(
    `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        if(/(^|\\/)prisma\\.js$/.test(s)) return {url:${JSON.stringify(PRISMA)},shortCircuit:true};
        if(/EmailService\\.js$/.test(s)) return {url:${JSON.stringify(MAIL)},shortCircuit:true};
        return n(s,c);
     }`,
    HERE
);

const A = await import('../server/lib/accountActions.js');
const EC = await import('../server/controllers/EmailAccountController.js');
const IC = await import('../server/controllers/institutionalAccessController.js');
const dbStub = await import(DB);
const prismaStub = await import(PRISMA);
const bcrypt = (await import('bcryptjs')).default;

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

/** Un `res` de mentira que guarda lo que el controlador contestó. */
const fakeRes = () => {
    const r = { code: 200, body: null, headers: {} };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.set = (k, v) => { r.headers[k] = v; return r; };
    return r;
};

const OPERADOR = { id: 'op', role: 'administrator', email: 'plataforma@clubplatform.org', clubId: 'A' };
const ADMIN = { id: 'ad', role: 'club_admin', email: 'presidencia@club.org', clubId: 'A' };
const OTRO_ADMIN = { id: 'ad2', role: 'club_admin', email: 'vicepresidencia@club.org', clubId: 'A' };
const INSTI = { id: 'in', role: 'institutional_user', email: 'secretaria@club.org', clubId: 'A' };

// ════════════════════════════════════════════════════════════════════
grupo('1 · El catálogo de lo editable es CERRADO');
// ════════════════════════════════════════════════════════════════════

eq('sólo el rótulo y la contraseña', A.MAILBOX_EDITABLE, ['label', 'password']);

const p1 = A.mailboxPatch({ label: 'Presidencia', password: 'nueva-clave', email: 'otro@club.org', isPrimary: true, clubId: 'B' });
eq('lo que llega de más se DESCARTA', p1.campos.sort(), ['label', 'password']);
check('…y se dice cuál', p1.descartados.includes('email') && p1.descartados.includes('isPrimary') && p1.descartados.includes('clubId'));
check('⚠️ la dirección NO se puede cambiar ni mandándola a mano', p1.patch.email === undefined);
check('⚠️ ni el sitio, ni si es la principal', p1.patch.clubId === undefined && p1.patch.isPrimary === undefined);

eq('`undefined` es «no lo toques»', A.mailboxPatch({}).campos, []);
eq('una contraseña VACÍA es «no la cambies», no «déjala vacía»', A.mailboxPatch({ password: '' }).campos, []);
eq('un rótulo vacío SÍ se aplica: es un valor legítimo', A.mailboxPatch({ label: '' }).patch, { label: null });
check('la confirmación no cuenta como campo editable', !A.mailboxPatch({ passwordConfirm: 'x' }).descartados.includes('passwordConfirm'));

// ════════════════════════════════════════════════════════════════════
grupo('2 · ⚠️ SON DOS CONTRASEÑAS DISTINTAS');
// ════════════════════════════════════════════════════════════════════

eq('están declaradas las dos', A.PASSWORD_SCOPE_KEYS, ['mailbox', 'access']);
check('⚠️ la del PANEL nace temporal', A.PASSWORD_SCOPES.access.temporary === true);
check('⚠️ la del BUZÓN no: no hay «primer ingreso» que interceptar', A.PASSWORD_SCOPES.mailbox.temporary === false);

const v1 = A.validateNewPassword({ password: 'clave-larga-1', passwordConfirm: 'clave-larga-1' }, { scope: 'access' });
check('una contraseña buena pasa', v1.ok && v1.value.temporary === true);
check('…y se puede pedir definitiva a propósito',
    A.validateNewPassword({ password: 'clave-larga-1', temporary: false }, { scope: 'access' }).value.temporary === false);
check('…pero en el buzón `temporary` no aplica aunque se pida',
    A.validateNewPassword({ password: 'clave-larga-1', temporary: true }, { scope: 'mailbox' }).value.temporary === false);

check('corta se rechaza', !A.validateNewPassword({ password: 'abc' }).ok);
check('sin contraseña se rechaza', !A.validateNewPassword({}).ok);
check('⚠️ se devuelven TODOS los errores, no el primero',
    A.validateNewPassword({ password: 'abc', passwordConfirm: 'xyz' }).errors.length >= 2);
check('sin confirmación se AVISA y se deja pasar (regla aditiva)',
    A.validateNewPassword({ password: 'clave-larga-1' }).ok
    && A.validateNewPassword({ password: 'clave-larga-1' }).warnings.length === 1);
check('la propia dirección como contraseña se avisa',
    A.validateNewPassword({ password: 'secretaria@club.org', passwordConfirm: 'secretaria@club.org' }, { currentEmail: 'secretaria@club.org' }).warnings.some(w => /dirección/i.test(w)));

// ════════════════════════════════════════════════════════════════════
grupo('3 · ⚠️ FIJARLE LA CONTRASEÑA A ALGUIEN ES TOMAR SU CUENTA');
// ════════════════════════════════════════════════════════════════════

check('un administrador de sitio puede sobre un usuario institucional', A.canResetAccessPassword(ADMIN, INSTI).ok);
check('⚠️ y NO sobre otro administrador de sitio', !A.canResetAccessPassword(ADMIN, OTRO_ADMIN).ok);
check('⚠️ ni sobre el operador de la plataforma', !A.canResetAccessPassword(ADMIN, OPERADOR).ok);
check('el operador sí puede sobre un administrador de sitio', A.canResetAccessPassword(OPERADOR, ADMIN).ok);
check('⚠️ NADIE sobre sí mismo', !A.canResetAccessPassword(ADMIN, ADMIN).ok);
check('…y se dice dónde se cambia la propia', /Mi perfil/i.test(A.canResetAccessPassword(ADMIN, ADMIN).way || ''));
check('un usuario institucional no puede sobre nadie', !A.canResetAccessPassword(INSTI, INSTI ? { id: 'z', role: 'institutional_user' } : null).ok);
check('⚠️ todo bloqueo dice su SALIDA: un bloqueo sin salida se lee como avería',
    ['administrador', 'operador', 'uno_mismo', 'sin_permiso'].every(r => {
        const casos = {
            administrador: A.canResetAccessPassword(ADMIN, OTRO_ADMIN),
            operador: A.canResetAccessPassword(ADMIN, OPERADOR),
            uno_mismo: A.canResetAccessPassword(ADMIN, ADMIN),
            sin_permiso: A.canResetAccessPassword(INSTI, { id: 'z', role: 'institutional_user' }),
        };
        return !!casos[r].way && casos[r].reason === r;
    }));
check('«Enviar acceso» es la salida que se ofrece: el enlace va al buzón de su dueño',
    /Enviar acceso/.test(A.canResetAccessPassword(ADMIN, OTRO_ADMIN).way));

// ════════════════════════════════════════════════════════════════════
grupo('4 · ⚠️ UNA ACCIÓN EN BLOQUE NO MIENTE');
// ════════════════════════════════════════════════════════════════════

const CUENTAS = [
    { id: '1', email: 'contacto@club.org', isPrimary: true, clubId: 'A' },
    { id: '2', email: 'secretaria@club.org', isPrimary: false, clubId: 'A' },
    { id: '3', email: 'tesoreria@club.org', isPrimary: false, clubId: 'A' },
    { id: '9', email: 'ajena@otro.org', isPrimary: false, clubId: 'B' },
];

const plan = A.bulkPlan(['1', '2', '3', '9', 'inventado'], CUENTAS, { clubId: 'A', action: 'delete' });
eq('se permite sólo lo que se puede borrar', plan.allowed.map(a => a.id), ['2', '3']);
check('⚠️ la cuenta principal se salta y se NOMBRA',
    plan.skipped.some(s => s.id === '1' && s.reason === 'principal' && /principal/.test(s.motivo)));
check('⚠️ una cuenta de otro sitio se salta', plan.skipped.some(s => s.id === '9' && s.reason === 'otro_sitio'));
check('una que no existe se salta', plan.skipped.some(s => s.id === 'inventado' && s.reason === 'no_existe'));
check('los ids repetidos se cuentan una vez',
    A.bulkPlan(['2', '2', '2'], CUENTAS, { clubId: 'A' }).allowed.length === 1);
check('⚠️ el propio buzón no se borra en bloque',
    A.bulkPlan(['2'], CUENTAS, { clubId: 'A', actorMailbox: 'SECRETARIA@club.org' }).skipped[0]?.reason === 'propia');
check('hay tope y se avisa', A.bulkPlan(Array.from({ length: A.BULK_MAX + 1 }, (_, i) => `x${i}`), CUENTAS).overLimit);

const frase = A.describeBulk({ done: [{ id: '2' }], skipped: plan.skipped, failed: [] });
check('⚠️ el resumen NOMBRA lo omitido, no sólo lo hecho', /quedaron fuera/.test(frase) && /principal/.test(frase));
check('…y lo fallido también',
    /no se pudieron eliminar/.test(A.describeBulk({ done: [], skipped: [], failed: [{ email: 'x@y.org' }] })));
check('⚠️ NO hay una acción de contraseña en bloque', !A.BULK_ACTION_KEYS.includes('password'));
eq('el catálogo de acciones en bloque es cerrado', A.BULK_ACTION_KEYS, ['delete']);

// ════════════════════════════════════════════════════════════════════
grupo('5 · EL CAMINO: editar un buzón');
// ════════════════════════════════════════════════════════════════════

const sembrar = () => {
    dbStub.reset(); prismaStub.reset();
    prismaStub.state.accounts.push(
        { id: '1', email: 'contacto@club.org', label: 'Contacto', password: 'vieja', isPrimary: true, clubId: 'A' },
        { id: '2', email: 'secretaria@club.org', label: null, password: 'vieja', isPrimary: false, clubId: 'A' },
        { id: '3', email: 'tesoreria@club.org', label: null, password: 'vieja', isPrimary: false, clubId: 'A' },
        { id: '9', email: 'ajena@otro.org', label: null, password: 'vieja', isPrimary: false, clubId: 'B' },
    );
    dbStub.state.users.push(
        { ...ADMIN, password: 'hash' },
        { ...OTRO_ADMIN, password: 'hash' },
        { ...INSTI, password: 'hash' },
    );
    dbStub.state.profiles.push(
        { userId: 'in', clubId: 'A', mailbox: 'secretaria@club.org', permissions: ['mailbox'], status: 'active', mustChangePassword: false },
        { userId: 'ad2', clubId: 'A', mailbox: 'vicepresidencia@club.org', permissions: [], status: 'active', mustChangePassword: false },
    );
    dbStub.state.memberships.push({ userId: 'in', clubId: 'A', sessionsRevokedAt: null });
};

sembrar();
let r = fakeRes();
await EC.updateEmailAccount({ user: ADMIN, params: { id: '2' }, body: { label: 'Secretaría', password: 'clave-larga-1', passwordConfirm: 'clave-larga-1' } }, r);
check('el administrador edita rótulo y contraseña del buzón', r.code === 200 && r.body?.ok);
eq('…y se dice qué se tocó', (r.body?.changed || []).sort(), ['label', 'password']);
check('la fila quedó con el rótulo nuevo', prismaStub.state.accounts.find(a => a.id === '2').label === 'Secretaría');
check('…y con la contraseña nueva', prismaStub.state.accounts.find(a => a.id === '2').password === 'clave-larga-1');
check('⚠️ LA RESPUESTA NO LLEVA NINGUNA CONTRASEÑA', !JSON.stringify(r.body).includes('clave-larga-1'));
check('…ni la que había', !JSON.stringify(r.body).includes('vieja'));
check('queda anotado en la bitácora', dbStub.state.audit.length >= 1);
check('⚠️ y la bitácora TAMPOCO guarda la contraseña',
    !JSON.stringify(dbStub.state.audit).includes('clave-larga-1'));

r = fakeRes();
await EC.updateEmailAccount({ user: ADMIN, params: { id: '2' }, body: { password: 'abc', passwordConfirm: 'abc' } }, r);
check('una contraseña corta se rechaza en el SERVIDOR', r.code === 400);

r = fakeRes();
await EC.updateEmailAccount({ user: ADMIN, params: { id: '9' }, body: { label: 'Ajena' } }, r);
check('⚠️ una cuenta de otro sitio responde 404, no 403', r.code === 404);
check('…y no se tocó', prismaStub.state.accounts.find(a => a.id === '9').label === null);

r = fakeRes();
await EC.updateEmailAccount({ user: INSTI, params: { id: '2' }, body: { label: 'X' } }, r);
check('⚠️ un usuario institucional NO edita cuentas', r.code === 403);

r = fakeRes();
await EC.updateEmailAccount({ user: ADMIN, params: { id: '2' }, body: { email: 'otra@club.org' } }, r);
check('mandar sólo campos no editables se rechaza con su motivo', r.code === 400 && /editable/i.test(JSON.stringify(r.body)));
check('…y la dirección sigue siendo la misma', prismaStub.state.accounts.find(a => a.id === '2').email === 'secretaria@club.org');

// ════════════════════════════════════════════════════════════════════
grupo('6 · EL CAMINO: eliminar en bloque');
// ════════════════════════════════════════════════════════════════════

sembrar();
r = fakeRes();
await EC.bulkDeleteEmailAccounts({ user: ADMIN, body: { ids: ['1', '2', '3', '9'] } }, r);
check('se eliminan las que se puede', r.code === 200 && (r.body?.done || []).length === 2);
check('⚠️ la principal sobrevive', !!prismaStub.state.accounts.find(a => a.id === '1'));
check('⚠️ la de otro sitio también', !!prismaStub.state.accounts.find(a => a.id === '9'));
check('⚠️ y las dos exclusiones se NOMBRAN en la respuesta',
    (r.body?.skipped || []).some(s => s.reason === 'principal')
    // ⚠️ La ajena sale como `no_existe` y NO como `otro_sitio`, a propósito: el
    // universo se lee ya acotado al sitio, así que el plan nunca la ve. Decir
    // «es de otro sitio» confirmaría que existe, que es la mitad de lo que hace
    // falta para ir a buscarla. `otro_sitio` queda para el criterio, que sí la
    // recibe (grupo 4).
    && (r.body?.skipped || []).some(s => s.id === '9' && s.reason === 'no_existe'));
check('el mensaje no dice haber borrado más de lo que borró',
    /Se eliminaron 2/.test(r.body?.message || '') && /quedaron fuera/.test(r.body?.message || ''));

sembrar();
r = fakeRes();
await EC.bulkDeleteEmailAccounts({ user: INSTI, body: { ids: ['2'] } }, r);
check('⚠️ un usuario institucional NO borra en bloque', r.code === 403);
check('…y nada se tocó', prismaStub.state.accounts.length === 4);

sembrar();
r = fakeRes();
await EC.bulkDeleteEmailAccounts({ user: ADMIN, body: { ids: [] } }, r);
check('sin nada marcado se dice, no se hace un borrado vacío', r.code === 400);

// ════════════════════════════════════════════════════════════════════
grupo('7 · EL CAMINO: fijar la contraseña de acceso');
// ════════════════════════════════════════════════════════════════════

sembrar();
r = fakeRes();
await IC.setOwnerPassword({ user: ADMIN, params: { userId: 'in' }, body: { password: 'clave-larga-1', passwordConfirm: 'clave-larga-1' } }, r);
check('el administrador fija la contraseña de un usuario institucional', r.code === 200 && r.body?.ok);
const guardada = dbStub.state.users.find(u => u.id === 'in').password;
check('⚠️ se guarda CIFRADA, no en claro', guardada !== 'clave-larga-1' && guardada.startsWith('$2'));
check('…y es la que se puso', await bcrypt.compare('clave-larga-1', guardada));
check('⚠️ LA RESPUESTA NO LLEVA LA CONTRASEÑA', !JSON.stringify(r.body).includes('clave-larga-1'));
check('⚠️ nace TEMPORAL: se le pedirá cambiarla al entrar',
    r.body?.temporary === true && dbStub.state.profiles.find(p => p.userId === 'in').mustChangePassword === true);
check('⚠️ y se CIERRAN sus sesiones abiertas',
    r.body?.sessionsClosed === true && !!dbStub.state.memberships.find(m => m.userId === 'in').sessionsRevokedAt);
check('queda anotado en la bitácora', dbStub.state.audit.length >= 1);
check('⚠️ la bitácora no guarda la contraseña', !JSON.stringify(dbStub.state.audit).includes('clave-larga-1'));

sembrar();
r = fakeRes();
await IC.setOwnerPassword({ user: ADMIN, params: { userId: 'ad2' }, body: { password: 'clave-larga-1', passwordConfirm: 'clave-larga-1' } }, r);
check('⚠️ un administrador de sitio NO se la fija a otro administrador', r.code === 403);
check('…y se le dice la salida', /Enviar acceso/.test(JSON.stringify(r.body)));
check('…y la contraseña del otro NO cambió', dbStub.state.users.find(u => u.id === 'ad2').password === 'hash');

sembrar();
r = fakeRes();
await IC.setOwnerPassword({ user: ADMIN, params: { userId: 'ad' }, body: { password: 'clave-larga-1' } }, r);
check('⚠️ nadie se la fija a sí mismo por acá', r.code === 400 && /Mi perfil/i.test(JSON.stringify(r.body)));

sembrar();
r = fakeRes();
await IC.setOwnerPassword({ user: OPERADOR, params: { userId: 'ad2' }, body: { password: 'clave-larga-1', passwordConfirm: 'clave-larga-1' } }, r);
check('el operador de la plataforma sí puede sobre un administrador de sitio', r.code === 200);

sembrar();
r = fakeRes();
await IC.setOwnerPassword({ user: ADMIN, params: { userId: 'in' }, body: { password: 'corta' } }, r);
check('una contraseña corta se rechaza', r.code === 400);
check('…y no se tocó la que había', dbStub.state.users.find(u => u.id === 'in').password === 'hash');

// ════════════════════════════════════════════════════════════════════
grupo('8 · La guardia va en la ruta Y OTRA VEZ en el controlador');
// ════════════════════════════════════════════════════════════════════

const rutasMail = codigo('server/routes/emailAccounts.js');
const rutasInst = codigo('server/routes/institutional-access.js');
const ctrlMail = codigo('server/controllers/EmailAccountController.js');
const ctrlInst = codigo('server/controllers/institutionalAccessController.js');

check('la ruta del bloque va ANTES que la paramétrica',
    rutasMail.indexOf("'/bulk-delete'") < rutasMail.indexOf("'/:id'"));
check('⚠️ editar comprueba el permiso en el controlador',
    /export const updateEmailAccount[\s\S]{0,900}canManageMailAccounts\(req\.user\)/.test(ctrlMail));
check('⚠️ el bloque también',
    /export const bulkDeleteEmailAccounts[\s\S]{0,900}canManageMailAccounts\(req\.user\)/.test(ctrlMail));
check('la contraseña de acceso pasa por la guardia de la ruta',
    /owners\/:userId\/password'[^\n]*requireAccountAdmin/.test(rutasInst));
check('⚠️ …y OTRA VEZ por el criterio en el controlador',
    /export const setOwnerPassword[\s\S]{0,1200}canResetAccessPassword\(req\.user, user\)/.test(ctrlInst));
check('⚠️ el criterio del bloque no se reimplementa en el controlador',
    /bulkPlan\(/.test(ctrlMail) && !/isPrimary\s*\)\s*\{[\s\S]{0,80}continue/.test(ctrlMail));
check('el resumen honesto sale del criterio, no de una frase escrita a mano',
    /describeBulk\(/.test(ctrlMail));
check('⚠️ fijar la contraseña marca el estado y cierra sesiones',
    /markPasswordSet\(user\.id/.test(ctrlInst) && /revokeSessions\(user\.id, clubId\)/.test(ctrlInst));

// ⚠️ La comprobación que de verdad protege la regla de v4.932.
// Se busca la CLAVE `password:` dentro de un `res.json`, no la palabra: un
// `campos.includes('password')` es una comprobación, no una contraseña que
// sale — y con la palabra suelta la prueba fallaba señalando eso.
const devuelvePassword = (c) => /res\.json\([^)]*\bpassword\s*:/.test(c);
const sale = devuelvePassword(ctrlMail) || devuelvePassword(ctrlInst);
check('⚠️ NINGÚN endpoint devuelve una contraseña', !sale);
check('…y el listado sigue sin traerla', !/select:\s*\{[^}]*password:\s*true/.test(ctrlMail));

// ════════════════════════════════════════════════════════════════════
grupo('9 · La pantalla');
// ════════════════════════════════════════════════════════════════════

const modal = leer('src/components/admin/institutional/AccountEditModal.tsx');
const pantalla = leer('src/pages/admin/EmailManagement.tsx');

check('⚠️ ningún campo de contraseña se PRECARGA',
    /useState\(''\)/.test(modal) && !/value=\{account\.password/.test(modal));
check('el modal distingue las dos contraseñas por su nombre',
    /El buzón/.test(modal) && /El acceso al panel/.test(modal));
check('⚠️ una cuenta SIN propietario no ofrece contraseña de panel',
    /!owner \?/.test(modal) && /sólo buzón/i.test(modal));
check('se avisa que el cambio cierra sus sesiones', /cierran sus sesiones abiertas/.test(modal));
check('la casilla «pedirle que la cambie» viene marcada', /useState\(true\)/.test(modal));
check('un fallo se dice con su causa (401 · 403 · sin respuesta)',
    /Tu sesión venció/.test(modal) && /no llegó a salir/.test(modal));

check('la pantalla ofrece selección múltiple', /setSeleccion/.test(pantalla) && /alternarTodas/.test(pantalla));
check('⚠️ la cuenta principal no ofrece casilla', /accounts\.filter\(a => !a\.isPrimary\)/.test(pantalla));
check('⚠️ la casilla NO está anidada dentro de otro control',
    !/<button[^>]*onClick=\{\(\) => setCuentaEnEdicion[\s\S]{0,400}alternar\(/.test(pantalla));
check('la barra de acciones sólo aparece con algo marcado', /seleccion\.length > 0 &&/.test(pantalla));
check('⚠️ el resultado del bloque se dice ENTERO, omisiones incluidas',
    /skipped[\s\S]{0,120}toast\.warning\(d\?\.message\)/.test(pantalla));
check('⚠️ y por qué no hay contraseña en bloque se DICE en la pantalla',
    /una sola filtración en todas ellas/.test(pantalla));
check('cada casilla lleva el nombre de su cuenta para el lector de pantalla',
    /aria-label=\{`\$\{seleccion\.includes\(acc\.id\)/.test(pantalla));
check('la confirmación DICE qué va a pasar, no pregunta si estás seguro',
    /Se eliminarán \$\{nombres\.length\}/.test(pantalla));
check('⚠️ la pantalla no reimplementa quién puede sobre quién: lo contesta el servidor',
    !/canResetAccessPassword/.test(pantalla) && !/canResetAccessPassword/.test(modal));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
