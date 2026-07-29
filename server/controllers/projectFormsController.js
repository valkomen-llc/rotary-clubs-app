// ════════════════════════════════════════════════════════════════════
// Formularios del proyecto — panel del club y panel administrativo
// v4.643.0
//
// Un proyecto inscrito tiene varios formularios: la Formulación del Proyecto
// y la Solicitud de Aportes del FDD 2026-2027 (y los que se registren
// después, ver `server/lib/projectFormsRegistry.js`). Este controlador los
// atiende a TODOS con el mismo código: mismo guardado, mismo autoguardado,
// mismo historial, mismos permisos, mismos estados.
//
// Es lo que hace escalable el módulo: agregar un formulario no agrega
// endpoints ni tablas ni pantallas, sólo una entrada en el registro.
//
// EL ESPACIO INSTITUCIONAL (aprobación del Gobernador de Distrito y del
// presidente del Comité de LFRI) tiene dos modos, y la plantilla elige cuál:
//   · `districtSpace` — lo diligencian el club Y el Distrito. Es el caso del
//     FDD desde v4.643: el Gestor de Proyectos lo llena con lo que le
//     corresponde al proyecto y al club, y el Distrito lo confirma desde el
//     panel administrativo, donde queda registrado quién lo hizo y cuándo.
//     Se guarda con el resto de las respuestas.
//   · `adminOnly` — no lo escribe nunca el club: vive en la columna `approval`
//     y `stripProtected` descarta cualquier intento que llegue del panel del
//     club, aunque llame al endpoint a mano.
//
// SEGURIDAD — dos reglas que no dependen del navegador, valga el modo que
// valga:
//   1. `saveApproval` escribe SÓLO la sección institucional, y sólo los campos
//      que la plantilla declara: no puede alterar ninguna otra respuesta del
//      club. Exige rol administrativo del sitio y el permiso 'changeStatus'.
//   2. Si el formulario se puede editar lo decide siempre el servidor
//      (`editability`), con la cuenta y el estado del pago en la mano.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { ensureTables, logEvent, readConfigForAdmin, APPLICANT_ROLES } from './projectFairController.js';
import { withAccess, actorFrom } from './projectFairAdminController.js';
import {
    completionOf, missingRequired, validateAnswers, stripProtected,
    withComputed, flattenFields, districtSectionOf, isProtectedSection,
} from '../lib/projectFormEngine.js';
import {
    resolveForm, resolveForms, storageOf, storageIsShared, MASTER_FORM_KEY,
} from '../lib/projectFormsRegistry.js';

console.log('[projectFormsController] v4.643.0 cargado — Formularios del proyecto: el espacio institucional (aprobación del GD y del Comité de LFRI) lo diligencian el club y el Distrito');

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Tablas donde pueden vivir las respuestas. Lista blanca explícita: el nombre
// de la tabla entra literal en el SQL (no se puede parametrizar un
// identificador), así que nunca puede salir de la petición.
const ALLOWED_TABLES = new Set(['ProjectFairMasterForm', 'ProjectFairProjectForm']);
const tableFor = (formKey) => {
    const table = storageOf(formKey);
    if (!ALLOWED_TABLES.has(table)) throw new Error(`Tabla no permitida para el formulario ${formKey}`);
    return table;
};

// ── Estados visibles del formulario ──────────────────────────────────
// El estado que ve el usuario no es una columna: se deriva de lo que el club
// escribió y de lo que el Distrito decidió. Así no hay dos fuentes de verdad
// que puedan discrepar (una fila "enviada" con 40% de avance, por ejemplo).
export const FORM_STATES = [
    { key: 'not_started', label: 'No iniciado', color: 'slate' },
    { key: 'in_progress', label: 'En progreso', color: 'amber' },
    { key: 'completed', label: 'Completado', color: 'sky' },
    { key: 'submitted', label: 'Enviado', color: 'emerald' },
    { key: 'in_review', label: 'En revisión', color: 'indigo' },
    { key: 'approved', label: 'Aprobado', color: 'emerald' },
    { key: 'rejected', label: 'Rechazado', color: 'red' },
];
const REVIEW_STATES = ['in_review', 'approved', 'rejected'];

