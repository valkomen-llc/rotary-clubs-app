// ════════════════════════════════════════════════════════════════════
// test:fair:post-close — Edición de proyectos después del cierre (v4.1330)
//
// Sin base ni red. Fija:
//   1. El criterio genérico (`postCloseEditPolicy.js`): fases, vigencia,
//      formularios, estados, autorización, archivo, campos bloqueados,
//      aplicación del bloqueo y bitácora.
//   2. La política de la Feria (`projectFairLifecycle.js`): casos A–F del
//      pedido y el corte de las postulaciones NUEVAS por fecha.
//   3. Invariantes leídas de los archivos: las dos mitades (criterio y
//      manejadores que escriben), la creación cerrada por fecha en el
//      servidor, el estado que no se mueve después del cierre, y la
//      pantalla que no vuelve a decidir.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    postCloseVerdict, normalizePostClosePolicy, lockedFieldsFor, applyFieldLocks,
    diffAnswers, pendingFieldsOf, isPastDeadline, maskPersonal, sameValue,
} from '../server/lib/postCloseEditPolicy.js';
import {
    applicationsClosedOf, fairFormEditVerdict, fairPostClosePolicyOf, FAIR_POST_CLOSE_DEFAULTS, editRequestOf,
} from '../server/lib/projectFairLifecycle.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
};
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const DEADLINE = '2026-11-09';
const ANTES = new Date('2026-11-09T20:00:00-05:00').getTime();      // último día, por la noche
const DESPUES = new Date('2026-11-10T00:00:30-05:00').getTime();     // medianoche pasada
const MUCHO_DESPUES = new Date('2026-12-20T10:00:00-05:00').getTime();

const TEMPLATE = {
    sections: [
        { key: 'objetivos', title: 'Objetivos', fields: [
            { key: 'generalObjective', label: 'Objetivo general', type: 'textarea' },
            { key: 'projectDescription', label: 'Descripción', type: 'textarea' },
        ] },
        { key: 'presupuesto', title: 'Presupuesto', fields: [
            { key: 'budgetTable', label: 'Presupuesto', type: 'matrix' },
            { key: 'total', label: 'Total', type: 'computed' },
        ] },
        { key: 'contacto', title: 'Contacto', fields: [
            { key: 'contactEmail', label: 'Email', type: 'email' },
            { key: 'contactPhone', label: 'Teléfono', type: 'phone' },
        ] },
        { key: 'interna', title: 'Interna', adminOnly: true, fields: [{ key: 'nota', label: 'Nota', type: 'text' }] },
    ],
};

// ── 1. Criterio genérico ─────────────────────────────────────────────
section('1. El criterio genérico');
ok('sin fecha nunca cierra', !isPastDeadline(null, MUCHO_DESPUES) && !isPastDeadline('basura', MUCHO_DESPUES));
ok('el último día entero vale (hora de Colombia)', !isPastDeadline(DEADLINE, ANTES));
ok('pasada la medianoche de Colombia, cerró', isPastDeadline(DEADLINE, DESPUES));

const pol = normalizePostClosePolicy({ states: { received: 'edit', in_review: 'restricted', approved: 'authorization', closed: 'locked' } });
ok('la política normalizada viene ACTIVADA por defecto', pol.enabled === true && pol.validity === 'open' && pol.scope === 'all');
ok('un valor de estado raro pide autorización (no abre)', normalizePostClosePolicy({ states: { x: 'abrir todo' } }).states.x === 'authorization');
ok('sólo `enabled: false` explícito la apaga', normalizePostClosePolicy({ enabled: 'no' }).enabled === true && normalizePostClosePolicy({ enabled: false }).enabled === false);
ok('rutas inválidas se descartan', normalizePostClosePolicy({ sensitiveFields: { master: ['a.b', 'x', 'a.*', '; DROP'] } }).sensitiveFields.master.join() === 'a.b,a.*');

