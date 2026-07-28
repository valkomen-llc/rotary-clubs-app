// ════════════════════════════════════════════════════════════════════
// Gestión de Postulaciones y Pagos — Feria de Proyectos Rotary Colombia
// v4.598.0
//
// Módulo administrativo sobre las postulaciones que entran por el formulario
// público (/postular-proyecto). No hay captura manual: todo lo que se ve aquí
// nació del formulario o de un webhook de Stripe.
//
// Entidades (tablas creadas en projectFairController.ensureTables):
//   ProjectFairSubmission      postulación + responsable + club + proyecto
//   ProjectFairEvent           línea de tiempo y auditoría (incl. comentarios)
//   ProjectFairFile            adjuntos
//   ProjectFairTag / …SubmissionTag   etiquetas
//   ProjectFairStripeEvent     eventos crudos de Stripe (idempotencia)
//
// Decisión de diseño: los comentarios viven en la misma línea de tiempo
// (type='comment') en vez de en una tabla aparte. Así la ficha muestra un
// único relato cronológico —formulario, pagos, cambios de estado y notas—
// sin tener que fusionar dos fuentes ni mantenerlas sincronizadas.
//
// Permisos: el rol del módulo se resuelve por rol de plataforma + las listas
// de correos configuradas en la convocatoria (access.finance / access.reviewers),
// de modo que no hace falta tocar el modelo global de usuarios.
// ════════════════════════════════════════════════════════════════════
import Stripe from 'stripe';
import db from '../lib/db.js';
import {
    ensureTables, logEvent, readConfigForAdmin, sendReceiptFor, buildSubmissionSnapshot,
    getAdminConfig, saveAdminConfig,
} from './projectFairController.js';
import { buildProjectDocx, DOCX_MIME } from '../lib/projectFairDocx.js';

console.log('[projectFairAdminController] v4.598.0 cargado — Gestión de Postulaciones y Pagos (dashboard, trazabilidad Stripe, etiquetas, alertas y reportes)');

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');

// ── Estados del proceso ──────────────────────────────────────────────
// El estado del PAGO vive en `status` (lo escribe Stripe); éste es el estado
// del proceso interno de revisión, que mueve el equipo.
export const WORKFLOW_STATES = [
    { key: 'draft', label: 'Borrador', color: 'slate', group: 'inicial' },
    { key: 'received', label: 'Recibida', color: 'sky', group: 'inicial' },
    { key: 'pending_payment', label: 'Pendiente de pago', color: 'amber', group: 'pago' },
    { key: 'payment_confirmed', label: 'Pago confirmado', color: 'emerald', group: 'pago' },
    { key: 'payment_failed', label: 'Pago fallido', color: 'red', group: 'pago' },
    { key: 'refunded', label: 'Reembolsada', color: 'orange', group: 'pago' },
    { key: 'in_review', label: 'En revisión', color: 'indigo', group: 'revision' },
    { key: 'needs_changes', label: 'Requiere ajustes', color: 'amber', group: 'revision' },
    { key: 'approved', label: 'Aprobada', color: 'emerald', group: 'resolucion' },
    { key: 'rejected', label: 'No aprobada', color: 'red', group: 'resolucion' },
    { key: 'sent_to_grants', label: 'Enviada a Rotary Grants', color: 'violet', group: 'resolucion' },
    { key: 'closed', label: 'Cerrada', color: 'slate', group: 'resolucion' },
];
const WORKFLOW_KEYS = WORKFLOW_STATES.map(s => s.key);

export const PAYMENT_STATES = [
    { key: 'pending_payment', label: 'Pendiente de pago', color: 'amber' },
    { key: 'paid', label: 'Pagado', color: 'emerald' },
    { key: 'failed', label: 'Fallido', color: 'red' },
    { key: 'refunded', label: 'Reembolsado', color: 'orange' },
];

export const PRIORITIES = [
    { key: 'low', label: 'Baja', color: 'slate' },
    { key: 'normal', label: 'Normal', color: 'sky' },
    { key: 'high', label: 'Alta', color: 'amber' },
    { key: 'critical', label: 'Crítica', color: 'red' },
];

// ── Permisos ─────────────────────────────────────────────────────────
const ROLE_CAPABILITIES = {
    admin:    { view: true, managePayments: true, viewPayments: true, comment: true, edit: true, changeStatus: true, manageTags: true, export: true, config: true },
    finance:  { view: true, managePayments: true, viewPayments: true, comment: true, edit: false, changeStatus: false, manageTags: false, export: true, config: false },
    reviewer: { view: true, managePayments: false, viewPayments: false, comment: true, edit: false, changeStatus: true, manageTags: true, export: true, config: false },
    viewer:   { view: true, managePayments: false, viewPayments: false, comment: false, edit: false, changeStatus: false, manageTags: false, export: false, config: false },
};

const listHas = (list, email) =>
    Array.isArray(list) && !!email && list.some(e => String(e).trim().toLowerCase() === String(email).toLowerCase());

export const resolveAccess = (user, cfg) => {
    const email = user?.email || '';
    const access = cfg?.access || {};
    // Administra el módulo quien es 'administrator' de la plataforma, quien
    // esté en la lista de administradores del módulo, o quien administre el
    // club/organización al que está asociada la feria (su propio sitio).
    const ownsFairSite = !!cfg?.clubId && user?.clubId === cfg.clubId
        && ['club_admin', 'district_admin', 'administrator'].includes(user?.role);

    let role = 'viewer';
    if (user?.role === 'administrator' || listHas(access.admins, email) || ownsFairSite) role = 'admin';
    else if (listHas(access.finance, email)) role = 'finance';
    else if (listHas(access.reviewers, email)) role = 'reviewer';
    else if (['district_admin', 'club_admin', 'editor'].includes(user?.role)) role = 'viewer';
    return { role, ...ROLE_CAPABILITIES[role] };
};

