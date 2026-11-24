// ════════════════════════════════════════════════════════════════════════════
// Expediente integral del proyecto — los endpoints (v4.1324.0)
//
// Todo pasa por `withAccess` (el mismo guardián del módulo de postulaciones) y
// por `loadScoped`, que devuelve 404 si el proyecto no es de la edición abierta
// en el panel: cambiar el id en la URL no abre un proyecto de otra edición.
//
// El criterio (qué se edita, qué se traduce, el estado) es de
// `server/lib/projectDossier.js`; aquí sólo se lee, se escribe y se audita.
// Ninguna ruta de este archivo escribe `status`, `workflowStatus`, `amount*`,
// `paidAt` ni nada de Stripe: traducir o corregir una descripción no toca el
// estado de la postulación ni el pago.
// ════════════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { withAccess, actorFrom, buildFilters } from './projectFairAdminController.js';
import { logEvent, readConfigForSubmission, readEditionEvent, sendFairEmail, headerLogoHtml, footerBrandingHtml } from './projectFairController.js';
import { resolveForms, storageOf, storageIsShared } from '../lib/projectFormsRegistry.js';
import { withComputed, completionOf, validateAnswers } from '../lib/projectFormEngine.js';
import { ensureProjectDossierSchema } from '../lib/ensureProjectDossierSchema.js';
import { routeToModel, getDefaultModel } from '../lib/ai-router.js';
import { hasDocQuery, matchesDocFilters } from '../lib/projectDocumentTracking.js';
import { loadTracking } from '../lib/projectDocumentTrackingStore.js';
import D from '../lib/projectDossier.js';
// v4.1356 — Verificación y seguimiento de traducciones por Cadres.
import T from '../lib/translationTracking.js';
import {
    HEADER_SQL, loadTranslationTracking, checkTranslationValidity, insertTranslationEvent, adminLinkFor,
} from '../lib/translationTrackingStore.js';

console.log('[projectDossierController] v4.1357.0 cargado — «Verificar traducción» en un paso: con campos traducidos sin marcar, la ventana pide confirmar que se revisaron y los marca al verificar (misma transacción); verificación desde la columna «Traducción EN» del listado y en lote.');
console.log('[projectDossierController] v4.1356.0 cargado — Traducción verificada por Cadre: «Verificar traducción» (la aprobación de siempre, reforzada: todo revisado, sin avisos bloqueantes, justificación, huella exacta y sin autocertificación), vigencia automática por huella, revocación, asignación de Cadres, indicadores, filtros, recordatorios y bitácora.');
console.log('[projectDossierController] v4.1355.0 cargado — Ficha técnica: «Club postulante» y «Nombre del proyecto» del registro inicial muestran el club principal y el título diligenciados, con lo inscrito debajo.');
console.log('[projectDossierController] v4.1354.0 cargado — Ficha técnica: la portada toma el título y el club principal de la Formulación (el club del registro pasa a participantes) y una fila sin concepto que suma las demás es el total.');
console.log('[projectDossierController] v4.1353.0 cargado — Ficha técnica: la portada suma los clubes escritos en «Club Rotario» y la fila «total» del desglose no se cuenta como rubro.');
console.log('[projectDossierController] v4.1347.0 cargado — Ficha técnica: la Aprobación institucional (districtSpace, la diligencia el club) vuelve a la ficha del gestor; sólo se quita lo adminOnly.');
console.log('[projectDossierController] v4.1345.0 cargado — Ficha técnica para el gestor: GET /portal/ficha (proyecto del token) con registro, Formulación y FDD, sin documento de identidad, pagos ni espacios del Distrito, logotipo de la Feria y registro de cada descarga.');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const ALLOWED_TABLES = new Set(['ProjectFairMasterForm', 'ProjectFairProjectForm']);
const tableFor = (formKey) => {
    const t = storageOf(formKey);
    if (!ALLOWED_TABLES.has(t)) throw new Error(`Tabla no permitida para ${formKey}`);
    return t;
};

/** Lo que la pantalla necesita saber del perfil, sin el resto de `access`. */
const capsOf = (access) => ({
    role: access.role,
    view: !!access.view, edit: !!access.edit, translate: !!access.translate,
    approveTranslation: !!access.approveTranslation, export: !!access.export,
    config: !!access.config, viewPayments: !!access.viewPayments,
    // v4.1356 — Asignar Cadres, revocar verificaciones, recordatorios.
    manageTranslation: !!access.manageTranslation,
});

// ── Alcance ────────────────────────────────────────────────────────────────
/**
 * El proyecto, sólo si pertenece a la edición abierta (`?evento=`). Una fila
 * sin edición (heredada, sin migrar) se admite como en el resto del módulo.
 */
const loadScoped = async (req, res, q = db) => {
    const id = clean(req.params.id, 80);
    const { rows } = await q.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [id]);
    const row = rows[0];
    const evento = clean(req.query?.evento, 60);
    if (!row || (evento && row.eventId && row.eventId !== evento)) {
        res.status(404).json({ error: 'Ese proyecto no existe en esta edición.' });
        return null;
    }
    return row;
};

const readFormRecord = async (q, submissionId, formKey, { lock = false } = {}) => {
    const table = tableFor(formKey);
    const forUpdate = lock ? ' FOR UPDATE' : '';
    const { rows } = storageIsShared(formKey)
        ? await q.query(`SELECT * FROM "${table}" WHERE "submissionId" = $1 AND "formKey" = $2 LIMIT 1${forUpdate}`, [submissionId, formKey])
        : await q.query(`SELECT * FROM "${table}" WHERE "submissionId" = $1 LIMIT 1${forUpdate}`, [submissionId]);
    return rows[0] || null;
};

// Las plantillas son las de la edición DEL PROYECTO (como el panel del club).
const configCache = new Map();
const configFor = async (eventId) => {
    const key = eventId || '__open__';
    const hit = configCache.get(key);
    if (hit && Date.now() - hit.at < 30_000) return hit.cfg;
    const cfg = await readConfigForSubmission(eventId || null);
    configCache.set(key, { cfg, at: Date.now() });
    return cfg;
};

const assemble = (row, cfg, records) => {
    const forms = resolveForms(cfg).map(f => ({ key: f.key, template: f.template, record: records[f.key] || null }));
    const computed = Object.fromEntries(forms.map(f => [f.key, withComputed(f.template, f.record?.answers || {})]));
    const dossier = D.buildDossier({ submission: row, forms, computed, focusAreas: cfg.focusAreas || [] });
    return { forms, dossier };
};

const loadDossier = async (row, q = db, { lock = false } = {}) => {
    const cfg = await configFor(row.eventId);
    const records = {};
    for (const f of resolveForms(cfg)) records[f.key] = await readFormRecord(q, row.id, f.key, { lock }).catch(() => null);
    return { cfg, ...assemble(row, cfg, records) };
};

const loadGlossary = async (lang = 'en') => {
    const { rows } = await db.query('SELECT * FROM "ProjectDossierGlossary" WHERE lang = $1 AND active = TRUE ORDER BY lower(source)', [lang]);
    return { saved: rows, merged: D.mergeGlossary(rows) };
};

const loadTranslation = async (submissionId, lang, q = db) => {
    const [h, f] = await Promise.all([
        // v4.1356 — Con el número de la versión verificada (lo dice la insignia).
        q.query(HEADER_SQL, [[submissionId], lang]),
        q.query('SELECT * FROM "ProjectDossierTranslationField" WHERE "submissionId" = $1 AND lang = $2', [submissionId, lang]),
    ]);
    return { header: h.rows[0] || null, fieldRows: f.rows };
};

const statusFor = async (dossier, submissionId, lang, q = db) => {
    const items = D.translatableItems(dossier);
    const { header, fieldRows } = await loadTranslation(submissionId, lang, q);
    const status = D.translationStatus({ items, fieldRows, header, now: Date.now() });
    // v4.1356 — El seguimiento (estado del listado, porcentajes, vigencia) sale
    // del MISMO estado: no hay un segundo cálculo.
    return { items, header, fieldRows, status, tracking: T.trackingOf(status, header) };
};

const summaryOf = (status) => {
    const { fields, ...rest } = status;
    return rest;
};

const submissionSummary = (row, access) => ({
    id: row.id, publicRef: row.publicRef, eventId: row.eventId || null,
    projectName: row.projectName, clubName: row.clubName, district: row.district,
    responsable: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
    focusArea: row.focusAreaLabel || row.focusArea || null,
    budgetUsd: row.budgetUsd == null ? null : Number(row.budgetUsd),
    workflowStatus: row.workflowStatus || 'received',
    paymentStatus: row.status,
    ...(access.viewPayments ? { amountCop: row.amountCop == null ? null : Number(row.amountCop), amountUsd: row.amountUsd == null ? null : Number(row.amountUsd), paidAt: row.paidAt || null } : {}),
    createdAt: row.createdAt, appliedAt: row.appliedAt || null, archivedAt: row.archivedAt || null,
    projectIndex: Number(row.projectIndex) || 1,
});

const insertRevision = (q, { submissionId, kind, lang = null, path, label, before, after, reason, actor }) => q.query(`
    INSERT INTO "ProjectDossierRevision" ("submissionId", kind, lang, path, label, "before", "after", reason, "actorId", "actorName", "actorRole")
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
`, [submissionId, kind, lang, path, label || null, JSON.stringify(before ?? null), JSON.stringify(after ?? null), reason || null, actor?.id || null, actor?.name || null, actor?.role || null]);

const withSchema = (handler, capability) => withAccess(async (req, res, ctx) => {
    await ensureProjectDossierSchema();
    return handler(req, res, ctx);
}, capability);