let v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: ANTES, formKey: 'master', state: 'approved' });
ok('antes del cierre manda lo de siempre (editable, sin restricciones)', v.phase === 'open' && v.canEdit && !v.restricted);
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: DESPUES, formKey: 'master', state: 'received' });
ok('después del cierre, «Postulado» editable', v.phase === 'post_close' && v.canEdit && v.code === null);
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: DESPUES, formKey: 'master', state: 'in_review' });
ok('«En revisión» editable CON restricciones', v.canEdit && v.restricted);
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: DESPUES, formKey: 'master', state: 'approved' });
ok('«Aprobado» requiere autorización y se puede pedir', !v.canEdit && v.code === 'needs_authorization' && v.requestable);
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: DESPUES, formKey: 'master', state: 'closed' });
ok('«Cerrado» no editable y sin solicitud', !v.canEdit && v.code === 'state_locked' && !v.requestable);
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: DESPUES, formKey: 'master', state: 'algo_nuevo' });
ok('un estado que la política no menciona pide autorización', !v.canEdit && v.code === 'needs_authorization');
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: DESPUES, formKey: 'master', state: 'closed', authorized: true });
ok('la autorización individual manda sobre el estado', v.canEdit && v.code === 'authorized');
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: ANTES, formKey: 'master', state: 'received', archived: true });
ok('un proyecto archivado no se edita, ni antes del cierre', !v.canEdit && v.code === 'archived');
v = postCloseVerdict({ deadline: DEADLINE, policy: pol, now: DESPUES, formKey: 'master', state: 'received', archived: true, authorized: true });
ok('… salvo autorización expresa', v.canEdit);
v = postCloseVerdict({ deadline: DEADLINE, policy: { ...pol, forms: ['fdd'] }, now: DESPUES, formKey: 'master', state: 'received' });
ok('un formulario fuera de la lista no se edita (y se puede pedir)', !v.canEdit && v.code === 'form_not_included' && v.requestable);
v = postCloseVerdict({ deadline: DEADLINE, policy: normalizePostClosePolicy({ validity: 'until', until: '2026-11-30', states: { received: 'edit' } }), now: DESPUES, formKey: 'm', state: 'received' });
ok('vigencia con fecha: editable y dice hasta cuándo', v.canEdit && v.until === '2026-11-30');
v = postCloseVerdict({ deadline: DEADLINE, policy: normalizePostClosePolicy({ validity: 'until', until: '2026-11-30', states: { received: 'edit' } }), now: MUCHO_DESPUES, formKey: 'm', state: 'received' });
ok('vencida la fecha de edición, se cierra', !v.canEdit && v.code === 'window_closed');
v = postCloseVerdict({ deadline: DEADLINE, policy: normalizePostClosePolicy({ validity: 'individual' }), now: DESPUES, formKey: 'm', state: 'received' });
ok('vigencia «solo autorización individual»', !v.canEdit && v.code === 'needs_authorization' && v.requestable);

section('1b. Campos bloqueados');
const polS = normalizePostClosePolicy({ ...pol, sensitiveFields: { master: ['presupuesto.*', 'contacto.contactEmail'] } });
const saved = { objetivos: { generalObjective: 'Agua', projectDescription: '' }, presupuesto: { budgetTable: { a: { b: '10' } } }, contacto: { contactEmail: 'x@y.org' } };
let ver = postCloseVerdict({ deadline: DEADLINE, policy: polS, now: DESPUES, formKey: 'master', state: 'in_review' });
let locked = lockedFieldsFor({ template: TEMPLATE, saved, verdict: ver, policy: polS, formKey: 'master' });
ok('«con restricciones» bloquea los sensibles (sección.* y campo)', locked.includes('presupuesto.budgetTable') && locked.includes('contacto.contactEmail'));
ok('… y deja libres los informativos', !locked.includes('objetivos.generalObjective') && !locked.includes('contacto.contactPhone'));
ok('ni los derivados ni lo reservado al administrador cuentan', !locked.includes('presupuesto.total') && !locked.includes('interna.nota'));
ver = postCloseVerdict({ deadline: DEADLINE, policy: polS, now: DESPUES, formKey: 'master', state: 'received' });
ok('«Postulado» con sensibles «sólo en restricciones»: nada bloqueado', lockedFieldsFor({ template: TEMPLATE, saved, verdict: ver, policy: polS, formKey: 'master' }).length === 0);
const polAlways = normalizePostClosePolicy({ ...polS, lockSensitive: 'always' });
ok('«siempre» bloquea los sensibles también en Postulado',
    lockedFieldsFor({ template: TEMPLATE, saved, verdict: postCloseVerdict({ deadline: DEADLINE, policy: polAlways, now: DESPUES, formKey: 'master', state: 'received' }), policy: polAlways, formKey: 'master' }).includes('presupuesto.budgetTable'));
