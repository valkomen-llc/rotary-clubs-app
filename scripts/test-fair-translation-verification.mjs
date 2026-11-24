#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Verificación y seguimiento de traducciones por Cadres.
//                                  npm run test:fair:translation-verification
// v4.1356.0
//
// 1–5 sin base y sin red: el CRITERIO (`server/lib/translationTracking.js`) —
// estados del seguimiento, porcentajes, regla de verificación, vigencia,
// filtros, indicadores, carga por Cadre, recordatorios — y las invariantes
// leídas de los archivos (rutas, permisos, que nada toque pagos ni estados).
//
// 6 contra Postgres DE VERDAD y los manejadores reales, si se le da una base
// desechable LOCAL (crea las tablas del módulo; la IA y el correo simulados):
//   TRANSLATION_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/tr_test npm run test:fair:translation-verification
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const URL_DB = process.env.TRANSLATION_TEST_DATABASE_URL || '';
if (URL_DB) {
    if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_DB)) { console.error('Sólo contra una base LOCAL y desechable.'); process.exit(1); }
    process.env.DATABASE_URL = URL_DB;
    process.env.GEMINI_API_KEY = 'clave-de-prueba';
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); } };
const leer = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const T = (await import('../server/lib/translationTracking.js')).default;
const D = (await import('../server/lib/projectDossier.js')).default;

// ── Ayudas para fabricar estados ────────────────────────────────────────────
const items = ['a', 'b', 'c', 'd'].map((k, i) => ({ path: `p.${k}`, fieldPath: `p.${k}`, label: `Campo ${k}`, labelEn: null, text: `Texto ${k} con ${i + 1} cifras`, hash: D.hashOf(`Texto ${k} con ${i + 1} cifras`), groupKey: 'g', sectionTitle: 's' }));
const rowFor = (it, extra = {}) => ({ path: it.path, sourceHash: it.hash, sourceText: it.text, text: `EN ${it.text}`, origin: 'ai', reviewed: false, warnings: [], ...extra });
const statusOf = (fieldRows, header = null) => D.translationStatus({ items, fieldRows, header });
const verifiedHeader = (fieldRows, extra = {}) => ({ approvedAt: '2026-11-20T15:00:00Z', approvedBy: 'cadre@feria.org', approvedRole: 'cadre', approvalKind: 'verification', approvedVersionId: 'v1', approvedVersionNumber: 1, approvedFingerprint: D.fingerprintOf(fieldRows), ...extra });

console.log('\n1. Estados del seguimiento y porcentajes');
const none = T.trackingOf(statusOf([]));
ok('sin filas → Sin traducir, 0 %', none.state === 'untranslated' && none.translatedPct === 0 && none.reviewedPct === 0);
ok('sin textos para traducir → «Sin textos» (no cuenta como pendiente)', T.trackingOf(D.translationStatus({ items: [], fieldRows: [] })).state === 'no_content');
const half = T.trackingOf(statusOf(items.slice(0, 2).map(i => rowFor(i))));
ok('2 de 4 traducidos → En progreso, traducción 50 %, revisión 0 %', half.state === 'in_progress' && half.translatedPct === 50 && half.reviewedPct === 0);
const allDraft = T.trackingOf(statusOf(items.map(i => rowFor(i))));
ok('todo traducido por IA sin revisar → Pendiente de revisión (la IA NO cuenta como revisada)', allDraft.state === 'pending_review' && allDraft.translatedPct === 100 && allDraft.reviewedPct === 0);
const threeQ = T.trackingOf(statusOf(items.map((i, n) => rowFor(i, { reviewed: n < 3 }))));
ok('3 de 4 revisados → En revisión, traducción 100 %, revisión 75 %', threeQ.state === 'in_review' && threeQ.translatedPct === 100 && threeQ.reviewedPct === 75);
ok('lista para verificar sólo con todo revisado', !threeQ.readyToVerify && T.trackingOf(statusOf(items.map(i => rowFor(i, { reviewed: true })))).readyToVerify);
ok('pctOf nunca redondea a 100 lo incompleto (199/200 → 99)', T.pctOf(199, 200) === 99 && T.pctOf(200, 200) === 100 && T.pctOf(0, 0) === null);
const allRev = items.map(i => rowFor(i, { reviewed: true, reviewedBy: 'cadre@feria.org' }));
const ver = T.trackingOf(statusOf(allRev, verifiedHeader(allRev)), verifiedHeader(allRev));
ok('verificada con la huella vigente → Verificada (vigente), con quién y versión', ver.state === 'verified' && ver.verification.vigente && ver.verification.by === 'cadre@feria.org' && ver.verification.versionNumber === 1);
const legacyHeader = { ...verifiedHeader(allRev), approvalKind: null };
const legacy = T.trackingOf(statusOf(allRev, legacyHeader), legacyHeader);
ok('aprobación HEREDADA (antes de v4.1356) → NO se certifica retroactivamente', legacy.state === 'in_review' && legacy.legacyApproved && legacy.verification.kind === 'legacy' && !legacy.verification.vigente);
// El original cambia después de verificar
const items2 = items.map((it, n) => (n === 1 ? { ...it, text: 'Texto b cambiado', hash: D.hashOf('Texto b cambiado') } : it));
const st2 = D.translationStatus({ items: items2, fieldRows: allRev, header: verifiedHeader(allRev) });
const upd = T.trackingOf(st2, verifiedHeader(allRev));
ok('cambia el original tras verificar → Requiere actualización (pierde vigencia)', upd.state === 'needs_update' && !upd.verification.vigente);
const inv = T.invalidationOf(st2, verifiedHeader(allRev));
ok('la invalidación identifica SÓLO el campo afectado', inv && inv.paths.length === 1 && inv.paths[0].path === 'p.b');
ok('… y se registra una sola vez por versión', T.invalidationOf(st2, verifiedHeader(allRev, { invalidatedAt: '2026-11-21T00:00:00Z', invalidatedVersionId: 'v1' })) === null);
// Retraducido el campo afectado pero sin volver a verificar → sigue «Requiere actualización»
const retrad = allRev.map(r => (r.path === 'p.b' ? { ...r, sourceHash: items2[1].hash, text: 'EN changed', reviewed: true } : r));
const hInv = verifiedHeader(allRev, { invalidatedAt: '2026-11-21T00:00:00Z', invalidatedVersionId: 'v1' });
ok('retraducido el campo, hasta volver a verificar sigue «Requiere actualización»', T.trackingOf(D.translationStatus({ items: items2, fieldRows: retrad, header: hInv }), hInv).state === 'needs_update');
// Editar la TRADUCCIÓN (no el original) tras verificar: vuelve a revisión, no «actualización»
const editT = allRev.map((r, n) => (n === 0 ? { ...r, text: 'EN otra', reviewed: false } : r));
ok('editar la traducción tras verificar → En revisión (no es un cambio del original)', T.trackingOf(statusOf(editT, verifiedHeader(allRev)), verifiedHeader(allRev)).state === 'in_review');
ok('cambiar el original y devolverlo a como estaba → vuelve a quedar vigente', T.trackingOf(statusOf(allRev, hInv), hInv).state === 'verified');
ok('sin una verificación, no hay nada que invalidar', T.invalidationOf(st2, null) === null && T.invalidationOf(st2, legacyHeader) === null);