// ── Documentos del proyecto ────────────────────────────────────────────────
const documentsOf = async (row, dossier, access) => {
    const files = await db.query('SELECT id, "fileName", "fileUrl", "fileSize", "contentType", "uploadedBy", "createdAt" FROM "ProjectFairFile" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC', [row.id])
        .then(r => r.rows).catch(() => []);
    // Enlaces a documentos escritos en los formularios (campos tipo archivo o enlace).
    const links = [];
    for (const g of dossier.groups) for (const s of g.sections) for (const f of s.fields) {
        if ((f.type === 'file' || f.type === 'url') && f.filled) links.push({ path: f.path, label: f.label, form: g.title, url: String(f.value) });
    }
    const videos = await db.query(`
        SELECT v.id, v.status, v.title, v."submittedAt", v."approvedAt", v."currentVersionId",
               cv."fileName", cv."sizeBytes", cv."durationSec"
        FROM "ProjectVideo" v LEFT JOIN "ProjectVideoVersion" cv ON cv.id = v."currentVersionId"
        WHERE v."submissionId" = $1 ORDER BY v."createdAt" DESC`, [row.id]).then(r => r.rows).catch(() => []);
    const pitch = await db.query('SELECT id, status, "createdAt" FROM "VideoPitchRequest" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC LIMIT 1', [row.id])
        .then(r => r.rows[0] || null).catch(() => null);
    return {
        files, links, videos, videoPitch: pitch,
        // El comprobante del pago sólo lo ven perfiles con permiso financiero, y
        // se abre desde la pestaña Pago con su propio control de acceso.
        paymentReceipt: access.viewPayments ? (row.manualPaymentReceiptName ? { name: row.manualPaymentReceiptName } : null) : null,
    };
};

// ════════════════════════════════════════════════════════════════════════════
// GET /admin/postulaciones/:id/expediente
// ════════════════════════════════════════════════════════════════════════════
export const getDossier = withSchema(async (req, res, { access }) => {
    const row = await loadScoped(req, res); if (!row) return;
    const { cfg, forms, dossier } = await loadDossier(row);
    const [{ status, tracking }, documents, edition] = await Promise.all([
        statusFor(dossier, row.id, 'en'),
        documentsOf(row, dossier, access),
        readEditionEvent(row.eventId).catch(() => null),
    ]);
    const booklets = await db.query('SELECT DISTINCT ON (lang) lang, status, "versionNumber", "createdAt" FROM "ProjectDossierBooklet" WHERE "submissionId" = $1 ORDER BY lang, "versionNumber" DESC', [row.id]).then(r => r.rows).catch(() => []);
    res.json({
        submission: submissionSummary(row, access),
        edition: { id: row.eventId || null, name: edition?.name || cfg?.edition?.name || 'Feria de Proyectos' },
        dossier,
        forms: forms.map(f => ({ key: f.key, title: f.template?.title || f.key, started: !!f.record, completionPct: Number(f.record?.completionPct || 0), status: f.record?.status || null, submittedAt: f.record?.submittedAt || null, lockedAt: f.record?.lockedAt || null })),
        translation: { en: summaryOf(status) },
        translationTracking: { en: tracking },
        booklets,
        documents,
        access: capsOf(access),
    });
}, 'view');

// ════════════════════════════════════════════════════════════════════════════
// PATCH /admin/postulaciones/:id/expediente   { edits:[{path,value,before}], reason }
//
// En UNA transacción y con la fila bloqueada: se vuelve a leer, se vuelve a
// planear con los `before` que vio la persona (409 si otro cambió el campo) y
// se escribe campo a campo. Las respuestas de un formulario se MEZCLAN: sólo
// cambia la clave editada. Queda en la bitácora del expediente, en la del
// formulario (`ProjectFairFormRevision`, como edición administrativa) y en el
// historial del proyecto.
// ════════════════════════════════════════════════════════════════════════════
export const updateDossier = withSchema(async (req, res, { access }) => {
    const actor = actorFrom(req, access);
    const client = await db.pool.connect();
    let committed = null;
    try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 FOR UPDATE', [clean(req.params.id, 80)]);
        const row = rows[0];
        const evento = clean(req.query?.evento, 60);
        if (!row || (evento && row.eventId && row.eventId !== evento)) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ese proyecto no existe en esta edición.' });
        }
        const { forms, dossier } = await loadDossier(row, client, { lock: true });
        const plan = D.planEdit(dossier, { edits: req.body?.edits, reason: req.body?.reason });
        if (!plan.ok) { await client.query('ROLLBACK'); return res.status(plan.status).json(plan); }

        // 1) Columnas de la postulación (sólo las de la lista blanca).
        const subChanges = plan.changes.filter(c => c.target === 'submission');
        if (subChanges.length) {
            const sets = []; const params = [];
            for (const c of subChanges) {
                const column = D.submissionColumnOf(c.key);
                if (!column) throw new Error(`Columna no editable: ${c.key}`);
                params.push(D.submissionColumnValue(c));
                sets.push(`${column} = $${params.length}`);
            }
            params.push(row.id);
            await client.query(`UPDATE "ProjectFairSubmission" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length}`, params);
        }

        // 2) Respuestas de cada formulario, mezcladas campo a campo.
        const byForm = new Map();
        for (const c of plan.changes.filter(x => x.target === 'form')) {
            if (!byForm.has(c.formKey)) byForm.set(c.formKey, []);
            byForm.get(c.formKey).push(c);
        }
        for (const [formKey, changes] of byForm) {
            const form = forms.find(f => f.key === formKey);
            if (!form?.record) throw new Error(`El formulario ${formKey} no está iniciado.`);
            const next = D.applyFormChanges(form.record.answers || {}, changes);
            const touched = new Set(changes.map(c => `${c.sectionKey}.${c.key}`));
            const problems = validateAnswers(form.template, next).filter(p => touched.has(`${p.sectionKey}.${p.key}`));
            if (problems.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: problems.map(p => `${p.label}: ${p.message}`).join(' ') });
            }
            const pct = completionOf(form.template, next);
            const table = tableFor(formKey);
            const params = [JSON.stringify(next), pct, row.id];
            if (storageIsShared(formKey)) params.push(formKey);
            await client.query(`UPDATE "${table}" SET answers = $1::jsonb, "completionPct" = $2, "updatedAt" = NOW()
                WHERE "submissionId" = $3${storageIsShared(formKey) ? ' AND "formKey" = $4' : ''}`, params);
            await client.query(`INSERT INTO "ProjectFairFormRevision" ("submissionId", "formKey", answers, "completionPct", action, "actorType", "actorName")
                VALUES ($1,$2,$3::jsonb,$4,'admin_edit','admin',$5)`, [row.id, formKey, JSON.stringify(next), pct, actor.name]);
        }

        for (const c of plan.changes) {
            await insertRevision(client, { submissionId: row.id, kind: 'edit', path: c.path, label: c.label, before: c.before, after: c.after, reason: plan.reason, actor });
        }
        await client.query('COMMIT');
        committed = { row, plan };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }

    const { row, plan } = committed;
    await logEvent(row.id, {
        type: 'dossier_edited',
        title: `Expediente editado por la administración (${plan.changes.length} campo${plan.changes.length === 1 ? '' : 's'})`,
        detail: plan.reason || plan.changes.map(c => c.label).join(', '),
        actor,
        metadata: { changes: plan.changes.map(c => ({ path: c.path, label: c.label, before: c.before, after: c.after })) },
    }).catch(() => {});

    const fresh = (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [row.id])).rows[0];
    // v4.1356 — Si el comité cambió un original de una traducción verificada,
    // la verificación pierde vigencia aquí mismo (y se avisa al Cadre).
    await checkTranslationValidity(row.id);
    const { dossier } = await loadDossier(fresh);
    const { status } = await statusFor(dossier, row.id, 'en');
    res.json({ ok: true, changed: plan.changes.map(c => c.path), dossier, translation: { en: summaryOf(status) } });
}, 'edit');

// ════════════════════════════════════════════════════════════════════════════
// GET /admin/postulaciones/:id/expediente/historial
// ════════════════════════════════════════════════════════════════════════════
export const getDossierHistory = withSchema(async (req, res) => {
    const row = await loadScoped(req, res); if (!row) return;
    const [revisions, versions, booklets, exportsRows, trEvents] = await Promise.all([
        db.query('SELECT * FROM "ProjectDossierRevision" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC LIMIT 400', [row.id]),
        db.query('SELECT id, lang, "versionNumber", "approvedBy", "approvedAt", note, kind, "approvedRole", "reviewedCount", "totalCount", "warningsCount", justification, (SELECT COUNT(*) FROM jsonb_object_keys(fields))::int AS "fieldCount" FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1 ORDER BY "approvedAt" DESC', [row.id]),
        db.query('SELECT id, lang, "versionNumber", status, "approvedAt", "approvedBy", "createdBy", "createdAt" FROM "ProjectDossierBooklet" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC', [row.id]),
        db.query('SELECT id, kind, lang, mode, "actorName", "createdAt", jsonb_array_length("submissionIds") AS projects FROM "ProjectDossierExport" WHERE "submissionIds" ? $1 ORDER BY "createdAt" DESC LIMIT 100', [row.id]),
        db.query('SELECT * FROM "ProjectDossierTranslationEvent" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC LIMIT 200', [row.id]).catch(() => ({ rows: [] })),
    ]);
    res.json({ revisions: revisions.rows, translationVersions: versions.rows, booklets: booklets.rows, exports: exportsRows.rows, translationEvents: trEvents.rows });
}, 'view');

// ════════════════════════════════════════════════════════════════════════════
// Traducción
// ════════════════════════════════════════════════════════════════════════════
const langOf = (req, res) => {
    const lang = clean(req.params.lang, 8).toLowerCase();
    if (!D.isTargetLang(lang)) { res.status(400).json({ error: 'Idioma no disponible.' }); return null; }
    return lang;
};