export const deriveState = (record) => {
    if (!record) return 'not_started';
    if (REVIEW_STATES.includes(record.reviewStatus)) return record.reviewStatus;
    if (record.status === 'submitted') return 'submitted';
    const pct = Number(record.completionPct || 0);
    if (pct >= 100) return 'completed';
    return pct > 0 ? 'in_progress' : 'not_started';
};

// ── Acceso a las respuestas ──────────────────────────────────────────
export const readRecord = async (submissionId, formKey) => {
    const table = tableFor(formKey);
    const { rows } = storageIsShared(formKey)
        ? await db.query(`SELECT * FROM "${table}" WHERE "submissionId" = $1 AND "formKey" = $2 LIMIT 1`, [submissionId, formKey])
        : await db.query(`SELECT * FROM "${table}" WHERE "submissionId" = $1 LIMIT 1`, [submissionId]);
    return rows[0] || null;
};

/** Todas las respuestas de un proyecto, indexadas por formulario. */
export const readAllRecords = async (submissionId, forms) => {
    const out = {};
    for (const form of forms) {
        out[form.key] = await readRecord(submissionId, form.key).catch(() => null);
    }
    return out;
};

/**
 * Guarda las respuestas del club. `answers` ya viene depurado: sin la sección
 * del Distrito y sin campos derivados.
 */
const writeAnswers = async (submissionId, formKey, { answers, pct, submitted = false }) => {
    const table = tableFor(formKey);
    const status = submitted ? 'submitted' : 'draft';
    const payload = JSON.stringify(answers);

    if (storageIsShared(formKey)) {
        const { rows } = await db.query(`
            INSERT INTO "${table}" ("submissionId", "formKey", answers, "completionPct", status, "submittedAt", "lastEditedAt")
            VALUES ($1,$2,$3::jsonb,$4,$5,${submitted ? 'NOW()' : 'NULL'},NOW())
            ON CONFLICT ("submissionId", "formKey") DO UPDATE
            SET answers = $3::jsonb, "completionPct" = $4,
                status = ${submitted ? `'submitted'` : `"${table}".status`},
                "submittedAt" = ${submitted ? 'NOW()' : `"${table}"."submittedAt"`},
                "lastEditedAt" = NOW(), "updatedAt" = NOW()
            RETURNING *
        `, [submissionId, formKey, payload, pct, status]);
        return rows[0];
    }

    const { rows } = await db.query(`
        INSERT INTO "${table}" ("submissionId", answers, "completionPct", status, "submittedAt", "lastEditedAt")
        VALUES ($1,$2::jsonb,$3,$4,${submitted ? 'NOW()' : 'NULL'},NOW())
        ON CONFLICT ("submissionId") DO UPDATE
        SET answers = $2::jsonb, "completionPct" = $3,
            status = ${submitted ? `'submitted'` : `"${table}".status`},
            "submittedAt" = ${submitted ? 'NOW()' : `"${table}"."submittedAt"`},
            "lastEditedAt" = NOW(), "updatedAt" = NOW()
        RETURNING *
    `, [submissionId, payload, pct, status]);
    return rows[0];
};

/** Crea el borrador inicial con la información que ya conocemos del proyecto. */
const createDraft = async (submissionId, formKey, answers, pct) => {
    const table = tableFor(formKey);
    const payload = JSON.stringify(answers);
    if (storageIsShared(formKey)) {
        const { rows } = await db.query(`
            INSERT INTO "${table}" ("submissionId", "formKey", answers, "completionPct", "lastEditedAt")
            VALUES ($1,$2,$3::jsonb,$4,NOW())
            ON CONFLICT ("submissionId", "formKey") DO NOTHING
            RETURNING *
        `, [submissionId, formKey, payload, pct]);
        return rows[0] || await readRecord(submissionId, formKey);
    }
    const { rows } = await db.query(`
        INSERT INTO "${table}" ("submissionId", answers, "completionPct", "lastEditedAt")
        VALUES ($1,$2::jsonb,$3,NOW())
        ON CONFLICT ("submissionId") DO NOTHING
        RETURNING *
    `, [submissionId, payload, pct]);
    return rows[0] || await readRecord(submissionId, formKey);
};