console.log('\n2. La regla de verificación');
const stAll = statusOf(allRev);
ok('todo revisado y sin avisos → se puede', T.verificationCheck(stAll).ok);
ok('faltan campos → no', T.verificationCheck(statusOf(allRev.slice(0, 3))).code === 'missing');
ok('campos sin revisar → no', T.verificationCheck(statusOf(items.map(i => rowFor(i)))).code === 'unreviewed');
ok('campos desactualizados → no', T.verificationCheck(st2).code === 'outdated');
ok('generación en curso → no', T.verificationCheck({ ...stAll, state: 'generating' }).code === 'generating');
const withNum = statusOf(allRev.map((r, n) => (n === 0 ? { ...r, warnings: [{ code: 'numbers', message: 'Cifras' }] } : r)));
const c1 = T.verificationCheck(withNum);
ok('aviso de cifras SIN justificación → pide justificación', c1.code === 'needs_justification' && c1.needsJustification && c1.nonBlocking.length === 1);
ok('… con una justificación corta → sigue pidiéndola', T.verificationCheck(withNum, { justification: 'ok' }).code === 'needs_justification');
ok('… con justificación escrita → se puede', T.verificationCheck(withNum, { justification: 'La cifra está escrita en letras: two hospitals.' }).ok);
const withMail = statusOf(allRev.map((r, n) => (n === 0 ? { ...r, warnings: [{ code: 'emails', message: 'Correos' }] } : r)));
ok('correo o enlace cambiado → BLOQUEANTE, ni con justificación', T.verificationCheck(withMail, { justification: 'Lo revisé y está bien así de verdad.' }).code === 'blocking_warnings');
ok('el responsable del proyecto NO certifica lo suyo', T.verificationCheck(stAll, { actorEmail: 'Paula@Example.org', projectEmail: 'paula@example.org' }).code === 'self_certification');
ok('la huella que se tenía en pantalla debe coincidir (otro guardó) → conflicto', T.verificationCheck(stAll, { expectedFingerprint: 'a', currentFingerprint: 'b' }).code === 'changed');
const sum = T.verificationSummary(statusOf(allRev), { nextVersionNumber: 3 });
const draftAll = statusOf(items.map(i => rowFor(i)));
const asRev = T.asIfReviewed(draftAll);
ok('v4.1357 — «como si se marcaran»: los traducidos cuentan como revisados', asRev.counts.draft === 0 && asRev.counts.reviewed === 4 && T.verificationCheck(asRev).ok && !T.verificationCheck(draftAll).ok);
ok('v4.1357 — … pero un faltante o un desactualizado sigue bloqueando', T.verificationCheck(T.asIfReviewed(statusOf(items.slice(0, 3).map(i => rowFor(i))))).code === 'missing' && T.verificationCheck(T.asIfReviewed(st2)).code === 'outdated');
ok('resumen para la ventana: traducidos, revisados, avisos, revisores y versión', sum.total === 4 && sum.reviewed === 4 && sum.translated === 4 && sum.reviewers['cadre@feria.org'] === 4 && sum.nextVersionNumber === 3);

console.log('\n3. Filtros, orden, indicadores y carga por Cadre');
const A = (state, extra = {}) => ({ state, total: 4, translated: 4, reviewed: 0, translatedPct: 100, reviewedPct: 0, warnings: 0, readyToVerify: false, assignee: null, verification: null, ...extra });
const list = [
    A('untranslated', { translated: 0, translatedPct: 0 }),
    A('in_progress', { translated: 2, translatedPct: 50, assignee: { email: 'cadre@feria.org' } }),
    A('pending_review', { warnings: 2, assignee: { email: 'cadre@feria.org' } }),
    A('in_review', { reviewed: 3, reviewedPct: 75, assignee: { email: 'otra@feria.org' } }),
    A('verified', { reviewed: 4, reviewedPct: 100, assignee: { email: 'cadre@feria.org' }, verification: { at: '2026-11-20T15:00:00Z', vigente: true } }),
    A('needs_update', { reviewed: 3, reviewedPct: 75, assignee: { email: 'otra@feria.org' } }),
    { ...A('no_content'), total: 0, translated: 0, translatedPct: null, reviewedPct: null },
];
const f = (q) => list.filter(t => T.matchesTranslationFilters(t, q)).map(t => t.state).join(',');
ok('vista «verificada»', f({ tr: 'verificada' }) === 'verified');
ok('vista «desactualizada»', f({ tr: 'desactualizada' }) === 'needs_update');
ok('vista «no verificada» excluye lo verificado y lo vacío', f({ tr: 'no_verificada' }) === 'untranslated,in_progress,pending_review,in_review,needs_update');
ok('vista «con avisos»', f({ tr: 'con_avisos' }) === 'pending_review');
ok('por Cadre (sin distinguir mayúsculas)', f({ trCadre: 'CADRE@feria.org' }) === 'in_progress,pending_review,verified');
ok('sin Cadre asignado', f({ trCadre: 'none' }) === 'untranslated,no_content' && f({ tr: 'sin_cadre' }) === 'untranslated');
ok('por fecha de verificación (día de Colombia)', f({ trDesde: '2026-11-20', trHasta: '2026-11-20' }) === 'verified' && f({ trDesde: '2026-11-21' }) === '');
ok('se combinan (Cadre + vista)', f({ trCadre: 'otra@feria.org', tr: 'desactualizada' }) === 'needs_update');
ok('`trCadre=me` lo resuelve el servidor con la sesión', T.resolveCadreQuery({ trCadre: 'me' }, 'Cadre@Feria.org').trCadre === 'cadre@feria.org' && T.resolveCadreQuery({ trCadre: 'me' }, '').trCadre === '__nadie__');
ok('hay consulta de traducción con vista, Cadre, fecha u orden', T.hasTranslationQuery({ tr: 'verificada' }) && T.hasTranslationQuery({ sortBy: 'trReviewed' }) && !T.hasTranslationQuery({ tr: 'all' }) && !T.hasTranslationQuery({ tr: 'inventada' }));
const sorted = [...list].sort((a, b) => T.translationSortValue(a, 'trState') - T.translationSortValue(b, 'trState')).map(t => t.state);
ok('orden por estado: de sin textos a verificada', sorted[0] === 'no_content' && sorted.at(-1) === 'verified');
const k = T.summarizeTranslations(list);
ok('indicadores: aplicables sin los vacíos', k.total === 7 && k.applicable === 6 && k.noContent === 1);
ok('indicadores: uno por estado', k.untranslated === 1 && k.inProgress === 1 && k.pendingReview === 1 && k.inReview === 1 && k.verified === 1 && k.needsUpdate === 1);
ok('indicadores: % general verificado sobre los aplicables (1/6 → 16 %)', k.verifiedPct === 16);
const wl = T.workloadByCadre(list.map(t => ({ tracking: t })));
const cad = wl.find(w => w.email === 'cadre@feria.org');
ok('carga por Cadre: asignados, verificados y pendientes', cad.assigned === 3 && cad.verified === 1 && cad.pending === 2 && wl.length === 2);
ok('fecha límite: días que faltan en calendario de Colombia', T.daysToDeadline('2026-11-30', Date.parse('2026-11-24T18:00:00Z')) === 6 && T.daysToDeadline(null) === null);
ok('configuración saneada (fecha inválida fuera, avisos encendidos por defecto)', (() => { const c = T.normalizeTranslationConfig({ deadline: '30/11/2026' }); return c.deadline === null && c.notifyOnInvalidation && c.notifyOnAssignment; })());

