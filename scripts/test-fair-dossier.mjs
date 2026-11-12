#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Expediente integral del proyecto.            npm run test:fair:dossier
// v4.1324.0
//
// 1–6 sin base y sin red: el CRITERIO (`server/lib/projectDossier.js`) — que el
// expediente sale de los campos REALES de las plantillas, qué se edita y qué no,
// qué se traduce y qué se conserva, la validación por tipo, los conflictos, el
// estado derivado de la traducción y la verificación de cifras.
//
// 7 contra Postgres DE VERDAD y los manejadores reales, si se le da una base
// desechable (se crean las tablas del módulo y se borran al terminar):
//   DOSSIER_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/dossier_test npm run test:fair:dossier
// El proveedor de IA se simula en `fetch` (formato de Gemini): ninguna llamada
// sale a la red y se puede comprobar QUÉ se le habría mandado.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

// La base se fija ANTES de cualquier import que cree el pool de conexiones.
if (process.env.DOSSIER_TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DOSSIER_TEST_DATABASE_URL;
    process.env.GEMINI_API_KEY = 'clave-de-prueba';
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); } };
const leer = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const D = (await import('../server/lib/projectDossier.js')).default;
const { DEFAULT_MASTER_FORM } = await import('../server/lib/projectFairMasterForm.js');
const { DEFAULT_FDD_FORM } = await import('../server/lib/projectFairFddForm.js');

const FOCUS = [{ key: 'water_sanitation', label: 'Agua, Saneamiento e Higiene.' }, { key: 'basic_education', label: 'Educación Básica y Alfabetización.' }];
const SUB = {
    id: 'sub-1', publicRef: 'FP-TEST01', eventId: 'evt-1', firstName: 'Paula Andrea', lastName: 'Cruz', email: 'paula@example.org', phone: '+57 3176547111',
    clubName: 'Pereira del Café', district: 'Rotary Distrito 4281', projectName: 'Agua limpia para la vereda La Esperanza',
    projectDescription: 'Instalar 12 filtros comunitarios para 300 familias.', focusArea: 'water_sanitation', focusAreaLabel: 'Agua, Saneamiento e Higiene.',
    budgetUsd: '45000', idType: 'cc', idTypeLabel: 'Cédula', idNumber: '1088000000', city: 'Pereira', department: 'Risaralda', country: 'Colombia', notes: null,
    status: 'paid', workflowStatus: 'received', amountCop: '250000', amountUsd: '62.5', paidAt: '2026-10-01T00:00:00Z',
};
const MASTER_ANSWERS = {
    identificacion: { clubName: 'Pereira del Café', district: '4281', city: 'Pereira', projectName: 'Agua limpia para la vereda La Esperanza', focusAreas: ['Agua, Saneamiento e Higiene.'] },
    objetivos: { generalObjective: 'Garantizar agua potable a 300 familias de la vereda en 2027.', projectDescription: 'El proyecto instala 12 filtros y capacita a 40 líderes. Contacto: agua@example.org' },
    necesidades: { needs: 'La vereda no tiene acueducto.', beneficiaries: '300 familias campesinas.' },
    presupuesto: { budgetTable: { projectCost: { pesos: '180000000', usd: '45000' } } },
    contacto: { contactName: 'Paula Cruz', contactEmail: 'paula@example.org', contactPhone: '+57 3176547111' },
};
const FDD_ANSWERS = {
    objetivo: { mainObjective: 'Agua potable para 300 familias.', beneficiaries: 'Familias de la vereda.', beneficiariesCount: '300' },
    presupuesto: { budgetUsd: '45000', budgetBreakdown: [{ concept: 'Filtros comunitarios', amountUsd: '30000' }, { concept: 'Capacitación', amountUsd: '15000' }] },
    fdd: { requestedUsd: '20000', fapGoalUsd: '5000' },
    subvencion: { alreadyRequested: 'Sí', ggStatus: 'En revisión' },
};
const formsOf = (masterRecord, fddRecord) => [
    { key: 'master', template: DEFAULT_MASTER_FORM, record: masterRecord },
    { key: 'fdd_2026_2027', template: { ...DEFAULT_FDD_FORM, key: 'fdd_2026_2027' }, record: fddRecord },
];
const dossierOf = (sub = SUB, master = { answers: MASTER_ANSWERS, completionPct: 70 }, fdd = { answers: FDD_ANSWERS, completionPct: 40 }) =>
    D.buildDossier({ submission: sub, forms: formsOf(master, fdd), computed: {}, focusAreas: FOCUS });

// ── 1 ───────────────────────────────────────────────────────────────────────
console.log('\n1. El expediente sale de los campos REALES (registro + plantillas), sin inventar ninguno');
const dossier = dossierOf();
const idx = D.fieldIndex(dossier);
const templateFieldCount = [DEFAULT_MASTER_FORM, DEFAULT_FDD_FORM].reduce((n, t) => n + t.sections.reduce((m, s) => m + s.fields.length, 0), 0);
const submissionFieldCount = D.SUBMISSION_GROUPS.reduce((n, g) => n + g.fields.length, 0);
ok(`trae TODOS los campos: ${submissionFieldCount} del registro + ${templateFieldCount} de las plantillas`, idx.size === submissionFieldCount + templateFieldCount, `tiene ${idx.size}`);
ok('cada campo de cada plantilla tiene su ruta formulario.sección.campo',
    [DEFAULT_MASTER_FORM, DEFAULT_FDD_FORM].every((t, i) => t.sections.every(s => s.fields.every(f => idx.has(`${i ? 'fdd_2026_2027' : 'master'}.${s.key}.${f.key}`)))));