const polPend = normalizePostClosePolicy({ ...pol, scope: 'pending' });
ver = postCloseVerdict({ deadline: DEADLINE, policy: polPend, now: DESPUES, formKey: 'master', state: 'received' });
const baseline = pendingFieldsOf(TEMPLATE, saved);
ok('la foto de pendientes lista los vacíos', baseline.includes('objetivos.projectDescription') && !baseline.includes('objetivos.generalObjective'));
const savedLuego = { ...saved, objetivos: { ...saved.objetivos, projectDescription: 'Ya escribí algo' } };
locked = lockedFieldsFor({ template: TEMPLATE, saved: savedLuego, verdict: ver, policy: polPend, formKey: 'master', pendingPaths: baseline });
ok('«solo pendientes» usa la FOTO: lo que el club empezó a llenar sigue editable', !locked.includes('objetivos.projectDescription'));
ok('… y lo que ya estaba lleno al cerrar queda bloqueado', locked.includes('objetivos.generalObjective'));
const polSel = normalizePostClosePolicy({ ...pol, scope: 'selected', selectedFields: { master: ['objetivos.*'] } });
ver = postCloseVerdict({ deadline: DEADLINE, policy: polSel, now: DESPUES, formKey: 'master', state: 'received' });
locked = lockedFieldsFor({ template: TEMPLATE, saved, verdict: ver, policy: polSel, formKey: 'master' });
ok('«seleccionados» sólo deja los elegidos', !locked.includes('objetivos.generalObjective') && locked.includes('contacto.contactPhone'));
ok('antes del cierre o con autorización no hay bloqueos',
    lockedFieldsFor({ template: TEMPLATE, saved, verdict: postCloseVerdict({ deadline: DEADLINE, policy: polSel, now: ANTES, formKey: 'master', state: 'received' }), policy: polSel, formKey: 'master' }).length === 0
    && lockedFieldsFor({ template: TEMPLATE, saved, verdict: postCloseVerdict({ deadline: DEADLINE, policy: polSel, now: DESPUES, formKey: 'master', state: 'received', authorized: true }), policy: polSel, formKey: 'master' }).length === 0);

const incoming = { objetivos: { generalObjective: 'Cambiado', projectDescription: 'Nuevo' }, presupuesto: { budgetTable: { a: { b: '999' } } }, contacto: { contactEmail: 'otro@y.org', contactPhone: '300' } };
const merged = applyFieldLocks(incoming, saved, ['presupuesto.budgetTable', 'contacto.contactEmail', 'objetivos.inexistente']);
ok('el bloqueo conserva EXACTAMENTE lo guardado', merged.presupuesto.budgetTable.a.b === '10' && merged.contacto.contactEmail === 'x@y.org');
ok('… y deja pasar lo editable', merged.objetivos.generalObjective === 'Cambiado' && merged.contacto.contactPhone === '300');
ok('… sin mutar lo que llegó', incoming.presupuesto.budgetTable.a.b === '999');
ok('un campo bloqueado que no existía no se crea', !('inexistente' in merged.objetivos));

section('1c. Bitácora');
const diff = diffAnswers({ template: TEMPLATE, before: saved, after: merged, policy: polS, formKey: 'master' });
ok('sólo lo que cambió', diff.map(d => d.path).sort().join() === 'contacto.contactPhone,objetivos.generalObjective,objetivos.projectDescription');
ok('vacío y nada son lo mismo', diffAnswers({ template: TEMPLATE, before: { objetivos: { projectDescription: '' } }, after: {}, formKey: 'master' }).length === 0);
const d2 = diffAnswers({ template: TEMPLATE, before: saved, after: { ...saved, contacto: { contactEmail: 'nuevo@club.org', contactPhone: '3001234567' } }, policy: polS, formKey: 'master' });
ok('correo y teléfono se enmascaran', d2.find(d => d.path === 'contacto.contactEmail')?.after === 'n***@club.org' && d2.find(d => d.path === 'contacto.contactPhone')?.after === '***4567');
ok('el cambio sensible se marca', d2.find(d => d.path === 'contacto.contactEmail')?.sensitive === true);
ok('maskPersonal no deja el correo entero', maskPersonal('ana@x.org', 'email') === 'a***@x.org');
ok('sameValue ignora el orden de las claves', sameValue({ a: 1, b: 2 }, { b: 2, a: 1 }) && !sameValue('a', 'b'));

