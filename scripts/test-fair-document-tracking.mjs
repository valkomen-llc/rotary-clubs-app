// ════════════════════════════════════════════════════════════════════
// test:fair:document-tracking — Seguimiento documental (v4.1332), sin base ni
// red: el motor de avance, el criterio documental y las invariantes leídas de
// los archivos. Corre en `prebuild`.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
const { formProgressOf, completionOf, missingRequired, fieldApplies, fieldIsRequired } = await import(`${REPO}/server/lib/projectFormEngine.js`);
const T = await import(`${REPO}/server/lib/projectDocumentTracking.js`);
const { OWNED_TABLES, OWNED_COLUMNS } = await import(`${REPO}/server/lib/ensureProjectDocumentSchema.js`);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

console.log('── Motor de avance (la única cuenta)');
const tpl = { sections: [
    { key: 's1', title: 'Datos', fields: [
        { key: 'name', label: 'Nombre', type: 'text', required: true },
        { key: 'mail', label: 'Correo', type: 'email', required: true },
        { key: 'opt', label: 'Opcional', type: 'text' },
        { key: 'calc', label: 'Total', type: 'computed', required: true, compute: { op: 'sum', sources: [] } },
    ] },
    { key: 's2', title: 'Subvención', fields: [
        { key: 'asked', label: '¿Solicitó?', type: 'select', required: true, options: ['Sí', 'No'] },
        { key: 'gg', label: 'Número GG', type: 'text', requiredIf: { field: 's2.asked', equals: 'Sí' } },
        { key: 'doc', label: 'Soporte', type: 'file', required: true, appliesIf: { field: 's2.asked', equals: 'Sí' } },
    ] },
    { key: 'adm', title: 'Distrito', adminOnly: true, fields: [{ key: 'firma', label: 'Firma', type: 'text', required: true }] },
] };
ok(formProgressOf(tpl, {}).pct === 0, 'vacío: 0 %');
let p = formProgressOf(tpl, { s1: { name: 'Ana', mail: 'ana@club.org' }, s2: { asked: 'No' } });
ok(p.pct === 100 && p.total === 3, 'con «No», el GG y el soporte no aplican: 3 obligatorios, 100 %');
ok(!p.missing.length && !p.invalid.length, 'nada pendiente');
p = formProgressOf(tpl, { s1: { name: 'Ana', mail: 'ana@club.org' }, s2: { asked: 'Sí' } });
ok(p.total === 5 && p.pct === 60, 'con «Sí», el GG (requiredIf) y el soporte (appliesIf) entran: 3 de 5 = 60 %');
ok(p.missing.map(m => m.key).sort().join() === 'doc,gg', 'y se nombran los dos que faltan');
p = formProgressOf(tpl, { s1: { name: 'Ana', mail: 'no-es-correo' }, s2: { asked: 'No' } });
ok(p.pct === 67 && p.invalid[0]?.key === 'mail', 'un correo inválido NO cuenta como diligenciado (2 de 3)');
ok(p.sections.find(s => s.key === 's1').complete === false, 'la sección con el inválido queda incompleta');
p = formProgressOf(tpl, { s1: { name: 'Ana', mail: 'ana@club.org', opt: '' }, s2: { asked: 'No' } });
ok(p.pct === 100, 'un opcional vacío no impide el 100 %');
ok(!formProgressOf(tpl, {}).sections.some(s => s.key === 'adm'), 'la sección del Distrito no cuenta para el club');
const big = { sections: [{ key: 'a', title: 'A', fields: Array.from({ length: 300 }, (_, i) => ({ key: `f${i}`, label: `F${i}`, type: 'text', required: true })) }] };
const almost = { a: Object.fromEntries(Array.from({ length: 299 }, (_, i) => [`f${i}`, 'x'])) };
ok(completionOf(big, almost) === 99, '299 de 300 se muestra 99 %, nunca 100 % con algo pendiente');
ok(completionOf(tpl, { s1: { name: 'A', mail: 'a@b.org' }, s2: { asked: 'No' } }) === 100, 'completionOf es formProgressOf');
ok(missingRequired(tpl, { s1: {}, s2: { asked: 'No' } }).map(m => m.key).sort().join() === 'mail,name', 'missingRequired respeta las condiciones');
ok(fieldIsRequired({ requiredIf: { field: 's2.asked', in: ['Sí', 'Tal vez'] } }, { s2: { asked: 'Tal vez' } }), 'requiredIf con «in»');
ok(!fieldApplies({ sectionKey: 's2', appliesIf: { field: 's2.asked', filled: true } }, tpl, {}), 'appliesIf con «filled»');