ok('un campo vacío NO se oculta: está, con filled=false', idx.get('master.sostenibilidad.sustainability')?.filled === false);
ok('el valor es el guardado por el club', idx.get('master.objetivos.generalObjective')?.value === MASTER_ANSWERS.objetivos.generalObjective);
ok('un campo agregado a la plantilla aparece solo', (() => {
    const t = JSON.parse(JSON.stringify(DEFAULT_MASTER_FORM));
    t.sections[1].fields.push({ key: 'nuevoCampo', label: 'Campo nuevo del comité', type: 'textarea' });
    const d = D.buildDossier({ submission: SUB, forms: [{ key: 'master', template: t, record: { answers: {} } }], focusAreas: FOCUS });
    const f = D.fieldIndex(d).get('master.objetivos.nuevoCampo');
    return f && f.translatable && f.labelEn === null;
})());
ok('las columnas de pago, estado y referencias NO son campos del expediente',
    !['submission.status', 'submission.workflowStatus', 'submission.amountCop', 'submission.amountUsd', 'submission.paidAt', 'submission.publicRef', 'submission.stripePaymentIntentId', 'submission.registrationId'].some(p => idx.has(p)));

// ── 2 ───────────────────────────────────────────────────────────────────────
console.log('\n2. Qué se edita y qué no, con su motivo');
const locked = (p) => idx.get(p) && !idx.get(p).editable && !!idx.get(p).lockReason;
ok('el correo del responsable no se edita (es el acceso a «Mi proyecto»)', locked('submission.email'));
ok('club y distrito no se editan (relación con el club)', locked('submission.clubName') && locked('submission.district'));
ok('el documento de identidad no se edita', locked('submission.document'));
ok('un campo calculado no se edita', locked('fdd_2026_2027.aportes.expectedTotalUsd'));
ok('la aprobación institucional no se edita desde aquí', locked('fdd_2026_2027.aprobacion.approvedAmountUsd'));
ok('la descripción, el objetivo y el desglose sí', ['submission.projectDescription', 'master.objetivos.generalObjective', 'fdd_2026_2027.presupuesto.budgetBreakdown'].every(p => idx.get(p)?.editable));
const sinIniciar = D.fieldIndex(dossierOf(SUB, { answers: MASTER_ANSWERS }, null));
ok('un formulario que el club no inició no se rellena desde el expediente', !sinIniciar.get('fdd_2026_2027.objetivo.mainObjective').editable);

// ── 3 ───────────────────────────────────────────────────────────────────────
console.log('\n3. La edición respeta el tipo, detecta conflictos y pide motivo para cifras');
const p1 = D.planEdit(dossier, { edits: [{ path: 'master.objetivos.generalObjective', value: 'Nuevo objetivo.', before: MASTER_ANSWERS.objetivos.generalObjective }] });
ok('un cambio de texto se planea contra la tabla del formulario', p1.ok && p1.changes[0].target === 'form' && p1.changes[0].formKey === 'master' && p1.changes[0].sectionKey === 'objetivos');
ok('el «antes» queda en el plan', p1.changes?.[0]?.before === MASTER_ANSWERS.objetivos.generalObjective);
const p2 = D.planEdit(dossier, { edits: [{ path: 'master.objetivos.generalObjective', value: 'X', before: 'Lo que vi hace una hora' }] });
ok('si otro cambió el campo mientras editaba → 409 con el campo', !p2.ok && p2.status === 409 && p2.conflicts[0].path === 'master.objetivos.generalObjective');
ok('el correo bloqueado → 403', D.planEdit(dossier, { edits: [{ path: 'submission.email', value: 'otro@x.org' }] }).status === 403);
ok('una ruta inventada → 400', D.planEdit(dossier, { edits: [{ path: 'submission.status', value: 'paid' }] }).status === 400);
ok('cambiar el presupuesto SIN motivo → 400 needsReason', D.planEdit(dossier, { edits: [{ path: 'submission.budgetUsd', value: '50000' }] }).needsReason === true);
ok('con motivo → ok', D.planEdit(dossier, { edits: [{ path: 'submission.budgetUsd', value: '50000' }], reason: 'Errata del club' }).ok);
ok('un número no numérico → 400', D.planEdit(dossier, { edits: [{ path: 'fdd_2026_2027.fdd.requestedUsd', value: 'veinte mil' }], reason: 'x x x x' }).status === 400);
ok('una fecha mal escrita → 400', D.planEdit(dossier, { edits: [{ path: 'fdd_2026_2027.proyecto.scheduledDate', value: '31/02/2027' }] }).status === 400);
ok('una opción fuera de la lista → 400', D.planEdit(dossier, { edits: [{ path: 'fdd_2026_2027.subvencion.ggStatus', value: 'Inventada' }] }).status === 400);
ok('un área de enfoque fuera del catálogo → 400', D.planEdit(dossier, { edits: [{ path: 'master.identificacion.focusAreas', value: ['Paz mundial'] }] }).status === 400);
ok('el mismo valor guardado → «no hay cambios»', D.planEdit(dossier, { edits: [{ path: 'master.necesidades.needs', value: 'La vereda no tiene acueducto.' }] }).status === 400);
ok('4500 y "4500" son el mismo valor', D.planEdit(dossier, { edits: [{ path: 'submission.budgetUsd', value: 45000 }], reason: 'motivo largo' }).status === 400);
const rep = D.planEdit(dossier, { edits: [{ path: 'fdd_2026_2027.presupuesto.budgetBreakdown', value: [{ concept: 'Filtros', amountUsd: '30000' }] }], reason: 'Se unifica' });
ok('un repetidor se valida por columna y conserva su forma de lista', rep.ok && Array.isArray(rep.changes[0].after) && rep.changes[0].after[0].concept === 'Filtros');
const merged = D.applyFormChanges(MASTER_ANSWERS, p1.changes);
ok('aplicar MEZCLA: cambia sólo la clave editada', merged.objetivos.generalObjective === 'Nuevo objetivo.' && merged.objetivos.projectDescription === MASTER_ANSWERS.objetivos.projectDescription && merged.contacto.contactEmail === 'paula@example.org');
ok('y no muta las respuestas originales', MASTER_ANSWERS.objetivos.generalObjective !== 'Nuevo objetivo.');

