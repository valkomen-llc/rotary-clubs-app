#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// La inscripción de un club: uno o dos proyectos, un pago.
// npm run test:fair:registration — v4.1299.0
//
// Sin base, sin credenciales, sin red. Prueba en las dos mitades donde la
// regla puede romperse en silencio:
//
//   1. El CRITERIO (`server/lib/projectFairRegistration.js`): las tarifas,
//      qué cubre una orden, cuánto suma, cuándo se puede agregar o quitar el
//      segundo proyecto y cómo se leen los proyectos cubiertos por un cobro.
//   2. El CAMINO, leído de los archivos: que el cobro cubra SÓLO lo que dice
//      su metadata, que el tope viva en la base, que el wizard mande una
//      ficha por proyecto, que la migración no toque lo ya migrado y que el
//      perfil ancle el pago en la inscripción y no en el proyecto mirado.
// ════════════════════════════════════════════════════════════════════
import {
    MODALITIES, modalityOf, projectCountOf, pricingRulesOf, lineAmountFor, modalityTotal,
    isActiveProject, activeProjects, coveredByCheckout, orderFor, registrationBreakdown,
    secondProjectVerdict, removeProjectVerdict, coveredIdsFromMetadata, coveredIdsToMetadata,
    SQL_ACTIVE_PROJECT, SQL_FIRST_PROJECT, SQL_SECOND_PROJECT, SQL_REGISTRATION_KEY, projectIndexLabel,
} from '../server/lib/projectFairRegistration.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const leer = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const CFG = { enabled: true, deadline: '2026-11-09', registration: { priceMode: 'COP', amountCop: 250000, maxProjectsPerClub: 2, secondProjectEnabled: true, secondProjectAmountCop: 100000 } };
const row = (o = {}) => ({ id: o.id || `s${o.projectIndex || 1}`, projectIndex: 1, workflowStatus: 'received', status: 'pending_payment', archivedAt: null, projectName: 'P', metadata: {}, ...o });

// ════════════════════════════════════════════════════════════════════
section('1. Las tarifas de la convocatoria (250.000 + 100.000 = 350.000)');
const rules = pricingRulesOf(CFG);
eq('moneda', rules.mode, 'COP');
eq('tope: dos proyectos por club', rules.maxProjects, 2);
eq('primer proyecto', rules.first, 250000);
eq('segundo proyecto', rules.second, 100000);
ok('el segundo está habilitado', rules.secondEnabled);
eq('línea del primero', lineAmountFor(rules, 1), 250000);
eq('línea del segundo', lineAmountFor(rules, 2), 100000);
eq('un proyecto = 250.000', modalityTotal(rules, 1), 250000);
eq('dos proyectos = 350.000 (no 500.000)', modalityTotal(rules, 2), 350000);
eq('el catálogo de modalidades es cerrado', MODALITIES.map(m => m.key), ['single', 'double']);
eq('modalidad por cantidad', [modalityOf(1), modalityOf(2), modalityOf(5)], ['single', 'double', 'double']);
eq('cantidad por modalidad', [projectCountOf('single'), projectCountOf('double')], [1, 2]);
eq('rótulos de posición', [projectIndexLabel(1), projectIndexLabel(2)], ['Primer proyecto', 'Segundo proyecto']);

section('2. El interruptor y el tope son administrativos, y no se pueden ampliar desde fuera');
ok('apagado el segundo proyecto, la convocatoria vuelve a UN proyecto', pricingRulesOf({ registration: { ...CFG.registration, secondProjectEnabled: false } }).maxProjects === 1);
ok('sin tarifa del segundo (0), no se ofrece', !pricingRulesOf({ registration: { ...CFG.registration, secondProjectAmountCop: 0 } }).secondEnabled);
eq('un tope de 5 se acota a 2 (regla administrativa aprobada)', pricingRulesOf({ registration: { ...CFG.registration, maxProjectsPerClub: 5 } }).maxProjects, 2);
eq('un tope raro vale 1', pricingRulesOf({ registration: { ...CFG.registration, maxProjectsPerClub: 'muchos' } }).maxProjects, 1);
eq('en dólares se leen las tarifas en dólares', pricingRulesOf({ registration: { priceMode: 'USD', amountUsd: 62, secondProjectAmountUsd: 25, maxProjectsPerClub: 2 } }).second, 25);
eq('la fecha límite del segundo sólo vale con formato', pricingRulesOf({ registration: { ...CFG.registration, secondProjectDeadline: 'mañana' } }).secondDeadline, null);
eq('…y con formato se conserva', pricingRulesOf({ registration: { ...CFG.registration, secondProjectDeadline: '2026-12-01' } }).secondDeadline, '2026-12-01');
// La configuración por defecto del módulo trae la modalidad del pedido.
const ctrl = leer('server/controllers/projectFairController.js');
ok('DEFAULT_CONFIG: hasta dos proyectos por club', /maxProjectsPerClub: 2,/.test(ctrl));
ok('DEFAULT_CONFIG: el segundo a 100.000 COP', /secondProjectAmountCop: 100000/.test(ctrl));
ok('la copia guardada del tope viejo (1, sin editor) cede al nuevo valor por defecto',
    /secondProjectAmountCop === undefined[\s\S]*?const \{ maxProjectsPerClub, \.\.\.restReg \} = out\.registration/.test(ctrl));