const actorFrom = (req, access) => ({
    id: req.user?.id || null,
    name: req.user?.email || 'Administrador',
    role: access?.role || req.user?.role || null,
});

const withAccess = (handler, capability = 'view') => async (req, res) => {
    try {
        await ensureTables();
        const cfg = await readConfigForAdmin();
        const access = resolveAccess(req.user, cfg);
        if (!access[capability]) {
            return res.status(403).json({ error: 'Tu perfil no tiene permiso para esta acción.' });
        }
        return await handler(req, res, { cfg, access });
    } catch (error) {
        console.error('[project-fair-admin]', error);
        return res.status(500).json({ error: error?.message || 'Error interno del módulo' });
    }
};

// ── Utilidades ───────────────────────────────────────────────────────
const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const num = (v) => (v === null || v === undefined ? null : Number(v));

const mapRow = (row, access) => {
    if (!row) return null;
    const base = {
        id: row.id,
        publicRef: row.publicRef,
        editionKey: row.editionKey,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        firstName: row.firstName,
        lastName: row.lastName,
        responsable: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
        email: row.email,
        phone: row.phone,
        clubName: row.clubName,
        district: row.district,
        projectName: row.projectName,
        projectDescription: row.projectDescription,
        focusArea: row.focusArea,
        focusAreaLabel: row.focusAreaLabel,
        budgetUsd: num(row.budgetUsd),
        paymentStatus: row.status,
        workflowStatus: row.workflowStatus || 'received',
        priority: row.priority || 'normal',
        internalCategory: row.internalCategory,
        assigneeId: row.assigneeId,
        assigneeName: row.assigneeName,
        reviewedAt: row.reviewedAt,
        reviewedBy: row.reviewedBy,
        amountCop: num(row.amountCop),
        amountUsd: num(row.amountUsd),
        amountReceived: num(row.amountReceived),
        refundedAmount: num(row.refundedAmount),
        refundedAt: row.refundedAt,
        trmRate: num(row.trmRate),
        trmDate: row.trmDate,
        trmSource: row.trmSource,
        paidAt: row.paidAt,
        tags: row.tags || [],
    };
    // Los identificadores de Stripe y el comprobante son datos financieros:
    // sólo los ve quien tiene ese permiso.
    if (access?.viewPayments) {
        Object.assign(base, {
            stripeSessionId: row.stripeSessionId,
            stripePaymentIntentId: row.stripePaymentIntentId,
            stripeChargeId: row.stripeChargeId,
            stripeCustomerId: row.stripeCustomerId,
            paymentMethod: row.paymentMethod,
            receiptUrl: row.receiptUrl,
            lastPaymentError: row.lastPaymentError,
        });
    }
    return base;
};

// Etiquetas de un conjunto de postulaciones, en una sola consulta.
const loadTagsFor = async (ids) => {
    if (!ids.length) return {};
    const { rows } = await db.query(`
        SELECT st."submissionId", t.id, t.label, t.color
        FROM "ProjectFairSubmissionTag" st
        JOIN "ProjectFairTag" t ON t.id = st."tagId"
        WHERE st."submissionId" = ANY($1::text[])
    `, [ids]);
    return rows.reduce((acc, r) => {
        (acc[r.submissionId] = acc[r.submissionId] || []).push({ id: r.id, label: r.label, color: r.color });
        return acc;
    }, {});
};

// ── Filtros compartidos por listado, reportes y exportación ──────────
const buildFilters = (query) => {
    const where = [];
    const params = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replace('$?', `$${params.length}`)); };

    const search = clean(query.search, 160);
    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        where.push(`("clubName" ILIKE $${i} OR "projectName" ILIKE $${i} OR email ILIKE $${i} OR "publicRef" ILIKE $${i} OR "firstName" ILIKE $${i} OR "lastName" ILIKE $${i})`);
    }
    if (query.paymentStatus && query.paymentStatus !== 'all') add('status = $?', clean(query.paymentStatus, 30));
    if (query.workflowStatus && query.workflowStatus !== 'all') add('"workflowStatus" = $?', clean(query.workflowStatus, 40));
    if (query.district && query.district !== 'all') add('district = $?', clean(query.district, 160));
    if (query.focusArea && query.focusArea !== 'all') add('"focusArea" = $?', clean(query.focusArea, 80));
    if (query.priority && query.priority !== 'all') add('priority = $?', clean(query.priority, 20));
    if (query.club) add('"clubName" ILIKE $?', `%${clean(query.club, 160)}%`);
    if (query.assignee) add('"assigneeName" ILIKE $?', `%${clean(query.assignee, 160)}%`);
    if (query.category) add('"internalCategory" ILIKE $?', `%${clean(query.category, 120)}%`);
    if (query.from) add('"createdAt" >= $?', new Date(query.from));
    if (query.to) add('"createdAt" <= $?', new Date(`${clean(query.to, 30)}T23:59:59`));
    if (query.budgetMin) add('"budgetUsd" >= $?', Number(query.budgetMin));
    if (query.budgetMax) add('"budgetUsd" <= $?', Number(query.budgetMax));
    if (query.tagId) {
        params.push(clean(query.tagId, 60));
        where.push(`EXISTS (SELECT 1 FROM "ProjectFairSubmissionTag" st WHERE st."submissionId" = "ProjectFairSubmission".id AND st."tagId" = $${params.length})`);
    }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