// GET /admin/postulaciones/:id/traduccion/:lang
export const getTranslation = withSchema(async (req, res, { access }) => {
    const lang = langOf(req, res); if (!lang) return;
    const row = await loadScoped(req, res); if (!row) return;
    const { dossier } = await loadDossier(row);
    const [{ status, header, fieldRows, items }, glossary, versions, events] = await Promise.all([
        statusFor(dossier, row.id, lang),
        loadGlossary(lang),
        db.query('SELECT id, "versionNumber", "approvedBy", "approvedAt", note, kind, "approvedRole", "totalCount", "reviewedCount", "warningsCount", justification, reviewers, origins FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1 AND lang = $2 ORDER BY "versionNumber" DESC', [row.id, lang]),
        db.query('SELECT id, action, "fromState", "toState", "versionNumber", "reviewedCount", "totalCount", paths, note, reason, "assigneeEmail", "previousAssignee", recipient, "deliveryStatus", "actorName", "actorRole", "createdAt" FROM "ProjectDossierTranslationEvent" WHERE "submissionId" = $1 AND lang = $2 ORDER BY "createdAt" DESC LIMIT 100', [row.id, lang]).catch(() => ({ rows: [] })),
    ]);
    // v4.1356 — La barrida de vigencia también corre al abrir la traducción:
    // si el original cambió, queda registrado antes de pintar.
    let h = header;
    let tracking = T.trackingOf(status, header);
    if (T.invalidationOf(status, header)) {
        const fresh = (await loadTranslationTracking([row], { lang })).get(row.id);
        if (fresh) { h = fresh.header; tracking = fresh.tracking; }
    }
    const present = fieldRows.filter(r => items.some(i => i.path === r.path));
    const nextVersion = (versions.rows[0]?.versionNumber || 0) + 1;
    const check = T.verificationCheck(status, { actorEmail: req.user?.email, projectEmail: row.email, justification: 'x'.repeat(T.JUSTIFICATION_MIN) });
    // v4.1357 — ¿Se podría verificar marcando en el mismo paso los campos
    // traducidos que faltan por marcar como revisados?
    const checkMarking = T.verificationCheck(T.asIfReviewed(status), { actorEmail: req.user?.email, projectEmail: row.email, justification: 'x'.repeat(T.JUSTIFICATION_MIN) });
    res.json({
        lang, status, tracking, glossary: glossary.merged, versions: versions.rows, events: events.rows,
        verification: {
            // Lo que verá la ventana de confirmación y la huella que se devuelve
            // al verificar (si otro cambia algo entre medio → 409).
            fingerprint: D.fingerprintOf(present),
            summary: T.verificationSummary(status, { nextVersionNumber: nextVersion }),
            // ¿Qué impide verificar HOY, sin contar la justificación (la pide la ventana)?
            canVerify: !!access.approveTranslation && check.ok && tracking.state !== 'verified',
            // v4.1357 — El botón se habilita también con campos sin marcar: la
            // ventana pide confirmar que se revisaron y los marca al verificar.
            canVerifyMarkingReviewed: !!access.approveTranslation && checkMarking.ok && tracking.state !== 'verified',
            pendingReview: status.counts.draft,
            blockedReason: tracking.state === 'verified' ? 'La traducción ya está verificada y vigente.' : (checkMarking.ok ? null : checkMarking.error),
            blockedCode: tracking.state === 'verified' ? 'verified' : (checkMarking.ok ? null : checkMarking.code),
            needsJustification: (checkMarking.nonBlocking || []).length > 0,
            nonBlocking: checkMarking.nonBlocking || [],
            blocking: checkMarking.blocking || [],
            revokedAt: h?.revokedAt || null, revokedBy: h?.revokedBy || null, revokeReason: h?.revokeReason || null,
        },
        actor: { email: req.user?.email || null, role: access.role },
        access: capsOf(access),
    });
}, 'view');

const runBatch = async (slug, system, batch, notes) => {
    const raw = await routeToModel(slug, system, D.translationUserPrompt(batch), [], {
        // ⚠️ Gemini recorta el mensaje a 2.500 caracteres si no se declara
        // otro tope: el lote (hasta BATCH_MAX_CHARS) ES la materia prima.
        maxTokens: 8000, maxInputChars: 30000, feature: 'project_fair.translation', notes,
    });
    return D.parseTranslationResponse(raw, batch);
};

/** Un lote; si falla, se parte en dos y se reintenta UNA vez cada mitad. */
const translateBatchSafely = async (slug, system, batch, notes, errors) => {
    try { return await runBatch(slug, system, batch, notes); } catch (e) {
        if (batch.length === 1) { errors.push(e?.message || String(e)); return new Map(); }
        const mid = Math.ceil(batch.length / 2);
        const out = new Map();
        for (const half of [batch.slice(0, mid), batch.slice(mid)]) {
            try { for (const [k, v] of await runBatch(slug, system, half, notes)) out.set(k, v); }
            catch (e2) { errors.push(e2?.message || String(e2)); }
        }
        return out;
    }
};

// POST /admin/postulaciones/:id/traduccion/:lang/generar  { paths?: string[], includeReviewed?: boolean }
export const generateTranslation = withSchema(async (req, res, { access }) => {
    const lang = langOf(req, res); if (!lang) return;
    const row = await loadScoped(req, res); if (!row) return;
    const actor = actorFrom(req, access);
    const { dossier } = await loadDossier(row);
    const { items, status } = await statusFor(dossier, row.id, lang);
    const byPath = new Map(status.fields.map(f => [f.path, f]));

    const requested = Array.isArray(req.body?.paths) ? req.body.paths.map(p => clean(p, 300)).filter(Boolean) : null;
    let targets;
    if (requested && requested.length) {
        // Un campo (o varios) pedido a mano: se regenera aunque esté revisado.
        // Los demás NO se tocan.
        targets = items.filter(i => requested.includes(i.path) || requested.includes(i.fieldPath));
        if (!targets.length) return res.status(400).json({ error: 'Esos campos no se traducen o están vacíos.' });
    } else {
        const includeReviewed = req.body?.includeReviewed === true;
        targets = items.filter(i => {
            const f = byPath.get(i.path);
            if (!f || f.state === 'missing' || f.state === 'outdated') return true;
            if (includeReviewed) return true;
            // Un borrador corregido a mano o un campo revisado se respeta.
            return f.state === 'draft' && f.origin === 'ai';
        });
    }
    if (!targets.length) {
        return res.json({ ok: true, translated: 0, message: 'No hay campos pendientes: todo está traducido. Para rehacer un campo revisado, regénéralo uno por uno o marca «incluir revisados».', status });
    }

    // Candado: una sola generación a la vez por proyecto e idioma. Una que
    // lleve más de 6 minutos se da por caída.
    const lock = await db.query(`
        INSERT INTO "ProjectDossierTranslation" ("submissionId", lang, status, "startedAt", "lastError")
        VALUES ($1, $2, 'generating', NOW(), NULL)
        ON CONFLICT ("submissionId", lang) DO UPDATE SET status = 'generating', "startedAt" = NOW(), "lastError" = NULL, "updatedAt" = NOW()
        WHERE "ProjectDossierTranslation".status <> 'generating' OR "ProjectDossierTranslation"."startedAt" < NOW() - INTERVAL '6 minutes'
        RETURNING id`, [row.id, lang]);
    if (!lock.rows[0]) return res.status(409).json({ error: 'Ya hay una traducción en curso para este proyecto. Espera a que termine.' });

    const errors = [];
    const notes = [];
    let slug = null;
    let written = 0;
    try {
        const { merged } = await loadGlossary(lang);
        const system = D.translationSystemPrompt(merged, lang);
        slug = await getDefaultModel();
        const batches = D.planBatches(targets);
        const results = new Map();
        // Hasta tres lotes en paralelo: un proyecto largo no se come los 120 s.
        for (let i = 0; i < batches.length; i += 3) {
            const chunk = await Promise.all(batches.slice(i, i + 3).map(b => translateBatchSafely(slug, system, b, notes, errors)));
            for (const m of chunk) for (const [k, v] of m) results.set(k, v);
        }
        for (const item of targets) {
            const text = results.get(item.hash);
            if (!text) continue;
            const prev = byPath.get(item.path);
            const warnings = D.auditTranslation(item.text, text);
            await db.query(`
                INSERT INTO "ProjectDossierTranslationField" ("submissionId", lang, path, "sourceHash", "sourceText", text, origin, reviewed, warnings, provider, model, "updatedBy")
                VALUES ($1,$2,$3,$4,$5,$6,'ai',FALSE,$7::jsonb,$8,$9,$10)
                ON CONFLICT ("submissionId", lang, path) DO UPDATE SET
                    "sourceHash" = EXCLUDED."sourceHash", "sourceText" = EXCLUDED."sourceText", text = EXCLUDED.text,
                    origin = 'ai', reviewed = FALSE, "reviewedAt" = NULL, "reviewedBy" = NULL,
                    warnings = EXCLUDED.warnings, provider = EXCLUDED.provider, model = EXCLUDED.model,
                    "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`,
            [row.id, lang, item.path, item.hash, item.text, text, JSON.stringify(warnings), 'ai-router', slug, actor.name]);
            if (prev?.text && prev.text !== text) {
                await insertRevision(db, { submissionId: row.id, kind: 'translation', lang, path: item.path, label: item.label, before: prev.text, after: text, reason: 'Regenerado con IA', actor });
            }
            written += 1;
        }
        const failedAll = written === 0;
        await db.query(`UPDATE "ProjectDossierTranslation" SET status = $3, "finishedAt" = NOW(), "lastError" = $4, provider = 'ai-router', model = $5, "updatedAt" = NOW()
            WHERE "submissionId" = $1 AND lang = $2`, [row.id, lang, failedAll ? 'error' : 'idle', errors.length ? errors.slice(0, 3).join(' | ').slice(0, 1500) : null, slug]);
    } catch (err) {
        await db.query(`UPDATE "ProjectDossierTranslation" SET status = 'error', "finishedAt" = NOW(), "lastError" = $3, "updatedAt" = NOW() WHERE "submissionId" = $1 AND lang = $2`,
            [row.id, lang, String(err?.message || err).slice(0, 1500)]).catch(() => {});
        return res.status(502).json({ error: `No se pudo traducir. ${err?.message || ''}`.trim() });
    }

    await logEvent(row.id, {
        type: 'dossier_translated',
        title: `Traducción al inglés generada con IA (${written} de ${targets.length} campo${targets.length === 1 ? '' : 's'})`,
        detail: [requested ? `Campos: ${requested.join(', ')}` : null, errors.length ? `Con errores: ${errors[0]}` : null, notes[0] || null].filter(Boolean).join(' · ') || null,
        actor,
        metadata: { lang, written, requested: targets.length, model: slug, errors: errors.slice(0, 3) },
    }).catch(() => {});

    const after = await statusFor(dossier, row.id, lang);
    if (!written) return res.status(502).json({ error: `La IA no devolvió traducciones utilizables. ${errors[0] || ''}`.trim(), status: after.status });
    res.json({ ok: true, translated: written, requested: targets.length, errors, notes, status: after.status });
}, 'translate');