// ── 2. La Feria ──────────────────────────────────────────────────────
section('2. La política de la Feria y los casos del pedido');
const cfg = { deadline: DEADLINE, postCloseEditing: FAIR_POST_CLOSE_DEFAULTS };
const fp = fairPostClosePolicyOf(cfg);
ok('de fábrica: activada, sin fecha adicional, todos los formularios, todos los campos', fp.enabled && fp.validity === 'open' && fp.forms.length === 0 && fp.scope === 'all');
ok('los estados de fábrica son los del pedido', fp.states.received === 'edit' && fp.states.in_review === 'restricted' && fp.states.approved === 'authorization' && fp.states.rejected === 'authorization' && fp.states.closed === 'locked');
ok('sin `postCloseEditing` guardado, rige la de fábrica', fairPostClosePolicyOf({}).enabled && fairPostClosePolicyOf({}).states.in_review === 'restricted');

const fila = (wf, extra = {}) => ({ id: 's1', workflowStatus: wf, status: 'pending_payment', ...extra });
const opts = { now: DESPUES };
v = fairFormEditVerdict(fila('received'), cfg, 'master', { completionPct: 53 }, opts);
ok('Caso A: Formulación al 53 % después del cierre → editable', v.canEdit && v.phase === 'post_close');
v = fairFormEditVerdict(fila('received'), cfg, 'fdd_2026_2027', { completionPct: 21 }, opts);
ok('Caso B: Solicitud FDD al 21 % → editable', v.canEdit);
v = fairFormEditVerdict(fila('in_review'), cfg, 'master', { status: 'submitted' }, opts);
ok('Caso C: proyecto postulado/en revisión corrige su descripción (editable)', v.canEdit && v.restricted);
const vd = fairFormEditVerdict(fila('in_review'), cfg, 'master', {}, opts);
const lk = lockedFieldsFor({ template: { sections: [{ key: 'presupuesto', fields: [{ key: 'budgetTable', type: 'matrix' }] }, { key: 'objetivos', fields: [{ key: 'projectDescription', type: 'textarea' }] }] }, verdict: vd, policy: fp, formKey: 'master' });
ok('Caso C/D: en revisión el presupuesto queda bloqueado y la descripción no', lk.includes('presupuesto.budgetTable') && !lk.includes('objetivos.projectDescription'));
v = fairFormEditVerdict(fila('approved'), cfg, 'master', {}, opts);
ok('Caso D: aprobado → requiere autorización', !v.canEdit && v.code === 'needs_authorization' && /autorización/.test(v.reason));
v = fairFormEditVerdict(fila('approved'), cfg, 'master', { reopenedAt: '2026-11-12' }, opts);
ok('Caso D: con «Reabrir edición» se puede', v.canEdit && v.code === 'authorized');
v = fairFormEditVerdict(fila('received'), { ...cfg, postCloseEditing: { enabled: false } }, 'master', {}, opts);
ok('Caso F: edición desactivada → consultable, no editable, con salida', !v.canEdit && v.code === 'disabled' && v.requestable);
v = fairFormEditVerdict(fila('received', { archivedAt: '2026-11-01' }), cfg, 'master', {}, opts);
ok('un proyecto archivado (sustituido) no se edita', !v.canEdit && v.code === 'archived');
ok('editRequestOf lee la solicitud del formulario', !!editRequestOf({ metadata: { editRequests: { master: { at: 'x' } } } }, 'master') && !editRequestOf({}, 'master'));

section('2b. Crear es otra regla');
ok('antes de la fecha la convocatoria recibe postulaciones', !applicationsClosedOf(cfg, ANTES).closed);
const cerrada = applicationsClosedOf(cfg, DESPUES);
ok('después de la fecha NO recibe postulaciones nuevas', cerrada.closed && cerrada.code === 'deadline' && /finalizó el 9 de noviembre de 2026/.test(cerrada.reason));
ok('apagada, tampoco (aunque no haya fecha)', applicationsClosedOf({ enabled: false }).closed);
ok('sin fecha y encendida, abierta', !applicationsClosedOf({ enabled: true }, MUCHO_DESPUES).closed);