console.log('── Criterio documental');
const cfg = T.normalizeTrackingConfig({ deadline: '2027-01-20' });
ok(cfg.deadline === '2027-01-20' && cfg.requirements.master.mode === 'required', 'configuración por defecto + fecha de la edición');
ok(T.normalizeTrackingConfig({ deadline: '20/01/2027', reminders: { minDays: 0, max: 99 } }).deadline === null, 'una fecha mal escrita no se guarda');
ok(T.normalizeTrackingConfig({ reminders: { minDays: 0, max: 99 } }).reminders.max === 20, 'los límites se acotan');
ok(!/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(T.DOCUMENT_TRACKING_DEFAULTS)), 'ninguna fecha escrita en la configuración de fábrica');
const forms = [
    { key: 'master', title: 'Formulación', template: tpl, record: { answers: { s1: { name: 'A', mail: 'a@b.org' }, s2: { asked: 'No' } }, status: 'submitted', lastEditedAt: '2026-11-01T10:00:00Z' } },
    { key: T.FDD_KEY, title: 'FDD', template: tpl, record: null },
];
const now = new Date('2027-01-15T12:00:00-05:00').getTime();
let t = T.trackingOf({ submission: { createdAt: '2026-10-01' }, forms, config: cfg, now });
ok(t.requirements.find(r => r.key === 'master').pct === 100 && t.requirements.find(r => r.key === T.FDD_KEY).status.label === 'Sin iniciar', 'Formulación 100 % y FDD «Sin iniciar»');
ok(t.overallPct === 25 && !t.complete, 'global sobre 4 obligatorios de igual peso: 25 %');
ok(t.risk.key === 'attention' && t.risk.daysLeft === 5 && t.risk.label === 'Vence en 5 días', 'semáforo en días de calendario de Colombia: del 15 al 20, «Vence en 5 días» → atención');
ok(t.pitch.label === 'No solicitado', 'Video Pitch: «No solicitado» por defecto');
const reviews = { [T.FDD_KEY]: { applicability: 'not_applicable', applicabilityReason: 'No solicita FDD' } };
t = T.trackingOf({ forms, reviews, config: cfg, now, presentation: { file: { id: 'f1', fileName: 'p.pdf' } }, video: { status: 'approved', currentVersionId: 'v1' } });
ok(t.requirements.find(r => r.key === T.FDD_KEY).status.label === 'No aplica' && t.overallPct === 100 && t.complete, '«No aplica» sale del cálculo: puede llegar al 100 %');
ok(t.requirements.find(r => r.key === 'presentation').status.label === 'Cargada', 'presentación con archivo: «Cargada»');
ok(t.requirements.find(r => r.key === 'presentation').review === null, 'cargada NO es validada');
ok(t.requirements.find(r => r.key === 'video').status.label === 'Validado', 'video aprobado en su módulo: «Validado»');
ok(t.validation.key === 'pending_review', 'con cosas entregadas sin revisar: «Pendiente de validación»');
ok(t.risk.key === 'complete', 'completo: semáforo «Al día»');
const rv = { ...reviews, presentation: { status: 'validated', fingerprint: 'f1' }, master: { status: 'validated', fingerprint: '2026-11-01T10:00:00.000Z' } };
t = T.trackingOf({ forms, reviews: rv, config: cfg, now, presentation: { file: { id: 'f1' } }, video: { status: 'approved', currentVersionId: 'v1' } });
ok(t.validation.key === 'validated', 'todo lo aplicable validado: «Validado»');
t = T.trackingOf({ forms, reviews: rv, config: cfg, now, presentation: { file: { id: 'f2' } }, video: { status: 'approved', currentVersionId: 'v1' } });
ok(t.requirements.find(r => r.key === 'presentation').status.key === 'uploaded' && t.requirements.find(r => r.key === 'presentation').reviewStale, 'una versión nueva deja la validación desactualizada');
t = T.trackingOf({ forms, reviews: { ...rv, presentation: { status: 'changes_requested', fingerprint: 'f1', note: 'x' } }, config: cfg, now, presentation: { file: { id: 'f1' } }, video: null });
ok(t.requirements.find(r => r.key === 'presentation').status.label === 'Requiere corrección' && !t.complete, 'corrección pedida: no cuenta como entregada');
ok(t.validation.key === 'changes_requested', 'y la validación dice «Requiere correcciones»');
const optCfg = T.normalizeTrackingConfig({ requirements: { video: { mode: 'optional' }, presentation: { mode: 'not_applicable' } } });
t = T.trackingOf({ forms, reviews, config: optCfg, now });
ok(t.overallPct === 100 && t.requirements.find(r => r.key === 'video').counts === false, 'opcional: se muestra pero no cuenta');
const weighted = T.normalizeTrackingConfig({ requirements: { master: { weight: 3 } } });
t = T.trackingOf({ forms, config: weighted, now });
ok(t.overallPct === 50, 'ponderación configurable: Formulación ×3 → 3/6 = 50 %');
ok(T.pitchStateOf({ status: 'submitted', commercialStatus: 'pending_payment' }) === 'payment_pending', 'Video Pitch con orden abierta: «Pago pendiente»');
ok(T.pitchStateOf({ status: 'in_production', commercialStatus: 'paid' }) === 'in_production' && T.pitchStateOf({ status: 'delivered' }) === 'delivered', '«En producción» y «Entregado»');
ok(T.pitchStateOf({ status: 'submitted', commercialStatus: 'pending_payment', paymentWaived: true }) === 'requested', 'exonerado por el comité: no es «Pago pendiente»');
t = T.trackingOf({ forms, config: cfg, now: new Date('2027-01-25T12:00:00-05:00').getTime() });
ok(t.risk.key === 'overdue', 'después de la fecha con pendientes: «Vencido»');
ok(T.trackingOf({ forms, config: T.normalizeTrackingConfig({}), now }).risk.key === 'no_deadline', 'sin fecha: «Sin fecha límite»');