// PUT /admin/postulaciones/:id/traduccion/:lang   { fields:[{ path, text, reviewed }] }
export const saveTranslation = withSchema(async (req, res, { access }) => {
    const lang = langOf(req, res); if (!lang) return;
    const row = await loadScoped(req, res); if (!row) return;
    const actor = actorFrom(req, access);
    const incoming = Array.isArray(req.body?.fields) ? req.body.fields : [];
    if (!incoming.length) return res.status(400).json({ error: 'No hay cambios que guardar.' });
    if (incoming.length > 300) return res.status(400).json({ error: 'Demasiados campos en una sola operación.' });
    const { dossier } = await loadDossier(row);
    const { items, status } = await statusFor(dossier, row.id, lang);
    const itemBy = new Map(items.map(i => [i.path, i]));
    const fieldBy = new Map(status.fields.map(f => [f.path, f]));

    const plan = [];
    for (const f of incoming) {
        const path = clean(f?.path, 300);
        const item = itemBy.get(path);
        if (!item) return res.status(400).json({ error: `El campo ${path} no se traduce o está vacío en español.` });
        if (typeof f.text !== 'string') return res.status(400).json({ error: `«${item.label}»: la traducción debe ser texto.` });
        const text = f.text.replace(/\r\n/g, '\n').trim();
        if (text.length > 20000) return res.status(400).json({ error: `«${item.label}»: la traducción es demasiado larga.` });
        const reviewed = f.reviewed === true;
        if (reviewed && !text) return res.status(400).json({ error: `«${item.label}»: no se puede marcar como revisado un campo vacío.` });
        plan.push({ item, text, reviewed, prev: fieldBy.get(path) });
    }

    for (const { item, text, reviewed, prev } of plan) {
        const changedText = (prev?.text ?? '') !== text;
        const origin = changedText ? 'manual' : (prev?.origin || 'manual');
        const warnings = D.auditTranslation(item.text, text);
        await db.query(`
            INSERT INTO "ProjectDossierTranslationField" ("submissionId", lang, path, "sourceHash", "sourceText", text, origin, reviewed, "reviewedAt", "reviewedBy", warnings, "updatedBy")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 THEN NOW() ELSE NULL END, CASE WHEN $8 THEN $9 ELSE NULL END, $10::jsonb, $9)
            ON CONFLICT ("submissionId", lang, path) DO UPDATE SET
                "sourceHash" = EXCLUDED."sourceHash", "sourceText" = EXCLUDED."sourceText", text = EXCLUDED.text, origin = EXCLUDED.origin,
                reviewed = EXCLUDED.reviewed, "reviewedAt" = EXCLUDED."reviewedAt", "reviewedBy" = EXCLUDED."reviewedBy",
                warnings = EXCLUDED.warnings, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`,
        [row.id, lang, item.path, item.hash, item.text, text, origin, reviewed, actor.name, JSON.stringify(warnings)]);
        if (changedText) {
            await insertRevision(db, { submissionId: row.id, kind: 'translation', lang, path: item.path, label: item.label, before: prev?.text ?? null, after: text, reason: 'Corrección manual', actor });
        }
        if (reviewed !== !!prev?.reviewed) {
            await insertRevision(db, { submissionId: row.id, kind: 'translation_review', lang, path: item.path, label: item.label, before: !!prev?.reviewed, after: reviewed, reason: null, actor });
        }
    }
    const after = await statusFor(dossier, row.id, lang);
    res.json({ ok: true, saved: plan.length, status: after.status });
}, 'translate');