/**
 * Historial. Una revisión por envío, y en los autoguardados como máximo una
 * cada 10 minutos: si no, cada tecleo dejaría una fila.
 */
const saveRevision = async (submissionId, formKey, { answers, pct, action, actorType, actorName, force = false }) => {
    if (!force) {
        const last = await db.query(
            `SELECT "createdAt" FROM "ProjectFairFormRevision" WHERE "submissionId" = $1 AND COALESCE("formKey",'master') = $2 ORDER BY "createdAt" DESC LIMIT 1`,
            [submissionId, formKey]
        ).catch(() => ({ rows: [] }));
        const lastAt = last.rows[0]?.createdAt ? new Date(last.rows[0].createdAt).getTime() : 0;
        if (Date.now() - lastAt <= 10 * 60 * 1000) return;
    }
    await db.query(`
        INSERT INTO "ProjectFairFormRevision" ("submissionId", "formKey", answers, "completionPct", action, "actorType", "actorName")
        VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)
    `, [submissionId, formKey, JSON.stringify(answers), pct, action, actorType, actorName]).catch(() => {});
};

// ── Precarga ─────────────────────────────────────────────────────────
/**
 * Valores que ya conocemos del proyecto y no hay por qué volver a pedir.
 * El destino de cada dato lo decide el mapa `prefill` de cada plantilla, así
 * que reordenar o renombrar secciones no rompe la precarga.
 *
 * `prefillFrom` va un paso más allá: copia respuestas de OTRO formulario del
 * mismo proyecto ('formKey.seccion.campo'), que es lo que evita que el club
 * escriba dos veces el objetivo o los beneficiarios.
 */
export const seedAnswersFor = (template, submission, cfg, relatedAnswers = {}) => {
    const sources = {
        projectName: submission.projectName || '',
        clubName: submission.clubName || '',
        district: submission.district || '',
        city: '',
        country: cfg?.edition?.country || 'Colombia',
        focusArea: submission.focusAreaLabel ? [submission.focusAreaLabel] : [],
        // Misma área, en texto: para los formularios que la piden con una sola
        // opción en vez de una lista.
        focusAreaLabel: submission.focusAreaLabel || '',
        contactName: `${submission.firstName || ''} ${submission.lastName || ''}`.trim(),
        contactEmail: submission.email || '',
        contactPhone: submission.phone || '',
        budgetUsd: submission.budgetUsd ? Number(submission.budgetUsd) : '',
    };

    const answers = {};
    const put = (target, value) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value) && !value.length) return;
        const [sectionKey, fieldKey] = String(target).split('.');
        if (!sectionKey || !fieldKey) return;
        answers[sectionKey] = { ...(answers[sectionKey] || {}), [fieldKey]: value };
    };

    // 1. Valores por defecto de la propia plantilla (periodos, constantes).
    flattenFields(template).forEach(field => {
        if (field.default !== undefined) put(`${field.sectionKey}.${field.key}`, field.default);
    });
    // 2. Datos de la inscripción.
    for (const [source, target] of Object.entries(template?.prefill || {})) put(target, sources[source]);
    // 3. Respuestas de otros formularios del mismo proyecto.
    for (const [path, target] of Object.entries(template?.prefillFrom || {})) {
        const [formKey, sectionKey, fieldKey] = String(path).split('.');
        if (!formKey || !sectionKey || !fieldKey) continue;
        put(target, relatedAnswers?.[formKey]?.[sectionKey]?.[fieldKey]);
    }
    return answers;
};