const SORTABLE = {
    createdAt: '"createdAt"', projectName: '"projectName"', clubName: '"clubName"',
    district: 'district', budgetUsd: '"budgetUsd"', amountCop: '"amountCop"',
    paymentStatus: 'status', workflowStatus: '"workflowStatus"', priority: 'priority', paidAt: '"paidAt"',
};

// ── Dashboard ────────────────────────────────────────────────────────
// GET /admin/overview
export const getOverview = withAccess(async (req, res, { cfg, access }) => {
    const { clause, params } = buildFilters(req.query);
    const T = '"ProjectFairSubmission"';

    const [totals, byPayment, byWorkflow, byDistrict, byFocus, timeline] = await Promise.all([
        db.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
                   COUNT(*) FILTER (WHERE status = 'pending_payment')::int AS pending,
                   COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                   COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded,
                   COUNT(*) FILTER (WHERE "workflowStatus" IN ('received','pending_payment','payment_confirmed'))::int AS "pendingReview",
                   COALESCE(SUM("amountCop") FILTER (WHERE status = 'paid'), 0)::float AS "totalCop",
                   COALESCE(SUM("amountUsd") FILTER (WHERE status = 'paid'), 0)::float AS "totalUsd",
                   COALESCE(SUM("refundedAmount"), 0)::float AS "totalRefunded",
                   COALESCE(AVG("budgetUsd"), 0)::float AS "avgBudget",
                   COALESCE(SUM("budgetUsd"), 0)::float AS "totalBudget"
            FROM ${T} ${clause}`, params),
        db.query(`SELECT status AS key, COUNT(*)::int AS count FROM ${T} ${clause} GROUP BY status`, params),
        db.query(`SELECT COALESCE("workflowStatus",'received') AS key, COUNT(*)::int AS count FROM ${T} ${clause} GROUP BY 1`, params),
        db.query(`SELECT COALESCE(district,'Sin distrito') AS key, COUNT(*)::int AS count,
                         COALESCE(SUM("amountCop") FILTER (WHERE status='paid'),0)::float AS "totalCop"
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY count DESC`, params),
        db.query(`SELECT COALESCE("focusAreaLabel", "focusArea", 'Sin área') AS key, COUNT(*)::int AS count,
                         COALESCE(SUM("budgetUsd"),0)::float AS "totalBudget"
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY count DESC`, params),
        db.query(`SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                         COUNT(*)::int AS total,
                         COUNT(*) FILTER (WHERE status = 'paid')::int AS paid
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY 1`, params),
    ]);

    const t = totals.rows[0] || {};
    // Tasa de conversión: de cuántos formularios enviados terminaron en pago.
    const conversionRate = t.total > 0 ? Math.round((t.paid / t.total) * 1000) / 10 : 0;

    res.json({
        kpis: {
            total: t.total || 0,
            paid: t.paid || 0,
            pending: t.pending || 0,
            failed: t.failed || 0,
            refunded: t.refunded || 0,
            pendingReview: t.pendingReview || 0,
            totalCop: t.totalCop || 0,
            totalUsd: Math.round((t.totalUsd || 0) * 100) / 100,
            totalRefunded: t.totalRefunded || 0,
            totalBudget: t.totalBudget || 0,
            avgBudget: Math.round((t.avgBudget || 0) * 100) / 100,
            conversionRate,
        },
        byPayment: byPayment.rows,
        byWorkflow: byWorkflow.rows,
        byDistrict: byDistrict.rows,
        byFocusArea: byFocus.rows,
        timeline: timeline.rows,
        edition: cfg.edition,
        access,
    });
});

// ── Listado ──────────────────────────────────────────────────────────
// GET /admin/submissions
export const listSubmissions = withAccess(async (req, res, { access }) => {
    const { clause, params } = buildFilters(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const sortBy = SORTABLE[req.query.sortBy] || SORTABLE.createdAt;
    const sortDir = String(req.query.sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM "ProjectFairSubmission" ${clause}`, params);
    const total = countRes.rows[0]?.total || 0;

    const rowsRes = await db.query(
        `SELECT * FROM "ProjectFairSubmission" ${clause}
         ORDER BY ${sortBy} ${sortDir} NULLS LAST
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize]
    );

    const tagsBySubmission = await loadTagsFor(rowsRes.rows.map(r => r.id));
    res.json({
        submissions: rowsRes.rows.map(r => mapRow({ ...r, tags: tagsBySubmission[r.id] || [] }, access)),
        pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
        access,
    });
});

// ── Ficha detallada ──────────────────────────────────────────────────
// GET /admin/submissions/:id
export const getSubmission = withAccess(async (req, res, { access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Postulación no encontrada' });

    const [events, files, tags, stripeEvents] = await Promise.all([
        db.query('SELECT * FROM "ProjectFairEvent" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC', [row.id]),
        db.query('SELECT * FROM "ProjectFairFile" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC', [row.id]),
        loadTagsFor([row.id]),
        access.viewPayments
            ? db.query('SELECT id, "stripeEventId", type, "objectId", "receivedAt" FROM "ProjectFairStripeEvent" WHERE "submissionId" = $1 ORDER BY "receivedAt" DESC LIMIT 50', [row.id])
            : Promise.resolve({ rows: [] }),
    ]);

    res.json({
        submission: mapRow({ ...row, tags: tags[row.id] || [] }, access),
        events: events.rows,
        files: files.rows,
        stripeEvents: stripeEvents.rows,
        access,
    });
});

// ── Edición y cambios de estado ──────────────────────────────────────
// PATCH /admin/submissions/:id
const EDITABLE_FIELDS = {
    // Datos del formulario que el equipo puede corregir (erratas de captura).
    firstName: '"firstName"', lastName: '"lastName"', email: 'email', phone: 'phone',
    clubName: '"clubName"', district: 'district', projectName: '"projectName"',
    projectDescription: '"projectDescription"', budgetUsd: '"budgetUsd"',
    focusArea: '"focusArea"', focusAreaLabel: '"focusAreaLabel"',
    // Gestión interna.
    priority: 'priority', internalCategory: '"internalCategory"',
    assigneeId: '"assigneeId"', assigneeName: '"assigneeName"',
};

export const updateSubmission = withAccess(async (req, res, { access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const current = rows[0];
    if (!current) return res.status(404).json({ error: 'Postulación no encontrada' });

    const actor = actorFrom(req, access);
    const body = req.body || {};
    const sets = [];
    const params = [];
    const changes = [];

    for (const [field, column] of Object.entries(EDITABLE_FIELDS)) {
        if (!(field in body)) continue;
        // Sólo quien puede editar toca datos del formulario; la gestión
        // interna (prioridad, categoría, responsable) la mueve también quien
        // puede cambiar estados.
        const isInternal = ['priority', 'internalCategory', 'assigneeId', 'assigneeName'].includes(field);
        if (!access.edit && !(isInternal && access.changeStatus)) continue;

        const value = field === 'budgetUsd' ? Number(body[field]) || null : clean(body[field], 8000);
        params.push(value);
        sets.push(`${column} = $${params.length}`);
        const before = current[field];
        if (String(before ?? '') !== String(value ?? '')) {
            changes.push({ field, before: before ?? null, after: value ?? null });
        }
    }

    // Cambio de estado: exige permiso propio y deja constancia de motivo.
    const nextStatus = clean(body.workflowStatus, 40);
    let statusChange = null;
    if (nextStatus && nextStatus !== current.workflowStatus) {
        if (!access.changeStatus) return res.status(403).json({ error: 'Tu perfil no puede cambiar el estado.' });
        if (!WORKFLOW_KEYS.includes(nextStatus)) return res.status(400).json({ error: 'Estado no válido.' });
        params.push(nextStatus);
        sets.push(`"workflowStatus" = $${params.length}`);
        statusChange = { from: current.workflowStatus || 'received', to: nextStatus };
    }

    if (body.markReviewed && access.changeStatus) {
        params.push(new Date());
        sets.push(`"reviewedAt" = $${params.length}`);
        params.push(actor.name);
        sets.push(`"reviewedBy" = $${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: 'No hay cambios que guardar.' });

    params.push(req.params.id);
    const { rows: updated } = await db.query(
        `UPDATE "ProjectFairSubmission" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length} RETURNING *`,
        params
    );

    const reason = clean(body.reason, 1000);
    if (statusChange) {
        const label = k => WORKFLOW_STATES.find(s => s.key === k)?.label || k;
        await logEvent(req.params.id, {
            type: 'status_change',
            title: `Estado: ${label(statusChange.from)} → ${label(statusChange.to)}`,
            detail: reason || null,
            actor,
            metadata: statusChange,
        });
    }
    if (changes.length) {
        await logEvent(req.params.id, {
            type: 'data_updated',
            title: `Datos actualizados (${changes.length} campo${changes.length === 1 ? '' : 's'})`,
            detail: reason || changes.map(c => c.field).join(', '),
            actor,
            metadata: { changes },
        });
    }
    if (body.markReviewed && access.changeStatus) {
        await logEvent(req.params.id, { type: 'reviewed', title: 'Marcada como revisada', actor });
    }

    const tags = await loadTagsFor([req.params.id]);
    res.json({ submission: mapRow({ ...updated[0], tags: tags[req.params.id] || [] }, access) });
}, 'view');

// ── Comentarios internos ─────────────────────────────────────────────
// POST /admin/submissions/:id/comments
export const addComment = withAccess(async (req, res, { access }) => {
    const body = clean(req.body?.body, 5000);
    if (!body) return res.status(400).json({ error: 'El comentario no puede estar vacío.' });
    const event = await logEvent(req.params.id, {
        type: 'comment',
        title: 'Observación interna',
        detail: body,
        actor: actorFrom(req, access),
    });
    res.status(201).json({ event });
}, 'comment');

// ── Etiquetas ────────────────────────────────────────────────────────
export const listTags = withAccess(async (_req, res) => {
    const { rows } = await db.query(`
        SELECT t.*, COUNT(st."submissionId")::int AS usage
        FROM "ProjectFairTag" t
        LEFT JOIN "ProjectFairSubmissionTag" st ON st."tagId" = t.id
        GROUP BY t.id ORDER BY t."isSystem" DESC, t.label ASC
    `);
    res.json(rows);
});

export const createTag = withAccess(async (req, res) => {
    const label = clean(req.body?.label, 120);
    const color = clean(req.body?.color, 20) || 'slate';
    if (!label) return res.status(400).json({ error: 'La etiqueta necesita un nombre.' });
    const { rows } = await db.query(
        `INSERT INTO "ProjectFairTag" (label, color) VALUES ($1, $2)
         ON CONFLICT (lower(label)) DO UPDATE SET color = EXCLUDED.color RETURNING *`,
        [label, color]
    );
    res.status(201).json(rows[0]);
}, 'manageTags');

export const deleteTag = withAccess(async (req, res) => {
    await db.query('DELETE FROM "ProjectFairSubmissionTag" WHERE "tagId" = $1', [req.params.id]);
    await db.query('DELETE FROM "ProjectFairTag" WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}, 'manageTags');

// POST /admin/submissions/:id/tags   { tagId }
export const attachTag = withAccess(async (req, res, { access }) => {
    const tagId = clean(req.body?.tagId, 60);
    if (!tagId) return res.status(400).json({ error: 'Falta la etiqueta.' });
    const { rows: tagRows } = await db.query('SELECT * FROM "ProjectFairTag" WHERE id = $1', [tagId]);
    if (!tagRows[0]) return res.status(404).json({ error: 'Etiqueta no encontrada' });

    await db.query(
        `INSERT INTO "ProjectFairSubmissionTag" ("submissionId","tagId") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [req.params.id, tagId]
    );
    await logEvent(req.params.id, {
        type: 'tag_added', title: `Etiqueta agregada: ${tagRows[0].label}`,
        actor: actorFrom(req, access), metadata: { tagId },
    });
    const tags = await loadTagsFor([req.params.id]);
    res.json({ tags: tags[req.params.id] || [] });
}, 'manageTags');

export const detachTag = withAccess(async (req, res, { access }) => {
    const { rows: tagRows } = await db.query('SELECT * FROM "ProjectFairTag" WHERE id = $1', [req.params.tagId]);
    await db.query('DELETE FROM "ProjectFairSubmissionTag" WHERE "submissionId" = $1 AND "tagId" = $2', [req.params.id, req.params.tagId]);
    if (tagRows[0]) {
        await logEvent(req.params.id, {
            type: 'tag_removed', title: `Etiqueta retirada: ${tagRows[0].label}`,
            actor: actorFrom(req, access), metadata: { tagId: req.params.tagId },
        });
    }
    const tags = await loadTagsFor([req.params.id]);
    res.json({ tags: tags[req.params.id] || [] });
}, 'manageTags');

// ── Archivos adjuntos ────────────────────────────────────────────────
// El archivo se sube a S3 con el flujo existente de /api/media; aquí sólo se
// registra su metadata contra la postulación.
export const addFile = withAccess(async (req, res, { access }) => {
    const fileName = clean(req.body?.fileName, 300);
    const fileUrl = clean(req.body?.fileUrl, 2000);
    if (!fileName || !fileUrl) return res.status(400).json({ error: 'Faltan el nombre y la URL del archivo.' });

    const { rows } = await db.query(`
        INSERT INTO "ProjectFairFile" ("submissionId","fileName","fileUrl","fileSize","contentType","uploadedBy")
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.params.id, fileName, fileUrl, Number(req.body?.fileSize) || null, clean(req.body?.contentType, 120), actorFrom(req, access).name]);

    await logEvent(req.params.id, {
        type: 'file_added', title: `Archivo adjunto: ${fileName}`,
        actor: actorFrom(req, access), metadata: { fileUrl },
    });
    res.status(201).json(rows[0]);
}, 'comment');

export const deleteFile = withAccess(async (req, res, { access }) => {
    const { rows } = await db.query('DELETE FROM "ProjectFairFile" WHERE id = $1 AND "submissionId" = $2 RETURNING *', [req.params.fileId, req.params.id]);
    if (rows[0]) {
        await logEvent(req.params.id, {
            type: 'file_removed', title: `Archivo eliminado: ${rows[0].fileName}`, actor: actorFrom(req, access),
        });
    }
    res.json({ success: true });
}, 'edit');

// ── Acciones sobre el pago ───────────────────────────────────────────
// POST /admin/submissions/:id/sync-stripe
// Reconsulta Stripe y actualiza la traza local. Útil si un webhook se perdió.
export const syncStripe = withAccess(async (req, res, { access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });
    if (!submission.stripeSessionId && !submission.stripePaymentIntentId) {
        return res.status(400).json({ error: 'Esta postulación todavía no tiene una sesión de pago.' });
    }

    const stripe = getStripe();
    try {
        let session = null;
        if (submission.stripeSessionId) {
            session = await stripe.checkout.sessions.retrieve(submission.stripeSessionId);
        }
        if (session?.payment_status === 'paid') {
            const mod = await import('./projectFairController.js');
            session.metadata = { ...(session.metadata || {}), submissionId: submission.id };
            await mod.confirmPaidSession(session);
        }

        const pi = submission.stripePaymentIntentId
            ? await stripe.paymentIntents.retrieve(submission.stripePaymentIntentId, { expand: ['latest_charge'] })
            : null;
        const charge = pi?.latest_charge || null;
        if (charge) {
            await db.query(`
                UPDATE "ProjectFairSubmission"
                SET "stripeChargeId" = COALESCE($1,"stripeChargeId"),
                    "receiptUrl" = COALESCE($2,"receiptUrl"),
                    "paymentMethod" = COALESCE($3,"paymentMethod"),
                    "refundedAmount" = CASE WHEN $4 > 0 THEN $4 ELSE "refundedAmount" END,
                    "updatedAt" = NOW()
                WHERE id = $5
            `, [charge.id, charge.receipt_url || null, charge.payment_method_details?.type || null,
                (charge.amount_refunded || 0) / 100, submission.id]);
        }

        await logEvent(submission.id, {
            type: 'stripe_sync', title: 'Sincronización manual con Stripe',
            detail: session ? `Estado en Stripe: ${session.payment_status}` : 'Consulta del PaymentIntent',
            actor: actorFrom(req, access),
        });

        const { rows: fresh } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [submission.id]);
        const tags = await loadTagsFor([submission.id]);
        res.json({ submission: mapRow({ ...fresh[0], tags: tags[submission.id] || [] }, access) });
    } catch (error) {
        console.error('[project-fair-admin] syncStripe:', error?.message);
        res.status(502).json({ error: `Stripe respondió con un error: ${error?.message}` });
    }
}, 'managePayments');

// POST /admin/submissions/:id/resend-receipt
export const resendReceipt = withAccess(async (req, res, { cfg, access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });
    if (submission.status !== 'paid') return res.status(400).json({ error: 'Sólo se reenvía el comprobante de una inscripción pagada.' });

    const result = await sendReceiptFor(submission, cfg);
    await logEvent(submission.id, {
        type: 'email_sent',
        title: 'Comprobante reenviado',
        detail: `Enviado a ${submission.email}`,
        actor: actorFrom(req, access),
        metadata: { success: !!result?.success },
    });
    if (!result?.success) return res.status(502).json({ error: result?.error || 'No se pudo enviar el correo.' });
    res.json({ success: true });
}, 'managePayments');

