#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El ciclo de vida de una postulación.  npm run test:fair:lifecycle
// v4.1253.0
//
// Sin base, sin credenciales, sin red. Prueba la regla del pedido de v4.1253
// —«la postulación de un proyecto NO requiere un pago previo»— en las dos
// mitades donde se puede romper en silencio:
//
//   1. El CRITERIO (`server/lib/projectFairLifecycle.js`): qué es un borrador,
//      qué es una postulación enviada, qué cuenta como deuda, cuándo se abren
//      los formularios y cuándo se puede mandar un recordatorio.
//   2. El CAMINO, leído de los archivos: que el wizard ya no salte al pago,
//      que los webhooks ya no escriban en el estado del proyecto y que el
//      perfil ofrezca pagar sin condicionar la postulación.
// ════════════════════════════════════════════════════════════════════
import {
    PROJECT_STATES, PROJECT_STATE_KEYS, LEGACY_PAYMENT_WORKFLOW, NOT_APPLIED_STATES,
    projectStateOf, isApplied, owesRegistration, paymentStatusOf, paymentStatusLabel,
    formsRequirePayment, formAccessOf, paymentDeadlineOf, paymentDeadlinePassed,
    reminderVerdict, SQL_APPLIED, SQL_DRAFT, SQL_OWES,
} from '../server/lib/projectFairLifecycle.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const leer = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// ════════════════════════════════════════════════════════════════════
section('1. Dos estados independientes');

eq('el catálogo del proyecto es el del pedido (más los dos heredados)', PROJECT_STATE_KEYS,
    ['draft', 'formulating', 'received', 'in_review', 'needs_changes', 'approved', 'rejected', 'withdrawn', 'sent_to_grants', 'closed']);
eq('«Postulado» es received', PROJECT_STATES.find(s => s.key === 'received').label, 'Postulado');
ok('ningún estado del proyecto habla del pago',
    PROJECT_STATES.every(s => !/pago|pay/i.test(`${s.key} ${s.label}`)));

// ⚠️ LAS DOS COMBINACIONES QUE EL PEDIDO EXIGE QUE SEAN VÁLIDAS.
const postuladoPendiente = { workflowStatus: 'received', status: 'pending_payment' };
ok('Proyecto: Postulado · Pago: Pendiente es válido',
    projectStateOf(postuladoPendiente) === 'received' && paymentStatusOf(postuladoPendiente) === 'pending');
const revisionPagado = { workflowStatus: 'in_review', status: 'paid' };
ok('Proyecto: En revisión · Pago: Confirmado es válido',
    projectStateOf(revisionPagado) === 'in_review' && paymentStatusOf(revisionPagado) === 'confirmed');

section('2. Los valores heredados del pago se leen como «Postulado»');
for (const k of LEGACY_PAYMENT_WORKFLOW) eq(`${k} → received`, projectStateOf({ workflowStatus: k }), 'received');
eq('vacío → received (valor por defecto de la columna)', projectStateOf({}), 'received');
ok('un valor desconocido se conserva y cuenta como postulado (no se le quita a nadie su postulación)',
    projectStateOf({ workflowStatus: 'algo_nuevo' }) === 'algo_nuevo' && isApplied({ workflowStatus: 'algo_nuevo' }));

section('3. Borrador ≠ pendiente de pago');
eq('los no enviados son borrador y en formulación', NOT_APPLIED_STATES, ['draft', 'formulating']);
ok('un borrador NO está postulado', !isApplied({ workflowStatus: 'draft' }));
ok('uno en formulación tampoco', !isApplied({ workflowStatus: 'formulating' }));
ok('un borrador NUNCA es deuda', !owesRegistration({ workflowStatus: 'draft', status: 'pending_payment' }));
ok('uno postulado sin pagar SÍ es deuda', owesRegistration(postuladoPendiente));
ok('con el pago fallido también', owesRegistration({ workflowStatus: 'received', status: 'failed' }));
ok('pagado no debe', !owesRegistration({ workflowStatus: 'received', status: 'paid' }));
ok('reembolsado no debe', !owesRegistration({ workflowStatus: 'received', status: 'refunded' }));
ok('retirado no debe', !owesRegistration({ workflowStatus: 'withdrawn', status: 'pending_payment' }));
ok('rechazado no debe', !owesRegistration({ workflowStatus: 'rejected', status: 'pending_payment' }));
ok('archivado no debe', !owesRegistration({ workflowStatus: 'received', status: 'pending_payment', archivedAt: '2026-10-01' }));
ok('un heredado «payment_failed» sin pagar sí debe', owesRegistration({ workflowStatus: 'payment_failed', status: 'failed' }));