// ════════════════════════════════════════════════════════════════════════════
// v4.1356 — VERIFICAR la traducción («Traducción verificada por Cadre»)
//
// POST /admin/postulaciones/:id/traduccion/:lang/verificar
// POST /admin/postulaciones/:id/traduccion/:lang/aprobar   (la ruta de siempre)
//   { justification?, expectedFingerprint?, note? }
//
// ES el botón «Aprobar versión inglesa» de v4.1324, reforzado — no un segundo
// proceso de aprobación—: todo traducido y revisado por una persona, nada
// desactualizado, ningún aviso bloqueante (correos o enlaces cambiados), una
// justificación escrita para los avisos no bloqueantes, la MISMA huella que
// la persona tenía en pantalla (409 si otro cambió algo) y nunca el
// responsable del proyecto certificando lo suyo. Todo se vuelve a leer DENTRO
// del candado: lo que se certifica es exactamente lo que queda guardado.
// ════════════════════════════════════════════════════════════════════════════
export const approveTranslation = withSchema(async (req, res, { access }) => {
    const lang = langOf(req, res); if (!lang) return;
    const row = await loadScoped(req, res); if (!row) return;
    const actor = actorFrom(req, access);
    const justification = clean(req.body?.justification, 2000);
    const note = clean(req.body?.note, 500) || null;
    const expectedFingerprint = clean(req.body?.expectedFingerprint, 64) || null;
    // v4.1357 — «Marcar revisados y verificar» en UN paso: quien verifica
    // declara que revisó los campos traducidos pendientes de marcar. Se marcan
    // a su nombre DENTRO de la misma transacción (si algo falla, no queda
    // ninguno marcado). Los faltantes y desactualizados siguen bloqueando.
    const markAllReviewed = req.body?.markAllReviewed === true;

    const client = await db.pool.connect();
    let version, fromState, check, status, items, present;
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dossier-approve:${row.id}:${lang}`]);
        const fresh = (await client.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [row.id])).rows[0] || row;
        const { dossier } = await loadDossier(fresh, client);
        const st = await statusFor(dossier, row.id, lang, client);
        ({ status, items } = st);
        present = st.fieldRows.filter(r => status.fields.some(f => f.path === r.path));
        fromState = st.tracking.state;
        const fingerprint = D.fingerprintOf(present);
        // Idempotente: dos clics (o dos personas) sobre lo mismo ya verificado
        // y vigente no crean una segunda versión idéntica.
        if (st.tracking.state === 'verified' && st.header?.approvedFingerprint === fingerprint) {
            await client.query('ROLLBACK');
            return res.json({ ok: true, alreadyVerified: true, version: { id: st.header.approvedVersionId, versionNumber: st.header.approvedVersionNumber, approvedAt: st.header.approvedAt }, status, tracking: st.tracking });
        }
        check = T.verificationCheck(markAllReviewed ? T.asIfReviewed(status) : status, {
            justification, expectedFingerprint, currentFingerprint: fingerprint,
            actorEmail: req.user?.email, projectEmail: fresh.email,
        });
        if (!check.ok) {
            await client.query('ROLLBACK');
            const code = check.code === 'self_certification' ? 403 : (check.code === 'changed' || check.code === 'needs_justification') ? 409 : 400;
            return res.status(code).json({ ...check, status, tracking: st.tracking });
        }
        const pendingDrafts = markAllReviewed ? status.fields.filter(f => f.state === 'draft') : [];
        if (pendingDrafts.length) {
            await client.query(`UPDATE "ProjectDossierTranslationField" SET reviewed = TRUE, "reviewedAt" = NOW(), "reviewedBy" = $3, "updatedAt" = NOW()
                WHERE "submissionId" = $1 AND lang = $2 AND path = ANY($4::text[]) AND reviewed = FALSE`,
            [row.id, lang, actor.name, pendingDrafts.map(f => f.path)]);
            for (const f of pendingDrafts) {
                await insertRevision(client, { submissionId: row.id, kind: 'translation_review', lang, path: f.path, label: f.label, before: false, after: true, reason: 'Marcado como revisado al verificar', actor });
            }
            const again = await statusFor(dossier, row.id, lang, client);
            ({ status, items } = again);
            present = again.fieldRows.filter(r => status.fields.some(f => f.path === r.path));
        }
        const summary = T.verificationSummary(status);
        const snapshot = Object.fromEntries(status.fields.map(f => [f.path, { label: f.label, source: f.source, text: f.text, sourceHash: f.sourceHash, origin: f.origin, reviewedBy: f.reviewedBy, reviewedAt: f.reviewedAt, warnings: f.warnings }]));
        const sourceFingerprint = T.sourceFingerprintOf(items);
        const n = await client.query('SELECT COALESCE(MAX("versionNumber"),0)+1 AS n FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1 AND lang = $2', [row.id, lang]);
        const { rows } = await client.query(`INSERT INTO "ProjectDossierTranslationVersion" ("submissionId", lang, "versionNumber", fields, fingerprint, note, "approvedBy", "approvedById",
                kind, "approvedRole", "totalCount", "reviewedCount", "warningsCount", justification, "sourceFingerprint", reviewers, origins)
            VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb) RETURNING *`,
        [row.id, lang, Number(n.rows[0].n), JSON.stringify(snapshot), fingerprint, note, actor.name, actor.id,
            T.VERIFICATION_KIND, access.role, summary.total, summary.reviewed, summary.warnings, summary.warnings ? justification : null,
            sourceFingerprint, JSON.stringify(summary.reviewers), JSON.stringify(summary.origins)]);
        version = rows[0];
        await client.query(`INSERT INTO "ProjectDossierTranslation" ("submissionId", lang, status, "approvedAt", "approvedBy", "approvedFingerprint", "approvedVersionId", "approvalKind", "approvedRole", "approvedById")
            VALUES ($1,$2,'idle',NOW(),$3,$4,$5,$6,$7,$8)
            ON CONFLICT ("submissionId", lang) DO UPDATE SET "approvedAt" = NOW(), "approvedBy" = $3, "approvedFingerprint" = $4, "approvedVersionId" = $5,
                "approvalKind" = $6, "approvedRole" = $7, "approvedById" = $8,
                "invalidatedAt" = NULL, "invalidatedVersionId" = NULL, "invalidatedPaths" = NULL,
                "revokedAt" = NULL, "revokedBy" = NULL, "revokeReason" = NULL, "updatedAt" = NOW()`,
        [row.id, lang, actor.name, fingerprint, version.id, T.VERIFICATION_KIND, access.role, actor.id]);
        await insertTranslationEvent(client, {
            submissionId: row.id, eventId: row.eventId, lang, action: 'verified', fromState, toState: 'verified',
            versionId: version.id, versionNumber: version.versionNumber, sourceFingerprint, translationFingerprint: fingerprint,
            reviewedCount: summary.reviewed, totalCount: summary.total,
            paths: summary.warnings ? check.nonBlocking.map(f => ({ path: f.path, label: f.label, warnings: f.warnings.map(w => w.code) })) : null,
            note, reason: summary.warnings ? justification : null, actor,
        });
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally { client.release(); }

    await logEvent(row.id, {
        type: 'dossier_translation_approved',
        title: `Traducción al inglés verificada (versión ${version.versionNumber})`,
        detail: [note, version.justification ? `Justificación de avisos: ${version.justification}` : null].filter(Boolean).join(' · ') || null,
        actor,
        metadata: { lang, versionId: version.id, versionNumber: version.versionNumber, fields: status.total, reviewed: version.reviewedCount, role: access.role, kind: T.VERIFICATION_KIND },
    }).catch(() => {});
    const { dossier } = await loadDossier(row);
    const after = await statusFor(dossier, row.id, lang);
    res.json({ ok: true, version: { id: version.id, versionNumber: version.versionNumber, approvedAt: version.approvedAt }, status: after.status, tracking: after.tracking });
}, 'approveTranslation');
export const verifyTranslation = approveTranslation;

// POST /admin/postulaciones/:id/traduccion/:lang/revocar   { reason }
// La verificación deja de certificar; la versión inmutable y el trabajo de
// revisión se conservan. Sólo con `manageTranslation` y con motivo.
export const revokeTranslation = withSchema(async (req, res, { access }) => {
    const lang = langOf(req, res); if (!lang) return;
    const row = await loadScoped(req, res); if (!row) return;
    const reason = clean(req.body?.reason, 1000);
    if (reason.length < 10) return res.status(400).json({ error: 'Escribe el motivo de la revocación (mínimo 10 caracteres).' });
    const actor = actorFrom(req, access);
    const { dossier } = await loadDossier(row);
    const before = await statusFor(dossier, row.id, lang);
    if (!T.isVerification(before.header)) return res.status(409).json({ error: 'Este proyecto no tiene una verificación que revocar.' });
    const { rows } = await db.query(`UPDATE "ProjectDossierTranslation"
        SET "revokedAt" = NOW(), "revokedBy" = $4, "revokeReason" = $5,
            "approvedAt" = NULL, "approvedBy" = NULL, "approvedFingerprint" = NULL, "approvedVersionId" = NULL,
            "approvalKind" = NULL, "approvedRole" = NULL, "approvedById" = NULL,
            "invalidatedAt" = NULL, "invalidatedVersionId" = NULL, "invalidatedPaths" = NULL, "updatedAt" = NOW()
        WHERE "submissionId" = $1 AND lang = $2 AND "approvedVersionId" = $3 RETURNING id`,
    [row.id, lang, before.header.approvedVersionId, actor.name, reason]);
    if (!rows[0]) return res.status(409).json({ error: 'La verificación cambió mientras tanto. Vuelve a cargar.' });
    await insertTranslationEvent(db, {
        submissionId: row.id, eventId: row.eventId, lang, action: 'revoked', fromState: before.tracking.state, toState: null,
        versionId: before.header.approvedVersionId, versionNumber: before.header.approvedVersionNumber ?? null,
        sourceFingerprint: T.sourceFingerprintOf(before.items), totalCount: before.status.total, reviewedCount: before.status.counts.reviewed,
        reason, actor,
    });
    await logEvent(row.id, { type: 'dossier_translation_revoked', title: `Verificación de la traducción al inglés revocada (versión ${before.header.approvedVersionNumber ?? '—'})`, detail: reason, actor, metadata: { lang, versionId: before.header.approvedVersionId } }).catch(() => {});
    const after = await statusFor(dossier, row.id, lang);
    res.json({ ok: true, status: after.status, tracking: after.tracking });
}, 'manageTranslation');

// ════════════════════════════════════════════════════════════════════════════
// Fichas (PDF): el servidor arma los DATOS; el navegador dibuja el PDF.
// ════════════════════════════════════════════════════════════════════════════
const KINDS = new Set(['es', 'en', 'bilingual']);

/**
 * Datos de una ficha. Para el inglés: la última versión APROBADA si existe y
 * no se pidió el borrador; si no, el texto vigente marcado como borrador —la
 * ficha lo dice en cada página—.
 */
const documentPayload = async (row, { kind, use, includeContact, glossary }) => {
    const { cfg, dossier } = await loadDossier(row);
    const edition = await readEditionEvent(row.eventId).catch(() => null);
    const base = D.forDocument(dossier, { includeContact });
    const out = {
        id: row.id, publicRef: row.publicRef, kind,
        edition: edition?.name || cfg?.edition?.name || 'Feria de Proyectos',
        projectName: row.projectName, clubName: row.clubName, district: row.district,
        generatedAt: new Date().toISOString(),
        es: base,
    };
    if (kind === 'en' || kind === 'bilingual') {
        const { status, header } = await statusFor(dossier, row.id, 'en');
        let translations = new Map();
        let mode = 'none';
        let approvedVersion = null;
        if (header?.approvedVersionId && use !== 'current') {
            const v = await db.query('SELECT * FROM "ProjectDossierTranslationVersion" WHERE id = $1', [header.approvedVersionId]);
            approvedVersion = v.rows[0] || null;
            if (approvedVersion) {
                translations = new Map(Object.entries(approvedVersion.fields || {}).map(([p, f]) => [p, f.text]));
                mode = 'approved';
            }
        }
        if (mode === 'none' && status.fields.some(f => f.text)) {
            translations = new Map(status.fields.filter(f => f.text).map(f => [f.path, f.text]));
            mode = 'draft';
        }
        out.en = D.englishView(base, translations, glossary);
        // v4.1356 — Sólo una VERIFICACIÓN (por Cadre o perfil autorizado,
        // con todo revisado) es documento oficial. Una aprobación heredada
        // (anterior a la verificación) sigue siendo la fuente del texto, pero
        // la ficha sale marcada como pendiente de verificación: no se
        // certifica retroactivamente.
        const verified = mode === 'approved' && approvedVersion?.kind === T.VERIFICATION_KIND;
        out.translation = {
            mode, state: status.state, label: status.label,
            approvedAt: approvedVersion?.approvedAt || null, approvedBy: approvedVersion?.approvedBy || null,
            versionNumber: approvedVersion?.versionNumber || null,
            outdatedSinceApproval: mode === 'approved' && status.state !== 'approved',
            verified,
            verifiedRole: verified ? (approvedVersion.approvedRole || null) : null,
        };
    }
    return out;
};

const logExport = (ids, { kind, mode, eventId, actor }) => db.query(
    'INSERT INTO "ProjectDossierExport" ("submissionIds", kind, lang, mode, "eventId", "actorId", "actorName") VALUES ($1::jsonb,$2,$3,$4,$5,$6,$7)',
    [JSON.stringify(ids), ids.length > 1 ? 'bulk_sheet' : 'sheet', kind, mode || null, eventId || null, actor?.id || null, actor?.name || null],
).catch(err => console.warn('[dossier] no pude registrar la descarga:', err?.message));

// GET /admin/postulaciones/:id/expediente/documento?lang=es|en|bilingual&use=approved|current&contact=1
export const getDocument = withSchema(async (req, res, { access }) => {
    const row = await loadScoped(req, res); if (!row) return;
    const kind = KINDS.has(clean(req.query?.lang, 12)) ? clean(req.query.lang, 12) : 'es';
    const { merged } = await loadGlossary('en');
    const payload = await documentPayload(row, { kind, use: clean(req.query?.use, 12), includeContact: req.query?.contact === '1', glossary: merged });
    await logExport([row.id], { kind, mode: payload.translation?.mode, eventId: row.eventId, actor: actorFrom(req, access) });
    res.json(payload);
}, 'export');

// ════════════════════════════════════════════════════════════════════════════
// v4.1345 — La ficha técnica que descarga el GESTOR desde «Mi Proyecto».
// GET /portal/ficha  (portalAuth). El proyecto sale del TOKEN, nunca de la
// URL: cada club descarga sólo la suya. Mismos datos que la ficha en español
// del comité (`forClubDocument`), más el logotipo del sitio de la Feria para la
// cabecera (lo trae el servidor: así el navegador no depende del CORS del
// almacenamiento para dibujarlo en el PDF).
// ════════════════════════════════════════════════════════════════════════════
const LOGO_MAX_BYTES = 1_500_000;
const LOGO_TYPES = /^image\/(png|jpe?g|webp|svg\+xml|gif)$/i;

const fairLogoOf = async (eventId) => {
    try {
        const { rows } = await db.query(`
            SELECT c.logo FROM "CalendarEvent" e JOIN "Club" c ON c.id = e."clubId"
             WHERE e.id = $1 LIMIT 1`, [eventId]);
        const url = String(rows[0]?.logo || '').trim();
        if (!/^https:\/\//i.test(url)) return null;
        const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
        if (!r.ok) return null;
        const type = String(r.headers.get('content-type') || '').split(';')[0].trim();
        if (!LOGO_TYPES.test(type)) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length || buf.length > LOGO_MAX_BYTES) return null;
        return `data:${type};base64,${buf.toString('base64')}`;
    } catch {
        return null; // sin logotipo: la cabecera dice el nombre en texto
    }
};

export const getPortalDocument = async (req, res) => {
    try {
        await ensureProjectDossierSchema();
        const id = String(req.portal?.submissionId || '');
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [id]);
        const row = rows[0];
        if (!row) return res.status(404).json({ error: 'No encontramos tu proyecto.' });
        const { cfg, dossier } = await loadDossier(row);
        const edition = await readEditionEvent(row.eventId).catch(() => null);
        const payload = {
            id: row.id, publicRef: row.publicRef, kind: 'es', audience: 'club',
            edition: cfg?.edition?.name || edition?.title || 'Feria de Proyectos',
            projectName: row.projectName, clubName: row.clubName, district: row.district,
            generatedAt: new Date().toISOString(),
            es: D.forClubDocument(dossier),
            logo: await fairLogoOf(row.eventId),
        };
        await logExport([row.id], { kind: 'es', mode: 'club', eventId: row.eventId, actor: { id: req.portal?.sub || null, name: req.portal?.email || 'club' } });
        res.json(payload);
    } catch (error) {
        console.error('[dossier] getPortalDocument:', error);
        res.status(500).json({ error: 'No pudimos preparar la ficha de tu proyecto.' });
    }
};

// POST /admin/expedientes/documentos   { ids:[], lang, use, includeContact }
export const getDocumentsBulk = withSchema(async (req, res, { access }) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(x => clean(x, 80)).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un proyecto.' });
    if (ids.length > 60) return res.status(400).json({ error: 'Máximo 60 proyectos por descarga.' });
    const kind = KINDS.has(clean(req.body?.lang, 12)) ? clean(req.body.lang, 12) : 'es';
    const evento = clean(req.query?.evento, 60);
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[])', [ids]);
    // Fuera del alcance (otra edición o inexistente): no se incluye, y se dice.
    const inScope = rows.filter(r => !evento || !r.eventId || r.eventId === evento);
    const skipped = ids.filter(id => !inScope.some(r => r.id === id));
    const { merged } = await loadGlossary('en');
    const documents = [];
    for (const id of ids) {
        const row = inScope.find(r => r.id === id);
        if (!row) continue;
        documents.push(await documentPayload(row, { kind, use: clean(req.body?.use, 12), includeContact: req.body?.includeContact === true, glossary: merged }));
    }
    await logExport(documents.map(d => d.id), { kind, mode: 'bulk', eventId: evento || null, actor: actorFrom(req, access) });
    res.json({ documents, skipped });
}, 'export');

// GET /admin/expedientes/estado?ids=a,b,c — el estado documental de varias filas
// del listado en pocas consultas (no una por fila).
export const getDossierStates = withSchema(async (req, res) => {
    const ids = [...new Set(clean(req.query?.ids, 8000).split(',').map(x => x.trim()).filter(Boolean))].slice(0, 200);
    if (!ids.length) return res.json({ states: {} });
    const evento = clean(req.query?.evento, 60);
    const [subs, master, generic, headers, fields] = await Promise.all([
        db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[])', [ids]),
        db.query('SELECT * FROM "ProjectFairMasterForm" WHERE "submissionId" = ANY($1::text[])', [ids]).catch(() => ({ rows: [] })),
        db.query('SELECT * FROM "ProjectFairProjectForm" WHERE "submissionId" = ANY($1::text[])', [ids]).catch(() => ({ rows: [] })),
        db.query(HEADER_SQL, [ids, 'en']),
        db.query('SELECT "submissionId", path, "sourceHash", text, reviewed, warnings FROM "ProjectDossierTranslationField" WHERE "submissionId" = ANY($1::text[]) AND lang = $2', [ids, 'en']),
    ]);
    const states = {};
    for (const row of subs.rows) {
        if (evento && row.eventId && row.eventId !== evento) continue;
        const cfg = await configFor(row.eventId);
        const records = {};
        for (const f of resolveForms(cfg)) {
            records[f.key] = storageIsShared(f.key)
                ? generic.rows.find(r => r.submissionId === row.id && r.formKey === f.key) || null
                : master.rows.find(r => r.submissionId === row.id) || null;
        }
        const { dossier, forms } = assemble(row, cfg, records);
        const header = headers.rows.find(h => h.submissionId === row.id) || null;
        const st = D.translationStatus({
            items: D.translatableItems(dossier),
            fieldRows: fields.rows.filter(f => f.submissionId === row.id),
            header,
            now: Date.now(),
        });
        states[row.id] = {
            en: { state: st.state, label: st.label, color: st.color, counts: st.counts, total: st.total },
            // v4.1356 — El seguimiento (verificación por Cadre, porcentajes).
            tracking: T.trackingOf(st, header),
            forms: forms.map(f => ({ key: f.key, started: !!f.record, completionPct: Number(f.record?.completionPct || 0) })),
        };
    }
    res.json({ states });
}, 'view');

// ════════════════════════════════════════════════════════════════════════════
// v4.1356 — SEGUIMIENTO DE TRADUCCIONES (indicadores, asignación de Cadres,
// configuración y recordatorios). Todo por `withAccess` con su capacidad; las
// cifras salen de `loadTranslationTracking`, el mismo cálculo del listado y
// de las exportaciones.
// ════════════════════════════════════════════════════════════════════════════
const CADRE_ROLES = [['cadres', 'cadre', 'Cadre'], ['reviewers', 'reviewer', 'Revisor'], ['translators', 'translator', 'Traductor']];

/** Quiénes pueden recibir proyectos: Cadres primero, luego revisores y traductores. */
const assignableOf = async (cfg) => {
    const seen = new Set();
    const out = [];
    for (const [list, role, roleLabel] of CADRE_ROLES) {
        for (const raw of Array.isArray(cfg?.access?.[list]) ? cfg.access[list] : []) {
            const email = String(raw || '').trim().toLowerCase();
            if (!email || seen.has(email)) continue;
            seen.add(email);
            out.push({ email, role, roleLabel, name: null });
        }
    }
    if (out.length) {
        const { rows } = await db.query('SELECT lower(email) AS email, name FROM "User" WHERE lower(email) = ANY($1::text[])', [out.map(o => o.email)]).catch(() => ({ rows: [] }));
        const names = new Map(rows.map(r => [r.email, r.name]));
        for (const o of out) o.name = names.get(o.email) || null;
    }
    return out;
};

/** `trCadre=me` se resuelve al correo de quien consulta. */
export const resolveTranslationQuery = (req) => {
    const q = { ...(req.query || {}) };
    if (String(q.trCadre || '').toLowerCase() === 'me') q.trCadre = String(req.user?.email || '__nadie__').toLowerCase();
    return q;
};

/** Las filas de la edición que pasan los filtros del listado (SIN la vista de traducción). */
const filteredRows = async (req, cfg, { keepView = false } = {}) => {
    const q = resolveTranslationQuery(req);
    const { clause, params } = buildFilters(q);
    const { rows } = await db.query(`SELECT * FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" DESC LIMIT 5000`, params);
    let list = rows;
    // Los filtros documentales también se combinan (pago confirmado +
    // documentación completa + traducción pendiente).
    if (hasDocQuery(q)) {
        const docs = await loadTracking(list, cfg);
        list = list.filter(r => matchesDocFilters(docs.get(r.id), { ...q, sortBy: undefined }));
    }
    const tr = await loadTranslationTracking(list);
    const tq = keepView ? q : { ...q, tr: undefined };
    return list.map(r => ({ row: r, tracking: tr.get(r.id)?.tracking || null })).filter(x => x.tracking && T.matchesTranslationFilters(x.tracking, tq));
};