// ── Alertas ──────────────────────────────────────────────────────────
// GET /admin/alerts
export const getAlerts = withAccess(async (req, res, { cfg }) => {
    const pendingHours = Math.max(1, Number(cfg.alerts?.pendingPaymentHours) || 48);
    const expectedCop = Number(cfg.registration?.amountCop) || 0;
    const budgetOutlier = Math.max(1, Number(cfg.alerts?.budgetOutlierUsd) || 500000);

    const [stale, failed, duplicates, incomplete, noFocus, outliers, mismatched] = await Promise.all([
        db.query(`
            SELECT id, "publicRef", "projectName", "clubName", email, "createdAt"
            FROM "ProjectFairSubmission"
            WHERE status = 'pending_payment' AND "createdAt" < NOW() - ($1 || ' hours')::interval
            ORDER BY "createdAt" ASC`, [String(pendingHours)]),
        db.query(`SELECT id, "publicRef", "projectName", "clubName", "lastPaymentError", "updatedAt"
                  FROM "ProjectFairSubmission" WHERE status = 'failed' ORDER BY "updatedAt" DESC`),
        db.query(`
            SELECT lower(email) AS email, COUNT(*)::int AS count,
                   array_agg(id) AS ids, array_agg("publicRef") AS refs, array_agg("projectName") AS projects
            FROM "ProjectFairSubmission" GROUP BY lower(email) HAVING COUNT(*) > 1`),
        db.query(`
            SELECT id, "publicRef", "projectName", "clubName"
            FROM "ProjectFairSubmission"
            WHERE COALESCE("projectDescription",'') = '' OR COALESCE(phone,'') = ''
               OR COALESCE("clubName",'') = '' OR COALESCE(district,'') = ''`),
        db.query(`SELECT id, "publicRef", "projectName", "clubName" FROM "ProjectFairSubmission" WHERE COALESCE("focusArea",'') = ''`),
        db.query(`SELECT id, "publicRef", "projectName", "clubName", "budgetUsd"
                  FROM "ProjectFairSubmission"
                  WHERE "budgetUsd" IS NULL OR "budgetUsd" <= 0 OR "budgetUsd" > $1
                  ORDER BY "budgetUsd" DESC NULLS FIRST`, [budgetOutlier]),
        expectedCop > 0
            ? db.query(`SELECT id, "publicRef", "projectName", "amountReceived", "amountCop"
                        FROM "ProjectFairSubmission"
                        WHERE status = 'paid' AND "amountReceived" IS NOT NULL
                          AND ABS("amountReceived" - $1) > 1`, [expectedCop])
            : Promise.resolve({ rows: [] }),
    ]);

    const alerts = [
        { key: 'stale_payment', severity: 'warning', label: `Pagos pendientes hace más de ${pendingHours} h`, items: stale.rows },
        { key: 'failed_payment', severity: 'danger', label: 'Pagos fallidos', items: failed.rows },
        { key: 'duplicates', severity: 'warning', label: 'Posibles postulaciones duplicadas (mismo correo)', items: duplicates.rows },
        { key: 'incomplete', severity: 'warning', label: 'Información incompleta', items: incomplete.rows },
        { key: 'no_focus_area', severity: 'warning', label: 'Sin área de enfoque', items: noFocus.rows },
        { key: 'budget_outlier', severity: 'info', label: 'Presupuestos atípicos', items: outliers.rows },
        { key: 'amount_mismatch', severity: 'danger', label: 'Diferencia entre el valor esperado y el recibido', items: mismatched.rows },
    ].map(a => ({ ...a, count: a.items.length }));

    res.json({ alerts, total: alerts.reduce((n, a) => n + a.count, 0), thresholds: { pendingHours, budgetOutlier, expectedCop } });
});