// ── 3. Invariantes leídas de los archivos ────────────────────────────
section('3. Invariantes');
const forms = read('server/controllers/projectFormsController.js');
const portal = read('server/controllers/projectFairPortalController.js');
const fair = read('server/controllers/projectFairController.js');
const admin = read('server/controllers/projectFairAdminController.js');
const routes = read('server/routes/project-fair.js');
const lifecycle = read('server/lib/projectFairLifecycle.js');
const lib = read('server/lib/postCloseEditPolicy.js');
const cuerpo = (src, nombre) => {
    const i = src.indexOf(`export const ${nombre} = `);
    if (i < 0) return '';
    const j = src.indexOf('\n};', i);
    return src.slice(i, j < 0 ? undefined : j);
};
const editab = cuerpo(forms, 'editability');
ok('editability ya no corta por `cfg.deadline` directamente', !/cfg\?\.deadline/.test(editab) && /fairFormEditVerdict\(/.test(editab));
for (const h of ['saveForm', 'submitForm']) {
    const c = cuerpo(forms, h);
    ok(`${h} consulta el veredicto con el formulario`, /editability\(submission, record, cfg, account, form\.key\)/.test(c));
    ok(`${h} aplica el bloqueo de campos en el servidor`, /applyFieldLocks\(/.test(c) && /fieldLocksFor\(/.test(c));
    ok(`${h} deja bitácora`, /trackClubChanges\(/.test(c));
}
const submit = cuerpo(forms, 'submitForm');
ok('después del cierre, enviar NO mueve el estado del proyecto', /MASTER_FORM_KEY && !postClose/.test(submit));
ok('la bitácora no toca el estado, el pago ni la fecha de postulación',
    !/"workflowStatus"|status = 'paid'|"appliedAt"|"createdAt" =/.test(forms.slice(forms.indexOf('export const markPostCloseReviewed'), forms.indexOf("}, 'changeStatus');", forms.indexOf('export const markPostCloseReviewed')))) && !/"workflowStatus"\s*=|"appliedAt"\s*=/.test(forms.slice(forms.indexOf('const trackClubChanges'), forms.indexOf('// ── Contexto común'))));
ok('reabrir ya no devuelve el formulario a borrador',
    !/status = 'draft', "reopenedAt"/.test(forms) && !/SET status = 'draft', "reopenedAt"/.test(admin));
ok('reabrir resuelve la solicitud del club', /clearEditRequest\(req\.params\.id, form\.key\)/.test(forms) && /#- ARRAY\['editRequests','master'\]/.test(admin));
ok('createSubmission corta por fecha en el SERVIDOR', /applicationsClosedOf\(cfg\)/.test(cuerpo(fair, 'createSubmission')));
ok('enviar un borrador también', /applicationsClosedOf\(cfg\)/.test(cuerpo(portal, 'submitApplication')));
ok('la configuración pública publica si recibe postulaciones', /applications: \(\(\) => \{/.test(fair));
ok('la política vive en DEFAULT_CONFIG (por edición)', /postCloseEditing: FAIR_POST_CLOSE_DEFAULTS/.test(fair));
ok('la solicitud del club sale del TOKEN', /portalContext\(req\)/.test(cuerpo(forms, 'requestEdit')) && !/req\.body\?\.submissionId/.test(cuerpo(forms, 'requestEdit')));
ok('las rutas nuevas existen', /\/portal\/forms\/:formKey\/edit-request', portal\.portalAuth/.test(routes) && /\/admin\/postulaciones\/:id\/post-close\/reviewed', authMiddleware, fairEdit/.test(routes));
ok('marcar revisado exige el permiso de cambiar estado', /markPostCloseReviewed = withAccess\([\s\S]*?\}, 'changeStatus'\)/.test(forms));
ok('el filtro del listado es catálogo cerrado', /POST_CLOSE_FILTERS\[clean\(query\.actualizaciones, 30\)\]/.test(admin));
ok('el criterio genérico no conoce la Feria', !/ProjectFair|projectFair|feria/i.test(lib.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
ok('el ciclo de vida sigue puro (sin base ni red)', !/from '\.\.\/lib\/db|from '\.\/db|fetch\(/.test(lifecycle));

const mi = read('src/pages/MiProyecto.tsx');
const view = read('src/components/project-forms/ProjectFormView.tsx');
ok('«Mi Proyecto» muestra el aviso de edición posterior al cierre', /La convocatoria para nuevas postulaciones ha finalizado\. Sin embargo, puedes continuar completando y actualizando la información de tu proyecto registrado\./.test(mi));
ok('la tarjeta usa la acción que decide el servidor', /form\.action\?\.label/.test(mi));
ok('la tarjeta ofrece pedir autorización sólo si el servidor lo permite', /form\.editWindow\?\.requestable/.test(mi));
ok('el formulario deshabilita los campos bloqueados', /lockedFields\?\.includes\(/.test(view) && /disabled=\{!data\.canEdit \|\| bloqueado\}/.test(view));
const feria = read('src/pages/FeriaProyectos.tsx');
ok('el wizard público dice «convocatoria cerrada» con la fecha', /config\.applications\?\.open === false/.test(feria));

console.log(`\n${fail ? '❌' : '✅'} test:fair:post-close — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