// ── 4 ───────────────────────────────────────────────────────────────────────
console.log('\n4. Qué se traduce y qué se conserva');
const items = D.translatableItems(dossier);
const paths = items.map(i => i.path);
ok('se traducen los textos narrativos', ['submission.projectName', 'submission.projectDescription', 'master.objetivos.generalObjective', 'master.necesidades.needs', 'fdd_2026_2027.objetivo.mainObjective'].every(p => paths.includes(p)));
ok('el desglose del presupuesto aporta su concepto por fila', paths.includes('fdd_2026_2027.presupuesto.budgetBreakdown[0].concept') && paths.includes('fdd_2026_2027.presupuesto.budgetBreakdown[1].concept'));
ok('NO se mandan nombres, correos, teléfonos, ciudades, club ni documento',
    !paths.some(p => /(firstName|lastName|email|phone|city|clubName|district|document|contactName|contactEmail|contactPhone|presidentName|location|clubId|Signature)$/.test(p)));
ok('NO se mandan cifras sueltas (beneficiariesCount = "300")', !paths.includes('fdd_2026_2027.objetivo.beneficiariesCount'));
const sentText = items.map(i => i.text).join('\n');
ok('ningún texto enviado contiene el documento, el teléfono ni el correo del responsable', !sentText.includes('1088000000') && !sentText.includes('3176547111') && !sentText.includes('paula@example.org'));
const batches = D.planBatches([...items, { ...items[0], path: 'otro' }]);
ok('un mismo original se traduce una sola vez', batches.flat().length === new Set(items.map(i => i.hash)).size);
ok('los lotes respetan el tope de caracteres', D.planBatches(Array.from({ length: 30 }, (_, i) => ({ hash: `h${i}`, text: 'x'.repeat(1000) }))).every(b => b.reduce((n, x) => n + x.text.length, 0) <= 9000));
const glossary = D.mergeGlossary([{ source: 'Vereda', target: 'Rural village', kind: 'term' }]);
ok('el glosario de fábrica trae las Áreas de Enfoque oficiales', D.glossaryLookup(glossary, 'Agua, Saneamiento e Higiene.') === 'Water, Sanitation, and Hygiene');
ok('el glosario del comité se suma y manda', D.glossaryLookup(D.mergeGlossary([{ source: 'Sí', target: 'Affirmative' }]), 'Sí') === 'Affirmative');
const sys = D.translationSystemPrompt(glossary);
ok('la instrucción lleva la terminología aprobada', sys.includes('"Club Rotario" → "Rotary Club"') && sys.includes('"Vereda" → "Rural village"'));
ok('y pide conservar cifras, correos y nombres', /figure, amount/.test(sys) && /email address/.test(sys) && /names of people/.test(sys));
const ev = D.englishView(dossier, new Map([['master.objetivos.generalObjective', 'Ensure safe water.']]), glossary);
const evIdx = D.fieldIndex(ev);
ok('vista inglesa: lo traducido sale del texto aprobado', evIdx.get('master.objetivos.generalObjective').valueEn === 'Ensure safe water.');
ok('vista inglesa: lo NO traducido queda marcado, no se cuela el español', evIdx.get('master.necesidades.needs').valueEn === null && evIdx.get('master.necesidades.needs').untranslated);
ok('vista inglesa: área de enfoque por glosario', evIdx.get('master.identificacion.focusAreas').valueEn[0] === 'Water, Sanitation, and Hygiene');
ok('vista inglesa: «Sí» → «Yes», «En revisión» → «Under review»', evIdx.get('fdd_2026_2027.subvencion.alreadyRequested').valueEn === 'Yes' && evIdx.get('fdd_2026_2027.subvencion.ggStatus').valueEn === 'Under review');
ok('vista inglesa: nombres y cifras se conservan', evIdx.get('submission.clubName').valueEn === 'Pereira del Café' && evIdx.get('fdd_2026_2027.fdd.requestedUsd').valueEn === '20000');
const doc = D.fieldIndex(D.forDocument(dossier));
ok('la ficha NUNCA lleva el documento de identidad', !doc.has('submission.document'));
ok('ni correo/teléfono del responsable salvo que se pidan', !doc.has('submission.email') && D.fieldIndex(D.forDocument(dossier, { includeContact: true })).has('submission.email'));