// ── Reportes ─────────────────────────────────────────────────────────
// GET /admin/reports
export const getReports = withAccess(async (req, res, { cfg }) => {
    const { clause, params } = buildFilters(req.query);
    const T = '"ProjectFairSubmission"';

    const [summary, byDistrict, byFocus, byClub, evolution, byWorkflow] = await Promise.all([
        db.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE status='paid')::int AS paid,
                   COUNT(*) FILTER (WHERE status='pending_payment')::int AS pending,
                   COUNT(*) FILTER (WHERE status='failed')::int AS failed,
                   COUNT(*) FILTER (WHERE status='refunded')::int AS refunded,
                   COALESCE(SUM("amountCop") FILTER (WHERE status='paid'),0)::float AS "totalCop",
                   COALESCE(SUM("amountUsd") FILTER (WHERE status='paid'),0)::float AS "totalUsd",
                   COALESCE(SUM("budgetUsd"),0)::float AS "totalBudget",
                   COALESCE(AVG("trmRate") FILTER (WHERE status='paid'),0)::float AS "avgTrm"
            FROM ${T} ${clause}`, params),
        db.query(`SELECT COALESCE(district,'Sin distrito') AS key, COUNT(*)::int AS count,
                         COUNT(*) FILTER (WHERE status='paid')::int AS paid,
                         COALESCE(SUM("amountCop") FILTER (WHERE status='paid'),0)::float AS "totalCop"
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY count DESC`, params),
        db.query(`SELECT COALESCE("focusAreaLabel","focusArea",'Sin área') AS key, COUNT(*)::int AS count,
                         COALESCE(SUM("budgetUsd"),0)::float AS "totalBudget"
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY count DESC`, params),
        db.query(`SELECT COALESCE("clubName",'Sin club') AS key, COUNT(*)::int AS count,
                         COUNT(*) FILTER (WHERE status='paid')::int AS paid,
                         COALESCE(SUM("amountCop") FILTER (WHERE status='paid'),0)::float AS "totalCop"
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY count DESC LIMIT 50`, params),
        db.query(`SELECT to_char(date_trunc('day',"createdAt"),'YYYY-MM-DD') AS day,
                         COUNT(*)::int AS total,
                         COUNT(*) FILTER (WHERE status='paid')::int AS paid,
                         COALESCE(SUM("amountCop") FILTER (WHERE status='paid'),0)::float AS "totalCop"
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY 1`, params),
        db.query(`SELECT COALESCE("workflowStatus",'received') AS key, COUNT(*)::int AS count FROM ${T} ${clause} GROUP BY 1`, params),
    ]);

    const s = summary.rows[0] || {};
    res.json({
        summary: {
            ...s,
            conversionRate: s.total > 0 ? Math.round((s.paid / s.total) * 1000) / 10 : 0,
        },
        byDistrict: byDistrict.rows,
        byFocusArea: byFocus.rows,
        byClub: byClub.rows,
        evolution: evolution.rows,
        byWorkflow: byWorkflow.rows,
        edition: cfg.edition,
        generatedAt: new Date().toISOString(),
    });
});

// ── Exportación ──────────────────────────────────────────────────────
// GET /admin/export.csv — respeta los mismos filtros del listado. El detalle
// financiero sólo sale si el perfil puede verlo.
export const exportCsv = withAccess(async (req, res, { access }) => {
    const { clause, params } = buildFilters(req.query);
    const { rows } = await db.query(`SELECT * FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" DESC`, params);
    const tagsBySubmission = await loadTagsFor(rows.map(r => r.id));

    const headers = [
        'Registro', 'Fecha de inscripción', 'Proyecto', 'Club Rotario', 'Distrito', 'Responsable',
        'Correo', 'WhatsApp', 'Área de enfoque', 'Presupuesto USD', 'Estado de la postulación',
        'Estado del pago', 'Valor pagado COP', 'Equivalente USD', 'TRM aplicada', 'Prioridad',
        'Responsable asignado', 'Categoría interna', 'Etiquetas', 'Fecha de confirmación',
    ];
    if (access.viewPayments) headers.push('Referencia Stripe (PaymentIntent)', 'Checkout Session', 'Charge', 'Método de pago', 'Comprobante');

    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const lines = [headers.join(';')];
    for (const r of rows) {
        const values = [
            r.publicRef, r.createdAt ? new Date(r.createdAt).toISOString() : '', r.projectName, r.clubName, r.district,
            `${r.firstName || ''} ${r.lastName || ''}`.trim(), r.email, r.phone,
            r.focusAreaLabel || r.focusArea, r.budgetUsd,
            WORKFLOW_STATES.find(s => s.key === (r.workflowStatus || 'received'))?.label || r.workflowStatus,
            PAYMENT_STATES.find(s => s.key === r.status)?.label || r.status,
            r.amountCop, r.amountUsd, r.trmRate, r.priority, r.assigneeName, r.internalCategory,
            (tagsBySubmission[r.id] || []).map(t => t.label).join(' | '),
            r.paidAt ? new Date(r.paidAt).toISOString() : '',
        ];
        if (access.viewPayments) {
            values.push(r.stripePaymentIntentId, r.stripeSessionId, r.stripeChargeId, r.paymentMethod, r.receiptUrl);
        }
        lines.push(values.map(cell).join(';'));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="postulaciones-feria-proyectos.csv"');
    res.send('﻿' + lines.join('\n'));
}, 'export');

// ── Catálogos para los filtros del panel ─────────────────────────────
export const getCatalog = withAccess(async (_req, res, { cfg, access }) => {
    const [districts, clubs, categories, assignees] = await Promise.all([
        db.query(`SELECT DISTINCT district AS value FROM "ProjectFairSubmission" WHERE COALESCE(district,'') <> '' ORDER BY 1`),
        db.query(`SELECT DISTINCT "clubName" AS value FROM "ProjectFairSubmission" WHERE COALESCE("clubName",'') <> '' ORDER BY 1`),
        db.query(`SELECT DISTINCT "internalCategory" AS value FROM "ProjectFairSubmission" WHERE COALESCE("internalCategory",'') <> '' ORDER BY 1`),
        db.query(`SELECT DISTINCT "assigneeName" AS value FROM "ProjectFairSubmission" WHERE COALESCE("assigneeName",'') <> '' ORDER BY 1`),
    ]);
    res.json({
        workflowStates: WORKFLOW_STATES,
        paymentStates: PAYMENT_STATES,
        priorities: PRIORITIES,
        focusAreas: cfg.focusAreas || [],
        configuredDistricts: cfg.districts || [],
        districts: districts.rows.map(r => r.value),
        clubs: clubs.rows.map(r => r.value),
        categories: categories.rows.map(r => r.value),
        assignees: assignees.rows.map(r => r.value),
        edition: cfg.edition,
        registration: cfg.registration,
        access,
    });
});

// ── Ficha completa para exportar a PDF (la arma el cliente) ──────────
export const getSubmissionSnapshot = withAccess(async (req, res, { cfg, access }) => {
    const snapshot = await buildSubmissionSnapshot(req.params.id, { includePayments: access.viewPayments });
    if (!snapshot) return res.status(404).json({ error: 'Postulación no encontrada' });
    res.json({ ...snapshot, edition: cfg.edition, generatedAt: new Date().toISOString() });
});

// ── Formulación: formularios maestros de los clubes (v4.608) ─────────
// GET /admin/formularios — estado de la formulación por postulación.
// Filtros propios (estado del formulario y búsqueda): los del listado de
// postulaciones no aplican aquí porque esta consulta une tres tablas.
export const listMasterForms = withAccess(async (req, res, { access }) => {
    const where = [];
    const params = [];
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
               s.status AS "paymentStatus", s."workflowStatus", s."budgetUsd", s."createdAt",
               f.status AS "formStatus", f."completionPct", f."submittedAt", f."lastEditedAt",
               f."lockedAt", f."reopenedAt",
               (a.id IS NOT NULL) AS "hasAccount", a."lastLoginAt"
        FROM "ProjectFairSubmission" s
        LEFT JOIN "ProjectFairMasterForm" f ON f."submissionId" = s.id
        LEFT JOIN "ProjectFairAccount" a ON a."submissionId" = s.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY f."submittedAt" DESC NULLS LAST, s."createdAt" DESC
    `, params);

    const stats = rows.reduce((acc, r) => {
        const key = r.formStatus || 'not_started';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    res.json({ forms: rows.map(r => ({ ...r, budgetUsd: num(r.budgetUsd) })), stats, access });
});

// GET /admin/postulaciones/:id/form — respuestas + plantilla, para verlo o exportarlo
export const getMasterForm = withAccess(async (req, res, { cfg, access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });

    const formRes = await db.query('SELECT * FROM "ProjectFairMasterForm" WHERE "submissionId" = $1 LIMIT 1', [req.params.id]);
    const revisions = await db.query(
        'SELECT id, action, "actorType", "actorName", "completionPct", "createdAt" FROM "ProjectFairFormRevision" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC LIMIT 30',
        [req.params.id]
    );

    res.json({
        submission: mapRow(submission, access),
        form: formRes.rows[0] || null,
        template: cfg.masterForm,
        revisions: revisions.rows,
    });
});

// GET /admin/postulaciones/:id/form.docx — descarga en Word
export const downloadMasterFormDocx = withAccess(async (req, res, { cfg, access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });

    const formRes = await db.query('SELECT * FROM "ProjectFairMasterForm" WHERE "submissionId" = $1 LIMIT 1', [req.params.id]);
    const buffer = await buildProjectDocx(submission, cfg.masterForm, formRes.rows[0]?.answers || {}, {
        edition: cfg.edition,
        includePayments: access.viewPayments,
    });

    const safeName = `${submission.publicRef || 'proyecto'}-${String(submission.projectName || '').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim().slice(0, 60).replace(/\s+/g, '-')}`;
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
    res.send(buffer);
}, 'export');

// POST /admin/postulaciones/:id/form/reopen — devolver la edición al club
export const reopenMasterForm = withAccess(async (req, res, { access }) => {
    const reason = clean(req.body?.reason, 500);
    const { rows } = await db.query(`
        UPDATE "ProjectFairMasterForm"
        SET status = 'draft', "reopenedAt" = NOW(), "reopenedBy" = $1, "lockedAt" = NULL, "updatedAt" = NOW()
        WHERE "submissionId" = $2 RETURNING *
    `, [actorFrom(req, access).name, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Este club todavía no ha iniciado su formulario.' });

    await logEvent(req.params.id, {
        type: 'form_reopened', title: 'Formulación reabierta para edición',
        detail: reason || null, actor: actorFrom(req, access),
    });
    res.json({ form: rows[0] });
}, 'changeStatus');

// POST /admin/postulaciones/:id/form/lock — cerrar la edición
export const lockMasterForm = withAccess(async (req, res, { access }) => {
    const { rows } = await db.query(`
        UPDATE "ProjectFairMasterForm"
        SET "lockedAt" = NOW(), "reopenedAt" = NULL, "updatedAt" = NOW()
        WHERE "submissionId" = $1 RETURNING *
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Este club todavía no ha iniciado su formulario.' });

    await logEvent(req.params.id, {
        type: 'form_locked', title: 'Formulación cerrada',
        detail: clean(req.body?.reason, 500) || null, actor: actorFrom(req, access),
    });
    res.json({ form: rows[0] });
}, 'changeStatus');

// ── Configuración de la convocatoria ─────────────────────────────────
// v4.601 — Al unificarse los dos módulos, la configuración pasa por el mismo
// control de permisos que el resto: consultarla exige acceso al módulo y
// guardarla exige el permiso 'config'. Antes bastaba con estar autenticado.
export const readConvocatoriaConfig = withAccess((req, res) => getAdminConfig(req, res), 'view');
export const writeConvocatoriaConfig = withAccess((req, res) => saveAdminConfig(req, res), 'config');

export default {
    getOverview, listSubmissions, getSubmission, updateSubmission, addComment,
    listTags, createTag, deleteTag, attachTag, detachTag,
    addFile, deleteFile, syncStripe, resendReceipt,
    getAlerts, getReports, exportCsv, getCatalog, getSubmissionSnapshot,
    readConvocatoriaConfig, writeConvocatoriaConfig,
    listMasterForms, getMasterForm, downloadMasterFormDocx, reopenMasterForm, lockMasterForm,
};
