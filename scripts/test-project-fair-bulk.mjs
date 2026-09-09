#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Acciones en bloque sobre las postulaciones.  npm run test:fair:bulk
// v4.1024.0
//
// Cuatro bloques, y los cuatro hacen falta:
//
//  1. EL CRITERIO — qué se elimina, qué se archiva y qué se dice. Es puro.
//  2. LA PARIDAD de los dos espejos, comparada por SALIDAS: con dos criterios,
//     la pantalla prometería eliminar lo que el servidor archiva.
//  3. EL CAMINO, con la base sustituida en memoria. El criterio puede estar
//     entero y el defecto vivir en el camino (la lección de v4.744): que las
//     tablas hijas se vacíen de verdad, que el historial sobreviva a la fila,
//     que sin confirmación no se toque nada y que una postulación de otra
//     edición no se alcance.
//  4. LAS INVARIANTES que sólo se ven LEYENDO los archivos — que el espejo no
//     traiga lo que decide el servidor, que `ProjectFairEvent` siga fuera de
//     la lista de tablas que se vacían, y que las rutas literales vayan antes
//     de las paramétricas.
//
// No necesita Postgres, credenciales ni red.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-fair-bulk-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como './db.js' y con el sufijo largo no
// casarían — la prueba no fallaría ruidosamente, se conectaría a un Postgres
// que no está (la trampa que costó una vuelta en v4.847).
register(
    `data:text/javascript,export async function resolve(s,c,n){` +
    `if(/(^|\\/)db\\.js$/.test(s))return{url:${JSON.stringify(DB)},shortCircuit:true};` +
    `if(s==='stripe')return{url:'data:text/javascript,export default class{constructor(){}}',shortCircuit:true};` +
    `return n(s,c)}`,
    HERE
);