// ── 5 ───────────────────────────────────────────────────────────────────────
console.log('\n5. El estado de la traducción se DERIVA (y es independiente del pago)');
const rowsFor = (list, extra = {}) => list.map(i => ({ path: i.path, sourceHash: i.hash, sourceText: i.text, text: `EN ${i.text}`, reviewed: false, origin: 'ai', ...extra }));
const st0 = D.translationStatus({ items, fieldRows: [], header: null });
ok('sin filas → No iniciada', st0.state === 'not_started');
ok('generación en curso reciente → En generación', D.translationStatus({ items, fieldRows: [], header: { status: 'generating', startedAt: new Date().toISOString() } }).state === 'generating');
ok('generación caída (> 6 min) → no bloquea para siempre', D.translationStatus({ items, fieldRows: [], header: { status: 'generating', startedAt: new Date(Date.now() - 7 * 60000).toISOString() } }).state === 'not_started');
ok('algunos campos → Borrador', D.translationStatus({ items, fieldRows: rowsFor(items.slice(0, 2)) }).state === 'draft');
const allRows = rowsFor(items);
ok('todos traducidos sin revisar → Pendiente de revisión', D.translationStatus({ items, fieldRows: allRows }).state === 'pending_review');
const reviewedRows = rowsFor(items, { reviewed: true });
ok('todos revisados → Revisada', D.translationStatus({ items, fieldRows: reviewedRows }).state === 'reviewed');
const header = { approvedAt: new Date().toISOString(), approvedFingerprint: D.fingerprintOf(reviewedRows) };
ok('aprobada con la huella vigente → Aprobada', D.translationStatus({ items, fieldRows: reviewedRows, header }).state === 'approved');
const dossier2 = dossierOf({ ...SUB, projectDescription: 'Instalar 15 filtros comunitarios para 300 familias.' });
const items2 = D.translatableItems(dossier2);
const st2 = D.translationStatus({ items: items2, fieldRows: reviewedRows, header });
ok('cambia el original después de aprobar → Desactualizada', st2.state === 'outdated');
ok('y el campo afectado (sólo ése) queda desactualizado, con su original anterior a la vista',
    st2.fields.filter(f => f.state === 'outdated').map(f => f.path).join() === 'submission.projectDescription' && /12 filtros/.test(st2.fields.find(f => f.path === 'submission.projectDescription').previousSource));
ok('editar la traducción tras aprobar → deja de contar como aprobada', D.translationStatus({ items, fieldRows: reviewedRows.map((r, i) => (i ? r : { ...r, text: 'otro' })), header }).state !== 'approved');
ok('aprobar exige todo revisado', !D.approvalCheck(D.translationStatus({ items, fieldRows: allRows })).ok);
ok('aprobar exige nada desactualizado', /cambiaron en español/.test(D.approvalCheck(st2).error));
ok('el criterio no lee el estado del pago (ni existe en sus entradas)', !/paymentStatus|amountReceived|\.status ===\s*'paid'/.test(leer('server/lib/projectDossier.js')));

// ── 6 ───────────────────────────────────────────────────────────────────────
console.log('\n6. La traducción no puede cambiar cifras, correos ni enlaces sin que se note');
ok('una cifra que desaparece se avisa', D.auditTranslation('Para 300 familias y 12 filtros', 'For 300 families and twelve filters').some(w => w.code === 'numbers'));
ok('separadores distintos (1.500.000 / 1,500,000) no son un cambio', D.auditTranslation('Cuesta $1.500.000', 'Costs $1,500,000').length === 0);
ok('un correo alterado se avisa', D.auditTranslation('Escriba a agua@example.org', 'Write to water@example.org').some(w => w.code === 'emails'));
ok('aprobar con avisos exige confirmarlos', D.approvalCheck({ ...D.translationStatus({ items, fieldRows: reviewedRows }), warnings: 1 }).needsAcknowledge === true);
ok('respuesta del modelo sin un id → error (no se guarda desalineado)', (() => { try { D.parseTranslationResponse('{"translations":[{"id":"a","text":"A"}]}', [{ id: 'a' }, { id: 'b' }]); return false; } catch { return true; } })());
ok('respuesta envuelta en ```json``` se lee', D.parseTranslationResponse('```json\n{"translations":[{"id":"a","text":"A"}]}\n```', [{ id: 'a' }]).get('a') === 'A');
const bk = D.prepareBooklet(dossier, { lang: 'es' });
ok('la libreta copia lo que escribió el club, y dice de qué campo salió', bk.blocks.find(b => b.key === 'objective').text === MASTER_ANSWERS.objetivos.generalObjective && bk.blocks.find(b => b.key === 'objective').source === 'master.objetivos.generalObjective');
ok('el mensaje breve nace vacío (es lo único que se escribe a mano)', bk.blocks.find(b => b.key === 'message').text === '');
ok('una cifra inventada en la libreta se detecta', D.auditBooklet({ blocks: [{ key: 'message', label: 'Mensaje', text: 'Beneficia a 7777 familias' }] }, dossier).length === 1);
ok('una cifra del expediente no se marca', D.auditBooklet({ blocks: [{ key: 'message', label: 'Mensaje', text: 'Beneficia a 300 familias' }] }, dossier).length === 0);

// ── Invariantes del código ──────────────────────────────────────────────────
console.log('\n· Invariantes del código');
const ctrl = leer('server/controllers/projectDossierController.js');
ok('el controlador no escribe pagos ni estados', !/SET[^;]*\b(status|"workflowStatus"|"amountCop"|"amountUsd"|"paidAt"|"amountReceived")\s*=/.test(ctrl.replace(/"ProjectDossierTranslation" SET status/g, '').replace(/SET status = 'approved'/g, '').replace(/SET status = \$3/g, '').replace(/SET status = 'error'/g, '').replace(/DO UPDATE SET status = 'generating'/g, '')));
ok('todo endpoint pasa por withAccess con su capacidad', (ctrl.match(/withSchema\(async/g) || []).length === (ctrl.match(/\}, '(view|edit|translate|approveTranslation|export|config)'\);/g) || []).length);
ok('Gemini recibe el lote entero (maxInputChars declarado)', /maxInputChars:\s*30000/.test(ctrl));
const schema = leer('server/lib/ensureProjectDossierSchema.js');
const { OWNED_COLUMNS } = await import('../server/lib/ensureProjectDossierSchema.js');
for (const t of Object.keys(OWNED_COLUMNS)) ok(`${t} se crea`, new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`).test(schema));
const adds = [...schema.matchAll(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)].map(m => m[1]);
ok('todo ADD COLUMN está enumerado en OWNED_COLUMNS', adds.every(c => Object.values(OWNED_COLUMNS).some(cols => cols.includes(c))));
const claude = leer('CLAUDE.md');
ok('las siete tablas están en la lista protegida de CLAUDE.md', Object.keys(OWNED_COLUMNS).every(t => claude.includes(`\`${t}\``)));
const routes = leer('server/routes/project-fair.js');
ok('las rutas literales /admin/expedientes/* van antes que /admin/postulaciones/:id', routes.indexOf("'/admin/expedientes/estado'") < routes.indexOf("'/admin/postulaciones/:id'"));