// GET /admin/traducciones?evento=…&<filtros del listado>
export const getTranslationSummary = withSchema(async (req, res, { cfg, access }) => {
    const entries = await filteredRows(req, cfg);
    const config = T.normalizeTranslationConfig(cfg.translationTracking);
    const me = String(req.user?.email || '').toLowerCase();
    res.json({
        kpis: T.summarizeTranslations(entries.map(e => e.tracking)),
        workload: T.workloadByCadre(entries),
        mine: entries.filter(e => e.tracking.assignee && e.tracking.assignee.email.toLowerCase() === me).length,
        config,
        daysToDeadline: T.daysToDeadline(config.deadline),
        views: T.translationViewOptions(),
        states: T.TRACKING_STATES,
        reminderScopes: T.REMINDER_SCOPES,
        assignable: access.manageTranslation ? await assignableOf(cfg) : [],
        access: capsOf(access),
        generatedAt: new Date().toISOString(),
    });
}, 'view');

// ── Configuración (fecha límite de traducción y avisos) ───────────────────
export const getTranslationConfig = withSchema(async (req, res, { cfg }) => {
    res.json({ config: T.normalizeTranslationConfig(cfg.translationTracking), history: Array.isArray(cfg.translationTrackingHistory) ? cfg.translationTrackingHistory.slice(0, 30) : [] });
}, 'view');