const db = await import(DB);
const C = await import('../server/lib/projectFairBulk.js');
const admin = await import('../server/controllers/projectFairAdminController.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** El archivo SIN comentarios: una comprobación que busca una cadena no puede
 *  encontrarla en el comentario que explica por qué ya no está (v4.991). */
const codigo = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ════════════════════════════════════════════════════════════════════
section('1. El criterio: qué tocó dinero');

ok('una pagada tiene rastro financiero', C.hasFinancialTrace({ status: 'paid' }));
ok('una reembolsada TAMBIÉN — cobró y se devolvió', C.hasFinancialTrace({ status: 'refunded' }));
ok('una con fecha de pago, aunque el estado se haya quedado atrás', C.hasFinancialTrace({ status: 'pending_payment', paidAt: '2026-08-01' }));
ok('una con importe recibido', C.hasFinancialTrace({ status: 'pending_payment', amountReceived: 12000 }));
ok('una con cargo de Stripe', C.hasFinancialTrace({ status: 'failed', stripeChargeId: 'ch_1' }));
ok('una pendiente y sin nada cobrado NO tiene rastro', !C.hasFinancialTrace({ status: 'pending_payment' }));
ok('un importe en cero no es un cobro', !C.hasFinancialTrace({ status: 'pending_payment', amountReceived: 0 }));
ok('sin fila, no hay rastro', !C.hasFinancialTrace(null));
// La fila mapeada llega con `paymentStatus`; la cruda con `status`. Con un
// solo nombre, el espejo daría por no cobrada TODA fila.
ok('lee la forma mapeada (`paymentStatus`)', C.hasFinancialTrace({ paymentStatus: 'paid' }));
eq('el estado sale de cualquiera de los dos nombres', C.paymentStatusOf({ paymentStatus: 'paid' }), 'paid');

section('2. El criterio: qué le pasa a cada fila');

const pendiente = { id: 'a', publicRef: 'FP-A', projectName: 'Uno', status: 'pending_payment' };
const pagada = { id: 'b', publicRef: 'FP-B', projectName: 'Dos', status: 'paid' };
const archivada = { id: 'c', publicRef: 'FP-C', projectName: 'Tres', status: 'pending_payment', archivedAt: '2026-09-01' };
const pagadaArchivada = { id: 'd', publicRef: 'FP-D', projectName: 'Cuatro', status: 'paid', archivedAt: '2026-09-01' };

eq('eliminar una sin cobro la elimina', C.dispositionFor(pendiente, 'delete'), { outcome: 'eliminada', reason: null });
eq('⚠️ eliminar una PAGADA la ARCHIVA, con su motivo', C.dispositionFor(pagada, 'delete'), { outcome: 'archivada', reason: 'tiene_cobro' });
eq('una pagada YA archivada queda como está', C.dispositionFor(pagadaArchivada, 'delete'), { outcome: 'sin_cambio', reason: 'ya_archivada' });
eq('eliminar una archivada sin cobro sí la elimina', C.dispositionFor(archivada, 'delete'), { outcome: 'eliminada', reason: null });
eq('archivar una sin archivar', C.dispositionFor(pendiente, 'archive'), { outcome: 'archivada', reason: null });
eq('archivar una ya archivada no cambia nada', C.dispositionFor(archivada, 'archive'), { outcome: 'sin_cambio', reason: 'ya_archivada' });
eq('restaurar una archivada', C.dispositionFor(archivada, 'restore'), { outcome: 'restaurada', reason: null });
eq('restaurar una que no lo estaba', C.dispositionFor(pendiente, 'restore'), { outcome: 'sin_cambio', reason: 'no_archivada' });
eq('una fila que no está', C.dispositionFor(null, 'delete'), { outcome: 'no_existe', reason: null });

section('3. El plan y lo que se le dice a quien confirma');

const plan = C.planBulk([pendiente, pagada, archivada, null], 'delete');
eq('cuenta lo que va a pasar', plan.totals.eliminada, 2);
eq('y lo que se archiva por haber cobrado', plan.totals.archivada, 1);
eq('y lo que no encuentra', plan.totals.no_existe, 1);
ok('la frase dice el hecho, no una advertencia genérica',
    C.describeBulkPlan(plan).includes('2 postulaciones definitivamente') && C.describeBulkPlan(plan).includes('archivará 1'),
    C.describeBulkPlan(plan));
ok('el aviso dice QUÉ se pierde al eliminar',
    C.bulkWarnings(plan).some(a => /NO se puede recuperar/.test(a) && /cuenta/.test(a)));
ok('y que lo cobrado se archiva en vez de borrarse',
    C.bulkWarnings(plan).some(a => /no se eliminan/.test(a)));
ok('la etiqueta de una fila la nombra por su referencia y su proyecto',
    C.labelOf(pendiente) === 'FP-A · Uno', C.labelOf(pendiente));

const soloPagadaArchivada = C.planBulk([pagadaArchivada], 'delete');
eq('un plan que no cambia nada se rechaza con su motivo',
    C.validateBulkPlan(soloPagadaArchivada), { ok: false, error: 'La selección no cambia nada.' });
eq('una selección vacía también', C.validateBulkPlan(C.planBulk([], 'delete')).ok, false);
eq('por encima del tope, se dice el número',
    C.validateBulkPlan(C.planBulk(Array.from({ length: C.BULK_MAX + 1 }, (_, i) => ({ ...pendiente, id: `x${i}` })), 'delete')).ok, false);
eq('un plan que sí cambia algo pasa', C.validateBulkPlan(plan).ok, true);

section('4. La vista de archivadas es un catálogo cerrado');
eq('por defecto no se ven las archivadas', C.normalizeArchiveView(undefined), 'activas');
eq('un valor inventado cae en el comportamiento de siempre', C.normalizeArchiveView('todito'), 'activas');
eq('sólo archivadas', C.normalizeArchiveView('archivadas'), 'archivadas');
eq('todas', C.normalizeArchiveView('todas'), 'todas');

// ════════════════════════════════════════════════════════════════════
section('5. Paridad de los dos espejos (salidas, no parecido)');

let esbuild = null;
try { esbuild = (await import('esbuild')).default ?? await import('esbuild'); } catch { /* opcional */ }
if (!esbuild) {
    console.log('  … se salta: falta esbuild (npm i --no-save esbuild)');
} else {
    const out = esbuild.buildSync({
        entryPoints: ['src/lib/projectFairBulk.ts'],
        bundle: true, format: 'esm', write: false, platform: 'neutral',
    });
    const M = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

    const matriz = [
        { id: '1', publicRef: 'FP-1', projectName: 'P', status: 'pending_payment' },
        { id: '2', publicRef: 'FP-2', projectName: 'P', status: 'paid' },
        { id: '3', publicRef: 'FP-3', projectName: 'P', status: 'refunded' },
        { id: '4', publicRef: 'FP-4', projectName: 'P', paymentStatus: 'paid' },
        { id: '5', publicRef: 'FP-5', projectName: 'P', status: 'failed', stripeChargeId: 'ch' },
        { id: '6', publicRef: 'FP-6', projectName: 'P', status: 'pending_payment', archivedAt: 'x' },
        { id: '7', publicRef: 'FP-7', projectName: 'P', status: 'paid', archivedAt: 'x' },
        { id: '8', publicRef: 'FP-8', projectName: 'P', status: 'pending_payment', amountReceived: 5 },
        { id: '9', publicRef: 'FP-9', projectName: 'P', status: 'pending_payment', refundedAmount: 5 },
    ];
    let distintos = 0;
    for (const row of matriz) {
        for (const accion of ['delete', 'archive', 'restore']) {
            const a = JSON.stringify(C.dispositionFor(row, accion));
            const b = JSON.stringify(M.dispositionFor(row, accion));
            if (a !== b) { distintos++; console.log(`    ✗ ${row.id}/${accion}: servidor ${a} · navegador ${b}`); }
        }
    }
    ok(`los dos criterios deciden igual en las ${matriz.length * 3} combinaciones`, distintos === 0);

    for (const accion of ['delete', 'archive', 'restore']) {
        const ps = C.planBulk(matriz, accion);
        const pm = M.planBulk(matriz, accion);
        eq(`el plan de «${accion}» coincide`, JSON.stringify(pm.totals), JSON.stringify(ps.totals));
        eq(`la frase de «${accion}» coincide`, M.describeBulkPlan(pm), C.describeBulkPlan(ps));
        eq(`los avisos de «${accion}» coinciden`, M.bulkWarnings(pm), C.bulkWarnings(ps));
    }
    eq('el tope es el mismo', M.BULK_MAX, C.BULK_MAX);
    eq('los rótulos de desenlace son los mismos', M.OUTCOME_LABELS, C.OUTCOME_LABELS);
    eq('los rótulos de motivo son los mismos', M.REASON_LABELS, C.REASON_LABELS);

    // ⚠️ El espejo NO decide: quién puede eliminar y si el plan se ejecuta son
    // del servidor. Con esas dos acá, la pantalla ofrecería una acción que la
    // API rechaza.
    ok('el espejo NO trae `BULK_CAPABILITY`', M.BULK_CAPABILITY === undefined);
    ok('el espejo NO trae `validateBulkPlan`', M.validateBulkPlan === undefined);
}

// ════════════════════════════════════════════════════════════════════
section('6. El CAMINO: eliminar, archivar y el historial');

const REQ = (body = {}, query = {}) => ({
    user: { role: 'administrator', email: 'admin@feria.test' },
    query: { evento: 'ev1', ...query },
    body,
    headers: {},
});
const RES = () => {
    const r = { code: 200, payload: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (p) => { r.payload = p; return r; };
    return r;
};
const correr = async (handler, body, query) => {
    const res = RES();
    await handler(REQ(body, query), res);
    return res;
};

const SEMILLA = () => [
    { id: 's1', publicRef: 'FP-1', projectName: 'Sin pagar', clubName: 'A', email: 'a@x.co', eventId: 'ev1', status: 'pending_payment', workflowStatus: 'received' },
    { id: 's2', publicRef: 'FP-2', projectName: 'Pagada', clubName: 'B', email: 'b@x.co', eventId: 'ev1', status: 'paid', workflowStatus: 'payment_confirmed' },
    { id: 's3', publicRef: 'FP-3', projectName: 'De otra feria', clubName: 'C', email: 'c@x.co', eventId: 'ev2', status: 'pending_payment' },
    { id: 's4', publicRef: 'FP-4', projectName: 'Sin edición', clubName: 'D', email: 'd@x.co', eventId: null, status: 'pending_payment' },
];
const HIJAS = () => ({
    ProjectFairFile: [{ submissionId: 's1' }, { submissionId: 's2' }],
    ProjectFairAccount: [{ submissionId: 's1' }, { submissionId: 's2' }],
    ProjectFairMasterForm: [{ submissionId: 's1' }],
    ProjectFairProjectForm: [{ submissionId: 's1' }],
    ProjectFairFormRevision: [{ submissionId: 's1' }],
    ProjectFairStripeEvent: [{ submissionId: 's2' }],
    ProjectFairPaymentAttempt: [{ submissionId: 's1' }],
    ProjectFairSubmissionTag: [{ submissionId: 's1' }],
});

// ── Sin confirmación no se toca nada ────────────────────────────────
db.reset(SEMILLA(), { children: HIJAS() });
let res = await correr(admin.bulkDelete, { ids: ['s1', 's2'] });
eq('sin `confirm: true` responde 428', res.code, 428);
ok('y devuelve el plan para poder decirlo', !!res.payload?.plan && !!res.payload?.summary);
eq('no borró nada', db.state().submissions.length, 4);

// ── Sin edición abierta tampoco ─────────────────────────────────────
db.reset(SEMILLA(), { children: HIJAS() });
res = await correr(admin.bulkDelete, { ids: ['s1'], confirm: true }, { evento: '' });
eq('sin edición abierta responde 400', res.code, 400);
ok('y dice por qué', /edición/i.test(res.payload?.error || ''));
eq('no borró nada', db.state().submissions.length, 4);

// ── La eliminación de verdad ────────────────────────────────────────
db.reset(SEMILLA(), { children: HIJAS() });
res = await correr(admin.bulkDelete, { ids: ['s1', 's2', 's3', 's4'], confirm: true, reason: 'pruebas' });
eq('responde 200', res.code, 200);
const tras = db.state();
eq('la que nunca cobró se eliminó', tras.submissions.some(r => r.id === 's1'), false);
eq('la que SÍ cobró sigue estando', tras.submissions.some(r => r.id === 's2'), true);
eq('…y quedó archivada', !!tras.submissions.find(r => r.id === 's2')?.archivedAt, true);
eq('con el motivo escrito', tras.submissions.find(r => r.id === 's2')?.archivedReason, 'pruebas');
eq('la de OTRA edición no se tocó', tras.submissions.some(r => r.id === 's3'), true);
eq('…y se dijo por qué',
    res.payload.outcomes.find(o => o.id === 's3')?.reason, 'otra_edicion');
eq('la que no tiene edición sí se opera: está en el listado', tras.submissions.some(r => r.id === 's4'), false);

// ⚠️ Las tablas hijas: si una se queda sin vaciar, deja filas huérfanas que
// nadie puede ver ni volver a borrar desde el panel, y el fallo es MUDO.
const huerfanas = Object.entries(tras.children)
    .filter(([, filas]) => filas.some(f => f.submissionId === 's1'))
    .map(([t]) => t);
eq('no queda ninguna fila hija de la eliminada', huerfanas, []);
eq('las de la archivada se conservan enteras',
    tras.children.ProjectFairFile.some(f => f.submissionId === 's2'), true);
eq('…incluida la cuenta con la que ese club entra a su panel',
    tras.children.ProjectFairAccount.some(f => f.submissionId === 's2'), true);

// ⚠️ El historial sobrevive a la fila: es lo único que contesta «¿por qué esta
// postulación ya no está?».
const evs = tras.events.filter(e => e.submissionId === 's1');
eq('la eliminación queda registrada', evs.some(e => e.type === 'submission_deleted'), true);
ok('con quién y con el motivo',
    evs.some(e => e.actorName === 'admin@feria.test' && e.detail === 'pruebas'));
eq('el archivado por cobro también', tras.events.some(e => e.submissionId === 's2' && e.type === 'archived'), true);

// ── Archivar y restaurar ────────────────────────────────────────────
db.reset(SEMILLA(), { children: HIJAS() });
res = await correr(admin.bulkArchive, { ids: ['s1', 's2'], confirm: true });
eq('archivar no borra ninguna fila', db.state().submissions.length, 4);
eq('las dos quedan archivadas', db.state().submissions.filter(r => r.archivedAt).length, 2);
res = await correr(admin.bulkArchive, { ids: ['s1'], confirm: true });
eq('volver a archivar la misma no cambia nada', res.code, 400);
res = await correr(admin.bulkRestore, { ids: ['s1', 's2'], confirm: true });
eq('restaurar las devuelve', db.state().submissions.filter(r => r.archivedAt).length, 0);

// ── La carrera: dos peticiones que leyeron lo mismo ─────────────────
//
// ⚠️ ESTO ES LO QUE PROTEGE EL `AND "archivedAt" IS NULL` DEL UPDATE, y no lo
// ve ninguna de las comprobaciones de arriba: el plan las frena antes de
// llegar al UPDATE porque ya ve la fila archivada. La segunda petición de un
// doble clic —o de otro administrador— leyó la fila ANTES, así que su plan
// dice «archivar» y lo que la detiene es la cláusula del UPDATE. Sin ella,
// pisaría la fecha y el nombre de quien archivó primero.
db.reset(SEMILLA(), { children: HIJAS() });
// La foto se toma ANTES: es lo que las DOS peticiones leyeron.
db.staleRead(true);
await correr(admin.bulkArchive, { ids: ['s1'], confirm: true, reason: 'la primera' });
const primera = db.state().submissions.find(r => r.id === 's1');
res = await correr(admin.bulkArchive, { ids: ['s1'], confirm: true, reason: 'la segunda' });
db.staleRead(false);
eq('la segunda vuelta de una carrera no archiva dos veces',
    res.payload.outcomes.find(o => o.id === 's1')?.outcome, 'sin_cambio');
eq('…y NO pisa el motivo de quien archivó primero',
    db.state().submissions.find(r => r.id === 's1').archivedReason, 'la primera');
eq('…ni la fecha', db.state().submissions.find(r => r.id === 's1').archivedAt, primera.archivedAt);
eq('…ni deja un segundo registro en el historial',
    db.state().events.filter(e => e.submissionId === 's1' && e.type === 'archived').length, 1);

// ── Estado en bloque ────────────────────────────────────────────────
db.reset(SEMILLA(), { children: HIJAS() });
res = await correr(admin.bulkStatus, { ids: ['s1'], confirm: true, workflowStatus: 'in_review' });
eq('sin motivo NO se cambia el estado', res.code, 400);
eq('el estado sigue igual', db.state().submissions.find(r => r.id === 's1').workflowStatus, 'received');
res = await correr(admin.bulkStatus, { ids: ['s1'], confirm: true, workflowStatus: 'nope', reason: 'x' });
eq('un estado que no existe se rechaza', res.code, 400);
res = await correr(admin.bulkStatus, { ids: ['s1', 's2'], confirm: true, workflowStatus: 'in_review', reason: 'revisión anual' });
eq('con motivo sí', db.state().submissions.find(r => r.id === 's1').workflowStatus, 'in_review');
ok('y queda en el historial de cada una',
    db.state().events.filter(e => e.type === 'status_change' && e.detail === 'revisión anual').length === 2);

// ── Etiquetar ───────────────────────────────────────────────────────
db.reset(SEMILLA(), { children: HIJAS(), tags: [{ id: 't1', label: 'Prueba' }] });
res = await correr(admin.bulkTag, { ids: ['s1', 's2'], confirm: true, tagId: 't1' });
eq('pone la etiqueta a las dos', db.state().submissionTags.filter(t => t.tagId === 't1').length, 2);
res = await correr(admin.bulkTag, { ids: ['s1'], confirm: true, tagId: 't1' });
// A diferencia de archivar, el plan previo NO puede saber si la fila ya tenía
// la etiqueta —eso vive en la tabla puente, no en la postulación—, así que la
// petición se atiende y el desenlace lo dice fila por fila. Responder 400
// habría exigido que el criterio adivinara algo que no sabe.
eq('ponerla otra vez se atiende…', res.code, 200);
eq('…y se dice que esa fila no cambió, con su motivo',
    res.payload.outcomes.find(o => o.id === 's1'), { id: 's1', label: 'FP-1 · Sin pagar', outcome: 'sin_cambio', reason: 'ya_tenia_etiqueta' });
eq('sin duplicar la etiqueta', db.state().submissionTags.filter(t => t.submissionId === 's1' && t.tagId === 't1').length, 1);
res = await correr(admin.bulkTag, { ids: ['s1'], confirm: true, tagId: 't1', remove: true });
eq('quitarla la quita', db.state().submissionTags.filter(t => t.tagId === 't1').length, 1);
res = await correr(admin.bulkTag, { ids: ['s1'], confirm: true, tagId: 'noexiste' });
eq('una etiqueta que no existe se rechaza', res.code, 404);

// ── Permisos ────────────────────────────────────────────────────────
db.reset(SEMILLA(), { children: HIJAS() });
const resSinPermiso = RES();
await admin.bulkDelete({ ...REQ({ ids: ['s1'], confirm: true }), user: { role: 'club_admin', email: 'x@y.co' } }, resSinPermiso);
eq('un rol sin la capacidad `remove` no elimina', resSinPermiso.code, 403);
eq('y nada se borró', db.state().submissions.length, 4);

ok('el doble no se tragó ninguna consulta en silencio',
    db.unhandled.length === 0, db.unhandled.slice(0, 3).join(' | '));

// ════════════════════════════════════════════════════════════════════
section('7. Invariantes que sólo se ven leyendo los archivos');

const crit = read('server/lib/projectFairBulk.js');
const ctrl = codigo('server/controllers/projectFairAdminController.js');
const rutas = codigo('server/routes/project-fair.js');
const espejo = codigo('src/lib/projectFairBulk.ts');
const pantalla = codigo('src/pages/admin/PostulacionesPagos.tsx');
const esquema = read('server/controllers/projectFairController.js');

// ⚠️ `ProjectFairEvent` NO se vacía: el historial sobrevive a la fila.
ok('`ProjectFairEvent` NO está entre las tablas que se vacían',
    !/SUBMISSION_CHILDREN = \[[^\]]*ProjectFairEvent/s.test(ctrl));
// …y todas las demás que cuelgan de `submissionId`, SÍ.
const hijasDeclaradas = (/const SUBMISSION_CHILDREN = \[([\s\S]*?)\];/.exec(ctrl) || [, ''])[1];
const hijasReales = [...new Set(
    [...esquema.matchAll(/CREATE TABLE IF NOT EXISTS "(ProjectFair\w+)"\s*\(([\s\S]*?)\);/g)]
        .filter(m => /"submissionId"/.test(m[2]))
        .map(m => m[1])
)].filter(t => t !== 'ProjectFairEvent');
const faltantes = hijasReales.filter(t => !hijasDeclaradas.includes(t));
eq('todas las tablas que cuelgan de una postulación se vacían al eliminar', faltantes, []);
ok('…incluida la de intentos de pago (vive en otro archivo)',
    hijasDeclaradas.includes('ProjectFairPaymentAttempt'));

// ⚠️ Las literales van ANTES de su paramétrica, o son inalcanzables.
const iBulk = rutas.indexOf("'/admin/postulaciones/bulk-");
const iParam = rutas.indexOf("'/admin/postulaciones/:id'");
ok('las rutas en bloque se declaran antes de `/:id`', iBulk > 0 && iBulk < iParam);
eq('están las cinco', (rutas.match(/'\/admin\/postulaciones\/bulk-/g) || []).length, 5);

// El permiso de cada acción sale del criterio, no escrito a mano en la ruta.
ok('el permiso de cada acción lo declara `BULK_CAPABILITY`',
    (ctrl.match(/BULK_CAPABILITY\./g) || []).length === 5);
ok('`remove` es una capacidad propia del rol admin',
    /admin:\s*\{[^}]*remove: true/.test(ctrl) && /viewer:\s*\{[^}]*remove: false/.test(ctrl));

// El archivado, en el esquema.
for (const col of ['archivedAt', 'archivedBy', 'archivedReason']) {
    ok(`la columna "${col}" se crea con ADD COLUMN IF NOT EXISTS`,
        new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`).test(esquema));
}
ok('el listado excluye lo archivado por defecto',
    /archivedAt" IS NULL/.test(ctrl) && /normalizeArchiveView/.test(ctrl));

// El espejo es MÍNIMO.
ok('el espejo no exporta `BULK_CAPABILITY`', !/export const BULK_CAPABILITY/.test(espejo));
ok('el espejo no exporta `validateBulkPlan`', !/export const validateBulkPlan/.test(espejo));

// La pantalla: la casilla va FUERA del botón que abre la ficha, y con el
// nombre en su etiqueta (reglas v4.940 y v4.740).
ok('la casilla de cada fila lleva el nombre en su etiqueta accesible',
    /aria-label=\{`Seleccionar \$\{s\.publicRef\}/.test(pantalla));
ok('la selección guarda las filas enteras, no sus ids',
    /useState<Submission\[\]>\(\[\]\)/.test(pantalla));
ok('la pantalla avisa cuando la selección incluye filas fuera de la página',
    /fueraDeVista/.test(pantalla));
ok('la confirmación usa el mismo criterio que el servidor',
    /describeBulkPlan\(bulkPlan\)/.test(pantalla) && /bulkWarnings\(bulkPlan\)/.test(pantalla));
ok('el desglose del resultado se pinta fila por fila',
    /bulkResult\.outcomes/.test(pantalla));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${fail ? '✗' : '✓'} ${pass} pasaron · ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