// ── Permisos de edición ──────────────────────────────────────────────
/**
 * ¿Puede el club editar este formulario? La convocatoria confirmada permite
 * editar hasta la fecha límite; después queda en solo lectura salvo que el
 * administrador lo reabra.
 *
 * Vivía en `projectFairPortalController`; se movió aquí en v4.642 para que la
 * decisión sea la misma para todos los formularios y haya un solo lugar donde
 * cambiarla.
 */
export const editability = (submission, form, cfg, account = null) => {
    if (submission?.status !== 'paid') {
        return { canEdit: false, reason: 'Tu formulario se habilita cuando se confirme el pago de la inscripción.' };
    }
    // Rol suspendido (reembolso): conserva consulta y descarga, pierde edición.
    if (account?.role === APPLICANT_ROLES.SUSPENDED) {
        return { canEdit: false, reason: 'Tu inscripción fue reembolsada. Puedes consultar y descargar tu proyecto, pero ya no editarlo.' };
    }
    if (form?.lockedAt && !form?.reopenedAt) {
        return { canEdit: false, reason: 'El comité cerró la edición de este formulario.' };
    }
    if (form?.reviewStatus === 'approved') {
        return { canEdit: false, reason: 'El Distrito ya aprobó esta solicitud, así que quedó en solo lectura.' };
    }
    const deadline = cfg?.deadline ? new Date(`${cfg.deadline}T23:59:59-05:00`) : null;
    if (deadline && !Number.isNaN(deadline.getTime()) && new Date() > deadline && !form?.reopenedAt) {
        return { canEdit: false, reason: `El plazo de postulación cerró el ${cfg.deadline}. Escríbenos si necesitas hacer un ajuste.` };
    }
    return { canEdit: true, reason: null };
};

// ── Contexto común de las peticiones del panel del club ──────────────
const portalContext = async (req) => {
    await ensureTables();
    const cfg = await readConfigForAdmin();
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
    const submission = rows[0];
    if (!submission) return { error: { code: 404, message: 'No encontramos tu inscripción.' } };
    const { rows: accRows } = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
    return { cfg, submission, account: accRows[0] || null };
};

/**
 * Tarjeta de un formulario para el panel del proyecto: qué es, cómo va y qué
 * se puede hacer con él. Es lo que dibuja la cuadrícula de "Gestión de
 * Proyectos", así que un formulario nuevo aparece ahí sin tocar la pantalla.
 */
export const cardFor = (form, record, { submission, cfg, account }) => {
    const edit = editability(submission, record, cfg, account);
    const state = deriveState(record);
    return {
        key: form.key,
        title: form.template?.title || form.key,
        shortTitle: form.template?.shortTitle || form.template?.title || form.key,
        subtitle: form.template?.subtitle || '',
        intro: form.template?.intro || '',
        icon: form.template?.icon || 'file-text',
        sections: (form.template?.sections || []).filter(s => !s.adminOnly).length,
        state,
        status: record?.status || 'draft',
        reviewStatus: record?.reviewStatus || null,
        reviewNote: record?.reviewNote || null,
        completionPct: Number(record?.completionPct || 0),
        submittedAt: record?.submittedAt || null,
        lastEditedAt: record?.lastEditedAt || null,
        lockedAt: record?.lockedAt || null,
        canEdit: edit.canEdit,
        reason: edit.reason,
        ...approvalState(form.template, record),
    };
};

/**
 * Estado del espacio institucional: si el formulario lo tiene y si ya está
 * diligenciado. Mira donde corresponda —la columna `approval` o las respuestas—
 * según cómo esté declarada la sección.
 */
const approvalState = (template, record) => {
    const section = districtSectionOf(template);
    if (!section) return { hasApproval: false, approvalFilled: false };
    const values = isProtectedSection(section)
        ? record?.approval?.[section.key]
        : record?.answers?.[section.key];
    return {
        hasApproval: true,
        approvalFilled: !!values && Object.values(values).some(v => String(v ?? '').trim() !== ''),
    };
};

// ════════════════════════════════════════════════════════════════════
// Panel del club
// ════════════════════════════════════════════════════════════════════