export const saveTranslationConfig = withSchema(async (req, res, { cfg, access }) => {
    const eventId = clean(req.query?.evento, 60);
    if (!eventId) return res.status(400).json({ error: 'Abre una edición para configurar su seguimiento de traducciones.' });
    const { rows } = await db.query('SELECT 1 FROM "ProjectFairConfig" WHERE "eventId" = $1 LIMIT 1', [eventId]);
    if (!rows[0]) return res.status(409).json({ error: 'Esta edición todavía no tiene Convocatoria guardada. Guárdala primero.' });
    const before = T.normalizeTranslationConfig(cfg.translationTracking);
    const next = T.normalizeTranslationConfig({ ...before, ...(req.body?.config || req.body || {}) });
    const changed = Object.keys(next).filter(k => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
    const actor = actorFrom(req, access);
    const history = [{ at: new Date().toISOString(), by: actor.name, changed, deadline: next.deadline }, ...(Array.isArray(cfg.translationTrackingHistory) ? cfg.translationTrackingHistory : [])].slice(0, 30);
    await db.query(`UPDATE "ProjectFairConfig"
                    SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('translationTracking', $2::jsonb, 'translationTrackingHistory', $3::jsonb),
                        "updatedAt" = NOW()
                    WHERE "eventId" = $1`, [eventId, JSON.stringify(next), JSON.stringify(history)]);
    res.json({ config: next, changed, history });
}, 'config');

// ── Correo al Cadre (asignación y recordatorio) ───────────────────────────
const fmtDay = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }) : '');
export const cadreEmailHtml = ({ cfg, name, intro, items, config, link }) => {
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rows = items.map(({ row, tracking: t }) => `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:0 0 12px">
        <p style="margin:0 0 6px;font-size:15px"><strong>${esc(row.projectName)}</strong> <span style="color:#64748b">(${esc(row.publicRef)})</span></p>
        <p style="margin:0 0 4px;font-size:14px">${esc(row.clubName)} · ${esc(row.district)}</p>
        <p style="margin:0;font-size:14px">Estado: <strong>${esc(t?.label || 'Sin traducir')}</strong> · traducción ${t?.translatedPct ?? 0} % · revisión ${t?.reviewedPct ?? 0} %${t?.outdated ? ` · <span style="color:#b91c1c">${t.outdated} campo(s) desactualizado(s)</span>` : ''}</p>
      </div>`).join('');
    const deadline = config.deadline ? fmtDay(config.deadline) : null;
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:24px 0">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#17458F;color:#fff;padding:26px 32px">${headerLogoHtml(cfg)}<div style="font-size:18px;font-weight:700">${esc(cfg.edition?.name || 'Feria de Proyectos Rotary Colombia')}</div></div>
    <div style="padding:30px 32px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hola${name ? ` ${esc(name)}` : ''}:</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${intro}</p>
      ${rows}
      ${deadline ? `<p style="font-size:14px;line-height:1.6;margin:0 0 14px">Fecha límite de traducción: <strong>${esc(deadline)}</strong>.</p>` : ''}
      ${config.reminderNote ? `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;white-space:pre-line">${esc(config.reminderNote)}</p>` : ''}
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#475569">En «Proyectos postulados», abre cada proyecto → pestaña «Traducción»: revisa cada campo, márcalo como revisado y pulsa «Verificar traducción».</p>
      <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir Proyectos postulados</a></p>
      <p style="font-size:15px;line-height:1.6;margin:0">Equipo organizador<br>Feria de Proyectos Rotary Colombia</p>
    </div>
    ${footerBrandingHtml(cfg)}
  </div>
</div>`;
};

// POST /admin/traducciones/asignar   { ids:[], email: 'cadre@…' | '' , notify }
export const assignTranslations = withSchema(async (req, res, { cfg, access }) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(x => clean(x, 80)).filter(Boolean))].slice(0, 300);
    if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un proyecto.' });
    const email = clean(req.body?.email, 200).toLowerCase();
    const assignable = await assignableOf(cfg);
    const person = email ? assignable.find(a => a.email === email) : null;
    if (email && !person) return res.status(400).json({ error: 'Esa persona no está en Cadres, Revisores ni Traductores de la convocatoria. Agrégala primero en Convocatoria → Perfiles del módulo.' });
    const evento = clean(req.query?.evento, 60);
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[])', [ids]);
    const inScope = rows.filter(r => !evento || !r.eventId || r.eventId === evento);
    if (person) {
        // Nunca se asigna a alguien el proyecto del que es responsable: no
        // podría verificarlo.
        const own = inScope.filter(r => String(r.email || '').toLowerCase() === person.email);
        if (own.length) return res.status(409).json({ error: `${person.email} es responsable de ${own.map(r => r.publicRef).join(', ')}: no puede verificar su propio proyecto.` });
    }
    const actor = actorFrom(req, access);
    const before = await loadTranslationTracking(inScope, { sweep: false });
    const changed = [];
    for (const row of inScope) {
        const prev = before.get(row.id)?.header?.assigneeEmail || null;
        if ((prev || '') === (person?.email || '')) continue;
        await db.query(`INSERT INTO "ProjectDossierTranslation" ("submissionId", lang, "assigneeEmail", "assigneeName", "assignedAt", "assignedBy")
            VALUES ($1, 'en', $2, $3, CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END, $4)
            ON CONFLICT ("submissionId", lang) DO UPDATE SET "assigneeEmail" = $2, "assigneeName" = $3,
                "assignedAt" = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END, "assignedBy" = $4, "updatedAt" = NOW()`,
        [row.id, person?.email || null, person?.name || null, actor.name]);
        const action = !person ? 'unassigned' : (prev ? 'reassigned' : 'assigned');
        await insertTranslationEvent(db, {
            submissionId: row.id, eventId: row.eventId, lang: 'en', action,
            fromState: before.get(row.id)?.tracking?.state || null, toState: before.get(row.id)?.tracking?.state || null,
            assigneeEmail: person?.email || null, previousAssignee: prev, note: clean(req.body?.note, 500) || null, actor,
        });
        await logEvent(row.id, {
            type: 'dossier_translation_assigned',
            title: person ? `Traducción asignada a ${person.email}${prev ? ` (antes: ${prev})` : ''}` : `Traducción sin Cadre asignado (antes: ${prev})`,
            actor, metadata: { assignee: person?.email || null, previous: prev },
        }).catch(() => {});
        changed.push(row);
    }
    let notified = null;
    const config = T.normalizeTranslationConfig(cfg.translationTracking);
    if (person && changed.length && req.body?.notify !== false && config.notifyOnAssignment) {
        const after = await loadTranslationTracking(changed, { sweep: false });
        const r = await sendFairEmail({
            to: person.email, cfg,
            subject: `Proyectos asignados para verificar su traducción — ${cfg.edition?.name || 'Feria de Proyectos Rotary Colombia'}`,
            html: cadreEmailHtml({
                cfg, name: person.name, config, link: adminLinkFor(changed[0]),
                intro: `Se te ${changed.length === 1 ? 'asignó un proyecto' : `asignaron ${changed.length} proyectos`} para revisar y verificar su traducción al inglés.`,
                items: changed.map(row => ({ row, tracking: after.get(row.id)?.tracking })),
            }),
        }).catch(e => ({ success: false, error: e?.message }));
        notified = { to: person.email, status: r?.success ? 'sent' : 'failed', error: r?.success ? null : (r?.error || 'No se pudo enviar') };
        await insertTranslationEvent(db, { eventId: evento || null, lang: 'en', action: 'assignment_notice', recipient: person.email, submissionIds: changed.map(r => r.id), deliveryStatus: notified.status, deliveryError: notified.error, actor });
    }
    res.json({ ok: true, changed: changed.length, skipped: ids.length - inScope.length, unchanged: inScope.length - changed.length, notified, assignee: person });
}, 'manageTranslation');

// ── Recordatorios a los Cadres ────────────────────────────────────────────
const planTranslationReminders = async ({ cfg, eventId, scope, ids }) => {
    let rows;
    if (scope === 'seleccion') {
        rows = (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[]) AND ("eventId" = $2 OR "eventId" IS NULL)', [ids, eventId])).rows;
    } else {
        const { clause, params } = buildFilters({ evento: eventId, archivadas: 'activas' });
        rows = (await db.query(`SELECT * FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" ASC LIMIT 2000`, params)).rows;
    }
    const tr = await loadTranslationTracking(rows);
    const plan = [];
    for (const row of rows) {
        const t = tr.get(row.id)?.tracking;
        if (scope === 'desactualizadas' && t?.state !== 'needs_update') continue;
        const v = T.reminderVerdict(t);
        plan.push({
            id: row.id, publicRef: row.publicRef, projectName: row.projectName, clubName: row.clubName,
            cadreEmail: t?.assignee?.email || null, cadreName: t?.assignee?.name || null,
            state: t?.state || null, label: t?.label || null, reviewedPct: t?.reviewedPct ?? null,
            send: v.ok, code: v.code || null, reason: v.reason || null, _row: row, _t: t,
        });
    }
    return { plan, recipients: T.groupByCadre(plan) };
};

// POST /admin/traducciones/recordatorios   { scope, ids?, confirm? }
// Sin `confirm: true` sólo devuelve el plan, los destinatarios y la vista
// previa del correo. Con confirmación, uno por Cadre, registrado ANTES de
// salir con una huella única por día (un doble clic no manda dos).
export const sendTranslationReminders = withSchema(async (req, res, { cfg, access }) => {
    const eventId = clean(req.query?.evento, 60);
    if (!eventId) return res.status(400).json({ error: 'Abre una edición para enviar recordatorios.' });
    const scope = T.REMINDER_SCOPE_KEYS.includes(clean(req.body?.scope, 30)) ? clean(req.body.scope, 30) : 'pendientes';
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => clean(x, 80)).filter(Boolean).slice(0, 500) : [];
    if (scope === 'seleccion' && !ids.length) return res.status(400).json({ error: 'Selecciona al menos un proyecto.' });
    const config = T.normalizeTranslationConfig(cfg.translationTracking);
    const { plan, recipients } = await planTranslationReminders({ cfg, eventId, scope, ids });
    const subject = `Traducciones pendientes de verificar — ${cfg.edition?.name || 'Feria de Proyectos Rotary Colombia'}`;
    const htmlFor = (g) => cadreEmailHtml({
        cfg, name: g.name, config, link: adminLinkFor(g.projects[0]._row),
        intro: `Tienes ${g.projects.length === 1 ? 'un proyecto' : `${g.projects.length} proyectos`} con la traducción al inglés pendiente de revisión o verificación.`,
        items: g.projects.map(p => ({ row: p._row, tracking: p._t })),
    });
    const publicPlan = plan.map(({ _row, _t, ...rest }) => rest);
    if (req.body?.confirm !== true) {
        return res.json({
            preview: true, scope, plan: publicPlan,
            recipients: recipients.map(g => ({ email: g.email, name: g.name, projects: g.projects.map(p => ({ id: p.id, publicRef: p.publicRef, projectName: p.projectName, label: p.label })) })),
            willSend: recipients.length, projects: recipients.reduce((a, g) => a + g.projects.length, 0),
            skipped: plan.filter(p => !p.send).length,
            sample: recipients[0] ? { to: recipients[0].email, subject, html: htmlFor(recipients[0]) } : null,
            deadline: config.deadline,
        });
    }
    const actor = actorFrom(req, access);
    const outcomes = [];
    for (const g of recipients) {
        const subIds = g.projects.map(p => p.id);
        const ins = await insertTranslationEvent(db, {
            eventId, lang: 'en', action: 'reminder', recipient: g.email, submissionIds: subIds,
            deliveryStatus: 'queued', dedupeKey: T.reminderDedupeKey(g.email, subIds), actor,
        });
        if (!ins.rows[0]) { outcomes.push({ email: g.email, status: 'duplicate', projects: subIds.length }); continue; }
        const r = await sendFairEmail({ to: g.email, subject, html: htmlFor(g), cfg }).catch(e => ({ success: false, error: e?.message }));
        await db.query('UPDATE "ProjectDossierTranslationEvent" SET "deliveryStatus" = $2, "deliveryError" = $3 WHERE id = $1',
            [ins.rows[0].id, r?.success ? 'sent' : 'failed', r?.success ? null : clean(r?.error || 'No se pudo enviar', 500)]);
        outcomes.push({ id: ins.rows[0].id, email: g.email, status: r?.success ? 'sent' : 'failed', error: r?.success ? null : (r?.error || 'No se pudo enviar'), projects: subIds.length });
    }
    res.json({
        preview: false,
        sent: outcomes.filter(o => o.status === 'sent').length,
        failed: outcomes.filter(o => o.status === 'failed').length,
        duplicates: outcomes.filter(o => o.status === 'duplicate').length,
        skipped: publicPlan.filter(p => !p.send),
        outcomes,
    });
}, 'manageTranslation');