console.log('── Filtros, indicadores y orden');
const a = T.trackingOf({ forms, config: cfg, now });
const b = T.trackingOf({ forms, reviews, config: cfg, now, presentation: { file: { id: 'f1' } }, video: { status: 'approved', currentVersionId: 'v1' } });
ok(T.matchesDocFilters(a, { doc: 'incompleta' }) && !T.matchesDocFilters(b, { doc: 'incompleta' }), 'vista «incompleta»');
ok(T.matchesDocFilters(a, { doc: 'fdd' }) && !T.matchesDocFilters(b, { doc: 'fdd' }), 'vista «FDD inferior al 100 %» (no cuenta un «No aplica»)');
ok(T.matchesDocFilters(a, { docMin: '0', docMax: '30' }) && !T.matchesDocFilters(b, { docMax: '99' }), 'rango de avance');
ok(!T.matchesDocFilters(a, { doc: 'no-existe-xyz' }) === false, 'una vista desconocida no filtra');
const k = T.summarizeTracking([a, b]);
ok(k.total === 2 && k.complete === 1 && k.incomplete === 1 && k.pendingFdd === 1 && k.pendingPresentation === 1, 'indicadores');
ok(T.hasDocQuery({ doc: 'completa' }) && T.hasDocQuery({ sortBy: 'docOverall' }) && !T.hasDocQuery({ search: 'x' }), 'el listado sabe cuándo tomar el camino documental');

console.log('── Recordatorios');
const sub = { email: 'a@club.org', workflowStatus: 'received' };
ok(T.documentReminderVerdict({ submission: sub, tracking: a, config: cfg, now }).ok, 'proyecto postulado e incompleto: se le escribe');
ok(T.documentReminderVerdict({ submission: { ...sub, workflowStatus: 'draft' }, tracking: a, config: cfg, now }).code === 'draft', 'borrador: no');
ok(T.documentReminderVerdict({ submission: { ...sub, archivedAt: new Date() }, tracking: a, config: cfg, now }).code === 'archived', 'archivado: no');
ok(T.documentReminderVerdict({ submission: sub, tracking: b, config: cfg, now }).code === 'complete', 'completo: no');
ok(T.documentReminderVerdict({ submission: sub, tracking: a, config: cfg, formsOpen: false, now }).code === 'forms_closed', 'si no puede editar: no (sería pedir lo imposible)');
ok(T.documentReminderVerdict({ submission: sub, tracking: { ...a, reminderCount: 1, lastReminderAt: new Date(now - 86400000).toISOString() }, config: cfg, now }).code === 'too_soon', 'intervalo mínimo');
ok(T.documentReminderVerdict({ submission: sub, tracking: { ...a, reminderCount: 5, lastReminderAt: new Date(now - 30 * 86400000).toISOString() }, config: cfg, now }).code === 'cap', 'tope por proyecto');
const g = T.groupByRecipient([{ id: '1', email: 'X@club.org' }, { id: '2', email: 'x@club.org' }, { id: '3', email: 'y@club.org' }]);
ok(g.length === 2 && g[0].projects.length === 2, 'un correo por responsable, con todos sus proyectos');
ok(T.reminderDedupeKey('a@b.org', ['2', '1'], now) === T.reminderDedupeKey('A@B.org', ['1', '2'], now), 'huella del envío estable (sin duplicados el mismo día)');

