#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// SECRETARÍA DIGITAL — CONTROL DE APORTES.  npm run test:digital-secretary
// v4.1265.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro; el cableado se
// lee de los archivos (rutas, guardia, pantalla) y el espejo del navegador y
// la vista de control se compilan con esbuild.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE LA SECRETARÍA NO PUEDA MOVER DINERO: ni `finance.manage`, ni las
//      rutas que escriben, que siguen exigiendo administrador en el SERVIDOR.
//   2. QUE PUEDA LO QUE EL PEDIDO ENUMERA: ver, abrir la ficha, descargar
//      comprobantes, exportar — y que todo eso quede auditado.
//   3. QUE UN ACCESO VENCIDO NO CONCEDA NADA, sin borrar nada.
//   4. QUE NADIE MÁS CAMBIE: administradores, operador e institucionales.
//   5. QUE LA VISTA DE CONTROL NO CONFUNDA PAGO, TRASLADO Y COMPROBANTE, ni
//      sume monedas.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const S = await import('../server/lib/rbacSpec.js');
const VA = await import('../server/lib/vaultAudit.js');

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

const compilar = async (entrada) => {
    try {
        const out = execFileSync('npx', ['esbuild', entrada, '--format=esm', '--bundle', '--platform=neutral',
            '--external:xlsx', '--external:jspdf'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return await import(`data:text/javascript,${encodeURIComponent(out)}`);
    } catch { return null; }
};

const JANET = { id: 'janet', role: 'institutional_user', email: 'secretaria@rotary4281.org', clubId: 'D4281' };
const ADMIN = { id: 'ad', role: 'district_admin', email: 'gobernador@rotary4281.org', clubId: 'D4281' };
const OPERADOR = { id: 'op', role: 'administrator', email: 'plataforma@clubplatform.org', clubId: 'D4281' };
const INSTI = { id: 'in', role: 'institutional_user', email: 'presidencia@rotary4281.org', clubId: 'D4281' };
const membresia = (extra = {}) => ({ userId: 'janet', siteId: 'D4281', roleKey: 'digital_secretary', status: 'active', ...extra });
const AHORA = new Date('2026-10-30T15:00:00Z');

// ── 1. El rol ───────────────────────────────────────────────────────
grupo('1. El rol «Secretaría Digital — Control de Aportes»');
const preset = S.presetRole('digital_secretary');
check('existe como preset del código (no fila sembrada)', !!preset);
eq('su nombre es el del pedido', preset?.label, 'Secretaría Digital — Control de Aportes');
check('es de sitio y protegido', preset?.scope === 'site' && preset?.protected === true);
// v4.1271 — más el Directorio de Clubes y su Catálogo Maestro (ver y administrar).
eq('⚠️ sus permisos son EXACTAMENTE ver, exportar, su buzón y el Directorio de Clubes', [...preset.permissions].sort(), ['clubs.manage', 'clubs.view', 'email_inbox.use_own', 'finance.export', 'finance.view']);
check('⚠️ NO trae finance.manage (retiros, traslados, estados)', !S.expandPermissions(preset.permissions).permissions.includes('finance.manage'));
check('no es un rol administrativo (no administra usuarios)', !S.isAdministrativeRole(preset));
eq('entra directo a la Bóveda', preset.landing, '/admin/boveda');
check('ROLE_FALLBACK lo reconoce', S.ROLE_FALLBACK.digital_secretary === 'digital_secretary');
check('su auditoría tiene nombre para los eventos nuevos',
    ['membership_validity_changed', 'vault_opened', 'vault_report_exported', 'vault_receipt_downloaded', 'vault_document_downloaded']
        .every(k => typeof S.RBAC_AUDIT_EVENTS[k] === 'string'));

// ── 2. Lo que resuelve ──────────────────────────────────────────────
grupo('2. Lo que resuelve para Janet en el Distrito 4281');
const gJ = S.resolveGrant({ user: JANET, siteId: 'D4281', membership: membresia(), legacyPermissions: ['mailbox'], now: AHORA });
check('origen: su membresía', gJ.source === 'membership');
check('puede ver la Bóveda', S.hasPermission(gJ, 'finance.view'));
check('puede exportar y descargar', S.hasPermission(gJ, 'finance.export'));
check('⚠️ NO puede finance.manage', !S.hasPermission(gJ, 'finance.manage'));
check('⚠️ NO administra usuarios ni roles', !S.hasPermission(gJ, 'users.manage') && !S.hasPermission(gJ, 'roles.manage'));
check('⚠️ NO alcanza integraciones (credenciales de Stripe)', !S.hasPermission(gJ, 'integrations.view') && !S.hasPermission(gJ, 'integrations.manage'));
check('⚠️ NO alcanza la configuración del sitio', !S.hasPermission(gJ, 'site_settings.view'));
check('su menú se recorta', S.isRestrictedGrant(gJ));
check('abre /admin/boveda', S.canOpenPath(gJ, '/admin/boveda'));
check('no abre /admin/integraciones', !S.canOpenPath(gJ, '/admin/integraciones'));
check('no abre /admin/configuracion', !S.canOpenPath(gJ, '/admin/configuracion'));
eq('su destino al entrar es la Bóveda', S.landingFor(gJ), '/admin/boveda');
check('v4.1271 — ve el Directorio de Clubes', S.hasPermission(gJ, 'clubs.view'));
check('v4.1271 — administra el Directorio y el Catálogo Maestro', S.hasPermission(gJ, 'clubs.manage'));
check('v4.1271 — abre /admin/directorio-clubes (y su pestaña del catálogo)', S.canOpenPath(gJ, '/admin/directorio-clubes') && S.canOpenPath(gJ, '/admin/directorio-clubes?tab=catalogo'));
check('v4.1271 — el Directorio es un módulo de SITIO, no de plataforma', S.moduleOf('clubs')?.scope === 'site' && !S.moduleOf('platform_sites').routes.includes('/admin/directorio-clubes'));

const LAYOUT = leer('src/components/admin/AdminLayout.tsx');
const RUTAS = [...new Set([...LAYOUT.matchAll(/path:\s*(?:esFeria \? '[^']*' : )?'(\/admin[^']*)'/g)].map(m => m[1]))];
const menu = RUTAS.filter(p => S.canOpenPath(gJ, p));
check('la barra lateral tiene «Finanzas → Bóveda de Fondos»', menu.includes('/admin/boveda'), JSON.stringify(menu));
check('v4.1271 — y «Directorio de Clubes»', menu.includes('/admin/directorio-clubes'), JSON.stringify(menu));
check('⚠️ y ninguna pantalla de administración', !menu.some(p => ['/admin/usuarios', '/admin/configuracion', '/admin/integraciones', '/admin/roles'].includes(p)), JSON.stringify(menu));
check('la entrada de la Bóveda vive en la categoría Finanzas', /label: esFeria \? 'Conciliaciones y Desembolsos' : 'Bóveda de Fondos',[\s\S]{0,200}category: 'Finanzas'/.test(LAYOUT));

// ── 3. La vigencia por período ──────────────────────────────────────
grupo('3. La vigencia del acceso por período rotario');
eq('30-oct-2026 cae en 2026-2027', S.rotaryPeriodEnd(new Date('2026-10-30T12:00:00Z')), '2027-06-30');
eq('marzo de 2027 también', S.rotaryPeriodEnd(new Date('2027-03-01T12:00:00Z')), '2027-06-30');
eq('el 1 de julio abre el período siguiente', S.rotaryPeriodEnd(new Date('2027-07-01T12:00:00Z')), '2028-06-30');
eq('el rótulo del período', S.rotaryPeriodLabel('2027-06-30'), '2026-2027');
eq('⚠️ un día sin hora es el día ENTERO en hora de Colombia', S.normalizeValidUntil('2027-06-30').value, '2027-07-01T04:59:59.999Z');
eq('vacío es «sin vencimiento»', S.normalizeValidUntil('').value, null);
check('una fecha ilegible se RECHAZA con motivo', S.normalizeValidUntil('30/06/2027x').ok === false && !!S.normalizeValidUntil('nope').error);
const vigente = membresia({ validUntil: '2027-07-01T04:59:59.999Z' });
const vencida = membresia({ validUntil: '2027-07-01T04:59:59.999Z' });
check('vigente el 30 de junio de 2027 a las 23:00 de Colombia', !S.isMembershipExpired(vigente, new Date('2027-07-01T04:00:00Z')));
check('vencida el 1 de julio de 2027', S.isMembershipExpired(vencida, new Date('2027-07-01T06:00:00Z')));
check('una fecha ilegible en la fila NO vence a nadie en silencio', !S.isMembershipExpired(membresia({ validUntil: 'basura' }), AHORA));
const gV = S.resolveGrant({ user: JANET, siteId: 'D4281', membership: vencida, legacyPermissions: ['mailbox'], now: new Date('2027-07-02T00:00:00Z') });
eq('⚠️ un acceso vencido resuelve `expired`', gV.source, 'expired');
check('⚠️ y no concede NADA — ni el menú base institucional', gV.permissions.size === 0);
check('conserva el rol para poder renovarlo', gV.roleKey === 'digital_secretary');
check('no se recorta el menú: el servidor contesta con su motivo', !S.isRestrictedGrant(gV));
const gVig = S.resolveGrant({ user: JANET, siteId: 'D4281', membership: vigente, now: AHORA });
check('vigente: concede lo suyo', S.hasPermission(gVig, 'finance.view'));
const guardia = codigo('server/middleware/institutionalGuard.js');
check('el guardia rechaza el vencido con `access_expired` y la fecha', /source === 'expired'/.test(guardia) && /access_expired/.test(guardia));
const ensure = leer('server/lib/ensureRbacSchema.js');
check('⚠️ la columna está en los ALTER', /ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMPTZ/.test(ensure));
check('⚠️ …y ENUMERADA en el atajo (o el ALTER no corre nunca)', /column: 'validUntil'/.test(ensure) && /\('SiteMembership','validUntil'\)/.test(ensure));
const store = codigo('server/lib/rbacStore.js');
check('la membresía viaja con su vigencia', /validUntil: row\.validUntil/.test(store));
check('la vigencia viaja en el grant serializado', /validUntil: grant\?\.membership\?\.validUntil/.test(store));
const ctrl = codigo('server/controllers/rbacController.js');
check('endpoint de vigencia: nadie sobre sí mismo', /putUserValidity[\s\S]{0,600}String\(userId\) === String\(req\.user\?\.id\)/.test(ctrl));
check('endpoint de vigencia: protege al último administrador', /putUserValidity[\s\S]{0,1200}orphanCheck/.test(ctrl));
check('endpoint de vigencia: queda auditado', /membership_validity_changed/.test(ctrl));
check('la ruta exige users.manage', /router\.put\('\/users\/:userId\/validity', requirePermission\('users\.manage'\)/.test(leer('server/routes/rbac.js')));

// ── 4. Nadie más cambia ─────────────────────────────────────────────
grupo('4. El acceso no altera los permisos de otros usuarios');
const gA = S.resolveGrant({ user: ADMIN, siteId: 'D4281', now: AHORA });
check('el administrador del distrito sigue con todo lo del sitio', S.isFullSiteAdmin(gA) && S.hasPermission(gA, 'finance.manage'));
check('el operador sigue con todo', S.resolveGrant({ user: OPERADOR, siteId: 'D4281' }).source === 'platform_operator');
const gI = S.resolveGrant({ user: INSTI, siteId: 'D4281', legacyPermissions: ['mailbox'], now: AHORA });
check('un institucional sigue sin finance.export ni manage', S.hasPermission(gI, 'finance.view') && !S.hasPermission(gI, 'finance.export') && !S.hasPermission(gI, 'finance.manage'));
check('una membresía SIN vigencia no vence nunca (filas anteriores)', !S.isMembershipExpired(membresia(), new Date('2099-01-01')));
check('una membresía de OTRO sitio no decide nada acá',
    S.resolveGrant({ user: JANET, siteId: 'OTRO', membership: membresia(), now: AHORA }).source !== 'membership');

// ── 5. Las rutas: lo que lee, lo que descarga y lo que NO puede ─────
grupo('5. Las rutas de la Bóveda en el servidor');
const FIN = codigo('server/routes/financial.js');
const ruta = (metodo, path) => {
    const re = new RegExp(`router\\.${metodo}\\('${path.replace(/[/:]/g, m => (m === '/' ? '\\/' : m))}',([^\\n]*(?:\\n\\s+[^\\n]*){0,3})`);
    return (FIN.match(re) || [])[1] || '';
};
const lectura = (m, p) => /requireRoleOrPermission\(SITE_ADMIN_ROLES, 'finance\.view'\)/.test(ruta(m, p));
const descarga = (m, p) => /requireRoleOrPermission\(SITE_ADMIN_ROLES, 'finance\.export'\)/.test(ruta(m, p));
const soloAdmin = (m, p) => /requireSiteAdmin/.test(ruta(m, p)) || /finance\.manage/.test(ruta(m, p));
check('aportes: finance.view', lectura('get', '/donations'));
check('saldos por moneda: finance.view', lectura('get', '/wallet'));
check('ficha del aporte (ciclo de vida): finance.view', lectura('get', '/payments/:id/lifecycle'));
check('lotes de traslado: finance.view', lectura('get', '/wallet/disbursement-batches') && lectura('get', '/wallet/disbursement-batches/:id'));
check('historial de avisos del traslado: finance.view', lectura('get', '/wallet/disbursement-batches/:id/notices'));
check('historial de conciliaciones (auditoría del ciclo): finance.view', lectura('get', '/wallet/audit-events'));
check('comprobante del traslado: finance.export Y auditado', descarga('get', '/disbursements/:id/receipt') && /vault_receipt_downloaded/.test(ruta('get', '/disbursements/:id/receipt')));
check('conciliación del traslado: finance.export Y auditada', descarga('get', '/wallet/disbursement-batches/:id/reconciliation') && /vault_document_downloaded/.test(ruta('get', '/wallet/disbursement-batches/:id/reconciliation')));
check('documento archivado: finance.export Y auditado', descarga('get', '/wallet/notices/:id/document') && /vault_document_downloaded/.test(ruta('get', '/wallet/notices/:id/document')));
check('conciliación de una selección (sin enviar): finance.export Y auditada', descarga('post', '/wallet/reconciliations/document') && /vault_document_downloaded/.test(ruta('post', '/wallet/reconciliations/document')));
check('la traza de apertura y exportación: finance.view', lectura('post', '/wallet/access-log'));
for (const [m, p, qué] of [
    ['post', '/payments/:id/disbursements', 'registrar un traslado'],
    ['post', '/disbursements/:id/reverse', 'reversar un traslado'],
    ['post', '/disbursements/:id/notify', 'reintentar un aviso'],
    ['post', '/wallet/disbursements/bulk', 'trasladar en bloque'],
    ['post', '/wallet/sync-stripe', 'sincronizar con Stripe'],
    ['post', '/wallet/refresh', 'barrer los estados'],
    ['post', '/wallet/reconcile', 'corregir estados históricos'],
    ['post', '/wallet/reconciliations/resend', 'reenviar una conciliación a terceros'],
    ['post', '/wallet/disbursement-batches/:id/resend', 'reenviar la conciliación de un lote'],
    ['post', '/wallet/beneficiaries', 'cambiar un beneficiario'],
    ['post', '/donations/:id/resend', 'reenviar la confirmación a un aportante'],
]) check(`⚠️ ${qué}: sigue siendo de administrador`, soloAdmin(m, p), ruta(m, p).slice(0, 120));
const PAY = codigo('server/routes/payouts.js');
check('⚠️ solicitar un retiro: sigue siendo de administrador', /router\.post\('\/request', requireSiteModule\('finance_vault'\), requireSiteAdmin/.test(PAY));
check('⚠️ las credenciales de Stripe son del operador', /router\.(get|put)\('\/admin\/payment-methods', roleMiddleware\(superAdminRoles\)/.test(PAY));
check('exportar desde la pantalla exige finance.export también al declararlo', /evento === 'exported'[\s\S]{0,300}hasPermission\(g, 'finance\.export'\)/.test(FIN));

// ── 6. La auditoría declarada ───────────────────────────────────────
grupo('6. Lo que declara la pantalla, con catálogo cerrado');
eq('abrir la Bóveda', VA.describirDeclarado({ evento: 'opened' }).kind, 'vault_opened');
const exp = VA.describirDeclarado({ evento: 'exported', formato: 'xlsx', vista: 'control', moneda: 'cop', periodo: 'Todo el histórico', filas: 16 });
eq('exportar: el hecho', exp.kind, 'vault_report_exported');
check('exportar: el detalle lo redactamos nosotros', exp.detail === 'formato XLSX · vista Control y Justificación · moneda COP · período Todo el histórico · 16 filas', exp.detail);
check('un evento inventado se rechaza', VA.describirDeclarado({ evento: 'borrar_todo' }).ok === false);
check('un formato inventado se rechaza', VA.describirDeclarado({ evento: 'exported', formato: 'exe' }).ok === false);
check('una vista desconocida no mete texto libre', VA.describirDeclarado({ evento: 'exported', formato: 'csv', vista: '<script>' }).detail.includes('informe de movimientos'));
check('una moneda que no es un código no entra', !String(VA.describirDeclarado({ evento: 'opened', moneda: '$$' }).detail || '').includes('$'));
check('⚠️ sólo se anota lo que SALIÓ (código < 400)', /statusCode >= 400\) return/.test(codigo('server/lib/vaultAudit.js')));

// ── 7. La vista de control ──────────────────────────────────────────
grupo('7. Control y Justificación de Aportes (criterio puro)');
const C = await compilar('src/lib/contributionControl.ts');
if (!C) {
    console.log('  · esbuild no disponible: se salta el bloque compilado');
} else {
    const mov = (id, bucket, amount, extra = {}) => ({ id, bucket, amount, currency: 'COP', origin: { kind: 'campaign', id: 'sismo', label: 'Campaña: Emergencia Terremoto Colombia 2026' }, providerRef: `cs_${id}`, ...extra });
    const aporte = (id, m, extra = {}) => ({ id, amount: 200000, currency: 'COP', donorName: `Aportante ${id}`, donorEmail: `${id}@x.org`, date: '2026-08-21T21:46:00Z', movement: m, ...extra });
    const aportes = [
        aporte('a', mov('pa', 'available', 186000)),                         // disponible, sin traslado
        aporte('b', mov('pb', 'available', 186000)),                         // trasladado CON comprobante
        aporte('c', mov('pc', 'available', 186000)),                         // trasladado SIN comprobante
        aporte('d', mov('pd', 'available', 186000)),                         // parcial
        aporte('e', mov('pe', 'in_transit', 186000)),                        // confirmado, aún no disponible
        aporte('f', mov('pf', 'processing', 186000)),                        // en procesamiento
        aporte('g', null),                                                   // sin movimiento
        aporte('h', mov('ph', 'available', 9.4, { currency: 'USD' }), { amount: 10, currency: 'USD', isAnonymous: true, donorName: 'Ana Pérez', donorEmail: 'ana@x.org' }),
        aporte('i', mov('pi', 'available', 186000)),                         // traslado REVERSADO
    ];
    const ds = {
        pb: [{ id: 'd1', amount: 186000, status: 'registrado', hasReceipt: true, beneficiary: 'Cruz Roja', disbursedAt: '2026-09-01' }],
        pc: [{ id: 'd2', amount: 186000, status: 'registrado', hasReceipt: false, beneficiary: 'Cruz Roja', disbursedAt: '2026-09-02' }],
        pd: [{ id: 'd3', amount: 100000, status: 'registrado', hasReceipt: true, beneficiary: 'Cruz Roja' }],
        pi: [{ id: 'd4', amount: 186000, status: 'reversado', hasReceipt: true, beneficiary: 'Cruz Roja' }],
    };
    const F = Object.fromEntries(C.filasDeControl(aportes, ds).map(f => [f.id, f]));
    eq('disponible sin traslado → «Pendiente de traslado»', F.a.estadoTraslado, 'pendiente');
    eq('…y sin traslado NO es «comprobante pendiente»', F.a.estadoComprobante, 'sin_traslado');
    eq('trasladado con soporte', [F.b.estadoTraslado, F.b.estadoComprobante], ['trasladado', 'con_soporte']);
    eq('⚠️ trasladado SIN soporte → «Comprobante pendiente»', [F.c.estadoTraslado, F.c.estadoComprobante], ['trasladado', 'pendiente']);
    eq('un traslado que no cubre el neto es PARCIAL', F.d.estadoTraslado, 'parcial');
    eq('⚠️ confirmado por Stripe NO es trasladado', [F.e.estadoPago, F.e.estadoTraslado], ['confirmado', 'no_disponible']);
    eq('en procesamiento', F.f.estadoPago, 'procesando');
    eq('sin movimiento: no se inventa nada', [F.g.estadoPago, F.g.estadoTraslado, F.g.referenciaStripe], ['sin_movimiento', 'no_aplica', null]);
    eq('⚠️ un traslado reversado no cuenta', [F.i.estadoTraslado, F.i.trasladado], ['pendiente', 0]);
    eq('el beneficiario sale del traslado', F.b.beneficiarios, ['Cruz Roja']);
    const I = C.indicadoresDe(Object.values(F));
    eq('⚠️ lo recaudado va POR MONEDA, sin sumar', I.recaudadoPorMoneda, { COP: 1600000, USD: 10 });
    eq('confirmados (confirmado + disponible)', I.confirmados, 7);
    eq('pendientes de comprobante', I.pendientesDeComprobante, 1);
    eq('con soporte', I.conSoporte, 2);
    eq('con traslado (total o parcial)', I.transferidos, 3);
    const todas = Object.values(F);
    eq('filtro «sin comprobante» = traslados sin soporte', C.filtrarControl(todas, { comprobante: 'sin' }).map(f => f.id), ['c']);
    eq('filtro por moneda', C.filtrarControl(todas, { moneda: 'USD' }).map(f => f.id), ['h']);
    eq('búsqueda de aportante sin tildes', C.filtrarControl(todas, { aportante: 'PEREZ' }).map(f => f.id), ['h']);
    eq('búsqueda por referencia de Stripe', C.filtrarControl(todas, { aportante: 'cs_pb' }).map(f => f.id), ['b']);
    const inf = C.informeControl({ sitio: 'Rotary Distrito 4281', periodo: 'Todo el histórico', destino: 'Todos', filas: todas, emitido: new Date('2026-10-30T15:00:00Z') });
    const csv = C.aCSVControl(inf);
    check('el CSV lleva BOM y punto y coma', csv.startsWith('﻿') && csv.includes(';'));
    check('⚠️ el anónimo NO lleva nombre ni correo al archivo', !csv.includes('Ana Pérez') && !csv.includes('ana@x.org'));
    check('⚠️ el archivo no suma monedas: una línea por moneda', csv.includes('Recaudado COP') && csv.includes('Recaudado USD') && !/Recaudado;/.test(csv));
    check('el archivo dice el estado del comprobante', csv.includes('Comprobante pendiente'));
    check('el archivo lleva la referencia de la transacción', csv.includes('cs_pb'));
    eq('nombre del archivo', C.nombreArchivoControl(inf, 'csv'), 'control-aportes-rotary-distrito-4281-20261030.csv');
}

// ── 8. La pantalla ──────────────────────────────────────────────────
grupo('8. La pantalla pinta; el servidor decide');
const WM = codigo('src/pages/admin/WalletManagement.tsx');
check('⚠️ ya no llama a `acceso.can` (no existe: tumbaba la Bóveda de todo acceso acotado)', !/acceso\.can\(/.test(WM));
check('gestionar = finance.manage; exportar = finance.export', /acceso\.has\('finance\.manage'\)/.test(WM) && /acceso\.has\('finance\.export'\)/.test(WM));
check('las descargas del informe se esconden sin finance.export', /puedeExportar && activeDonations\.length > 0/.test(WM));
check('la ficha se monta en sólo lectura', /soloLectura=\{soloLectura\}/.test(WM));
check('la pestaña de Control existe y lee los MISMOS aportes', /tab === 'control'[\s\S]{0,200}aportes=\{donations\}[\s\S]{0,60}desembolsos=\{desembolsos\}/.test(WM));
check('la apertura y la exportación se declaran a la auditoría', /evento: 'opened'/.test(WM) && /evento: 'exported'/.test(WM));
check('⚠️ la tarjeta ya no afirma «Fundación Rotaria» a todo rol', !/Tu perfil institucional de la <b>Fundación Rotaria<\/b>/.test(leer('src/pages/admin/WalletManagement.tsx')));
const DS = codigo('src/components/admin/wallet/DisbursementSection.tsx');
check('sin «Registrar desembolso» en sólo lectura', /!soloLectura && puedeDesembolsar/.test(DS));
check('sin «Reintentar aviso» en sólo lectura', /!soloLectura && d\.notifyState === 'fallido'/.test(DS));
check('un traslado sin soporte dice «Comprobante pendiente»', /Comprobante pendiente/.test(DS));
const CV = codigo('src/components/admin/wallet/ContributionControlView.tsx');
check('⚠️ la vista de control no escribe: ninguna petición propia', !/axios|fetch\(/.test(CV));
check('su detalle es la ficha de siempre, en sólo lectura', /<DisbursementSection[\s\S]{0,200}soloLectura/.test(CV));
const MIRROR = await compilar('src/lib/rbacSpec.ts');
if (MIRROR) {
    const m = MIRROR.presetRole('digital_secretary');
    check('el espejo del navegador tiene el mismo preset', !!m && JSON.stringify(m.permissions) === JSON.stringify(preset.permissions));
    check('⚠️ …sin el destino: lo decide el servidor', m && !('landing' in m));
}

console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas bien.`);