ok('el texto público de «un (1) proyecto» se reemplaza si sigue siendo exactamente el viejo', /LEGACY_INTROS\.includes\(out\.content\.intro\.trim\(\)\)/.test(ctrl));
ok('y el nuevo habla de hasta dos proyectos', /intro: 'Los clubes rotarios podrán postular hasta dos proyectos/.test(ctrl));

section('3. Qué proyectos cuentan en la inscripción');
ok('uno postulado cuenta', isActiveProject(row()));
ok('un borrador cuenta (participa, aunque no deba)', isActiveProject(row({ workflowStatus: 'draft' })));
ok('un rechazado cuenta (estuvo inscrito)', isActiveProject(row({ workflowStatus: 'rejected' })));
ok('uno retirado NO cuenta', !isActiveProject(row({ workflowStatus: 'withdrawn' })));
ok('uno archivado NO cuenta', !isActiveProject(row({ archivedAt: '2026-10-01' })));
eq('los activos salen ordenados por posición',
    activeProjects([row({ id: 'b', projectIndex: 2 }), row({ id: 'a', projectIndex: 1 })]).map(r => r.id), ['a', 'b']);

section('4. Qué cubre el pago que se abre ahora');
const dos = [row({ id: 'p1', projectIndex: 1, projectName: 'Agua' }), row({ id: 'p2', projectIndex: 2, projectName: 'Salud' })];
const o1 = orderFor(dos, rules);
eq('dos postulados sin pagar: UNA orden de dos líneas', o1.count, 2);
eq('que suma 350.000', o1.total, 350000);
eq('anclada en el primero', o1.anchorId, 'p1');
eq('con los dos cubiertos', o1.coveredIds, ['p1', 'p2']);
eq('cada línea con su posición y su precio', o1.lines.map(l => [l.projectIndex, l.amount]), [[1, 250000], [2, 100000]]);
ok('y su rótulo nombra el proyecto', o1.lines[1].label === 'Segundo proyecto — Salud');

const primeroPagado = [row({ id: 'p1', projectIndex: 1, status: 'paid', amountCop: 250000 }), row({ id: 'p2', projectIndex: 2 })];
const o2 = orderFor(primeroPagado, rules);
eq('con el primero ya pagado, la orden es SÓLO el segundo: 100.000 (cobro complementario)', [o2.count, o2.total, o2.anchorId], [1, 100000, 'p2']);
eq('un borrador no se cobra', orderFor([row({ id: 'p1' }), row({ id: 'p2', projectIndex: 2, workflowStatus: 'draft' })], rules).coveredIds, ['p1']);
eq('un retirado no se cobra', orderFor([row({ id: 'p1' }), row({ id: 'p2', projectIndex: 2, workflowStatus: 'withdrawn' })], rules).coveredIds, ['p1']);
eq('un rechazado no se cobra', orderFor([row({ id: 'p1' }), row({ id: 'p2', projectIndex: 2, workflowStatus: 'rejected' })], rules).coveredIds, ['p1']);
eq('sin deuda, orden vacía', orderFor([row({ status: 'paid' })], rules).count, 0);
eq('un solo proyecto: la orden de siempre (250.000)', orderFor([row()], rules).total, 250000);
eq('coveredByCheckout es la misma lista', coveredByCheckout(dos).map(r => r.id), ['p1', 'p2']);

section('5. El desglose de la inscripción, para mostrarlo');
const b = registrationBreakdown(primeroPagado, rules);
eq('modalidad', b.modality, 'double');
eq('total 350.000', b.total, 350000);
eq('pagado 250.000', b.paidTotal, 250000);
eq('pendiente 100.000', b.pendingTotal, 100000);
ok('la línea pagada conserva su importe congelado aunque cambie la tarifa',
    registrationBreakdown([row({ status: 'paid', amountCop: 200000 })], rules).lines[0].amount === 200000);
ok('un retirado no aparece', registrationBreakdown([row(), row({ id: 'x', projectIndex: 2, workflowStatus: 'withdrawn' })], rules).count === 1);
ok('un rechazado aparece pero no suma al total', registrationBreakdown([row(), row({ id: 'x', projectIndex: 2, workflowStatus: 'rejected' })], rules).total === 250000);

section('6. ¿Se puede agregar un segundo proyecto?');
const ahora = new Date('2026-10-01T12:00:00-05:00').getTime();
let v = secondProjectVerdict([row()], CFG, { now: ahora });
ok('con uno activo y la convocatoria abierta, sí', v.ok && v.code === null);
eq('y la posición siguiente es 2', v.nextIndex, 2);
v = secondProjectVerdict(dos, CFG, { now: ahora });
eq('con dos activos, no: tope alcanzado', [v.ok, v.code], [false, 'max_reached']);
v = secondProjectVerdict([row()], { ...CFG, registration: { ...CFG.registration, secondProjectEnabled: false } }, { now: ahora });
eq('con el segundo apagado, no', [v.ok, v.code], [false, 'disabled']);
v = secondProjectVerdict([row()], { ...CFG, enabled: false }, { now: ahora });
eq('con la convocatoria cerrada, no', [v.ok, v.code], [false, 'closed']);
v = secondProjectVerdict([row()], CFG, { now: new Date('2026-11-10T12:00:00-05:00').getTime() });
eq('vencida la fecha límite general, no', [v.ok, v.code], [false, 'deadline']);
v = secondProjectVerdict([row()], { ...CFG, deadline: '2026-11-09', registration: { ...CFG.registration, secondProjectDeadline: '2026-12-15' } }, { now: new Date('2026-11-20T12:00:00-05:00').getTime() });
ok('la fecha propia del segundo proyecto manda sobre la general', v.ok);
v = secondProjectVerdict([row(), row({ id: 'p2', projectIndex: 2, workflowStatus: 'withdrawn', metadata: { withdrawnByClub: { at: 'x' } } })], CFG, { now: ahora });
eq('con un segundo retirado por el club: se restaura, no se crea otro', [v.ok, v.code, v.restoreId], [true, 'restorable', 'p2']);
v = secondProjectVerdict([row(), row({ id: 'p2', projectIndex: 2, workflowStatus: 'withdrawn' })], CFG, { now: ahora });
ok('un retirado por el COMITÉ no se restaura solo: se puede crear otro', v.ok && v.code === null);
ok('todo «no» trae su motivo escrito', ['disabled', 'closed', 'max_reached', 'deadline'].every(code => {
    const cfgs = { disabled: { ...CFG, registration: { ...CFG.registration, secondProjectEnabled: false } }, closed: { ...CFG, enabled: false }, max_reached: CFG, deadline: CFG };
    const rows = code === 'max_reached' ? dos : [row()];
    const now = code === 'deadline' ? new Date('2027-01-01').getTime() : ahora;
    const r = secondProjectVerdict(rows, cfgs[code], { now });
    return r.code === code && typeof r.reason === 'string' && r.reason.length > 10;
}));

section('7. ¿Se puede quitar el segundo proyecto?');
eq('el principal no se quita', removeProjectVerdict(row()).code, 'primary');
ok('el segundo sin pagar sí', removeProjectVerdict(row({ projectIndex: 2 })).ok);
eq('el segundo ya pagado NO (procedimiento administrativo)', removeProjectVerdict(row({ projectIndex: 2, status: 'paid' })).code, 'paid');
eq('reembolsado tampoco', removeProjectVerdict(row({ projectIndex: 2, status: 'refunded' })).code, 'paid');
eq('ya retirado, no otra vez', removeProjectVerdict(row({ projectIndex: 2, workflowStatus: 'withdrawn' })).code, 'already');

section('8. Los proyectos cubiertos por un cobro se LEEN de su metadata');
eq('se parsean y se incluye el ancla', coveredIdsFromMetadata({ coveredSubmissionIds: 'p1,p2' }, 'p1'), ['p1', 'p2']);
eq('sin repetidos', coveredIdsFromMetadata({ coveredSubmissionIds: 'p2,p2' }, 'p1'), ['p1', 'p2']);
eq('una sesión antigua sin el dato cubre sólo su ancla', coveredIdsFromMetadata({}, 'p1'), ['p1']);
eq('ida y vuelta', coveredIdsFromMetadata({ coveredSubmissionIds: coveredIdsToMetadata(['a', 'b']) }, 'a'), ['a', 'b']);

section('9. Las mismas reglas, en SQL');
ok('activo = sin archivar y no retirado', /"archivedAt" IS NULL/.test(SQL_ACTIVE_PROJECT) && /<> 'withdrawn'/.test(SQL_ACTIVE_PROJECT));
eq('primer proyecto', SQL_FIRST_PROJECT, `COALESCE("projectIndex",1) = 1`);
eq('segundo proyecto', SQL_SECOND_PROJECT, `COALESCE("projectIndex",1) >= 2`);
eq('la llave de la inscripción cae a la fila misma en lo heredado', SQL_REGISTRATION_KEY, `COALESCE("registrationId", id)`);

// ════════════════════════════════════════════════════════════════════
section('10. El camino, leído de los archivos');

// El cobro cubre SÓLO lo que dice la metadata, nunca «lo que debe hoy».
const confirmar = ctrl.slice(ctrl.indexOf('export const confirmPaidSession'), ctrl.indexOf('const findSubmissionForStripe'));
ok('confirmPaidSession lee los cubiertos de la metadata de la sesión', /coveredIdsFromMetadata\(session\.metadata, submissionId\)/.test(confirmar));
ok('y no los deduce de la inscripción', !/coveredByCheckout|orderFor/.test(confirmar));
const pi = ctrl.slice(ctrl.indexOf('export const handlePaymentIntentSucceeded'), ctrl.indexOf('export const handlePaymentFailed'));
ok('el webhook del PaymentIntent también los lee de su metadata', /coveredIdsFromMetadata\(paymentIntent\?\.metadata, submission\.id\)/.test(pi));
const marcar = ctrl.slice(ctrl.indexOf('const markCoveredPaid'), ctrl.indexOf('const coveredProjectsFor'));
ok('marcar los cubiertos es idempotente (sólo lo no pagado)', /AND status <> 'paid'/.test(marcar));
ok('y deja la marca de quién los cubrió', /coveredBy: anchor\.id/.test(marcar));
ok('sin escribir amountReceived en los cubiertos (el cobro real vive una vez, en el ancla)', !/amountReceived/.test(marcar));
ok('el pago NO mueve el estado del proyecto tampoco en los cubiertos', /THEN 'received' ELSE "workflowStatus" END/.test(marcar));
// La sesión de Stripe lleva los cubiertos en la metadata, en los dos sitios.
const cobro = ctrl.slice(ctrl.indexOf('export const beginCheckout'), ctrl.indexOf('const markCoveredPaid'));
eq('la metadata de la sesión y la del PaymentIntent llevan los cubiertos', (cobro.match(/coveredSubmissionIds: coveredIdsToMetadata\(order\.coveredIds\)/g) || []).length, 2);
ok('cada proyecto cubierto guarda SU línea, no el total', /for \(const l of order\.lines\)[\s\S]*?"amountCop" = \$1/.test(cobro));
ok('con dos proyectos, Stripe pinta una partida por proyecto', /partidasProyecto/.test(cobro) && /l\.key === 'base' && variosProyectos \? partidasProyecto : \[l\]/.test(cobro));
// El precio de la orden es el único cálculo del cobro.
ok('priceSubmission cobra la ORDEN de la inscripción', /orderFor\(siblings, rules\)/.test(ctrl.slice(ctrl.indexOf('export const priceSubmission'), ctrl.indexOf('export const beginCheckout'))));
ok('y un proyecto no cubierto se cobra solo, como siempre', /if \(!order\.coveredIds\.includes\(submission\.id\)\)/.test(ctrl));

// El tope vive en la base.
ok('índice único (inscripción, posición), parcial', /CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFairSubmission_registration_index_uidx" ON "ProjectFairSubmission" \("registrationId", "projectIndex"\) WHERE "registrationId" IS NOT NULL/.test(ctrl));
ok('y la posición se acota con CHECK a 2', /CHECK \("projectIndex" >= 1 AND "projectIndex" <= 2\)/.test(ctrl));
ok('la tabla de la inscripción se crea sin tocar datos', /CREATE TABLE IF NOT EXISTS "ProjectFairRegistration"/.test(ctrl));
for (const col of ['registrationId', 'projectIndex']) {
    ok(`la columna "${col}" se crea con ADD COLUMN IF NOT EXISTS`, new RegExp(`ALTER TABLE "ProjectFairSubmission" ADD COLUMN IF NOT EXISTS "${col}"`).test(ctrl));
}
// La migración sólo toca filas sin inscripción, y no agrupa por correo.
const migrar = ctrl.slice(ctrl.indexOf('export const migrateRegistrations'), ctrl.indexOf('export const migrateDecoupledStates'));
ok('la migración sólo toma filas con registrationId NULL', /WHERE s\."registrationId" IS NULL/.test(migrar));
ok('y las escribe de forma condicional (idempotente entre instancias)', /WHERE id = \$2 AND "registrationId" IS NULL/.test(migrar));
ok('una inscripción por fila heredada: no agrupa por correo ni por club', !/GROUP BY/.test(migrar) && /modality, metadata, "createdAt"\)\s*VALUES \(\$1, \$2, \$3, \$4, \$5, 'single'/.test(migrar));
ok('la inscripción es un PADRE: no se vacía como hija de la postulación',
    !/SUBMISSION_CHILDREN = \[[^\]]*ProjectFairRegistration/s.test(leer('server/controllers/projectFairAdminController.js')));

// El wizard manda una ficha por proyecto; el servidor valida cada una.
const wizard = leer('src/pages/FeriaProyectos.tsx');
ok('el wizard manda `projects` (una ficha por proyecto) y la modalidad', /projects: visibleProjects\.map/.test(wizard) && /modality: visibleProjects\.length/.test(wizard));
ok('la selección de modalidad está en el paso 1', /Modalidad de postulación del club/.test(wizard) && /chooseModality/.test(wizard));
ok('de dos a uno se confirma y la segunda ficha se conserva', /window\.confirm\('Vas a postular un solo proyecto/.test(wizard));
ok('el borrador local guarda modalidad y fichas, y migra el anterior', /feria_proyectos_draft_v2/.test(wizard) && /LEGACY_DRAFT_KEY/.test(wizard));
ok('el resumen de inscripción nombra club, distrito, cantidad y total', /Resumen de inscripción/.test(wizard) && /Cantidad de proyectos/.test(wizard));
ok('el servidor valida cada ficha por separado', /export const validateWizard/.test(ctrl) && /projectErrors\.push\(own\)/.test(ctrl));
ok('crea la inscripción ANTES que sus proyectos', ctrl.indexOf('INSERT INTO "ProjectFairRegistration"') < ctrl.indexOf('created.push(await insertProjectRow('));
ok('y deshace lo creado si la segunda ficha falla', /for \(const row of created\) await db\.query\('DELETE FROM "ProjectFairSubmission" WHERE id = \$1'/.test(ctrl));
ok('el tope lo decide el servidor, no el navegador', /raw\.length > rules\.maxProjects/.test(ctrl));

// El perfil.
const portal = leer('server/controllers/projectFairPortalController.js');
ok('el pago del perfil se ancla en el primer proyecto que debe', /anchorId = coveredByCheckout\(siblings\)\[0\]\?\.id \|\| own\.id/.test(portal));
ok('un token por proyecto, con el mismo vencimiento', /issueProjectToken = \(account, submissionId, \{ exp = null \}/.test(portal));
ok('agregar el segundo exige el veredicto del criterio', /secondProjectVerdict\(siblings, cfg\)/.test(portal.slice(portal.indexOf('export const addProject'))));
ok('quitarlo es un UPDATE condicional: nunca uno pagado', /WHERE id = \$1 AND status NOT IN \('paid','refunded'\) AND COALESCE\("workflowStatus",'received'\) <> 'withdrawn'/.test(portal));
ok('y conserva el estado anterior para restaurarlo', /withdrawnByClub: \{ at: new Date\(\)\.toISOString\(\), previousState: projectStateOf\(target\)/.test(portal));
const rutas = leer('server/routes/project-fair.js');
ok('las tres rutas del perfil exigen sesión del perfil', /router\.post\('\/portal\/projects', portal\.portalAuth/.test(rutas)
    && /router\.post\('\/portal\/projects\/:id\/withdraw', portal\.portalAuth/.test(rutas)
    && /router\.post\('\/portal\/projects\/:id\/restore', portal\.portalAuth/.test(rutas));
const miProyecto = leer('src/pages/MiProyecto.tsx');
ok('Mi proyecto cambia de proyecto cambiando de token', /setProjectToken\(p\.token\)/.test(miProyecto) && /const activeToken = projectToken \|\| token;/.test(miProyecto));
ok('las tarjetas del proyecto reciben el token del proyecto activo', !/token=\{token\}/.test(miProyecto));
ok('quitar el segundo proyecto pide confirmación', /window\.confirm\(`Vas a quitar/.test(miProyecto));

// El panel administrativo distingue clubes de proyectos.
const admin = leer('server/controllers/projectFairAdminController.js');
ok('cuenta inscripciones (clubes) aparte de proyectos', /COUNT\(DISTINCT \$\{SQL_REGISTRATION_KEY\}\) FILTER \(WHERE \$\{SQL_ACTIVE_PROJECT\}\)::int AS registrations/.test(admin));
ok('separa el recaudo por primeras y por segundas postulaciones', /AS "collectedFirst"/.test(admin) && /AS "collectedSecond"/.test(admin));
ok('filtra por cantidad de proyectos del club y por posición', /clean\(query\.proyectos, 4\)/.test(admin) && /clean\(query\.indice, 4\)/.test(admin));

section('11. v4.1301 — La ampliación desde «Mi proyecto»');
ok('el segundo proyecto creado desde el perfil queda marcado como ampliación', /addedVia: 'portal_extension'/.test(portal));
ok('y el del registro inicial, como wizard (valor por defecto)', /addedVia = 'wizard'/.test(ctrl) && /addedVia,/.test(ctrl));
ok('el cobro de sólo el segundo proyecto se nombra «Inscripción adicional»', /Inscripción adicional — Segundo proyecto — \$\{edition\}/.test(ctrl));
ok('…también en el comprobante', /Comprobante de inscripción adicional · segundo proyecto/.test(ctrl));
ok('la acción del botón la resuelve el servidor (postular / continuar / completar / dos ya registrados)',
    /key: 'add', label: 'Postular segundo proyecto'/.test(portal) && /key: 'continue', label: 'Continuar segundo proyecto'/.test(portal)
    && /key: 'pay', label: 'Completar inscripción del segundo proyecto'/.test(portal) && /key: 'complete', label: 'Tu club ya tiene dos proyectos registrados'/.test(portal));
ok('el saldo del perfil es lo pendiente de TODA la inscripción', /balance: breakdown\.pendingTotal/.test(portal));
ok('la carrera por el segundo proyecto se responde como 409 (índice único)', /String\(err\?\.code\) === '23505'/.test(portal));
ok('el panel distingue ampliaciones de inscripciones iniciales', /metadata->>'addedVia' = 'portal_extension'/.test(admin) && /originLabel: segundo \? \(segundo\.metadata\?\.addedVia === 'portal_extension'/.test(admin));
ok('y separa pago original de pago complementario en la ficha', /kind: projectIndexOf\(r\) >= 2/.test(admin));
ok('Mi proyecto abre el asistente desde el encabezado y no manda a Stripe al comenzar',
    /SecondProjectHeaderAction/.test(miProyecto) && /Comenzar segundo proyecto/.test(miProyecto) && /Tu segundo proyecto está listo para continuar/.test(miProyecto));
ok('con el primero pagado el asistente dice «pago complementario»; sin pagar, el saldo total', /registration\.firstPaid\s*\?/.test(miProyecto) && /saldoTrasAgregar/.test(miProyecto));
// El saldo según los pagos confirmados: 350.000 menos lo pagado.
eq('primero pagado → saldo 100.000', registrationBreakdown(primeroPagado, rules).pendingTotal, 100000);
eq('ninguno pagado → saldo 350.000', registrationBreakdown(dos, rules).pendingTotal, 350000);
eq('los dos pagados → saldo 0', registrationBreakdown([row({ id: 'p1', status: 'paid', amountCop: 250000 }), row({ id: 'p2', projectIndex: 2, status: 'paid', amountCop: 100000 })], rules).pendingTotal, 0);

// ════════════════════════════════════════════════════════════════════
console.log(`\n${fail ? '❌' : '✅'} test:fair:registration — ${pass} pasaron, ${fail} fallaron.\n`);
process.exit(fail ? 1 : 0);