section('4. El estado del pago, como se le explica a una persona');
eq('pendiente', paymentStatusOf({ status: 'pending_payment' }), 'pending');
eq('con un intento abierto, en proceso', paymentStatusOf({ status: 'pending_payment' }, { openAttempt: true }), 'processing');
eq('fallido', paymentStatusOf({ status: 'failed' }), 'failed');
eq('confirmado', paymentStatusOf({ status: 'paid' }), 'confirmed');
eq('reembolso parcial', paymentStatusOf({ status: 'paid', refundedAmount: 5000 }), 'partially_refunded');
eq('reembolsado', paymentStatusOf({ status: 'refunded' }), 'refunded');
ok('un reembolso nunca se lee como «en proceso»', paymentStatusOf({ status: 'refunded' }, { openAttempt: true }) === 'refunded');
eq('rótulo', paymentStatusLabel('partially_refunded'), 'Parcialmente reembolsado');

section('5. Los formularios del proyecto no esperan al pago (salvo que se exija)');
ok('por defecto el pago NO se exige', !formsRequirePayment({}) && !formsRequirePayment({ registration: {} }));
ok('sólo `true` lo enciende', !formsRequirePayment({ registration: { requirePaymentForForms: 'true' } })
    && formsRequirePayment({ registration: { requirePaymentForForms: true } }));
ok('postulado y sin pagar → se abren', formAccessOf(postuladoPendiente, {}).available);
eq('borrador → no, y dice por qué', formAccessOf({ workflowStatus: 'draft' }, {}).code, 'not_applied');
const exige = { registration: { requirePaymentForForms: true } };
eq('si la Convocatoria lo exige, sin pago → no', formAccessOf(postuladoPendiente, exige).code, 'needs_payment');
ok('y con pago → sí', formAccessOf({ workflowStatus: 'received', status: 'paid' }, exige).available);

section('6. Fecha límite de pago');
eq('sin fecha no se inventa ninguna', paymentDeadlineOf({}), null);
eq('una fecha mal escrita no cuenta', paymentDeadlineOf({ registration: { paymentDeadline: '15/12/2026' } }), null);
eq('una fecha bien escrita sí', paymentDeadlineOf({ registration: { paymentDeadline: '2026-12-15' } }), '2026-12-15');
ok('vence al final del día en Colombia',
    !paymentDeadlinePassed({ registration: { paymentDeadline: '2026-12-15' } }, Date.parse('2026-12-16T04:00:00Z'))
    && paymentDeadlinePassed({ registration: { paymentDeadline: '2026-12-15' } }, Date.parse('2026-12-16T05:30:00Z')));

section('7. Recordatorios: sin repetirse ni excederse');
const ahora = Date.parse('2026-11-01T15:00:00Z');
const debe = { ...postuladoPendiente, email: 'club@x.co' };
ok('a quien debe y nunca recibió uno → sí', reminderVerdict(debe, [], { now: ahora }).ok);
eq('a un borrador → no', reminderVerdict({ ...debe, workflowStatus: 'draft' }, [], { now: ahora }).code, 'draft');
eq('a uno pagado → no', reminderVerdict({ ...debe, status: 'paid' }, [], { now: ahora }).code, 'paid');
eq('a uno retirado → no', reminderVerdict({ ...debe, workflowStatus: 'withdrawn' }, [], { now: ahora }).code, 'no_obligation');
eq('hace 3 días → no (intervalo mínimo 7)', reminderVerdict(debe, ['2026-10-29T15:00:00Z'], { now: ahora }).code, 'too_soon');
ok('hace 8 días → sí', reminderVerdict(debe, ['2026-10-24T15:00:00Z'], { now: ahora }).ok);
eq('con 3 ya enviados → no (tope)', reminderVerdict(debe, ['2026-09-01', '2026-09-10', '2026-09-20'], { now: ahora }).code, 'cap');
eq('con la fecha límite vencida → no', reminderVerdict(debe, [], { now: ahora, cfg: { registration: { paymentDeadline: '2026-10-15' } } }).code, 'deadline');
eq('desactivados en la Convocatoria → no', reminderVerdict(debe, [], { now: ahora, cfg: { notifications: { paymentReminders: { enabled: false } } } }).code, 'disabled');
eq('sin correo → no', reminderVerdict({ ...debe, email: '' }, [], { now: ahora }).code, 'no_email');