/** Resumen de todos los formularios del proyecto: alimenta las tarjetas. */
export const listPortalForms = async (submission, cfg, account) => {
    const forms = resolveForms(cfg);
    const records = await readAllRecords(submission.id, forms);
    return forms.map(form => cardFor(form, records[form.key], { submission, cfg, account }));
};

// GET /portal/forms
export const getForms = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        res.json({ forms: await listPortalForms(ctx.submission, ctx.cfg, ctx.account), states: FORM_STATES });
    } catch (error) {
        console.error('[project-forms] getForms:', error);
        res.status(500).json({ error: 'No pudimos cargar tus formularios.' });
    }
};

// GET /portal/forms/:formKey
export const getForm = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        const { cfg, submission, account } = ctx;

        const form = resolveForm(cfg, req.params.formKey);
        if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

        let record = await readRecord(submission.id, form.key);
        if (!record && submission.status === 'paid') {
            // Primera apertura: se crea el borrador ya precargado con lo que
            // la plataforma sabe del proyecto y con lo que el club respondió
            // en los otros formularios.
            const others = await readAllRecords(submission.id, resolveForms(cfg));
            const related = Object.fromEntries(Object.entries(others).map(([k, r]) => [k, r?.answers || {}]));
            const answers = seedAnswersFor(form.template, submission, cfg, related);
            record = await createDraft(submission.id, form.key, answers, completionOf(form.template, answers));
            await logEvent(submission.id, {
                type: 'form_started',
                title: `${form.template?.title || form.key}: iniciado`,
                detail: 'El club abrió el formulario por primera vez.',
                actor: { name: submission.email, role: 'club' },
                metadata: { formKey: form.key },
            });
        }

        const answers = record?.answers || {};
        res.json({
            formKey: form.key,
            template: form.template,
            form: record ? {
                status: record.status, completionPct: record.completionPct,
                submittedAt: record.submittedAt, lastEditedAt: record.lastEditedAt,
                lockedAt: record.lockedAt, reviewStatus: record.reviewStatus,
                reviewNote: record.reviewNote, reviewedAt: record.reviewedAt,
            } : null,
            state: deriveState(record),
            answers,
            // La sección del Distrito viaja en solo lectura: el club la ve
            // (para saber qué le aprobaron) pero no la escribe.
            approval: record?.approval || {},
            computed: withComputed(form.template, answers),
            focusAreas: cfg.focusAreas || [],
            deadline: cfg.deadline,
            submission: {
                id: submission.id, publicRef: submission.publicRef,
                projectName: submission.projectName, clubName: submission.clubName,
                district: submission.district,
            },
            ...editability(submission, record, cfg, account),
        });
    } catch (error) {
        console.error('[project-forms] getForm:', error);
        res.status(500).json({ error: 'No pudimos cargar el formulario.' });
    }
};

// PUT /portal/forms/:formKey — guardar borrador (lo llama el autoguardado)
export const saveForm = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        const { cfg, submission, account } = ctx;

        const form = resolveForm(cfg, req.params.formKey);
        if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

        const record = await readRecord(submission.id, form.key);
        const edit = editability(submission, record, cfg, account);
        if (!edit.canEdit) return res.status(403).json({ error: edit.reason });

        // Aquí se cae cualquier intento de escribir la sección del Distrito.
        const answers = stripProtected(form.template, req.body?.answers);
        const pct = completionOf(form.template, answers);
        const saved = await writeAnswers(submission.id, form.key, { answers, pct });

        await saveRevision(submission.id, form.key, {
            answers, pct, action: 'save', actorType: 'club', actorName: submission.email,
        });

        res.json({
            completionPct: pct, savedAt: saved.lastEditedAt, status: saved.status,
            state: deriveState(saved), computed: withComputed(form.template, answers),
        });
    } catch (error) {
        console.error('[project-forms] saveForm:', error);
        res.status(500).json({ error: 'No pudimos guardar los cambios.' });
    }
};

