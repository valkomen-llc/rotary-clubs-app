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
import { withAccess, actorFrom } from './projectFairAdminController.js';
import { logEvent, readConfigForSubmission, readEditionEvent } from './projectFairController.js';
import { resolveForms, storageOf, storageIsShared } from '../lib/projectFormsRegistry.js';
import { withComputed, completionOf, validateAnswers } from '../lib/projectFormEngine.js';
import { ensureProjectDossierSchema } from '../lib/ensureProjectDossierSchema.js';
import { routeToModel, getDefaultModel } from '../lib/ai-router.js';
import D from '../lib/projectDossier.js';

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
        q.query('SELECT * FROM "ProjectDossierTranslation" WHERE "submissionId" = $1 AND lang = $2 LIMIT 1', [submissionId, lang]),
        q.query('SELECT * FROM "ProjectDossierTranslationField" WHERE "submissionId" = $1 AND lang = $2', [submissionId, lang]),
    ]);
    return { header: h.rows[0] || null, fieldRows: f.rows };
};

const statusFor = async (dossier, submissionId, lang) => {
    const items = D.translatableItems(dossier);
    const { header, fieldRows } = await loadTranslation(submissionId, lang);
    return { items, header, fieldRows, status: D.translationStatus({ items, fieldRows, header, now: Date.now() }) };
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
    const [{ status }, documents, edition] = await Promise.all([
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
    const { dossier } = await loadDossier(fresh);
    const { status } = await statusFor(dossier, row.id, 'en');
    res.json({ ok: true, changed: plan.changes.map(c => c.path), dossier, translation: { en: summaryOf(status) } });
}, 'edit');

// ════════════════════════════════════════════════════════════════════════════
// GET /admin/postulaciones/:id/expediente/historial
// ════════════════════════════════════════════════════════════════════════════
export const getDossierHistory = withSchema(async (req, res) => {
    const row = await loadScoped(req, res); if (!row) return;
    const [revisions, versions, booklets, exportsRows] = await Promise.all([
        db.query('SELECT * FROM "ProjectDossierRevision" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC LIMIT 400', [row.id]),
        db.query('SELECT id, lang, "versionNumber", "approvedBy", "approvedAt", note, (SELECT COUNT(*) FROM jsonb_object_keys(fields))::int AS "fieldCount" FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1 ORDER BY "approvedAt" DESC', [row.id]),
        db.query('SELECT id, lang, "versionNumber", status, "approvedAt", "approvedBy", "createdBy", "createdAt" FROM "ProjectDossierBooklet" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC', [row.id]),
        db.query('SELECT id, kind, lang, mode, "actorName", "createdAt", jsonb_array_length("submissionIds") AS projects FROM "ProjectDossierExport" WHERE "submissionIds" ? $1 ORDER BY "createdAt" DESC LIMIT 100', [row.id]),
    ]);
    res.json({ revisions: revisions.rows, translationVersions: versions.rows, booklets: booklets.rows, exports: exportsRows.rows });
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
    const [{ status }, glossary, versions] = await Promise.all([
        statusFor(dossier, row.id, lang),
        loadGlossary(lang),
        db.query('SELECT id, "versionNumber", "approvedBy", "approvedAt", note FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1 AND lang = $2 ORDER BY "versionNumber" DESC', [row.id, lang]),
    ]);
    res.json({ lang, status, glossary: glossary.merged, versions: versions.rows, access: capsOf(access) });
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

// POST /admin/postulaciones/:id/traduccion/:lang/aprobar   { acknowledgeWarnings, note }
export const approveTranslation = withSchema(async (req, res, { access }) => {
    const lang = langOf(req, res); if (!lang) return;
    const row = await loadScoped(req, res); if (!row) return;
    const actor = actorFrom(req, access);
    const { dossier } = await loadDossier(row);
    const { status, fieldRows } = await statusFor(dossier, row.id, lang);
    const check = D.approvalCheck(status, { acknowledgeWarnings: req.body?.acknowledgeWarnings === true });
    if (!check.ok) return res.status(check.needsAcknowledge ? 409 : 400).json({ ...check, status });

    const present = fieldRows.filter(r => status.fields.some(f => f.path === r.path));
    const fingerprint = D.fingerprintOf(present);
    const snapshot = Object.fromEntries(status.fields.map(f => [f.path, { label: f.label, source: f.source, text: f.text, sourceHash: f.sourceHash }]));
    const client = await db.pool.connect();
    let version;
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dossier-approve:${row.id}:${lang}`]);
        const n = await client.query('SELECT COALESCE(MAX("versionNumber"),0)+1 AS n FROM "ProjectDossierTranslationVersion" WHERE "submissionId" = $1 AND lang = $2', [row.id, lang]);
        const { rows } = await client.query(`INSERT INTO "ProjectDossierTranslationVersion" ("submissionId", lang, "versionNumber", fields, fingerprint, note, "approvedBy", "approvedById")
            VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8) RETURNING *`,
        [row.id, lang, Number(n.rows[0].n), JSON.stringify(snapshot), fingerprint, clean(req.body?.note, 500) || null, actor.name, actor.id]);
        version = rows[0];
        await client.query(`INSERT INTO "ProjectDossierTranslation" ("submissionId", lang, status, "approvedAt", "approvedBy", "approvedFingerprint", "approvedVersionId")
            VALUES ($1,$2,'idle',NOW(),$3,$4,$5)
            ON CONFLICT ("submissionId", lang) DO UPDATE SET "approvedAt" = NOW(), "approvedBy" = $3, "approvedFingerprint" = $4, "approvedVersionId" = $5, "updatedAt" = NOW()`,
        [row.id, lang, actor.name, fingerprint, version.id]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally { client.release(); }

    await logEvent(row.id, {
        type: 'dossier_translation_approved',
        title: `Traducción al inglés aprobada (versión ${version.versionNumber})`,
        detail: clean(req.body?.note, 500) || null,
        actor,
        metadata: { lang, versionId: version.id, versionNumber: version.versionNumber, fields: status.total },
    }).catch(() => {});
    const after = await statusFor(dossier, row.id, lang);
    res.json({ ok: true, version: { id: version.id, versionNumber: version.versionNumber, approvedAt: version.approvedAt }, status: after.status });
}, 'approveTranslation');

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
        out.translation = {
            mode, state: status.state, label: status.label,
            approvedAt: approvedVersion?.approvedAt || null, approvedBy: approvedVersion?.approvedBy || null,
            versionNumber: approvedVersion?.versionNumber || null,
            outdatedSinceApproval: mode === 'approved' && status.state !== 'approved',
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
        db.query('SELECT * FROM "ProjectDossierTranslation" WHERE "submissionId" = ANY($1::text[]) AND lang = $2', [ids, 'en']),
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
        const st = D.translationStatus({
            items: D.translatableItems(dossier),
            fieldRows: fields.rows.filter(f => f.submissionId === row.id),
            header: headers.rows.find(h => h.submissionId === row.id) || null,
            now: Date.now(),
        });
        states[row.id] = {
            en: { state: st.state, label: st.label, color: st.color, counts: st.counts, total: st.total },
            forms: forms.map(f => ({ key: f.key, started: !!f.record, completionPct: Number(f.record?.completionPct || 0) })),
        };
    }
    res.json({ states });
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
    getTranslation, generateTranslation, saveTranslation, approveTranslation,
    getDocument, getDocumentsBulk, getDossierStates,
    getGlossary, saveGlossaryEntry, deleteGlossaryEntry,
    getBooklet, prepareBooklet, saveBooklet, approveBooklet,
};