// ════════════════════════════════════════════════════════════════════════════
// 7 — Contra Postgres de verdad
// ════════════════════════════════════════════════════════════════════════════
const URL_DB = process.env.DOSSIER_TEST_DATABASE_URL;
if (!URL_DB) {
    console.log('\n7. Postgres real: OMITIDO (define DOSSIER_TEST_DATABASE_URL con una base desechable)');
} else {
    console.log('\n7. Los endpoints reales contra Postgres');
    // ── El proveedor de IA, simulado: responde en el formato de Gemini. ──
    const sent = [];
    let mode = 'ok';
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
        const body = JSON.parse(init.body);
        const userText = body.contents.at(-1).parts[0].text;
        sent.push({ system: body.systemInstruction.parts[0].text, user: userText });
        const { items: list } = JSON.parse(userText);
        const translations = list.map(it => ({
            id: it.id,
            // En modo «cifras» el modelo cambia un número: debe quedar marcado.
            text: mode === 'cifras' ? `EN: ${it.text.replace(/\d+/, 'many')}` : `EN: ${it.text}`,
        }));
        const text = JSON.stringify({ translations });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const db = (await import('../server/lib/db.js')).default;
    const dossierCtl = (await import('../server/controllers/projectDossierController.js')).default;
    const call = (handler, { params = {}, query = {}, body = {}, user }) => new Promise((resolve, reject) => {
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this; },
            json(b) { resolve({ status: this.statusCode, body: b }); return this; },
            setHeader() {}, send(b) { resolve({ status: this.statusCode, body: b }); },
        };
        Promise.resolve(handler({ params, query, body, user, headers: { host: 'localhost' } }, res)).catch(reject);
    });
    const ADMIN = { id: 'u-admin', role: 'administrator', email: 'admin@feria.org' };
    const TRANSLATOR = { id: 'u-tr', role: 'editor', email: 'traductora@feria.org' };
    const REVIEWER = { id: 'u-rev', role: 'editor', email: 'revisora@feria.org' };
    const VIEWER = { id: 'u-view', role: 'club_admin', email: 'mirón@club.org' };
    const Q = { evento: 'evt-1' };

    try {
        // Las tablas del módulo las crea su propio arranque (ensureTables) al
        // primer pedido; la configuración de la edición se escribe a mano.
        await call(dossierCtl.getGlossary, { query: Q, user: ADMIN });
        await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-1', 'evt-1', $1::jsonb)
            ON CONFLICT (key) DO UPDATE SET config = EXCLUDED.config`, [JSON.stringify({ access: { translators: [TRANSLATOR.email], reviewers: [REVIEWER.email] }, focusAreas: FOCUS })]);
        await db.query('DELETE FROM "ProjectFairSubmission" WHERE id = ANY($1)', [['sub-1', 'sub-otra']]);
        const cols = ['id', 'publicRef', 'eventId', 'firstName', 'lastName', 'email', 'phone', 'clubName', 'district', 'projectName', 'projectDescription', 'focusArea', 'focusAreaLabel', 'budgetUsd', 'idType', 'idTypeLabel', 'idNumber', 'city', 'department', 'country', 'status', 'workflowStatus', 'amountCop', 'amountUsd', 'paidAt'];
        const ins = (row) => db.query(`INSERT INTO "ProjectFairSubmission" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map(c => row[c] ?? null));
        await ins(SUB);
        await ins({ ...SUB, id: 'sub-otra', publicRef: 'FP-OTRA01', eventId: 'evt-2' });
        await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", status) VALUES ('sub-1', $1::jsonb, 70, 'submitted')`, [JSON.stringify(MASTER_ANSWERS)]);
        await db.query(`INSERT INTO "ProjectFairProjectForm" ("submissionId", "formKey", answers, "completionPct") VALUES ('sub-1', 'fdd_2026_2027', $1::jsonb, 40)`, [JSON.stringify(FDD_ANSWERS)]);
        await db.query(`INSERT INTO "ProjectFairFile" ("submissionId", "fileName", "fileUrl") VALUES ('sub-1', 'carta-aval.pdf', 'https://files.example.org/carta-aval.pdf')`);
        const paymentBefore = (await db.query('SELECT status, "workflowStatus", "amountCop", "amountUsd", "paidAt", "publicRef", email, "clubName" FROM "ProjectFairSubmission" WHERE id = $1', ['sub-1'])).rows[0];

        // 1–3 · Abrir, ver todo, documentos
        const g = await call(dossierCtl.getDossier, { params: { id: 'sub-1' }, query: Q, user: ADMIN });
        const gIdx = D.fieldIndex(g.body.dossier);
        ok('(1) el administrador abre el expediente', g.status === 200 && g.body.submission.publicRef === 'FP-TEST01');
        ok('(2) ve todos los campos de las plantillas, también los vacíos', gIdx.size === submissionFieldCount + templateFieldCount && gIdx.get('master.sostenibilidad.sustainability').filled === false);
        ok('(2) con los valores reales de la base', gIdx.get('fdd_2026_2027.presupuesto.budgetBreakdown').value.length === 2);
        ok('(3) ve los documentos adjuntos', g.body.documents.files.some(f => f.fileName === 'carta-aval.pdf'));
        ok('el administrador tiene editar, traducir, aprobar y exportar', ['edit', 'translate', 'approveTranslation', 'export'].every(k => g.body.access[k]));
        const other = await call(dossierCtl.getDossier, { params: { id: 'sub-otra' }, query: Q, user: ADMIN });
        ok('(18) cambiar el id en la URL por un proyecto de OTRA edición → 404', other.status === 404);

        // 4–6 · Editar, guardar, historial
        const e1 = await call(dossierCtl.updateDossier, { params: { id: 'sub-1' }, query: Q, user: ADMIN, body: {
            edits: [
                { path: 'master.objetivos.generalObjective', value: 'Garantizar agua potable a 320 familias de la vereda en 2027.', before: MASTER_ANSWERS.objetivos.generalObjective },
                { path: 'submission.projectDescription', value: 'Instalar 15 filtros comunitarios para 300 familias.', before: SUB.projectDescription },
            ], reason: 'Corrección enviada por el club por correo' } });
        ok('(4) edita dos campos autorizados', e1.status === 200 && e1.body.changed.length === 2, JSON.stringify(e1.body).slice(0, 200));
        const m = (await db.query('SELECT answers, "completionPct" FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', ['sub-1'])).rows[0];
        ok('(5) se guardó en la tabla del formulario, mezclado (las demás respuestas intactas)', m.answers.objetivos.generalObjective.includes('320') && m.answers.objetivos.projectDescription === MASTER_ANSWERS.objetivos.projectDescription && m.answers.contacto.contactEmail === 'paula@example.org');
        const s1 = (await db.query('SELECT "projectDescription" FROM "ProjectFairSubmission" WHERE id = $1', ['sub-1'])).rows[0];
        ok('(5) y en la columna de la postulación', s1.projectDescription.includes('15 filtros'));
        const h = await call(dossierCtl.getDossierHistory, { params: { id: 'sub-1' }, query: Q, user: ADMIN });
        const rev = h.body.revisions.find(r => r.path === 'master.objetivos.generalObjective');
        ok('(6) historial campo a campo: anterior, nuevo, usuario, fecha y motivo', rev && rev.before.includes('300') && rev.after.includes('320') && rev.actorName === ADMIN.email && rev.reason.includes('correo') && rev.createdAt);
        const fr = (await db.query(`SELECT action, "actorType" FROM "ProjectFairFormRevision" WHERE "submissionId" = 'sub-1' AND "formKey" = 'master' ORDER BY "createdAt" DESC LIMIT 1`)).rows[0];
        ok('(6) el formulario registra que fue una edición ADMINISTRATIVA', fr?.action === 'admin_edit' && fr?.actorType === 'admin');
        const evt = (await db.query(`SELECT * FROM "ProjectFairEvent" WHERE "submissionId" = 'sub-1' AND type = 'dossier_edited'`)).rows[0];
        ok('(6) y queda en el historial del proyecto', !!evt && /2 campos/.test(evt.title));
        const conflict = await call(dossierCtl.updateDossier, { params: { id: 'sub-1' }, query: Q, user: ADMIN, body: { edits: [{ path: 'master.objetivos.generalObjective', value: 'Pisar', before: MASTER_ANSWERS.objetivos.generalObjective }] } });
        ok('editar sobre un valor viejo → 409, no pisa', conflict.status === 409 && (await db.query('SELECT answers FROM "ProjectFairMasterForm" WHERE "submissionId" = $1', ['sub-1'])).rows[0].answers.objetivos.generalObjective.includes('320'));
        const noReason = await call(dossierCtl.updateDossier, { params: { id: 'sub-1' }, query: Q, user: ADMIN, body: { edits: [{ path: 'fdd_2026_2027.fdd.requestedUsd', value: '25000', before: '20000' }] } });
        ok('cambiar cifras sin motivo → 400', noReason.status === 400 && noReason.body.needsReason);
        const lockedEdit = await call(dossierCtl.updateDossier, { params: { id: 'sub-1' }, query: Q, user: ADMIN, body: { edits: [{ path: 'submission.email', value: 'x@y.org' }] } });
        ok('el correo de acceso no se puede cambiar por aquí → 403', lockedEdit.status === 403);

        // 16 · Permisos en el servidor
        const trEdit = await call(dossierCtl.updateDossier, { params: { id: 'sub-1' }, query: Q, user: TRANSLATOR, body: { edits: [{ path: 'master.necesidades.needs', value: 'x' }] } });
        ok('(16) un traductor NO puede editar la postulación → 403', trEdit.status === 403);
        const viewTr = await call(dossierCtl.generateTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: VIEWER, body: {} });
        ok('(16) un perfil de sólo lectura NO puede traducir → 403', viewTr.status === 403);
        const viewDoc = await call(dossierCtl.getDocument, { params: { id: 'sub-1' }, query: { ...Q, lang: 'es' }, user: VIEWER });
        ok('(18) un perfil de sólo lectura NO puede descargar fichas → 403', viewDoc.status === 403);
        const viewRead = await call(dossierCtl.getDossier, { params: { id: 'sub-1' }, query: Q, user: VIEWER });
        // v4.1326 — Sin perfil en la Feria (otro sitio, sin lista) no se lee
        // nada: el expediente lleva documento, correo y teléfono.
        ok('… y tampoco leer el expediente (v4.1326: sin perfil no se ve nada) → 403', viewRead.status === 403 && viewRead.body?.code === 'NO_FAIR_PROFILE');
        const revRead = await call(dossierCtl.getDossier, { params: { id: 'sub-1' }, query: Q, user: REVIEWER });
        ok('… el perfil de lectura de la convocatoria (revisores) sí lo lee, sin editar', revRead.status === 200 && revRead.body.access.edit === false);

        // 7 · Traducir (con el perfil de traductor)
        const t1 = await call(dossierCtl.generateTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR, body: {} });
        ok('(7) el traductor genera la traducción completa', t1.status === 200 && t1.body.translated === items.length && t1.body.status.state === 'pending_review', JSON.stringify(t1.body).slice(0, 300));
        const allSent = sent.map(x => x.user).join('\n');
        ok('al proveedor sólo viajaron textos narrativos: ni documento, ni teléfono, ni correo del responsable', !allSent.includes('1088000000') && !allSent.includes('3176547111') && !allSent.includes('paula@example.org'));
        ok('la instrucción llevó la terminología aprobada', sent[0].system.includes('"Club Rotario" → "Rotary Club"'));
        const hdr = (await db.query(`SELECT status FROM "ProjectDossierTranslation" WHERE "submissionId" = 'sub-1'`)).rows[0];
        ok('el candado de generación quedó liberado', hdr.status === 'idle');
        await db.query(`UPDATE "ProjectDossierTranslation" SET status = 'generating', "startedAt" = NOW() WHERE "submissionId" = 'sub-1'`);
        const busy = await call(dossierCtl.generateTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR, body: { paths: ['master.necesidades.needs'] } });
        ok('dos generaciones a la vez → 409', busy.status === 409);
        await db.query(`UPDATE "ProjectDossierTranslation" SET status = 'idle' WHERE "submissionId" = 'sub-1'`);

        // 8 · Revisar y corregir; regenerar un campo sin tocar los demás
        const tr = await call(dossierCtl.getTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR });
        const corrected = tr.body.status.fields.map(f => ({ path: f.path, text: f.path === 'master.necesidades.needs' ? 'The rural village has no water supply system.' : f.text, reviewed: true }));
        const sv = await call(dossierCtl.saveTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR, body: { fields: corrected } });
        ok('(8) corrige un campo y marca todo como revisado', sv.status === 200 && sv.body.status.state === 'reviewed');
        const before = (await db.query(`SELECT path, text FROM "ProjectDossierTranslationField" WHERE "submissionId" = 'sub-1'`)).rows;
        const one = await call(dossierCtl.generateTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR, body: { paths: ['master.objetivos.generalObjective'] } });
        const after = (await db.query(`SELECT path, text, reviewed FROM "ProjectDossierTranslationField" WHERE "submissionId" = 'sub-1'`)).rows;
        ok('regenerar UN campo no sobrescribe los demás', one.status === 200 && after.filter(r => r.path !== 'master.objetivos.generalObjective').every(r => before.find(b => b.path === r.path).text === r.text));
        ok('… y el corregido a mano sigue igual', after.find(r => r.path === 'master.necesidades.needs').text === 'The rural village has no water supply system.');
        const all2 = await call(dossierCtl.generateTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR, body: {} });
        ok('«regenerar todo» respeta lo revisado y lo corregido', all2.status === 200 && all2.body.translated <= 1);
        await call(dossierCtl.saveTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR, body: { fields: [{ path: 'master.objetivos.generalObjective', text: (await call(dossierCtl.getTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR })).body.status.fields.find(f => f.path === 'master.objetivos.generalObjective').text, reviewed: true }] } });

        // 9 · Aprobar
        const trApprove = await call(dossierCtl.approveTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: TRANSLATOR, body: {} });
        ok('(16) el traductor NO aprueba → 403', trApprove.status === 403);
        const ap = await call(dossierCtl.approveTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: REVIEWER, body: { note: 'Revisada por el comité' } });
        ok('(9) la revisora aprueba: versión 1 inmutable', ap.status === 200 && ap.body.version.versionNumber === 1 && ap.body.status.state === 'approved', JSON.stringify(ap.body).slice(0, 300));

        // 10–12 · Fichas
        const es = await call(dossierCtl.getDocument, { params: { id: 'sub-1' }, query: { ...Q, lang: 'es' }, user: TRANSLATOR });
        const esIdx = D.fieldIndex(es.body.es);
        ok('(10) ficha en español con los datos del expediente', es.status === 200 && esIdx.get('submission.projectDescription').value.includes('15 filtros'));
        ok('(10) sin documento de identidad ni contacto del responsable', !esIdx.has('submission.document') && !esIdx.has('submission.email') && !JSON.stringify(es.body).includes('1088000000'));
        ok('(10) sin datos de pago', !JSON.stringify(es.body).includes('250000') && !('amountCop' in es.body));
        const en = await call(dossierCtl.getDocument, { params: { id: 'sub-1' }, query: { ...Q, lang: 'en' }, user: TRANSLATOR });
        ok('(11) ficha en inglés desde la versión APROBADA', en.body.translation.mode === 'approved' && en.body.translation.versionNumber === 1 && D.fieldIndex(en.body.en).get('master.necesidades.needs').valueEn === 'The rural village has no water supply system.');
        const bi = await call(dossierCtl.getDocument, { params: { id: 'sub-1' }, query: { ...Q, lang: 'bilingual' }, user: TRANSLATOR });
        ok('(12) ficha bilingüe: las dos versiones completas', bi.body.es && bi.body.en && bi.body.kind === 'bilingual');
        const exp = (await db.query(`SELECT * FROM "ProjectDossierExport" WHERE "submissionIds" ? 'sub-1'`)).rows;
        ok('cada descarga queda registrada (quién, qué, idioma)', exp.length >= 3 && exp.every(x => x.actorName === TRANSLATOR.email));

        // 13–15 · Cambiar el original después de aprobar
        await call(dossierCtl.updateDossier, { params: { id: 'sub-1' }, query: Q, user: ADMIN, body: { edits: [{ path: 'master.necesidades.needs', value: 'La vereda no tiene acueducto ni alcantarillado.', before: 'La vereda no tiene acueducto.' }] } });
        const tr2 = await call(dossierCtl.getTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: ADMIN });
        ok('(13–14) el sistema detecta que la traducción quedó desactualizada', tr2.body.status.state === 'outdated' && tr2.body.status.fields.find(f => f.path === 'master.necesidades.needs').state === 'outdated');
        ok('(14) sólo el campo cambiado', tr2.body.status.counts.outdated === 1);
        ok('(15) la versión aprobada se conserva', tr2.body.versions.length === 1);
        const en2 = await call(dossierCtl.getDocument, { params: { id: 'sub-1' }, query: { ...Q, lang: 'en' }, user: ADMIN });
        ok('(15) la ficha inglesa sigue usando lo aprobado y avisa que el original cambió', en2.body.translation.mode === 'approved' && en2.body.translation.outdatedSinceApproval === true);
        const blocked = await call(dossierCtl.approveTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: REVIEWER, body: {} });
        ok('no se puede re-aprobar con un campo desactualizado', blocked.status === 400);

        // 17 · Cifras
        mode = 'cifras';
        const cf = await call(dossierCtl.generateTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: ADMIN, body: { paths: ['submission.projectDescription'] } });
        const cfField = cf.body.status.fields.find(f => f.path === 'submission.projectDescription');
        ok('(17) si la IA cambia una cifra, el campo queda marcado', cfField.warnings.some(w => w.code === 'numbers'));
        mode = 'ok';

        // Lotes y estado documental
        const bulk = await call(dossierCtl.getDocumentsBulk, { query: Q, user: TRANSLATOR, body: { ids: ['sub-1', 'sub-otra'], lang: 'bilingual' } });
        ok('(18) la exportación en lote excluye lo que está fuera de la edición y lo dice', bulk.status === 200 && bulk.body.documents.length === 1 && bulk.body.skipped.includes('sub-otra'));
        const states = await call(dossierCtl.getDossierStates, { query: { ...Q, ids: 'sub-1,sub-otra' }, user: ADMIN });
        ok('estado documental de varias filas en una llamada (y sólo de la edición)', states.body.states['sub-1']?.en.state === 'outdated' && !states.body.states['sub-otra']);

        // Libreta
        const prep = await call(dossierCtl.prepareBooklet, { params: { id: 'sub-1' }, query: Q, user: TRANSLATOR, body: { lang: 'en' } });
        ok('libreta en inglés preparada desde la traducción aprobada', prep.status === 200 && prep.body.translationMode === 'approved' && /^EN: /.test(prep.body.proposal.blocks.find(b => b.key === 'objective').text));
        const content = { blocks: prep.body.proposal.blocks.map(b => (b.key === 'message' ? { ...b, text: 'Safe water for 7777 people.' } : b)) };
        const saved = await call(dossierCtl.saveBooklet, { params: { id: 'sub-1' }, query: Q, user: TRANSLATOR, body: { lang: 'en', content } });
        ok('guardar la libreta crea la versión 1 y detecta la cifra inventada', saved.status === 201 && saved.body.booklet.versionNumber === 1 && saved.body.audit.length === 1);
        const apb = await call(dossierCtl.approveBooklet, { params: { id: 'sub-1' }, query: Q, user: REVIEWER, body: { lang: 'en' } });
        ok('aprobarla con esa cifra exige confirmación', apb.status === 409 && apb.body.needsAcknowledge);
        const apb2 = await call(dossierCtl.approveBooklet, { params: { id: 'sub-1' }, query: Q, user: REVIEWER, body: { lang: 'en', acknowledge: true } });
        ok('confirmada, queda aprobada', apb2.status === 200 && apb2.body.booklet.status === 'approved');

        // Glosario
        const gl = await call(dossierCtl.saveGlossaryEntry, { query: Q, user: ADMIN, body: { source: 'Vereda', target: 'Rural village', kind: 'term' } });
        ok('el comité agrega un término al glosario', gl.status === 201 && gl.body.entries.some(e => e.source === 'Vereda'));
        const glTr = await call(dossierCtl.saveGlossaryEntry, { query: Q, user: TRANSLATOR, body: { source: 'X', target: 'Y' } });
        ok('un traductor no administra el glosario → 403', glTr.status === 403);
        sent.length = 0;
        await call(dossierCtl.generateTranslation, { params: { id: 'sub-1', lang: 'en' }, query: Q, user: ADMIN, body: { paths: ['master.necesidades.needs'] } });
        ok('la siguiente traducción ya lo usa', sent[0]?.system.includes('"Vereda" → "Rural village"'));

        // 20 · Nada de esto tocó el pago ni el estado
        const paymentAfter = (await db.query('SELECT status, "workflowStatus", "amountCop", "amountUsd", "paidAt", "publicRef", email, "clubName" FROM "ProjectFairSubmission" WHERE id = $1', ['sub-1'])).rows[0];
        ok('(20) estado, pago, valores, referencia, correo y club quedaron intactos', JSON.stringify(paymentAfter) === JSON.stringify(paymentBefore), `${JSON.stringify(paymentBefore)} → ${JSON.stringify(paymentAfter)}`);
    } catch (err) {
        fail++;
        console.log(`  ✗ la prueba con Postgres se interrumpió: ${err?.stack || err}`);
    } finally {
        for (const t of Object.keys(OWNED_COLUMNS)) await db.query(`DROP TABLE IF EXISTS "${t}"`).catch(() => {});
        await db.query(`DELETE FROM "ProjectFairSubmission" WHERE id = ANY($1)`, [['sub-1', 'sub-otra']]).catch(() => {});
        await db.query(`DELETE FROM "ProjectFairMasterForm" WHERE "submissionId" = 'sub-1'`).catch(() => {});
        await db.query(`DELETE FROM "ProjectFairProjectForm" WHERE "submissionId" = 'sub-1'`).catch(() => {});
        await db.pool.end().catch(() => {});
        globalThis.fetch = realFetch;
    }
}

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