console.log('\n4. Recordatorios');
ok('no se recuerda lo verificado ni lo que no tiene Cadre', !T.reminderVerdict(list[4]).ok && T.reminderVerdict(list[0]).code === 'unassigned' && T.reminderVerdict(list[1]).ok);
const groups = T.groupByCadre([{ send: true, cadreEmail: 'a@x.org', id: 1 }, { send: true, cadreEmail: 'A@x.org', id: 2 }, { send: false, cadreEmail: 'b@x.org', id: 3 }]);
ok('un correo por Cadre con todos sus proyectos', groups.length === 1 && groups[0].projects.length === 2);
ok('huella del envío: mismo Cadre, mismos proyectos, mismo día', T.reminderDedupeKey('a@x.org', ['2', '1'], Date.parse('2026-11-24T12:00:00Z')) === T.reminderDedupeKey('A@x.org', ['1', '2'], Date.parse('2026-11-24T20:00:00Z')));
ok('CSV: tantas celdas como encabezados', T.translationCsvValues(list[4]).length === T.TRANSLATION_CSV_HEADERS.length && T.translationCsvValues(null).length === T.TRANSLATION_CSV_HEADERS.length);

console.log('\n5. Invariantes del código');
const ctrl = leer('server/controllers/projectDossierController.js');
const admin = leer('server/controllers/projectFairAdminController.js');
const routes = leer('server/routes/project-fair.js');
const store = leer('server/lib/translationTrackingStore.js');
const schema = leer('server/lib/ensureProjectDossierSchema.js');
ok('«Verificar» y «Aprobar» son el MISMO manejador (no hay dos procesos)', /export const verifyTranslation = approveTranslation;/.test(ctrl));
for (const r of ['/admin/traducciones\'', '/admin/traducciones/config', '/admin/traducciones/asignar', '/admin/traducciones/recordatorios', '/traduccion/:lang/verificar', '/traduccion/:lang/revocar']) {
    ok(`ruta ${r} montada`, routes.includes(r));
}
ok('las rutas literales /admin/traducciones van antes de cualquier /:id', routes.indexOf("'/admin/traducciones'") < routes.indexOf("'/admin/postulaciones/:id'"));
ok('el perfil cadre verifica, no ve pagos, no edita, no asigna', /cadre:\s+\{ view: true, managePayments: false, viewPayments: false[^}]*edit: false[^}]*translate: true, approveTranslation: true[^}]*manageTranslation: false/.test(admin));
ok('sólo el administrador tiene manageTranslation', (admin.match(/manageTranslation: true/g) || []).length === 1 && /admin:\s+\{[^}]*manageTranslation: true/.test(admin));
ok('la lista de Cadres de la convocatoria da el perfil cadre', /listHas\(access\.cadres, email\)\) role = 'cadre'/.test(admin));
// Las escrituras NUEVAS de la verificación (la cabecera también guarda el
// estado de la GENERACIÓN —`SET status = 'generating'`—, que es suyo).
const sqlWrites = [...ctrl.matchAll(/(UPDATE|INSERT INTO) "ProjectDossierTranslation"[\s\S]*?(WHERE|RETURNING|`)/g), ...store.matchAll(/UPDATE "ProjectDossierTranslation"[\s\S]*?WHERE/g)]
    .map(m => m[0]).filter(w => /approvalKind|invalidated|revoked|assignee/.test(w));
ok('la verificación no escribe pagos ni estados de la postulación', sqlWrites.length >= 2 && sqlWrites.every(w => !/"workflowStatus"|"amount|"paidAt"|SET status\b/.test(w)) && !/UPDATE "ProjectFairSubmission"/.test(store));
ok('la verificación se vuelve a leer DENTRO del candado', /pg_advisory_xact_lock[\s\S]{0,400}loadDossier\(fresh, client\)/.test(ctrl));
ok('la pérdida de vigencia se registra con UPDATE condicional (una vez)', /"invalidatedVersionId" IS DISTINCT FROM "approvedVersionId"/.test(store));
ok('guardar el formulario del club comprueba la vigencia', /checkTranslationValidity\(submission\.id\)/.test(leer('server/controllers/projectFormsController.js')));
ok('editar el expediente y la postulación comprueba la vigencia', /checkTranslationValidity\(row\.id\)/.test(ctrl) && /checkTranslationValidity\(req\.params\.id\)/.test(admin));
ok('la bitácora nueva está en OWNED_COLUMNS', /ProjectDossierTranslationEvent: \[\]/.test(schema));
ok('la tabla nueva está en la lista protegida de CLAUDE.md', leer('CLAUDE.md').includes('`ProjectDossierTranslationEvent`'));
ok('ninguna comilla invertida dentro de los SQL nuevos del store', !/db\.query\(`[^`]*\\`/.test(store));

// ════════════════════════════════════════════════════════════════════════════
// 6 — Contra Postgres de verdad
// ════════════════════════════════════════════════════════════════════════════
if (!URL_DB) {
    console.log('\n6. Postgres real: OMITIDO (define TRANSLATION_TEST_DATABASE_URL con una base LOCAL desechable)');
} else {
    console.log('\n6. Los manejadores reales contra Postgres');
    const realFetch = globalThis.fetch;
    let mode = 'ok';
    globalThis.fetch = async (url, init) => {
        if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
        const body = JSON.parse(init.body);
        const { items: list2 } = JSON.parse(body.contents.at(-1).parts[0].text);
        const translations = list2.map(it => ({ id: it.id, text: mode === 'cifras' ? `EN: ${it.text.replace(/\d+/, 'many')}` : `EN: ${it.text}` }));
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ translations }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { default: EmailService } = await import('../server/services/EmailService.js');
    const mails = [];
    EmailService.sendPlatformEmail = async ({ to, subject, html }) => { mails.push({ to, subject, html }); return { success: true, id: `m${mails.length}` }; };

    const db = (await import('../server/lib/db.js')).default;
    const ctl = (await import('../server/controllers/projectDossierController.js')).default;
    const fair = (await import('../server/controllers/projectFairAdminController.js')).default;
    const { checkTranslationValidity } = await import('../server/lib/translationTrackingStore.js');
    const { DEFAULT_MASTER_FORM } = await import('../server/lib/projectFairMasterForm.js');
    const call = (handler, { params = {}, query = {}, body = {}, user }) => new Promise((resolve, reject) => {
        const res = {
            statusCode: 200, headers: {},
            status(c) { this.statusCode = c; return this; },
            json(b) { resolve({ status: this.statusCode, body: b }); return this; },
            setHeader(k, v) { this.headers[k] = v; }, send(b) { resolve({ status: this.statusCode, body: b }); },
        };
        Promise.resolve(handler({ params, query, body, user, headers: { host: 'localhost' } }, res)).catch(reject);
    });
    const ADMIN = { id: 'u-admin', role: 'administrator', email: 'admin@feria.org' };
    const CADRE = { id: 'u-cadre', role: 'editor', email: 'cadre@feria.org' };
    const CADRE_RESP = { id: 'u-cadre2', role: 'editor', email: 'paula@example.org' };
    const TRANSLATOR = { id: 'u-tr', role: 'editor', email: 'traductora@feria.org' };
    const VIEWER = { id: 'u-view', role: 'club_admin', email: 'miron@club.org' };
    const Q = { evento: 'evt-tr' };
    const SUBS = ['tr-1', 'tr-2', 'tr-3', 'tr-otra'];

    try {
        await call(ctl.getGlossary, { query: Q, user: ADMIN }); // crea las tablas del módulo
        await db.query(`CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, "clubId" TEXT, password TEXT)`);
        await db.query(`INSERT INTO "User" (id, email, name, role) VALUES ('u-cadre','cadre@feria.org','Carlos Cadre','editor') ON CONFLICT (id) DO NOTHING`);
        await db.query(`INSERT INTO "ProjectFairConfig" (key, "eventId", config) VALUES ('evt-tr', 'evt-tr', $1::jsonb) ON CONFLICT (key) DO UPDATE SET config = EXCLUDED.config`,
            [JSON.stringify({ access: { cadres: [CADRE.email, CADRE_RESP.email], translators: [TRANSLATOR.email] }, edition: { name: 'XII Feria' } })]);
        await db.query('DELETE FROM "ProjectFairSubmission" WHERE id = ANY($1)', [SUBS]);
        await db.query('DELETE FROM "ProjectDossierTranslation" WHERE "submissionId" = ANY($1)', [SUBS]);
        await db.query('DELETE FROM "ProjectDossierTranslationField" WHERE "submissionId" = ANY($1)', [SUBS]);
        await db.query('DELETE FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = ANY($1)', [SUBS]);
        await db.query('DELETE FROM "ProjectDossierTranslationEvent" WHERE "eventId" = $1 OR "submissionId" = ANY($2)', ['evt-tr', SUBS]);
        await db.query('DELETE FROM "ProjectFairMasterForm" WHERE "submissionId" = ANY($1)', [SUBS]);
        await db.query('DELETE FROM "ProjectDossierRevision" WHERE "submissionId" = ANY($1)', [SUBS]);
        const cols = ['id', 'publicRef', 'eventId', 'firstName', 'lastName', 'email', 'clubName', 'district', 'projectName', 'projectDescription', 'status', 'workflowStatus', 'amountCop', 'paidAt', 'appliedAt'];
        const ins = (row) => db.query(`INSERT INTO "ProjectFairSubmission" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map(c => row[c] ?? null));
        const base = { eventId: 'evt-tr', firstName: 'Paula', lastName: 'Cruz', clubName: 'Pereira del Café', district: 'Rotary Distrito 4281', status: 'paid', workflowStatus: 'received', amountCop: '250000', paidAt: '2026-10-01T00:00:00Z', appliedAt: '2026-10-01T00:00:00Z' };
        await ins({ ...base, id: 'tr-1', publicRef: 'FP-TR0001', email: 'paula@example.org', projectName: 'Cuna de Vida: unidades neonatales para Pereira', projectDescription: 'Dotar dos hospitales con 4 incubadoras.' });
        await ins({ ...base, id: 'tr-2', publicRef: 'FP-TR0002', email: 'otro@club.org', projectName: 'Agua para comunidades', projectDescription: 'Filtros para 300 familias de la vereda.' });
        await ins({ ...base, id: 'tr-3', publicRef: 'FP-TR0003', email: 'tres@club.org', projectName: 'Educación para todos', projectDescription: 'Bibliotecas en 5 escuelas rurales.' });
        await ins({ ...base, id: 'tr-otra', publicRef: 'FP-TROTRA', eventId: 'evt-otra', email: 'x@club.org', projectName: 'Otra edición', projectDescription: 'No debe verse.' });
        await db.query(`INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", status) VALUES ('tr-1', $1::jsonb, 50, 'draft')`,
            [JSON.stringify({ objetivos: { generalObjective: 'Reducir la mortalidad neonatal en Pereira tras el terremoto.' } })]);
        const before = (await db.query('SELECT id, status, "workflowStatus", "amountCop", "paidAt" FROM "ProjectFairSubmission" WHERE id = ANY($1) ORDER BY id', [SUBS])).rows;
        const P = (id) => ({ params: { id, lang: 'en' }, query: Q });

        // ── Traducir y revisar ────────────────────────────────────────────
        const g = await call(ctl.generateTranslation, { ...P('tr-1'), user: CADRE, body: {} });
        ok('el Cadre genera la traducción (edita traducciones)', g.status === 200 && g.body.translated >= 3, JSON.stringify(g.body).slice(0, 200));
        let t = await call(ctl.getTranslation, { ...P('tr-1'), user: CADRE });
        ok('recién generada: Pendiente de revisión, traducción 100 %, revisión 0 %', t.body.tracking.state === 'pending_review' && t.body.tracking.translatedPct === 100 && t.body.tracking.reviewedPct === 0);
        ok('la pantalla recibe la huella; sin campos marcados no se verifica «estricto» pero sí marcándolos en el paso (v4.1357)', t.body.verification.fingerprint && !t.body.verification.canVerify && t.body.verification.canVerifyMarkingReviewed && t.body.verification.blockedCode === null && t.body.verification.pendingReview > 0);
        const fieldsAll = t.body.status.fields;
        await call(ctl.saveTranslation, { ...P('tr-1'), user: CADRE, body: { fields: [{ path: fieldsAll[0].path, text: fieldsAll[0].text, reviewed: true }] } });
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: CADRE });
        ok('con un campo revisado: En revisión y el % de revisión sube', t.body.tracking.state === 'in_review' && t.body.tracking.reviewedPct > 0 && t.body.tracking.reviewedPct < 100);
        const early = await call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE, body: {} });
        ok('verificar con campos sin revisar → 400', early.status === 400 && early.body.code === 'unreviewed');
        await call(ctl.saveTranslation, { ...P('tr-1'), user: CADRE, body: { fields: fieldsAll.map(x => ({ path: x.path, text: x.text, reviewed: true })) } });
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: CADRE });
        ok('todo revisado: lista para verificar', t.body.tracking.readyToVerify && t.body.verification.canVerify && t.body.verification.summary.reviewed === t.body.status.total);

        // ── Permisos ─────────────────────────────────────────────────────
        ok('un traductor NO verifica → 403', (await call(ctl.verifyTranslation, { ...P('tr-1'), user: TRANSLATOR, body: {} })).status === 403);
        ok('un perfil sin Feria NO verifica → 403', (await call(ctl.verifyTranslation, { ...P('tr-1'), user: VIEWER, body: {} })).status === 403);
        const self = await call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE_RESP, body: {} });
        ok('un Cadre que es responsable del proyecto NO lo certifica → 403', self.status === 403 && self.body.code === 'self_certification');
        const stale = await call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE, body: { expectedFingerprint: 'huella-vieja' } });
        ok('verificar sobre una huella vieja (otro cambió algo) → 409', stale.status === 409 && stale.body.code === 'changed');
        ok('fuera de la edición → 404', (await call(ctl.verifyTranslation, { params: { id: 'tr-otra', lang: 'en' }, query: Q, user: ADMIN, body: {} })).status === 404);

        // ── Verificar (y concurrencia) ───────────────────────────────────
        const fp = t.body.verification.fingerprint;
        const [v1, v2] = await Promise.all([
            call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE, body: { expectedFingerprint: fp, note: 'Revisada contra el original' } }),
            call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE, body: { expectedFingerprint: fp } }),
        ]);
        const versions1 = (await db.query('SELECT * FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1', ['tr-1'])).rows;
        ok('dos verificaciones a la vez → una sola versión (idempotente)', v1.status === 200 && v2.status === 200 && versions1.length === 1 && (v1.body.alreadyVerified || v2.body.alreadyVerified), JSON.stringify([v1.body.error, v2.body.error]));
        const vrow = versions1[0];
        ok('la versión guarda que es una verificación, el rol, los revisados y la huella del original', vrow.kind === 'verification' && vrow.approvedRole === 'cadre' && vrow.reviewedCount === vrow.totalCount && !!vrow.sourceFingerprint && vrow.reviewers['cadre@feria.org'] >= 1);
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: ADMIN });
        ok('estado: Verificada y vigente, con quién, rol y versión', t.body.tracking.state === 'verified' && t.body.tracking.verification.vigente && t.body.tracking.verification.by === CADRE.email && t.body.tracking.verification.role === 'cadre' && t.body.tracking.verification.versionNumber === 1);
        ok('la bitácora registra la verificación con estado anterior y nuevo', t.body.events.some(e => e.action === 'verified' && e.fromState === 'in_review' && e.toState === 'verified' && e.actorRole === 'cadre'));
        ok('el estado de la traducción del expediente sigue siendo «Aprobada» (un solo estado, no dos)', t.body.status.state === 'approved');

        // ── Listado, filtros, indicadores, CSV ───────────────────────────
        const l1 = await call(fair.listSubmissions, { query: { ...Q, tr: 'verificada' }, user: ADMIN });
        ok('filtro «Verificadas» del listado', l1.status === 200 && l1.body.submissions.map(s => s.id).join() === 'tr-1' && l1.body.submissions[0].translation.state === 'verified', JSON.stringify(l1.body).slice(0, 200));
        const l2 = await call(fair.listSubmissions, { query: { ...Q, tr: 'sin_traducir' }, user: ADMIN });
        ok('filtro «Sin traducir» (y nada de otra edición)', l2.body.submissions.map(s => s.id).sort().join() === 'tr-2,tr-3');
        const l3 = await call(fair.listSubmissions, { query: { ...Q, sortBy: 'trState', sortDir: 'desc' }, user: ADMIN });
        ok('orden por estado de traducción', l3.body.submissions[0].id === 'tr-1');
        const l4 = await call(fair.listSubmissions, { query: { ...Q, tr: 'sin_traducir', paymentStatus: 'paid' }, user: ADMIN });
        ok('se combina con los filtros de siempre (pago confirmado + sin traducir)', l4.body.submissions.length === 2);
        const l5 = await call(fair.listSubmissions, { query: Q, user: ADMIN });
        ok('sin filtro, cada fila trae su traducción y sus columnas documentales', l5.body.submissions.every(s => s.translation && 'documents' in s));
        const sum1 = await call(ctl.getTranslationSummary, { query: Q, user: ADMIN });
        ok('indicadores reales de la edición', sum1.status === 200 && sum1.body.kpis.applicable === 3 && sum1.body.kpis.verified === 1 && sum1.body.kpis.untranslated === 2 && sum1.body.kpis.verifiedPct === 33, JSON.stringify(sum1.body.kpis));
        ok('el administrador recibe a quién puede asignar (Cadres primero, con nombre)', sum1.body.assignable[0].email === CADRE.email && sum1.body.assignable[0].name === 'Carlos Cadre' && sum1.body.assignable.some(a => a.role === 'translator'));
        const csv = await call(fair.exportCsv, { query: Q, user: ADMIN });
        ok('el CSV lleva la traducción (estado, %, quién verificó, vigencia)', /Traducción EN \(estado\)/.test(csv.body) && /Verificada/.test(csv.body) && /cadre@feria\.org/.test(csv.body) && /Vigente/.test(csv.body));
        const csvF = await call(fair.exportCsv, { query: { ...Q, tr: 'sin_traducir' }, user: ADMIN });
        ok('el CSV respeta el filtro de traducción', !/FP-TR0001/.test(csvF.body) && /FP-TR0002/.test(csvF.body));
        const doc = await call(ctl.getDocument, { params: { id: 'tr-1' }, query: { ...Q, lang: 'en' }, user: ADMIN });
        ok('la ficha inglesa usa la versión verificada y la marca como oficial', doc.body.translation.mode === 'approved' && doc.body.translation.verified === true && doc.body.translation.verifiedRole === 'cadre');

        // ── Cambios NO traducibles no invalidan ──────────────────────────
        await db.query(`UPDATE "ProjectFairSubmission" SET "workflowStatus" = 'in_review', "amountCop" = 100000 WHERE id = 'tr-1'`);
        await checkTranslationValidity('tr-1');
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: ADMIN });
        ok('cambiar estado o valor del pago NO invalida la verificación', t.body.tracking.state === 'verified');
        await db.query(`UPDATE "ProjectFairSubmission" SET "workflowStatus" = 'received', "amountCop" = 250000 WHERE id = 'tr-1'`);

        // ── Asignación ───────────────────────────────────────────────────
        ok('un Cadre NO asigna → 403', (await call(ctl.assignTranslations, { query: Q, user: CADRE, body: { ids: ['tr-2'], email: CADRE.email } })).status === 403);
        ok('asignar a alguien fuera de los perfiles → 400', (await call(ctl.assignTranslations, { query: Q, user: ADMIN, body: { ids: ['tr-2'], email: 'nadie@x.org' } })).status === 400);
        ok('asignar a un Cadre su propio proyecto → 409', (await call(ctl.assignTranslations, { query: Q, user: ADMIN, body: { ids: ['tr-1'], email: CADRE_RESP.email } })).status === 409);
        mails.length = 0;
        const as1 = await call(ctl.assignTranslations, { query: Q, user: ADMIN, body: { ids: ['tr-1', 'tr-2', 'tr-otra'], email: CADRE.email } });
        ok('el administrador asigna dos proyectos (el de otra edición se ignora)', as1.status === 200 && as1.body.changed === 2 && as1.body.skipped === 1);
        ok('el Cadre recibe UN correo con sus proyectos', mails.length === 1 && mails[0].to === CADRE.email && /FP-TR0001/.test(mails[0].html) && /FP-TR0002/.test(mails[0].html));
        const as2 = await call(ctl.assignTranslations, { query: Q, user: ADMIN, body: { ids: ['tr-2'], email: TRANSLATOR.email, notify: false } });
        ok('reasignar a otra persona', as2.status === 200 && as2.body.changed === 1);
        const evA = (await db.query(`SELECT action, "previousAssignee", "assigneeEmail" FROM "ProjectDossierTranslationEvent" WHERE "submissionId" = 'tr-2' ORDER BY "createdAt"`)).rows;
        ok('la bitácora registra asignación y reasignación con quién tenía antes', evA.map(e => e.action).join() === 'assigned,reassigned' && evA[1].previousAssignee === CADRE.email);
        const mine = await call(fair.listSubmissions, { query: { ...Q, trCadre: 'me' }, user: CADRE });
        ok('«Asignados a mí» para el Cadre', mine.body.submissions.map(s => s.id).join() === 'tr-1');
        const nobody = await call(fair.listSubmissions, { query: { ...Q, trCadre: 'none' }, user: ADMIN });
        ok('«Sin Cadre asignado»', nobody.body.submissions.map(s => s.id).join() === 'tr-3');
        const wl2 = await call(ctl.getTranslationSummary, { query: Q, user: ADMIN });
        ok('carga de trabajo por persona', wl2.body.workload.find(w => w.email === CADRE.email)?.verified === 1 && wl2.body.workload.find(w => w.email === TRANSLATOR.email)?.pending === 1);

        // ── Vigencia: el club cambia un texto traducido ──────────────────
        mails.length = 0;
        await db.query(`UPDATE "ProjectFairMasterForm" SET answers = jsonb_set(answers, '{objetivos,generalObjective}', '"Reducir la mortalidad neonatal en Pereira y Dosquebradas tras el terremoto."') WHERE "submissionId" = 'tr-1'`);
        await checkTranslationValidity('tr-1');
        await checkTranslationValidity('tr-1');
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: ADMIN });
        ok('el club cambia el original → Requiere actualización, sin insignia vigente', t.body.tracking.state === 'needs_update' && !t.body.tracking.verification.vigente);
        ok('identifica SÓLO el campo afectado', t.body.tracking.invalidatedPaths.length === 1 && t.body.tracking.invalidatedPaths[0].path === 'master.objetivos.generalObjective');
        const invEv = (await db.query(`SELECT * FROM "ProjectDossierTranslationEvent" WHERE "submissionId" = 'tr-1' AND action = 'invalidated'`)).rows;
        ok('la pérdida de vigencia se registra UNA vez (aunque se compruebe dos)', invEv.length === 1 && invEv[0].fromState === 'verified' && invEv[0].toState === 'needs_update');
        ok('… y se avisa al Cadre asignado UNA vez', mails.filter(m => m.to === CADRE.email).length === 1 && /Requiere actualización/.test(mails[0].html));
        ok('la traducción anterior se conserva (campo desactualizado con el original previo)', t.body.status.fields.find(x => x.path === 'master.objetivos.generalObjective').previousSource.includes('tras el terremoto'));
        const versions2 = (await db.query('SELECT COUNT(*)::int AS n FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1', ['tr-1'])).rows[0].n;
        ok('la versión verificada sigue en el historial', versions2 === 1);
        const docOld = await call(ctl.getDocument, { params: { id: 'tr-1' }, query: { ...Q, lang: 'en' }, user: ADMIN });
        ok('la ficha inglesa sigue con lo verificado y avisa que el original cambió', docOld.body.translation.verified && docOld.body.translation.outdatedSinceApproval);
        // Revisar sólo el campo afectado y volver a verificar
        await call(ctl.generateTranslation, { ...P('tr-1'), user: CADRE, body: { paths: ['master.objetivos.generalObjective'] } });
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: CADRE });
        ok('retraducido el campo, sigue «Requiere actualización» hasta verificar', t.body.tracking.state === 'needs_update');
        const gf = t.body.status.fields.find(x => x.path === 'master.objetivos.generalObjective');
        await call(ctl.saveTranslation, { ...P('tr-1'), user: CADRE, body: { fields: [{ path: gf.path, text: gf.text, reviewed: true }] } });
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: CADRE });
        const re = await call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE, body: { expectedFingerprint: t.body.verification.fingerprint } });
        ok('nueva verificación → versión 2, vigente otra vez', re.status === 200 && re.body.version.versionNumber === 2 && re.body.tracking.state === 'verified');

        // ── Editar el expediente (comité) también invalida ───────────────
        const ed = await call(ctl.updateDossier, { params: { id: 'tr-1' }, query: Q, user: ADMIN, body: { edits: [{ path: 'submission.projectDescription', value: 'Dotar dos hospitales con 6 incubadoras.', before: 'Dotar dos hospitales con 4 incubadoras.' }], reason: 'Corrección del club' } });
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: ADMIN });
        ok('la edición del comité en el expediente deja la verificación sin vigencia en el acto', ed.status === 200 && t.body.tracking.state === 'needs_update');

        // ── Avisos: justificación ────────────────────────────────────────
        mode = 'cifras';
        await call(ctl.generateTranslation, { ...P('tr-1'), user: CADRE, body: { paths: ['submission.projectDescription'] } });
        mode = 'ok';
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: CADRE });
        const pd = t.body.status.fields.find(x => x.path === 'submission.projectDescription');
        await call(ctl.saveTranslation, { ...P('tr-1'), user: CADRE, body: { fields: [{ path: pd.path, text: pd.text, reviewed: true }] } });
        t = await call(ctl.getTranslation, { ...P('tr-1'), user: CADRE });
        ok('con avisos de cifras la pantalla sabe que pedirá justificación', t.body.verification.needsJustification && t.body.verification.nonBlocking.length === 1);
        const nj = await call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE, body: { expectedFingerprint: t.body.verification.fingerprint } });
        ok('sin justificación → 409', nj.status === 409 && nj.body.needsJustification);
        const wj = await call(ctl.verifyTranslation, { ...P('tr-1'), user: CADRE, body: { expectedFingerprint: t.body.verification.fingerprint, justification: 'El número 6 aparece escrito en letras en la versión inglesa.' } });
        const v3 = (await db.query('SELECT * FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1 AND "versionNumber" = 3', ['tr-1'])).rows[0];
        ok('con justificación → verificada, y la justificación queda en la versión', wj.status === 200 && v3?.justification?.includes('letras') && v3.warningsCount === 1);

        // ── Revocar ──────────────────────────────────────────────────────
        ok('un Cadre NO revoca → 403', (await call(ctl.revokeTranslation, { ...P('tr-1'), user: CADRE, body: { reason: 'No me gusta cómo quedó.' } })).status === 403);
        ok('revocar sin motivo → 400', (await call(ctl.revokeTranslation, { ...P('tr-1'), user: ADMIN, body: { reason: 'no' } })).status === 400);
        const rv = await call(ctl.revokeTranslation, { ...P('tr-1'), user: ADMIN, body: { reason: 'El comité pidió una segunda revisión del glosario.' } });
        ok('el administrador revoca con motivo: deja de estar verificada, el trabajo de revisión se conserva', rv.status === 200 && rv.body.tracking.state === 'in_review' && rv.body.tracking.reviewedPct === 100 && rv.body.tracking.revokeReason.includes('glosario'));
        const allVersions = (await db.query('SELECT COUNT(*)::int AS n FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1', ['tr-1'])).rows[0].n;
        ok('las versiones verificadas NO se borran al revocar', allVersions === 3);
        const revEv = (await db.query(`SELECT * FROM "ProjectDossierTranslationEvent" WHERE "submissionId" = 'tr-1' AND action = 'revoked'`)).rows[0];
        ok('la revocación queda en la bitácora con su motivo y rol', revEv && revEv.reason.includes('glosario') && revEv.actorRole === 'admin' && revEv.versionNumber === 3);

        // ── Aprobación heredada: no se certifica retroactivamente ────────
        await call(ctl.generateTranslation, { ...P('tr-3'), user: CADRE, body: {} });
        const t3 = await call(ctl.getTranslation, { ...P('tr-3'), user: CADRE });
        await call(ctl.saveTranslation, { ...P('tr-3'), user: CADRE, body: { fields: t3.body.status.fields.map(x => ({ path: x.path, text: x.text, reviewed: true })) } });
        await db.query(`INSERT INTO "ProjectDossierTranslationVersion" (id, "submissionId", lang, "versionNumber", fields, fingerprint, "approvedBy") VALUES ('legacy-v', 'tr-3', 'en', 1, '{}'::jsonb, $1, 'viejo@feria.org')`, [t3.body.verification.fingerprint]);
        await db.query(`UPDATE "ProjectDossierTranslation" SET "approvedAt" = NOW(), "approvedBy" = 'viejo@feria.org', "approvedFingerprint" = $1, "approvedVersionId" = 'legacy-v' WHERE "submissionId" = 'tr-3'`, [t3.body.verification.fingerprint]);
        const t3b = await call(ctl.getTranslation, { ...P('tr-3'), user: ADMIN });
        ok('una aprobación anterior a v4.1356 NO cuenta como verificada', t3b.body.status.state === 'approved' && t3b.body.tracking.state === 'in_review' && t3b.body.tracking.legacyApproved);
        const doc3 = await call(ctl.getDocument, { params: { id: 'tr-3' }, query: { ...Q, lang: 'en' }, user: ADMIN });
        ok('… y su ficha inglesa NO sale como oficial', doc3.body.translation.mode === 'approved' && doc3.body.translation.verified === false);
        ok('… pero un Cadre puede verificarla ahora', t3b.body.verification.canVerify);

        // ── Recordatorios ────────────────────────────────────────────────
        await call(ctl.assignTranslations, { query: Q, user: ADMIN, body: { ids: ['tr-3'], email: CADRE.email, notify: false } });
        ok('un Cadre NO envía recordatorios → 403', (await call(ctl.sendTranslationReminders, { query: Q, user: CADRE, body: {} })).status === 403);
        const pv = await call(ctl.sendTranslationReminders, { query: Q, user: ADMIN, body: { scope: 'pendientes' } });
        ok('sin confirmar: vista previa con destinatarios y proyectos, nada enviado', pv.status === 200 && pv.body.preview && pv.body.willSend === 2 && pv.body.sample?.html.includes('Verificar traducción'));
        mails.length = 0;
        const sent = await call(ctl.sendTranslationReminders, { query: Q, user: ADMIN, body: { scope: 'pendientes', confirm: true } });
        ok('confirmado: un correo por persona con todos sus proyectos', sent.body.sent === 2 && mails.length === 2 && mails.find(m => m.to === CADRE.email).html.includes('FP-TR0003'));
        const again = await call(ctl.sendTranslationReminders, { query: Q, user: ADMIN, body: { scope: 'pendientes', confirm: true } });
        ok('el mismo envío el mismo día → sin duplicados', again.body.sent === 0 && again.body.duplicates === 2 && mails.length === 2);
        const regs = await call(ctl.listTranslationReminders, { query: Q, user: ADMIN });
        ok('registro de recordatorios con su estado', regs.body.reminders.filter(r => r.action === 'reminder' && r.deliveryStatus === 'sent').length === 2);

        // ── v4.1357 — Marcar revisados y verificar en UN paso ───────────
        await call(ctl.generateTranslation, { ...P('tr-2'), user: CADRE, body: {} });
        let t2 = await call(ctl.getTranslation, { ...P('tr-2'), user: CADRE });
        ok('v4.1357 — traducida sin marcar: no se verifica «estricto», pero sí marcando', !t2.body.verification.canVerify && t2.body.verification.canVerifyMarkingReviewed && t2.body.verification.pendingReview === t2.body.status.total);
        ok('v4.1357 — sin markAllReviewed sigue pidiendo revisar', (await call(ctl.verifyTranslation, { ...P('tr-2'), user: CADRE, body: { expectedFingerprint: t2.body.verification.fingerprint } })).body.code === 'unreviewed');
        ok('v4.1357 — un traductor tampoco verifica marcando → 403', (await call(ctl.verifyTranslation, { ...P('tr-2'), user: TRANSLATOR, body: { markAllReviewed: true } })).status === 403);
        await db.query(`UPDATE "ProjectFairSubmission" SET email = 'cadre@feria.org' WHERE id = 'tr-2'`);
        const selfMark = await call(ctl.verifyTranslation, { ...P('tr-2'), user: CADRE, body: { markAllReviewed: true } });
        const marcadosTrasFallo = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProjectDossierTranslationField" WHERE "submissionId" = 'tr-2' AND reviewed`)).rows[0].n;
        ok('v4.1357 — si la verificación falla, NO queda ningún campo marcado (transacción)', selfMark.status === 403 && marcadosTrasFallo === 0);
        await db.query(`UPDATE "ProjectFairSubmission" SET email = 'otro@club.org' WHERE id = 'tr-2'`);
        const one = await call(ctl.verifyTranslation, { ...P('tr-2'), user: CADRE, body: { markAllReviewed: true, expectedFingerprint: t2.body.verification.fingerprint } });
        const marcados = (await db.query(`SELECT reviewed, "reviewedBy" FROM "ProjectDossierTranslationField" WHERE "submissionId" = 'tr-2'`)).rows;
        ok('v4.1357 — en un paso: marca los campos a nombre de quien verifica y verifica', one.status === 200 && one.body.tracking.state === 'verified' && marcados.every(r => r.reviewed && r.reviewedBy === CADRE.email), JSON.stringify(one.body).slice(0, 200));
        const revMarks = (await db.query(`SELECT COUNT(*)::int AS n FROM "ProjectDossierRevision" WHERE "submissionId" = 'tr-2' AND kind = 'translation_review' AND reason = 'Marcado como revisado al verificar'`)).rows[0].n;
        ok('v4.1357 — cada campo marcado queda en la bitácora del expediente', revMarks === marcados.length);
        const v2row = (await db.query(`SELECT "reviewedCount", "totalCount" FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = 'tr-2'`)).rows[0];
        ok('v4.1357 — la versión registra todos los campos como revisados', v2row.reviewedCount === v2row.totalCount);

        // ── Configuración ────────────────────────────────────────────────
        ok('un Cadre NO configura → 403', (await call(ctl.saveTranslationConfig, { query: Q, user: CADRE, body: { deadline: '2026-12-15' } })).status === 403);
        const cf = await call(ctl.saveTranslationConfig, { query: Q, user: ADMIN, body: { deadline: '2026-12-15', notifyOnInvalidation: false } });
        ok('la fecha límite de traducción se guarda por edición, aparte de las demás', cf.status === 200 && cf.body.config.deadline === '2026-12-15' && cf.body.history[0].changed.includes('deadline'));

        // ── Nada de pagos ni estados cambió ──────────────────────────────
        const after = (await db.query('SELECT id, status, "workflowStatus", "amountCop", "paidAt" FROM "ProjectFairSubmission" WHERE id = ANY($1) ORDER BY id', [SUBS])).rows;
        ok('pagos y estados de postulación intactos', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
    } catch (err) {
        fail++; console.log(`  ✗ excepción: ${err?.stack || err}`);
    } finally {
        globalThis.fetch = realFetch;
        await db.pool?.end?.().catch(() => {});
    }
}

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