// GET /admin/traducciones/recordatorios — el registro de avisos a los Cadres.
export const listTranslationReminders = withSchema(async (req, res) => {
    const eventId = clean(req.query?.evento, 60) || null;
    const { rows } = await db.query(`SELECT id, action, recipient, "submissionIds", "deliveryStatus", "deliveryError", "actorName", "createdAt"
        FROM "ProjectDossierTranslationEvent" WHERE action IN ('reminder', 'assignment_notice') AND ($1::text IS NULL OR "eventId" = $1)
        ORDER BY "createdAt" DESC LIMIT 200`, [eventId]);
    res.json({ reminders: rows });
}, 'view');

// ════════════════════════════════════════════════════════════════════════════
// Glosario
// ════════════════════════════════════════════════════════════════════════════
export const getGlossary = withSchema(async (req, res, { access }) => {
    const { saved, merged } = await loadGlossary('en');
    res.json({ entries: merged, saved, access: capsOf(access) });
}, 'view');

export const saveGlossaryEntry = withSchema(async (req, res, { access }) => {
    const source = clean(req.body?.source, 200);
    const target = clean(req.body?.target, 200);
    const kind = ['term', 'area', 'option'].includes(req.body?.kind) ? req.body.kind : 'term';
    if (!source || !target) return res.status(400).json({ error: 'Escribe el término en español y su equivalencia en inglés.' });
    const actor = actorFrom(req, access);
    const { rows } = await db.query(`
        INSERT INTO "ProjectDossierGlossary" (lang, source, target, kind, note, active, "createdBy", "updatedBy")
        VALUES ('en', $1, $2, $3, $4, TRUE, $5, $5)
        ON CONFLICT (lang, lower(source)) DO UPDATE SET source = EXCLUDED.source, target = EXCLUDED.target, kind = EXCLUDED.kind,
            note = EXCLUDED.note, active = TRUE, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()
        RETURNING *`, [source, target, kind, clean(req.body?.note, 300) || null, actor.name]);
    res.status(201).json({ entry: rows[0], entries: (await loadGlossary('en')).merged });
}, 'config');

export const deleteGlossaryEntry = withSchema(async (req, res) => {
    await db.query('DELETE FROM "ProjectDossierGlossary" WHERE id = $1', [clean(req.params.glossaryId, 80)]);
    res.json({ ok: true, entries: (await loadGlossary('en')).merged });
}, 'config');

// ════════════════════════════════════════════════════════════════════════════
// Libreta de presentación
// ════════════════════════════════════════════════════════════════════════════
const bookletLang = (v) => (['es', 'en'].includes(v) ? v : 'es');

const translationsForBooklet = async (row, dossier) => {
    const { header, status } = await statusFor(dossier, row.id, 'en');
    if (header?.approvedVersionId) {
        const v = await db.query('SELECT fields FROM "ProjectDossierTranslationVersion" WHERE id = $1', [header.approvedVersionId]);
        if (v.rows[0]) return { map: new Map(Object.entries(v.rows[0].fields || {}).map(([p, f]) => [p, f.text])), mode: 'approved' };
    }
    const drafts = status.fields.filter(f => f.text);
    return { map: new Map(drafts.map(f => [f.path, f.text])), mode: drafts.length ? 'draft' : 'none' };
};

// GET /admin/postulaciones/:id/libreta
export const getBooklet = withSchema(async (req, res, { access }) => {
    const row = await loadScoped(req, res); if (!row) return;
    const { rows } = await db.query('SELECT * FROM "ProjectDossierBooklet" WHERE "submissionId" = $1 ORDER BY lang, "versionNumber" DESC', [row.id]);
    const out = {};
    for (const lang of ['es', 'en']) {
        const versions = rows.filter(r => r.lang === lang);
        out[lang] = { current: versions[0] || null, versions: versions.map(v => ({ id: v.id, versionNumber: v.versionNumber, status: v.status, createdBy: v.createdBy, createdAt: v.createdAt, approvedAt: v.approvedAt, approvedBy: v.approvedBy })) };
    }
    res.json({ booklets: out, access: capsOf(access) });
}, 'view');

// POST /admin/postulaciones/:id/libreta/preparar  { lang } — PROPUESTA, no se guarda.
export const prepareBooklet = withSchema(async (req, res) => {
    const row = await loadScoped(req, res); if (!row) return;
    const lang = bookletLang(req.body?.lang);
    const { dossier } = await loadDossier(row);
    let translationMode = null;
    let translations = null;
    if (lang === 'en') {
        const t = await translationsForBooklet(row, dossier);
        translations = t.map; translationMode = t.mode;
    }
    const proposal = D.prepareBooklet(dossier, { lang, translations });
    res.json({ proposal, translationMode });
}, 'translate');

// PUT /admin/postulaciones/:id/libreta   { lang, content } — cada guardado es una versión.
export const saveBooklet = withSchema(async (req, res, { access }) => {
    const row = await loadScoped(req, res); if (!row) return;
    const lang = bookletLang(req.body?.lang);
    const norm = D.normalizeBooklet(req.body?.content);
    if (!norm.ok) return res.status(400).json({ error: norm.error });
    const actor = actorFrom(req, access);
    const { dossier } = await loadDossier(row);
    const audit = D.auditBooklet(norm.content, dossier);
    const content = { ...norm.content, audit };
    const client = await db.pool.connect();
    let saved;
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dossier-booklet:${row.id}:${lang}`]);
        const n = await client.query('SELECT COALESCE(MAX("versionNumber"),0)+1 AS n FROM "ProjectDossierBooklet" WHERE "submissionId" = $1 AND lang = $2', [row.id, lang]);
        const { rows } = await client.query(`INSERT INTO "ProjectDossierBooklet" ("submissionId", lang, "versionNumber", content, status, "createdBy")
            VALUES ($1,$2,$3,$4::jsonb,'draft',$5) RETURNING *`, [row.id, lang, Number(n.rows[0].n), JSON.stringify(content), actor.name]);
        saved = rows[0];
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally { client.release(); }
    await logEvent(row.id, { type: 'dossier_booklet_saved', title: `Libreta (${lang === 'en' ? 'inglés' : 'español'}) guardada — versión ${saved.versionNumber}`, actor, metadata: { lang, versionNumber: saved.versionNumber, audit } }).catch(() => {});
    res.status(201).json({ booklet: saved, audit });
}, 'translate');

// POST /admin/postulaciones/:id/libreta/aprobar  { lang, acknowledge }
export const approveBooklet = withSchema(async (req, res, { access }) => {
    const row = await loadScoped(req, res); if (!row) return;
    const lang = bookletLang(req.body?.lang);
    const { rows } = await db.query('SELECT * FROM "ProjectDossierBooklet" WHERE "submissionId" = $1 AND lang = $2 ORDER BY "versionNumber" DESC LIMIT 1', [row.id, lang]);
    const current = rows[0];
    if (!current) return res.status(400).json({ error: 'Guarda la libreta antes de aprobarla.' });
    if (current.status === 'approved') return res.json({ ok: true, booklet: current });
    const audit = Array.isArray(current.content?.audit) ? current.content.audit : [];
    if (audit.length && req.body?.acknowledge !== true) {
        return res.status(409).json({ needsAcknowledge: true, audit, error: 'La libreta tiene cifras que no aparecen en el expediente. Confírmalas antes de aprobar.' });
    }
    const actor = actorFrom(req, access);
    const upd = await db.query(`UPDATE "ProjectDossierBooklet" SET status = 'approved', "approvedAt" = NOW(), "approvedBy" = $2 WHERE id = $1 AND status = 'draft' RETURNING *`, [current.id, actor.name]);
    await logEvent(row.id, { type: 'dossier_booklet_approved', title: `Libreta (${lang === 'en' ? 'inglés' : 'español'}) aprobada — versión ${current.versionNumber}`, actor, metadata: { lang, versionNumber: current.versionNumber } }).catch(() => {});
    res.json({ ok: true, booklet: upd.rows[0] || current });
}, 'approveTranslation');

// ════════════════════════════════════════════════════════════════════════════
// v4.1329 — Para la Dirección IA (herramientas N0 de los agentes). NO es una
// ruta: el ejecutor de la herramienta ya comprobó que la postulación es del
// sitio de la instalación (`clubId`). Sólo lee: el expediente armado con las
// plantillas vigentes y, si se pide, el ESTADO de su traducción (sin textos).
// ════════════════════════════════════════════════════════════════════════════
export async function agentDossierSnapshot(submissionId, { translation = false } = {}) {
    await ensureProjectDossierSchema();
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [String(submissionId)]);
    const row = rows[0];
    if (!row) return null;
    const { dossier } = await loadDossier(row);
    if (!translation) return { dossier };
    const { status } = await statusFor(dossier, row.id, 'en');
    return { dossier, translation: summaryOf(status) };
}

export default {
    getDossier, updateDossier, getDossierHistory,
    getTranslation, generateTranslation, saveTranslation, approveTranslation, verifyTranslation, revokeTranslation,
    getTranslationSummary, getTranslationConfig, saveTranslationConfig, assignTranslations, sendTranslationReminders, listTranslationReminders,
    getDocument, getDocumentsBulk, getDossierStates, getPortalDocument,
    getGlossary, saveGlossaryEntry, deleteGlossaryEntry,
    getBooklet, prepareBooklet, saveBooklet, approveBooklet,
};