// POST /portal/forms/:formKey/submit
export const submitForm = async (req, res) => {
    try {
        const ctx = await portalContext(req);
        if (ctx.error) return res.status(ctx.error.code).json({ error: ctx.error.message });
        const { cfg, submission, account } = ctx;

        const form = resolveForm(cfg, req.params.formKey);
        if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

        const record = await readRecord(submission.id, form.key);
        const edit = editability(submission, record, cfg, account);
        if (!edit.canEdit) return res.status(403).json({ error: edit.reason });

        const answers = req.body?.answers !== undefined
            ? stripProtected(form.template, req.body.answers)
            : (record?.answers || {});

        const missing = missingRequired(form.template, answers);
        if (missing.length) {
            return res.status(400).json({ error: 'Faltan campos obligatorios por completar.', missing });
        }
        // Formato: correos, teléfonos, fechas, montos y porcentajes. Se
        // comprueba en el servidor aunque el navegador ya lo haya hecho.
        const invalid = validateAnswers(form.template, answers);
        if (invalid.length) {
            return res.status(400).json({ error: 'Hay campos con un formato incorrecto.', invalid });
        }

        const pct = completionOf(form.template, answers);
        const saved = await writeAnswers(submission.id, form.key, { answers, pct, submitted: true });

        await saveRevision(submission.id, form.key, {
            answers, pct, action: 'submit', actorType: 'club', actorName: submission.email, force: true,
        });

        // La postulación entra a revisión salvo que ya esté más avanzada. Sólo
        // lo hace la Formulación: los formularios de apoyo no mueven el estado
        // general del proyecto.
        if (form.key === MASTER_FORM_KEY) {
            await db.query(`
                UPDATE "ProjectFairSubmission"
                SET "workflowStatus" = CASE WHEN "workflowStatus" IN ('payment_confirmed','received','pending_payment')
                                            THEN 'in_review' ELSE "workflowStatus" END,
                    "updatedAt" = NOW()
                WHERE id = $1
            `, [submission.id]);
        }

        await logEvent(submission.id, {
            type: form.key === MASTER_FORM_KEY ? 'form_submitted_master' : 'project_form_submitted',
            title: `${form.template?.title || form.key}: enviado`,
            detail: `El club envió el formulario completo (${pct}%).`,
            actor: { name: submission.email, role: 'club' },
            metadata: { formKey: form.key },
        });

        res.json({ status: 'submitted', state: deriveState(saved), completionPct: pct, submittedAt: saved.submittedAt });
    } catch (error) {
        console.error('[project-forms] submitForm:', error);
        res.status(500).json({ error: 'No pudimos enviar el formulario.' });
    }
};

// ════════════════════════════════════════════════════════════════════
// Panel administrativo
// ════════════════════════════════════════════════════════════════════