section('8. El SQL sale de las mismas listas');
ok('postulados excluye exactamente los no enviados', SQL_APPLIED.includes(`NOT IN ('draft','formulating')`));
ok('borradores son exactamente los no enviados', SQL_DRAFT.includes(`IN ('draft','formulating')`));
ok('la deuda excluye retirados y rechazados', SQL_OWES.includes(`NOT IN ('withdrawn','rejected')`));
ok('y sólo cuenta lo no pagado', SQL_OWES.includes(`status IN ('pending_payment','failed')`));
ok('sin comillas invertidas que rompan un db.query', ![SQL_APPLIED, SQL_DRAFT, SQL_OWES].some(x => x.includes('`')));

// ════════════════════════════════════════════════════════════════════
section('9. El CAMINO: el wizard postula sin pagar');
const wizard = leer('src/pages/FeriaProyectos.tsx');
ok('el botón final dice «Confirmar y postular proyecto»', /Confirmar y postular proyecto/.test(wizard));
ok('y ya no «Confirmar y continuar al pago»', !/Confirmar y continuar al pago/.test(wizard));
ok('hay pantalla de éxito con el título del pedido', /¡Tu proyecto ha sido postulado exitosamente!/.test(wizard));
ok('el pago es una acción opcional', /Realizar pago ahora/.test(wizard) && /Ir a mi perfil/.test(wizard));
ok('se puede guardar un borrador', /sendWizard\('draft'\)/.test(wizard) && /Guardar borrador/.test(wizard));

const ctrl = leer('server/controllers/projectFairController.js');
const crear = ctrl.slice(ctrl.indexOf('export const createSubmission'), ctrl.indexOf('export const applicationViewOf'));
ok('crear la postulación NO abre ninguna sesión de pago', !/beginCheckout|checkout\.sessions/.test(crear));
ok('la postulación nace «Postulado» y el borrador «Borrador»', /draft \? 'draft' : 'received'/.test(crear));
ok('y se sella la fecha de postulación', /"appliedAt"/.test(crear));
ok('y se manda la confirmación', /notifyApplication\(created, cfg\)/.test(crear));

section('10. Los webhooks ya no escriben en el estado del proyecto');
for (const valor of ['payment_confirmed', 'payment_failed']) {
    ok(`nadie escribe workflowStatus = '${valor}'`, !new RegExp(`"workflowStatus" = '${valor}'`).test(ctrl)
        && !new RegExp(`THEN '${valor}'`).test(ctrl));
}
ok('una sesión caducada no toca el proyecto', !/"workflowStatus" = 'pending_payment'/.test(ctrl));
const admin = leer('server/controllers/projectFairAdminController.js');
ok('la confirmación manual tampoco', !/THEN 'payment_confirmed'/.test(admin));
ok('un borrador no se cobra', /if \(!isApplied\(submission\)\) \{\s*return \{\s*blocked: 'draft'/.test(ctrl));
ok('el perfil y la pasarela usan el MISMO cálculo', /const priced = await priceSubmission\(submission\);/.test(ctrl)
    && (ctrl.match(/priceSubmission\(submission\)/g) || []).length >= 2);

section('11. El perfil del club');
const portal = leer('server/controllers/projectFairPortalController.js');
ok('el borrador se envía con un UPDATE condicional (sin doble postulación)',
    /WHERE id = \$1 AND COALESCE\("workflowStatus",'received'\) IN \('draft','formulating'\)/.test(portal));
ok('la postulación sale del token, nunca del cuerpo', /req\.portal\.submissionId/.test(portal) && !/req\.body\?\.submissionId/.test(portal.slice(portal.indexOf('loadOwnSubmission'))));
ok('el pago del perfil vuelve al perfil', /returnPath: cfg\?\.portal\?\.path/.test(portal));
const rutas = leer('server/routes/project-fair.js');
ok('las rutas nuevas exigen sesión del perfil',
    /'\/portal\/application', portal\.portalAuth/.test(rutas) && /'\/portal\/application\/submit', portal\.portalAuth/.test(rutas)
    && /'\/portal\/receipt', portal\.portalAuth/.test(rutas));
ok('los recordatorios exigen sesión de plataforma', /'\/admin\/postulaciones\/payment-reminders', authMiddleware/.test(rutas));
const perfil = leer('src/pages/MiProyecto.tsx');
ok('la sección se llama como pidió el cliente', /Inscripción a la Feria de Proyectos/.test(perfil));
ok('ofrece «Pagar inscripción» sólo con el veredicto del servidor', /pago\?\.canPay/.test(perfil) && /Pagar inscripción/.test(perfil));

console.log(`\n${fail ? '❌' : '✅'} test:fair:lifecycle — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