console.log('── Invariantes en los archivos');
const ctl = read('server/controllers/projectDocumentTrackingController.js');
ok(!/UPDATE\s+"ProjectFair(MasterForm|ProjectForm)"/.test(ctl), 'el seguimiento NO escribe las respuestas de los formularios');
ok(!/UPDATE\s+"ProjectFairSubmission"\s+SET\s+(?!metadata)/.test(ctl) && !/"workflowStatus"\s*=/.test(ctl) && !/\bstatus\s*=\s*'paid'/.test(ctl), 'ni el estado del proyecto ni el pago');
ok(/confirm !== true/.test(ctl) && /preview: true/.test(ctl), 'sin confirmación explícita el recordatorio sólo devuelve la vista previa');
ok(/ON CONFLICT \("dedupeKey"\) DO NOTHING/.test(ctl), 'cada envío se registra ANTES de salir, con huella única');
const store = read('server/lib/projectDocumentTrackingStore.js');
ok(!/from '\.\.\/controllers\//.test(store), 'la lectura por lotes no importa controladores (sin ciclos)');
ok((store.match(/db\.query\(/g) || []).length <= 10 && /ANY\(\$1::text\[\]\)/.test(store), 'una consulta por fuente para N proyectos, nunca por proyecto');
const routes = read('server/routes/project-fair.js');
const iCfg = routes.indexOf("'/admin/seguimiento-documental/config'");
const iRec = routes.indexOf("'/admin/seguimiento-documental/recordatorios'");
const iId = routes.indexOf("'/admin/seguimiento-documental/:id'");
ok(iCfg > 0 && iRec > 0 && iCfg < iId && iRec < iId, 'los literales van antes de /:id');
for (const m of routes.split('\n').filter(l => l.includes('/admin/seguimiento-documental'))) ok(m.includes('authMiddleware'), `con sesión: ${m.trim().slice(0, 70)}…`);
for (const m of routes.split('\n').filter(l => /'\/portal\/(document-status|presentation)/.test(l))) ok(m.includes('portal.portalAuth'), `con la sesión del club: ${m.trim().slice(0, 60)}…`);
const forms_ = read('server/controllers/projectFormsController.js');
ok(/const record = withLivePct\(form\.template, rawRecord\)/.test(forms_), '«Mi Proyecto» muestra el avance calculado con la plantilla vigente');
const engine = read('server/lib/projectFormEngine.js');
ok(/export const completionOf = \(template, answers = \{\}\) => formProgressOf\(template, answers\)\.pct;/.test(engine), 'completionOf delega en formProgressOf: una sola cuenta');
const ui = read('src/pages/admin/PostulacionesPagos.tsx');
ok(ui.includes('<DocumentTrackingStrip') && ui.includes('<DocumentTrackingDrawer') && ui.includes('<DocumentRemindersDialog') && ui.includes('<DocumentTrackingConfigDialog'), 'la tabla monta la franja, el detalle, los recordatorios y la configuración');
ok(!/\.reduce\([^)]*completionPct/.test(read('src/components/admin/feria/seguimiento/DocumentTrackingCells.tsx')), 'el navegador no calcula porcentajes');
const mp = read('src/pages/MiProyecto.tsx');
ok(mp.includes('<DocumentProgressPanel') && mp.includes('<PresentationDeliveryCard'), '«Mi Proyecto» muestra el avance documental y la entrega de la presentación');
const grid = mp.slice(mp.indexOf('Formularios y recursos del proyecto'));
ok(grid.indexOf('<VideoPitchCard') < grid.indexOf('<PresentationDeliveryCard') && grid.indexOf('<PresentationDeliveryCard') < grid.indexOf('</div>', grid.indexOf('forms.map(form => <FormCardTile')), 'la entrega cierra la cuadrícula sin mover las tarjetas anteriores');
ok(/role="progressbar"/.test(read('src/components/admin/feria/seguimiento/DocumentTrackingCells.tsx')) && /aria-valuenow/.test(read('src/components/project-forms/DocumentProgressPanel.tsx')), 'barras accesibles (progressbar con valor)');

console.log('── Esquema');
const claude = read('CLAUDE.md');
const guard = read('scripts/db-push-guard.mjs');
for (const tbl of OWNED_TABLES) ok(claude.includes(`\`${tbl}\``) && guard.includes(tbl), `${tbl}: en CLAUDE.md y en el guardián de db:push`);
ok(Object.values(OWNED_COLUMNS).every(c => Array.isArray(c)), 'OWNED_COLUMNS enumera los ADD COLUMN (hoy ninguno)');
const ens = read('server/lib/ensureProjectDocumentSchema.js');
ok((ens.match(/db\.query\(`[\s\S]*?`[,)]/g) || []).every(q => (q.match(/`/g) || []).length === 2), 'ninguna comilla invertida dentro del SQL');
ok(claude.includes('docs/claude/seguimiento-documental-de-proyectos.md') && read('docs/claude/seguimiento-documental-de-proyectos.md').length > 3000, 'el módulo tiene su archivo en docs/claude y está en la tabla');

console.log(`\n✅ ${n} comprobaciones, todas en verde.`);