// GET /admin/forms?formKey=…&formStatus=…&search=…
export const adminListForms = withAccess(async (req, res, { cfg, access }) => {
    const formKey = clean(req.query.formKey, 60) || MASTER_FORM_KEY;
    const form = resolveForm(cfg, formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const table = tableFor(form.key);
    const params = [];
    let join = `LEFT JOIN "${table}" f ON f."submissionId" = s.id`;
    if (storageIsShared(form.key)) {
        params.push(form.key);
        join += ` AND f."formKey" = $1`;
    }

    const where = [];
    const formStatus = clean(req.query.formStatus, 30);
    if (formStatus === 'not_started') where.push('f.id IS NULL');
    else if (formStatus === 'draft') where.push(`f.status = 'draft'`);
    else if (formStatus === 'submitted') where.push(`f.status = 'submitted'`);
    else if (formStatus === 'paid_pending') where.push(`s.status = 'paid' AND (f.id IS NULL OR f.status = 'draft')`);

    const search = clean(req.query.search, 160);
    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        where.push(`(s."clubName" ILIKE $${i} OR s."projectName" ILIKE $${i} OR s.email ILIKE $${i} OR s."publicRef" ILIKE $${i})`);
    }

    const { rows } = await db.query(`
        SELECT s.id, s."publicRef", s."projectName", s."clubName", s.district, s.email,
               s.status AS "paymentStatus", s."workflowStatus", s."createdAt",
               f.status AS "formStatus", f."completionPct", f."submittedAt", f."lastEditedAt",
               f."lockedAt", f."reopenedAt", f."reviewStatus", f."reviewedAt", f.approval, f.answers,
               (a.id IS NOT NULL) AS "hasAccount", a."lastLoginAt"
        FROM "ProjectFairSubmission" s
        ${join}
        LEFT JOIN "ProjectFairAccount" a ON a."submissionId" = s.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY f."submittedAt" DESC NULLS LAST, s."createdAt" DESC
    `, params);

    // `answers` y `approval` se leen para saber si el espacio institucional ya
    // está diligenciado, pero no se devuelven: el listado no necesita cargar
    // las respuestas completas de cada club.
    const forms = rows.map(({ answers, approval, ...r }) => ({
        ...r,
        ...approvalState(form.template, { answers, approval }),
        state: deriveState(r),
    }));
    const stats = forms.reduce((acc, r) => {
        const key = r.formStatus || 'not_started';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    res.json({
        formKey: form.key,
        available: resolveForms(cfg).map(f => ({
            key: f.key,
            title: f.template?.title,
            shortTitle: f.template?.shortTitle || f.template?.title,
            docx: !!f.docx,
            hasApproval: !!districtSectionOf(f.template),
        })),
        forms, stats, access, states: FORM_STATES,
    });
});

// GET /admin/postulaciones/:id/forms/:formKey — respuestas + plantilla + firma
export const adminGetForm = withAccess(async (req, res, { cfg }) => {
    const form = resolveForm(cfg, req.params.formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const { rows } = await db.query(
        'SELECT id, "publicRef", "projectName", "clubName", district, email, status, "workflowStatus" FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1',
        [req.params.id]
    );
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });

    const record = await readRecord(submission.id, form.key);
    const revisions = await db.query(
        `SELECT id, action, "actorType", "actorName", "completionPct", "createdAt"
         FROM "ProjectFairFormRevision" WHERE "submissionId" = $1 AND COALESCE("formKey",'master') = $2
         ORDER BY "createdAt" DESC LIMIT 30`,
        [submission.id, form.key]
    ).catch(() => ({ rows: [] }));

    res.json({
        submission,
        formKey: form.key,
        template: form.template,
        form: record,
        answers: record?.answers || {},
        approval: record?.approval || {},
        computed: withComputed(form.template, record?.answers || {}),
        state: deriveState(record),
        focusAreas: cfg.focusAreas || [],
        revisions: revisions.rows,
    });
});

/**
 * PUT /admin/postulaciones/:id/forms/:formKey/approval
 *
 * La firma del Gobernador de Distrito y del presidente del Comité de LFRI, y
 * la decisión sobre la solicitud. Es el ÚNICO camino para escribir la sección
 * `adminOnly`: exige sesión de plataforma con rol administrativo y el permiso
 * 'changeStatus' del módulo.
 */
export const saveApproval = withAccess(async (req, res, { cfg, access }) => {
    const form = resolveForm(cfg, req.params.formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const section = districtSectionOf(form.template);
    if (!section) return res.status(400).json({ error: 'Este formulario no tiene sección de aprobación.' });

    const record = await readRecord(req.params.id, form.key);
    if (!record) return res.status(404).json({ error: 'Este club todavía no ha iniciado este formulario.' });

    const reviewStatus = REVIEW_STATES.includes(req.body?.reviewStatus) ? req.body.reviewStatus : null;
    const reviewNote = clean(req.body?.reviewNote, 1000) || null;
    const actor = actorFrom(req, access);

    // Dónde vive la sección depende de quién la puede escribir:
    //   · `adminOnly`     → columna `approval`, fuera del alcance del club.
    //   · `districtSpace` → con el resto de las respuestas, porque el club
    //                       también la diligencia (v4.643). Se mezcla campo a
    //                       campo para no borrar lo que ya hubiera escrito.
    // En los dos casos se guarda SÓLO esa sección: el cuerpo no puede tocar
    // ninguna otra respuesta del club.
    const protectedSection = isProtectedSection(section);
    const incoming = req.body?.approval?.[section.key];
    const values = isPlainObject(incoming) ? incoming : {};
    const allowed = new Set((section.fields || []).map(f => f.key));
    const clamped = Object.fromEntries(Object.entries(values).filter(([k]) => allowed.has(k)));

    const approval = protectedSection
        ? { [section.key]: clamped }
        : (record.approval || {});
    const answers = protectedSection
        ? (record.answers || {})
        : { ...(record.answers || {}), [section.key]: { ...(record.answers?.[section.key] || {}), ...clamped } };

    const table = tableFor(form.key);
    const params = [
        JSON.stringify(approval), reviewStatus, reviewNote, actor.name,
        JSON.stringify(answers), completionOf(form.template, answers), req.params.id,
    ];
    if (storageIsShared(form.key)) params.push(form.key);

    const { rows } = await db.query(`
        UPDATE "${table}"
        SET approval = $1::jsonb, "reviewStatus" = COALESCE($2, "reviewStatus"),
            "reviewNote" = COALESCE($3, "reviewNote"), "reviewedAt" = NOW(), "reviewedBy" = $4,
            answers = $5::jsonb, "completionPct" = $6, "updatedAt" = NOW()
        WHERE "submissionId" = $7${storageIsShared(form.key) ? ` AND "formKey" = $8` : ''}
        RETURNING *
    `, params);

    await logEvent(req.params.id, {
        type: 'project_form_reviewed',
        title: `${form.template?.title || form.key}: aprobación institucional`,
        detail: reviewStatus
            ? `El Distrito marcó la solicitud como ${FORM_STATES.find(s => s.key === reviewStatus)?.label || reviewStatus}.`
            : 'Se actualizó el espacio reservado al Distrito.',
        actor,
        metadata: { formKey: form.key, reviewStatus },
    });

    res.json({ form: rows[0], state: deriveState(rows[0]) });
}, 'changeStatus');

// POST /admin/postulaciones/:id/forms/:formKey/reopen | /lock
const setLock = (lock) => withAccess(async (req, res, { cfg, access }) => {
    const form = resolveForm(cfg, req.params.formKey);
    if (!form) return res.status(404).json({ error: 'Ese formulario no existe.' });

    const table = tableFor(form.key);
    const set = lock
        ? `"lockedAt" = NOW(), "reopenedAt" = NULL`
        : `status = 'draft', "reopenedAt" = NOW(), "reopenedBy" = $2, "lockedAt" = NULL`;
    const params = lock ? [req.params.id] : [req.params.id, actorFrom(req, access).name];
    if (storageIsShared(form.key)) params.push(form.key);

    const { rows } = await db.query(`
        UPDATE "${table}" SET ${set}, "updatedAt" = NOW()
        WHERE "submissionId" = $1${storageIsShared(form.key) ? ` AND "formKey" = $${params.length}` : ''}
        RETURNING *
    `, params);
    if (!rows[0]) return res.status(404).json({ error: 'Este club todavía no ha iniciado este formulario.' });

    await logEvent(req.params.id, {
        type: lock ? 'form_locked' : 'form_reopened',
        title: `${form.template?.title || form.key}: ${lock ? 'edición cerrada' : 'edición reabierta'}`,
        detail: clean(req.body?.reason, 500) || null,
        actor: actorFrom(req, access),
        metadata: { formKey: form.key },
    });
    res.json({ form: rows[0], state: deriveState(rows[0]) });
}, 'changeStatus');

export const lockForm = setLock(true);
export const reopenForm = setLock(false);

export default {
    getForms, getForm, saveForm, submitForm,
    adminListForms, adminGetForm, saveApproval, lockForm, reopenForm,
};
