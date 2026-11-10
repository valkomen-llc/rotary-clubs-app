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
    getAdminConfig, saveAdminConfig, resolvePriceMode, sendFairEmail, buildPaymentReminderHtml,
} from './projectFairController.js';
import { buildProjectDocx, DOCX_MIME } from '../lib/projectFairDocx.js';
import {
    BULK_MAX, BULK_CAPABILITY, planBulk, describeBulkPlan,
    validateBulkPlan, normalizeArchiveView, labelOf,
} from '../lib/projectFairBulk.js';
// v4.1026 — El traslado de lo cobrado. El CRITERIO es puro y vive aparte; el
// REGISTRO no está acá: va por el mismo endpoint de la Bóveda.
import {
    transferItem, planTransfers, pickTransferSite,
} from '../lib/projectFairTransfers.js';
import { paymentsForSubmissions } from '../lib/projectFairCollections.js';
import { canDisburse } from '../lib/walletLifecycle.js';
import { balanceFor } from '../lib/disbursements.js';
// Normalización del logo institucional (misma que Gestión de Eventos).
import { embedLogoDataUrl } from '../lib/logoEmbed.js';
import { hasPermission } from '../lib/rbacSpec.js';
// v4.1253 — Estado del proyecto y estado del pago, separados.
import {
    PROJECT_STATES, PROJECT_STATE_KEYS, LEGACY_PAYMENT_WORKFLOW, projectStateOf, projectStateMeta,
    isApplied, owesRegistration, paymentStatusOf, paymentStatusLabel, PAYMENT_VIEW_STATES,
    SQL_APPLIED, SQL_DRAFT, SQL_OWES, reminderVerdict,
} from '../lib/projectFairLifecycle.js';
import { resolveUserGrant } from '../lib/rbacStore.js';
// v4.1299 — La INSCRIPCIÓN: uno o dos proyectos por club. Las reglas en SQL
// se arman en el criterio puro, no a mano acá.
import {
    SQL_ACTIVE_PROJECT, SQL_FIRST_PROJECT, SQL_SECOND_PROJECT, SQL_REGISTRATION_KEY,
    indexOf as projectIndexOf, projectIndexLabel, pricingRulesOf, registrationBreakdown,
    manualCoverageFor, amountOverrideOf, amountOverridePlan, lineAmountFor,
} from '../lib/projectFairRegistration.js';
// v4.1308 — El comprobante adjunto de la confirmación manual (S3 privado).
import {
    presignManualReceipt, verifyManualReceipt, manualReceiptKeyBelongs, signedReceiptUrl,
} from '../lib/projectFairManualReceipts.js';
// v4.1304 — FDD y FAP del proyecto en el listado: una sola lectura en SQL de
// lo que el club ya escribió en su Solicitud de Aportes del FDD.
// v4.1311 — Sustituir una postulación por otra del mismo club, con su pago.
import {
    substitutionPlan, substitutionWrites, substitutionViewOf, paymentFactsOf, stripeFactsOf,
} from '../lib/projectFairSubstitution.js';
import {
    SQL_FDD_COLUMNS, FDD_SORTABLE, FDD_RANGE_FILTERS, sqlAmount, rangeBound, fddAmountsOf,
} from '../lib/projectFairFddAmounts.js';

console.log('[projectFairAdminController] v4.1313.0 cargado — Editar el valor de la inscripción de un proyecto desde su ficha (250.000 → 100.000 u otro): línea + metadata.amountOverride que respetan el cobro, el desglose y la confirmación manual; motivo obligatorio, historial antes/después, cobro abierto expirado; no toca lo recibido ni Stripe.');
console.log('[projectFairAdminController] v4.1311.0 cargado — Sustituir una postulación por otra del mismo club con su pago: verificación contra la base, Stripe y la Bóveda; aplicación en una transacción con huella, auditoría antes/después e idempotencia; el pago queda en su ancla (coveredBy).');
console.log('[projectFairAdminController] v4.1308.0 cargado — Confirmación manual de pagos: comprobante adjunto (S3 privado, validado por sus bytes), el mismo pago puede cubrir la inscripción completa de dos proyectos, y cada fila confirmada deja su línea escrita para sumar al recaudo.');
console.log('[projectFairAdminController] v4.1301.0 cargado — La ficha resume la inscripción (modalidad, origen del segundo proyecto, pago original y complementario, total y saldo); indicadores y filtro de ampliaciones posteriores.');
console.log('[projectFairAdminController] v4.1299.0 cargado — Hasta dos proyectos por club: el panel distingue clubes inscritos de proyectos inscritos, cuenta segundos proyectos y separa el recaudo por primeras y segundas postulaciones; filtros por cantidad de proyectos del club y por posición.');
console.log('[projectFairAdminController] v4.1220.0 cargado — Gestión de Postulaciones y Pagos (dashboard, trazabilidad Stripe, confirmación manual, etiquetas, alertas y reportes)');

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');

// ── Estados del proceso ──────────────────────────────────────────────
// El estado del PAGO vive en `status` (lo escribe Stripe); éste es el estado
// del proceso interno de revisión, que mueve el equipo.
// v4.1253 — Es el estado del PROYECTO y nada más. Hasta v4.1252 traía
// también «Pendiente de pago», «Pago confirmado», «Pago fallido» y
// «Reembolsada»: el pago escrito en el lugar del proyecto, y el webhook los
// pisaba sobre lo que hubiera decidido el comité. El catálogo vive en el
// criterio puro (`projectFairLifecycle.js`); los cuatro heredados se siguen
// pudiendo LEER (`legacy`) pero ya no se ofrecen al elegir, y la migración de
// arranque los convierte en «Postulado».
export const WORKFLOW_STATES = [
    ...PROJECT_STATES.map(st => ({ key: st.key, label: st.label, color: st.color, group: st.applied ? 'postulacion' : 'inicial' })),
    ...LEGACY_PAYMENT_WORKFLOW.map(key => ({ key, label: 'Postulado', color: 'blue', group: 'postulacion', legacy: true })),
];
// Lo que se puede ESCRIBIR: sólo estados del proyecto, nunca uno del pago.
const WORKFLOW_KEYS = PROJECT_STATE_KEYS;

export const PAYMENT_STATES = [
    { key: 'pending_payment', label: 'Pendiente de pago', color: 'amber' },
    { key: 'processing', label: 'Pago en procesamiento', color: 'sky' },
    { key: 'paid', label: 'Pago completado', color: 'emerald' },
    { key: 'failed', label: 'Pago fallido', color: 'red' },
    { key: 'refunded', label: 'Pago reembolsado', color: 'orange' },
    { key: 'requires_reconciliation', label: 'Requiere conciliación', color: 'violet' },
];

export const PRIORITIES = [
    { key: 'low', label: 'Baja', color: 'slate' },
    { key: 'normal', label: 'Normal', color: 'sky' },
    { key: 'high', label: 'Alta', color: 'amber' },
    { key: 'critical', label: 'Crítica', color: 'red' },
];

// ── Permisos ─────────────────────────────────────────────────────────
//
// `remove` (v4.1024) es la capacidad de ARCHIVAR y de ELIMINAR, y es propia a
// propósito: no se deduce de `edit`. Editar es corregir una errata de captura;
// archivar saca una postulación del listado y eliminar se lleva la cuenta con
// la que un club entra a su panel, sus formularios y sus adjuntos. Sólo la
// tiene el rol admin — un `finance` mueve pagos y un `reviewer` mueve estados,
// y ninguno de los dos tiene por qué poder vaciar el registro.
const ROLE_CAPABILITIES = {
    admin:    { view: true, managePayments: true, viewPayments: true, comment: true, edit: true, changeStatus: true, manageTags: true, export: true, config: true, remove: true },
    finance:  { view: true, managePayments: true, viewPayments: true, comment: true, edit: false, changeStatus: false, manageTags: false, export: true, config: false, remove: false },
    reviewer: { view: true, managePayments: false, viewPayments: false, comment: true, edit: false, changeStatus: true, manageTags: true, export: true, config: false, remove: false },
    viewer:   { view: true, managePayments: false, viewPayments: false, comment: false, edit: false, changeStatus: false, manageTags: false, export: false, config: false, remove: false },
};

// Columna sobre la que se agregan los recaudos: la del precio anunciado. Es un
// literal controlado (nunca viene del request), no una interpolación de datos.
const amountColumn = (priceMode) => (priceMode === 'USD' ? '"amountUsd"' : '"amountCop"');

const listHas = (list, email) =>
    Array.isArray(list) && !!email && list.some(e => String(e).trim().toLowerCase() === String(email).toLowerCase());

/**
 * ¿El usuario administra el sitio donde vive este módulo?
 *
 * Antes esto sólo era cierto si el admin había asociado explícitamente un
 * `clubId` a la convocatoria, algo que nadie hacía: el resultado era que el
 * administrador del propio sitio de la feria entraba como 'viewer' y no podía
 * editar su convocatoria. Ahora también cuenta como dueño quien administra un
 * sitio cuyo tipo lo identifica como Feria de Proyectos — el mismo criterio con
 * el que la barra lateral decide mostrar el módulo.
 */
const FAIR_SITE_HINT = /feria de proyectos|project[ _-]?fair/;

const isFairClubRow = (row) =>
    !!row && FAIR_SITE_HINT.test(`${row.type || ''} ${row.organizationType || ''} ${row.category || ''}`.toLowerCase());

/** El sitio (Club) desde cuyo dominio llega la petición, si se puede resolver. */
const clubFromHost = async (req) => {
    const host = String(req?.headers?.host || '').toLowerCase().replace(/:\d+$/, '');
    if (!host) return null;
    const bare = host.replace(/^www\./, '');
    const sub = bare.split('.')[0];
    try {
        const { rows } = await db.query(`
            SELECT id, type, "organizationType", category FROM "Club"
            WHERE lower(domain) IN ($1, $2) OR lower(subdomain) = $3
            LIMIT 1`, [host, bare, sub]);
        return rows[0] || null;
    } catch (err) {
        console.warn('[project-fair-admin] No pude resolver el sitio por dominio:', err?.message);
        return null;
    }
};

export const isProjectFairSiteAdmin = async (req, cfg) => {
    const user = req?.user;
    if (!user) return false;
    if (user.role === 'administrator') return true;
    if (!user.clubId) return false;
    if (cfg?.clubId && user.clubId === cfg.clubId) return true;

    // Reconocimiento explícito del rol institucional o permiso de la feria
    if (user.role === 'project_fair_manager') return true;
    try {
        const grant = req.grant || await resolveUserGrant(user, user.clubId);
        if (grant && (grant.roleKey === 'project_fair_manager' || hasPermission(grant, 'project_fair.manage') || hasPermission(grant, 'project_fair.view'))) {
            return true;
        }
    } catch {
        // Degrada a comprobación por rol y tipo
    }

    if (!['club_admin', 'district_admin', 'administrator', 'editor', 'institutional_user'].includes(user?.role)) return false;

    // 1) El sitio del que administra el usuario está marcado como Feria de
    //    Proyectos (mismo criterio con el que la barra lateral muestra el
    //    módulo).
    try {
        const { rows } = await db.query(
            'SELECT type, "organizationType", category FROM "Club" WHERE id = $1 LIMIT 1', [user.clubId]);
        if (isFairClubRow(rows[0])) return true;
    } catch (err) {
        console.warn('[project-fair-admin] No pude verificar el tipo del sitio:', err?.message);
    }

    // 2) Respaldo: la petición llega desde el dominio de un sitio de feria y el
    //    usuario administra ese mismo sitio. Cubre los casos donde el `clubId`
    //    del token apunta a un club espejo (p. ej. tras una suplantación de
    //    distrito) y por eso el tipo no se reconocía.
    const host = await clubFromHost(req);
    return !!host && host.id === user.clubId && isFairClubRow(host);
};

export const resolveAccess = (user, cfg, { ownsFairSite = false } = {}) => {
    const email = user?.email || '';
    const access = cfg?.access || {};

    let role = 'viewer';
    if (user?.role === 'administrator' || user?.role === 'project_fair_manager' || listHas(access.admins, email) || ownsFairSite) role = 'admin';
    else if (listHas(access.finance, email)) role = 'finance';
    else if (listHas(access.reviewers, email)) role = 'reviewer';
    else if (['district_admin', 'club_admin', 'editor'].includes(user?.role)) role = 'viewer';
    return { role, ...ROLE_CAPABILITIES[role] };
};

export const actorFrom = (req, access) => ({
    id: req.user?.id || null,
    name: req.user?.email || 'Administrador',
    role: access?.role || req.user?.role || null,
});

// v4.642 — Exportado para que los formularios del proyecto
// (`projectFormsController.js`) resuelvan los permisos con este mismo
// guardián, en vez de tener uno propio que se desincronice.
export const withAccess = (handler, capability = 'view') => async (req, res) => {
    try {
        await ensureTables();
        // La convocatoria que se lee es la de la EDICIÓN abierta en el panel:
        // precios, fechas, plantilla del formulario y permisos son suyos. Sin
        // `evento` se lee la abierta, como hasta v4.682.
        const cfg = await readConfigForAdmin(clean(req.query?.evento, 60) || null);
        const access = resolveAccess(req.user, cfg, { ownsFairSite: await isProjectFairSiteAdmin(req, cfg) });
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
        // v4.677 — Datos del representante para facturar y acreditar.
        country: row.country || null,
        department: row.department || null,
        city: row.city || null,
        clubRole: row.clubRole || null,
        // Con "Otro" vale el cargo que escribió el postulante, no la palabra.
        clubRoleLabel: row.clubRoleOther || row.clubRoleLabel || null,
        clubRoleOther: row.clubRoleOther || null,
        idType: row.idType || null,
        idTypeLabel: row.idTypeLabel || null,
        idNumber: row.idNumber || null,
        notes: row.notes || null,
        projectName: row.projectName,
        projectDescription: row.projectDescription,
        focusArea: row.focusArea,
        focusAreaLabel: row.focusAreaLabel,
        budgetUsd: num(row.budgetUsd),
        paymentStatus: row.status,
        // v4.1253 — El estado del PROYECTO, normalizado: un valor heredado
        // del pago se lee como «Postulado».
        workflowStatus: projectStateOf(row),
        projectStateLabel: projectStateMeta(projectStateOf(row)).label,
        applied: isApplied(row),
        appliedAt: row.appliedAt || null,
        // Y el del PAGO, como se le explica a una persona.
        paymentView: paymentStatusOf(row),
        paymentViewLabel: paymentStatusLabel(paymentStatusOf(row)),
        owesRegistration: owesRegistration(row),
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
        // v4.1024 — El archivado viaja siempre: la pantalla lo necesita para
        // marcar la fila y para prever qué haría una acción en bloque.
        archivedAt: row.archivedAt || null,
        archivedBy: row.archivedBy || null,
        archivedReason: row.archivedReason || null,
        chargeCurrency: row.chargeCurrency || null,
        paymentConfirmationOrigin: row.paymentConfirmationOrigin || (row.status === 'paid' ? (row.stripeSessionId || row.stripePaymentIntentId || row.metadata?.payment?.coveredBy ? 'stripe' : 'manual_admin') : null),
        // v4.1299 — La inscripción a la que pertenece y su posición en ella.
        registrationId: row.registrationId || null,
        projectIndex: projectIndexOf(row),
        projectIndexLabel: projectIndexLabel(projectIndexOf(row)),
        // Cuántos proyectos ACTIVOS tiene su inscripción (lo calcula el listado).
        registrationProjects: row.registrationProjects == null ? null : Number(row.registrationProjects),
        // Pagado dentro del cobro de otro proyecto de la misma inscripción.
        coveredBy: row.metadata?.payment?.coveredBy ? { id: row.metadata.payment.coveredBy, publicRef: row.metadata.payment.coveredByRef || null } : null,
        // El cobro de esta fila cubrió también a estos proyectos.
        coveredProjects: Array.isArray(row.metadata?.payment?.coveredProjects) && row.metadata.payment.coveredProjects.length > 1
            ? row.metadata.payment.coveredProjects.filter(p => p.id !== row.id).map(p => ({ id: p.id, publicRef: p.publicRef || null, projectName: p.projectName, projectIndex: p.projectIndex }))
            : [],
        withdrawnByClub: !!row.metadata?.withdrawnByClub,
        // v4.1311 — Sustitución: el proyecto retirado sabe por cuál se cambió, y
        // el conservado, de quién es el pago que lo respalda (que puede no ser
        // su responsable).
        substitution: substitutionViewOf(row, { viewPayments: !!access?.viewPayments }),
        paidByName: row.metadata?.substitution?.role === 'kept' ? (row.metadata.substitution.payer?.name || null) : null,
        // v4.1301 — Por dónde entró a la inscripción: registro inicial o
        // ampliación posterior desde «Mi proyecto».
        addedVia: row.metadata?.addedVia || (projectIndexOf(row) >= 2 ? 'wizard' : null),
        isExtension: row.metadata?.addedVia === 'portal_extension',
        lastSyncAt: row.lastSyncAt || null,
        // v4.1313 — El valor ajustado a mano por el comité (si lo tiene).
        amountOverride: (() => {
            const o = amountOverrideOf(row);
            return o ? { amount: o.amount, currency: o.currency, tariff: o.tariff ?? null, previous: o.previous ?? null, reason: o.reason || null, by: o.by || null, at: o.at || null } : null;
        })(),
        manualPaymentRef: row.manualPaymentRef || null,
        manualPaymentEvidence: row.manualPaymentEvidence || null,
        manualPaymentReason: row.manualPaymentReason || null,
        manualPaymentBy: row.manualPaymentBy || null,
        manualPaymentAt: row.manualPaymentAt || null,
        // v4.1308 — El comprobante adjunto: nombre, tipo y peso. La clave de
        // S3 NO viaja; se abre con `manual-payment/receipt` (enlace firmado).
        manualPaymentReceipt: row.manualPaymentReceiptKey
            ? { name: row.manualPaymentReceiptName || 'comprobante', mime: row.manualPaymentReceiptMime || null, bytes: row.manualPaymentReceiptBytes == null ? null : Number(row.manualPaymentReceiptBytes) }
            : null,
        tags: row.tags || [],
        // v4.1304 — FDD solicitado y meta FAP del proyecto (sólo cuando la
        // consulta los trajo: listado y exportación).
        ...fddAmountsOf(row),
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
/**
 * AISLAMIENTO POR EDICIÓN (v4.683) — la razón de que esta función exista.
 *
 * Todas las consultas del panel pasan por aquí, así que es el único sitio donde
 * hay que garantizar que una edición no vea las postulaciones de otra. Si el
 * panel manda `?evento=`, se filtra por esa edición y punto; no hay forma de
 * pedir "todas" desde la pantalla.
 *
 * Sin `evento` se conserva el comportamiento anterior —todo junto—, que es lo
 * que necesitan las postulaciones aún sin migrar y cualquier consulta interna
 * que no venga del panel.
 */
const buildFilters = (query) => {
    const where = [];
    const params = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replace('$?', `$${params.length}`)); };

    const eventId = clean(query.evento, 60);
    if (eventId) add('"eventId" = $?', eventId);

    // ARCHIVADAS (v4.1024). Por defecto NO se ven: es lo que significa
    // archivar y es lo que se pidió — «limpiar el listado». Como pasa por
    // aquí, alcanza también a los reportes y a la exportación, que es lo
    // coherente: una postulación archivada no debería seguir sumando en el
    // Centro de Inteligencia. Y como hoy no hay ninguna archivada, desplegarlo
    // no mueve ni una cifra — ésa es la comprobación que lo autoriza.
    const archivadas = normalizeArchiveView(query.archivadas);
    if (archivadas === 'activas') where.push('"archivedAt" IS NULL');
    else if (archivadas === 'archivadas') where.push('"archivedAt" IS NOT NULL');

    const search = clean(query.search, 160);
    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        where.push(`("clubName" ILIKE $${i} OR "projectName" ILIKE $${i} OR email ILIKE $${i} OR "publicRef" ILIKE $${i} OR "firstName" ILIKE $${i} OR "lastName" ILIKE $${i})`);
    }
    if (query.paymentStatus && query.paymentStatus !== 'all') add('status = $?', clean(query.paymentStatus, 30));
    if (query.workflowStatus && query.workflowStatus !== 'all') {
        const wf = clean(query.workflowStatus, 40);
        // «Postulado» incluye las filas que todavía tienen un valor heredado
        // del pago (antes de que corra la migración de arranque).
        if (wf === 'received') add(`COALESCE("workflowStatus",'received') = ANY($?::text[])`, ['received', ...LEGACY_PAYMENT_WORKFLOW]);
        else add('"workflowStatus" = $?', wf);
    }
    // v4.1253 — Vistas de PARTICIPACIÓN y RECAUDO. Son catálogo cerrado y
    // cada una es un literal del criterio puro: un valor que no se reconozca
    // no filtra nada.
    const vista = VIEW_FILTERS[clean(query.vista, 40)];
    if (vista) where.push(vista);
    // v4.1299 — Cantidad de proyectos ACTIVOS de la inscripción del club
    // (`proyectos=1|2`) y posición de la fila en ella (`indice=1|2`).
    const proyectos = clean(query.proyectos, 4);
    if (proyectos === '1' || proyectos === '2') {
        const cmp = proyectos === '2' ? '>= 2' : '= 1';
        // La llave de la inscripción es `COALESCE("registrationId", id)`
        // (`SQL_REGISTRATION_KEY`), calificada acá con la tabla externa.
        where.push(`(SELECT COUNT(*) FROM "ProjectFairSubmission" h
                     WHERE COALESCE(h."registrationId", h.id) = COALESCE("ProjectFairSubmission"."registrationId", "ProjectFairSubmission".id)
                       AND h."archivedAt" IS NULL AND COALESCE(h."workflowStatus",'received') <> 'withdrawn') ${cmp}`);
    }
    const indice = clean(query.indice, 4);
    if (indice === '1') where.push(SQL_FIRST_PROJECT);
    else if (indice === '2') where.push(SQL_SECOND_PROJECT);
    // v4.1301 — Origen del segundo proyecto: `ampliacion` (desde «Mi
    // proyecto») o `inicial` (elegido en el registro).
    const origen = clean(query.origen, 12);
    if (origen === 'ampliacion') where.push(`${SQL_SECOND_PROJECT} AND metadata->>'addedVia' = 'portal_extension'`);
    else if (origen === 'inicial') where.push(`${SQL_SECOND_PROJECT} AND COALESCE(metadata->>'addedVia','wizard') <> 'portal_extension'`);
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
    // v4.1304 — Rangos de FDD solicitado y meta FAP, con la MISMA lectura que
    // la columna. Un proyecto sin el valor no entra en un rango.
    for (const r of FDD_RANGE_FILTERS) {
        const bound = rangeBound(query[r.param]);
        if (bound !== null) add(`${sqlAmount(r.key)} ${r.op} $?::numeric`, bound);
    }
    if (query.tagId) {
        params.push(clean(query.tagId, 60));
        where.push(`EXISTS (SELECT 1 FROM "ProjectFairSubmissionTag" st WHERE st."submissionId" = "ProjectFairSubmission".id AND st."tagId" = $${params.length})`);
    }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

/**
 * Las vistas que pidió el cliente para separar participación de recaudo.
 * Cada una sale del criterio puro (`SQL_APPLIED`, `SQL_OWES`…), así que el
 * listado, los indicadores y los recordatorios cuentan lo mismo.
 */
export const VIEW_FILTERS = {
    postulados: SQL_APPLIED,
    borradores: SQL_DRAFT,
    // v4.1259 — «En revisión» y «Requieren ajustes» son vistas separadas (el
    // Centro de Gestión del dashboard las ofrece por separado).
    en_revision: `COALESCE("workflowStatus",'received') = 'in_review'`,
    requieren_ajustes: `COALESCE("workflowStatus",'received') = 'needs_changes'`,
    aprobados: `COALESCE("workflowStatus",'received') = 'approved'`,
    rechazados: `COALESCE("workflowStatus",'received') = 'rejected'`,
    pago_pendiente: SQL_OWES,
    pago_confirmado: `status = 'paid'`,
    // «Postulaciones sin pago»: deben la inscripción y NUNCA intentaron
    // pagarla. Es la lista de a quién conviene escribirle primero.
    sin_intento_de_pago: `${SQL_OWES} AND NOT EXISTS (SELECT 1 FROM "ProjectFairPaymentAttempt" a WHERE a."submissionId" = "ProjectFairSubmission".id)`,
};
export const VIEW_OPTIONS = [
    { key: 'postulados', label: 'Postulados' },
    { key: 'en_revision', label: 'En revisión' },
    { key: 'requieren_ajustes', label: 'Requieren ajustes' },
    { key: 'aprobados', label: 'Aprobados' },
    { key: 'rechazados', label: 'Rechazados' },
    { key: 'pago_pendiente', label: 'Pago pendiente' },
    { key: 'pago_confirmado', label: 'Pago confirmado' },
    { key: 'borradores', label: 'En borrador' },
    { key: 'sin_intento_de_pago', label: 'Sin ningún intento de pago' },
];

const SORTABLE = {
    createdAt: '"createdAt"', projectName: '"projectName"', clubName: '"clubName"', projectIndex: '"projectIndex"',
    district: 'district', budgetUsd: '"budgetUsd"', amountCop: '"amountCop"',
    paymentStatus: 'status', workflowStatus: '"workflowStatus"', priority: 'priority', paidAt: '"paidAt"',
    // v4.1304 — Numérico: el alias de la columna calculada del listado.
    ...FDD_SORTABLE,
};

// ── Dashboard ────────────────────────────────────────────────────────
// GET /admin/overview
/**
 * CENTRO DE INTELIGENCIA DE LA EDICIÓN (v4.689) — antes `getOverview` + `getReports`.
 *
 * Las dos pantallas calculaban lo MISMO por separado: `byDistrict`,
 * `byFocusArea`, `byWorkflow` y la línea de tiempo salían de consultas casi
 * idénticas, en dos viajes al servidor, y se pintaban dos veces con nombres
 * distintos. Aquí se calcula una sola vez y se sirve en una sola respuesta.
 *
 * Todo pasa por `buildFilters`, así que responde SIEMPRE sobre la edición
 * abierta: cada versión de la feria tiene su propio centro de inteligencia sin
 * que haya que hacer nada.
 */
export const getIntelligence = withAccess(async (req, res, { cfg, access }) => {
    const { clause, params } = buildFilters(req.query);
    const T = '"ProjectFairSubmission"';
    const priceMode = resolvePriceMode(cfg);
    const AMT = amountColumn(priceMode);

    // Agrupación por una columna cualquiera, con conteo, pagadas, recaudo y
    // presupuesto. Sirve para distrito, club, área, país, departamento y
    // ciudad: son la misma pregunta cambiando el eje.
    const groupBy = (expr, limit = null) => db.query(
        `SELECT ${expr} AS key,
                COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE status='paid')::int AS paid,
                COALESCE(SUM(${AMT}) FILTER (WHERE status='paid'),0)::float AS "totalAmount",
                COALESCE(SUM("budgetUsd"),0)::float AS "totalBudget"
         FROM ${T} ${clause}
         GROUP BY 1 ORDER BY count DESC, key ASC ${limit ? `LIMIT ${limit}` : ''}`, params);

    const [
        totals, byPayment, byWorkflow, byDistrict, byFocus, byClub,
        byCountry, byDepartment, byCity, timeline, topBudget, activity, byRegistrationSize,
    ] = await Promise.all([
        db.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
                   COUNT(*) FILTER (WHERE status = 'pending_payment')::int AS pending,
                   COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                   COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded,
                   COUNT(*) FILTER (WHERE "workflowStatus" IN ('received','pending_payment','payment_confirmed','payment_failed','refunded'))::int AS "pendingReview",
                   COUNT(*) FILTER (WHERE "workflowStatus" = 'approved')::int AS approved,
                   -- v4.1253 — PARTICIPACIÓN y RECAUDO, separados. Un borrador
                   -- cuenta como participación, nunca como deuda.
                   COUNT(*) FILTER (WHERE ${SQL_DRAFT})::int AS drafts,
                   COUNT(*) FILTER (WHERE ${SQL_APPLIED})::int AS applied,
                   COUNT(*) FILTER (WHERE ${SQL_OWES})::int AS owing,
                   COALESCE(SUM(${AMT}) FILTER (WHERE ${SQL_OWES}), 0)::float AS "pendingAmount",
                   COALESCE(SUM(${AMT}) FILTER (WHERE status = 'paid'), 0)::float AS "collectedAmount",
                   COUNT(DISTINCT lower(email))::int AS "registeredUsers",
                   COUNT(*) FILTER (WHERE "workflowStatus" = 'rejected')::int AS rejected,
                   COUNT(*) FILTER (WHERE "workflowStatus" = 'in_review')::int AS "inReview",
                   COUNT(*) FILTER (WHERE "workflowStatus" = 'needs_changes')::int AS "needsChanges",
                   COUNT(*) FILTER (WHERE "workflowStatus" = 'sent_to_grants')::int AS "sentToGrants",
                   COUNT(DISTINCT district) FILTER (WHERE district IS NOT NULL AND district <> '')::int AS districts,
                   COUNT(DISTINCT lower("clubName")) FILTER (WHERE "clubName" IS NOT NULL AND "clubName" <> '')::int AS clubs,
                   -- v4.1299 — INSCRIPCIONES (clubes inscritos) vs PROYECTOS, y
                   -- el segundo proyecto por separado. Un retirado no cuenta.
                   COUNT(DISTINCT ${SQL_REGISTRATION_KEY}) FILTER (WHERE ${SQL_ACTIVE_PROJECT})::int AS registrations,
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT})::int AS "activeProjects",
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT})::int AS "secondProjects",
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND ${SQL_APPLIED})::int AS "secondProjectsApplied",
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND status = 'paid')::int AS "secondProjectsPaid",
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND ${SQL_OWES})::int AS "secondProjectsOwing",
                   COALESCE(SUM(${AMT}) FILTER (WHERE status = 'paid' AND ${SQL_FIRST_PROJECT}), 0)::float AS "collectedFirst",
                   COALESCE(SUM(${AMT}) FILTER (WHERE status = 'paid' AND ${SQL_SECOND_PROJECT}), 0)::float AS "collectedSecond",
                   COALESCE(SUM(${AMT}) FILTER (WHERE ${SQL_OWES} AND ${SQL_FIRST_PROJECT}), 0)::float AS "pendingFirst",
                   COALESCE(SUM(${AMT}) FILTER (WHERE ${SQL_OWES} AND ${SQL_SECOND_PROJECT}), 0)::float AS "pendingSecond",
                   COALESCE(SUM("amountReceived") FILTER (WHERE status = 'paid'), 0)::float AS "receivedTotal",
                   -- v4.1301 — AMPLIACIONES: segundos proyectos agregados desde «Mi proyecto».
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND metadata->>'addedVia' = 'portal_extension')::int AS extensions,
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND metadata->>'addedVia' = 'portal_extension' AND ${SQL_DRAFT})::int AS "extensionsDraft",
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND metadata->>'addedVia' = 'portal_extension' AND ${SQL_OWES})::int AS "extensionsOwing",
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND metadata->>'addedVia' = 'portal_extension' AND status = 'paid')::int AS "extensionsPaid",
                   COALESCE(SUM(${AMT}) FILTER (WHERE status = 'paid' AND ${SQL_SECOND_PROJECT} AND metadata->>'addedVia' = 'portal_extension'), 0)::float AS "collectedExtensions",
                   COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND ${SQL_SECOND_PROJECT} AND ${SQL_DRAFT})::int AS "secondProjectsDraft",
                   COUNT(DISTINCT lower(country)) FILTER (WHERE country IS NOT NULL AND country <> '')::int AS countries,
                   COALESCE(SUM("amountCop") FILTER (WHERE status = 'paid'), 0)::float AS "totalCop",
                   COALESCE(SUM("amountUsd") FILTER (WHERE status = 'paid'), 0)::float AS "totalUsd",
                   COALESCE(SUM("refundedAmount"), 0)::float AS "totalRefunded",
                   COALESCE(AVG("budgetUsd"), 0)::float AS "avgBudget",
                   COALESCE(SUM("budgetUsd"), 0)::float AS "totalBudget",
                   MIN("budgetUsd") FILTER (WHERE "budgetUsd" IS NOT NULL AND "budgetUsd" > 0)::float AS "minBudget",
                   MAX("budgetUsd")::float AS "maxBudget",
                   COALESCE(AVG("trmRate") FILTER (WHERE status='paid'), 0)::float AS "avgTrm",
                   MIN("trmRate") FILTER (WHERE status='paid' AND "trmRate" IS NOT NULL)::float AS "minTrm",
                   MAX("trmRate") FILTER (WHERE status='paid' AND "trmRate" IS NOT NULL)::float AS "maxTrm",
                   COALESCE(AVG("amountCop") FILTER (WHERE status='paid'), 0)::float AS "ticketAvgCop",
                   COALESCE(AVG("amountUsd") FILTER (WHERE status='paid'), 0)::float AS "ticketAvgUsd",
                   MIN("createdAt")::text AS "periodStart",
                   MAX("createdAt")::text AS "periodEnd",
                   MIN("paidAt") FILTER (WHERE status='paid')::text AS "firstPayment",
                   MAX("paidAt") FILTER (WHERE status='paid')::text AS "lastPayment"
            FROM ${T} ${clause}`, params),
        db.query(`SELECT status AS key, COUNT(*)::int AS count FROM ${T} ${clause} GROUP BY 1`, params),
        db.query(`SELECT COALESCE("workflowStatus",'received') AS key, COUNT(*)::int AS count FROM ${T} ${clause} GROUP BY 1`, params),
        groupBy(`COALESCE(district,'Sin distrito')`),
        groupBy(`COALESCE("focusAreaLabel", "focusArea", 'Sin área')`),
        groupBy(`COALESCE("clubName",'Sin club')`, 50),
        groupBy(`COALESCE(country,'Sin país')`),
        groupBy(`COALESCE(department,'Sin departamento')`, 25),
        groupBy(`COALESCE(city,'Sin ciudad')`, 25),
        db.query(`SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                         COUNT(*)::int AS total,
                         COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
                         COALESCE(SUM(${AMT}) FILTER (WHERE status='paid'),0)::float AS "totalAmount"
                  FROM ${T} ${clause} GROUP BY 1 ORDER BY 1`, params),
        db.query(`SELECT id, "publicRef", "projectName", "clubName", district,
                         COALESCE("budgetUsd",0)::float AS "budgetUsd", status
                  FROM ${T} ${clause} ORDER BY "budgetUsd" DESC NULLS LAST LIMIT 10`, params),
        // Actividad reciente: la línea de tiempo que el módulo ya registra por
        // cada postulación. Se acota a la edición uniendo con su postulación,
        // porque `ProjectFairEvent` no lleva `eventId` propio.
        db.query(`
            SELECT e.type, e.title, e.detail, e."createdAt",
                   ${T}."publicRef", ${T}."projectName", ${T}."clubName"
            FROM "ProjectFairEvent" e
            JOIN ${T} ON ${T}.id = e."submissionId"
            ${clause}
            ORDER BY e."createdAt" DESC LIMIT 25`, params),
        // v4.1299 — Cuántas inscripciones tienen UN proyecto y cuántas DOS, y
        // cuántas de cada grupo están completamente pagadas.
        db.query(`
            SELECT n AS projects,
                   COUNT(*)::int AS registrations,
                   COUNT(*) FILTER (WHERE paid = n)::int AS "fullyPaid"
            FROM (
                SELECT ${SQL_REGISTRATION_KEY} AS reg,
                       COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT}) AS n,
                       COUNT(*) FILTER (WHERE ${SQL_ACTIVE_PROJECT} AND status = 'paid') AS paid
                FROM ${T} ${clause}
                GROUP BY 1
            ) g
            WHERE n > 0
            GROUP BY n ORDER BY n`, params),
    ]);

    const t = totals.rows[0] || {};
    const pct = (n, d) => (d > 0 ? Math.round(((n || 0) / d) * 1000) / 10 : 0);

    // EMBUDO. Sólo etapas que el módulo REGISTRA de verdad; no se inventan
    // pasos ("proyecto publicado") que nadie marca, porque una etapa siempre en
    // cero no dice dónde se pierde nada: sólo estorba.
    // v4.1253 — «Enviadas» son las POSTULADAS: un borrador todavía no se
    // envió. Sin borradores (todo lo anterior a v4.1253) es lo mismo que el
    // total.
    const enviadas = t.applied ?? t.total ?? 0;
    const enRevision = (t.inReview || 0) + (t.approved || 0) + (t.sentToGrants || 0);
    const aprobadas = (t.approved || 0) + (t.sentToGrants || 0);
    const funnel = [
        { key: 'submitted', label: 'Proyecto postulado', count: enviadas, rate: enviadas ? 100 : 0 },
        { key: 'paid', label: 'Pago confirmado', count: t.paid || 0, rate: pct(t.paid, enviadas) },
        { key: 'in_review', label: 'En revisión', count: enRevision, rate: pct(enRevision, enviadas) },
        { key: 'approved', label: 'Aprobada', count: aprobadas, rate: pct(aprobadas, enviadas) },
        { key: 'sent_to_grants', label: 'Enviada a Rotary Grants', count: t.sentToGrants || 0, rate: pct(t.sentToGrants, enviadas) },
    ];

    // Logo oficial del sitio de la feria (v4.1128): el que el sitio ya usa
    // como identidad (navbar con `Club.logo` / `logo_intl`, og:image). Sin
    // hardcodear assets en el cliente: se resuelve DINÁMICAMENTE para la
    // edición que se está reportando (`?evento=` o la abierta).
    //
    // Cascada (primera URL no vacía gana):
    //   1. sitio de la edición (`CalendarEvent.clubId`, NOT NULL garantizado)
    //   2. club de la convocatoria (`cfg.clubId`, billetera del cobro)
    //   3. sitio que sirve la petición (dominio actual)
    //   4. primer sitio de feria con logo (`category = 'project_fair'` o
    //      marcas de feria/fair en tipo/organización/categoría)
    //
    // En cada sitio se lee `Club.logo` (nacional, el que usa el PDF en
    // español) y `Setting.logo_intl` (versión internacional de la navbar):
    // el PDF prefiere el nacional y cae al internacional si es lo único que
    // hay. `Club.logo` es URL directa.
    let siteLogo = null;
    let siteLogoIntl = null;
    try {
        const cleanId = (v) => String(v || '').trim() || null;
        // Edición reportada: la de la URL o, sin ella, la abierta (mismo
        // orden que `readConfig`: habilitada primero, luego la más reciente).
        let editionEventId = cleanId(req.query?.evento);
        if (!editionEventId) {
            try {
                const open = await db.query(`
                    SELECT "eventId" FROM "ProjectFairConfig"
                    ORDER BY (config->>'enabled' IS DISTINCT FROM 'false') DESC, "updatedAt" DESC
                    LIMIT 1`);
                editionEventId = cleanId(open.rows?.[0]?.eventId);
            } catch { /* sin edición abierta: se sigue con las demás señales */ }
        }
        let editionClubId = null;
        if (editionEventId) {
            try {
                const ev = await db.query('SELECT "clubId" FROM "CalendarEvent" WHERE id = $1 LIMIT 1', [editionEventId]);
                editionClubId = cleanId(ev.rows?.[0]?.clubId);
            } catch { /* el sitio de la edición degrada a null, nunca lanza */ }
        }
        const ids = [];
        if (editionClubId) ids.push(editionClubId);
        if (cfg?.clubId && !ids.includes(cfg.clubId)) ids.push(cfg.clubId);
        try {
            const hostSite = await clubFromHost(req).catch(() => null);
            if (hostSite?.id && !ids.includes(hostSite.id)) ids.push(hostSite.id);
        } catch { /* el host es sólo una señal más */ }
        const logoOf = async (id) => {
            if (!id) return null;
            try {
                const { rows } = await db.query('SELECT logo FROM "Club" WHERE id = $1 LIMIT 1', [id]);
                const url = typeof rows[0]?.logo === 'string' ? rows[0].logo.trim() : '';
                if (url) return { url, national: true };
            } catch { /* sigue con la siguiente señal */ }
            try {
                const { rows } = await db.query(
                    `SELECT value FROM "Setting" WHERE "clubId" = $1 AND key = 'logo_intl' LIMIT 1`, [id]);
                const url = typeof rows[0]?.value === 'string' ? rows[0].value.trim() : '';
                if (url) return { url, national: false };
            } catch { /* sin internacional tampoco */ }
            return null;
        };
        for (const id of ids) {
            const found = await logoOf(id);
            if (found) {
                if (found.national) siteLogo = found.url;
                else { siteLogoIntl = siteLogoIntl || found.url; siteLogo = siteLogo || found.url; }
                if (siteLogo) break;
            }
        }
        // Logo internacional del sitio de la edición, para cuando el nacional
        // no existe pero el sitio sí tiene versión rotulada en inglés.
        if (!siteLogoIntl && editionClubId) {
            try {
                const { rows } = await db.query(
                    `SELECT value FROM "Setting" WHERE "clubId" = $1 AND key = 'logo_intl' LIMIT 1`, [editionClubId]);
                const url = typeof rows[0]?.value === 'string' ? rows[0].value.trim() : '';
                if (url) siteLogoIntl = url;
            } catch { /* opcional */ }
        }
        if (!siteLogo && !siteLogoIntl) {
            // `category = 'project_fair'` es el subtipo real del esquema (ver
            // `schema.prisma`); '%feria%' solo no lo alcanza porque el valor
            // guardado es 'project_fair' en inglés.
            const { rows } = await db.query(
                `SELECT c.id, c.logo FROM "Club" c
                 WHERE c.logo IS NOT NULL AND btrim(c.logo) <> ''
                   AND (c.category = 'project_fair'
                        OR c.type ILIKE '%feria%' OR c.type ILIKE '%fair%'
                        OR c."organizationType" ILIKE '%feria%' OR c."organizationType" ILIKE '%fair%'
                        OR c.category ILIKE '%feria%' OR c.category ILIKE '%fair%')
                 ORDER BY c."updatedAt" DESC NULLS LAST
                 LIMIT 1`);
            const url = typeof rows[0]?.logo === 'string' ? rows[0].logo.trim() : '';
            if (url) {
                siteLogo = url;
                try {
                    const s = await db.query(
                        `SELECT value FROM "Setting" WHERE "clubId" = $1 AND key = 'logo_intl' LIMIT 1`, [rows[0].id]);
                    const intl = typeof s.rows[0]?.value === 'string' ? s.rows[0].value.trim() : '';
                    if (intl) siteLogoIntl = intl;
                } catch { /* el nacional basta */ }
            }
        }
        if (!siteLogo && siteLogoIntl) siteLogo = siteLogoIntl;
    } catch { siteLogo = siteLogo || null; }

    // Identidad visual disponible para el informe ejecutivo. El PDF usa el
    // logo oficial cuando el admin lo configuró (panel de registro o
    // plantilla del correo) o, en su defecto, el logo del sitio de la
    // EDICIÓN reportada (`siteLogo`, el mismo de la navbar y el og:image:
    // `Club.logo`, con `logo_intl` como respaldo); si no hay ninguno, el
    // informe usa cabecera tipográfica institucional sin inventar un logo.
    //
    // `logoSource` dice qué campo ganó (diagnóstico visible en la pestaña de
    // red). Con `?logoData=1` se embeben además los bytes ya normalizados
    // (`logoDataUrl` + `logoDataFormat`, o `logoDataError` con la causa): el
    // PDF del navegador los usa directo y deja de depender de CORS.
    const branding = {
        headerLogo: cfg?.registrationPanel?.headerLogo || null,
        receiptLogo: cfg?.notifications?.branding?.headerLogoUrl || null,
        siteLogo,
        siteLogoIntl: siteLogoIntl || null,
        footerLogo: cfg?.notifications?.branding?.footerLogoUrl || null,
        footerText: cfg?.notifications?.branding?.footerText || null,
        footerImage: cfg?.registrationPanel?.footerImage || null,
    };
    const cleanBrandUrl = (v) => (typeof v === 'string' ? v.trim() : '') || null;
    const logoSource = cleanBrandUrl(branding.headerLogo) ? 'headerLogo'
        : cleanBrandUrl(branding.receiptLogo) ? 'receiptLogo'
        : cleanBrandUrl(branding.siteLogo) ? 'siteLogo'
        : cleanBrandUrl(branding.siteLogoIntl) ? 'siteLogoIntl'
        : cleanBrandUrl(branding.footerLogo) ? 'footerLogo' : null;
    branding.logoSource = logoSource;
    if (['1', 'true', 'yes'].includes(String(req.query?.logoData || '').toLowerCase())) {
        const logoUrl = (logoSource && branding[logoSource]) || null;
        if (logoUrl) {
            try {
                const embedded = await embedLogoDataUrl(logoUrl, req);
                if (embedded?.dataUrl) {
                    branding.logoDataUrl = embedded.dataUrl;
                    branding.logoDataFormat = embedded.format;
                } else {
                    branding.logoDataError = embedded?.error || 'unknown';
                }
            } catch { branding.logoDataError = 'exception'; }
        } else {
            branding.logoDataError = 'no-logo-configured';
        }
    }

    res.json({
        kpis: {
            total: t.total || 0,
            paid: t.paid || 0,
            pending: t.pending || 0,
            failed: t.failed || 0,
            refunded: t.refunded || 0,
            pendingReview: t.pendingReview || 0,
            approved: t.approved || 0,
            rejected: t.rejected || 0,
            inReview: t.inReview || 0,
            needsChanges: t.needsChanges || 0,
            sentToGrants: t.sentToGrants || 0,
            districts: t.districts || 0,
            clubs: t.clubs || 0,
            countries: t.countries || 0,
            priceMode,
            totalCop: t.totalCop || 0,
            totalUsd: Math.round((t.totalUsd || 0) * 100) / 100,
            totalRefunded: t.totalRefunded || 0,
            totalBudget: t.totalBudget || 0,
            avgBudget: Math.round((t.avgBudget || 0) * 100) / 100,
            minBudget: t.minBudget != null ? Math.round(Number(t.minBudget) * 100) / 100 : null,
            maxBudget: t.maxBudget != null ? Math.round(Number(t.maxBudget) * 100) / 100 : null,
            avgTrm: Math.round((t.avgTrm || 0) * 100) / 100,
            minTrm: t.minTrm != null ? Math.round(Number(t.minTrm) * 100) / 100 : null,
            maxTrm: t.maxTrm != null ? Math.round(Number(t.maxTrm) * 100) / 100 : null,
            ticketAvgCop: Math.round(t.ticketAvgCop || 0),
            ticketAvgUsd: Math.round((t.ticketAvgUsd || 0) * 100) / 100,
            periodStart: t.periodStart || null,
            periodEnd: t.periodEnd || null,
            firstPayment: t.firstPayment || null,
            lastPayment: t.lastPayment || null,
            conversionRate: pct(t.paid, enviadas),
            paymentRate: pct(t.paid, enviadas),
        },
        // v4.1253 — PARTICIPACIÓN vs. RECAUDO. Son dos preguntas y se
        // responden por separado: cuántos clubes quieren estar (aunque no
        // hayan pagado) y cuánto se ha cobrado y queda por cobrar. Lo
        // pendiente se calcula SÓLO sobre obligaciones válidas (postuladas,
        // no retiradas ni rechazadas, sin pagar): un borrador no es deuda.
        participation: {
            clubs: t.clubs || 0,
            // v4.1299 — Inscripciones (clubes inscritos) frente a proyectos.
            registrations: t.registrations || 0,
            activeProjects: t.activeProjects || 0,
            withOneProject: byRegistrationSize.rows.find(r => Number(r.projects) === 1)?.registrations || 0,
            withTwoProjects: byRegistrationSize.rows.filter(r => Number(r.projects) >= 2).reduce((a, r) => a + (r.registrations || 0), 0),
            withTwoProjectsPaid: byRegistrationSize.rows.filter(r => Number(r.projects) >= 2).reduce((a, r) => a + (r.fullyPaid || 0), 0),
            secondProjects: t.secondProjects || 0,
            secondProjectsApplied: t.secondProjectsApplied || 0,
            secondProjectsPaid: t.secondProjectsPaid || 0,
            secondProjectsOwing: t.secondProjectsOwing || 0,
            secondProjectsDraft: t.secondProjectsDraft || 0,
            extensions: t.extensions || 0,
            extensionsDraft: t.extensionsDraft || 0,
            extensionsOwing: t.extensionsOwing || 0,
            extensionsPaid: t.extensionsPaid || 0,
            collectedExtensions: Math.round((t.collectedExtensions || 0) * 100) / 100,
            collectedFirst: Math.round((t.collectedFirst || 0) * 100) / 100,
            collectedSecond: Math.round((t.collectedSecond || 0) * 100) / 100,
            pendingFirst: Math.round((t.pendingFirst || 0) * 100) / 100,
            pendingSecond: Math.round((t.pendingSecond || 0) * 100) / 100,
            receivedTotal: Math.round((t.receivedTotal || 0) * 100) / 100,
            registeredUsers: t.registeredUsers || 0,
            drafts: t.drafts || 0,
            applied: t.applied || 0,
            approved: t.approved || 0,
            paid: t.paid || 0,
            owing: t.owing || 0,
            priceMode,
            collectedAmount: Math.round((t.collectedAmount || 0) * 100) / 100,
            pendingAmount: Math.round((t.pendingAmount || 0) * 100) / 100,
        },
        funnel,
        byPayment: byPayment.rows,
        byWorkflow: byWorkflow.rows,
        byDistrict: byDistrict.rows,
        byFocusArea: byFocus.rows,
        byClub: byClub.rows,
        byCountry: byCountry.rows,
        byDepartment: byDepartment.rows,
        byCity: byCity.rows,
        timeline: timeline.rows,
        topBudget: topBudget.rows,
        activity: activity.rows,
        edition: cfg.edition,
        branding,
        registration: {
            priceMode,
            amountCop: cfg?.registration?.amountCop ?? null,
            amountUsd: cfg?.registration?.amountUsd ?? null,
            // v4.1299 — Las reglas de la segunda postulación, resueltas.
            rules: pricingRulesOf(cfg),
        },
        generatedAt: new Date().toISOString(),
        access,
    });
});

// `/admin/overview` responde lo MISMO: la pantalla es una sola desde v4.689.
// Se conserva la ruta para que un navegador con el panel viejo en caché no se
// quede sin datos.
export const getOverview = getIntelligence;

/**
 * CENTRO DE INTELIGENCIA Y GESTIÓN CONSOLIDADO — XII FERIA DE PROYECTOS (v4.1209.0)
 *
 * Consolida en una sola respuesta atómica y en tiempo real:
 *   · Metadatos y contexto del evento (Sede, Fechas, Estado, Edición)
 *   · KPIs sincronizados de Postulaciones (activas, pagadas, revisión)
 *   · KPIs sincronizados de Evento (inscripciones, confirmadas, acompañantes, personas)
 *   · Recaudación desglosada por moneda (COP y USD)
 *   · Participación institucional (clubes, distritos, países)
 *   · Gráfica de evolución temporal (diaria y acumulada para inscripciones, postulaciones y pagos)
 *   · Embudo de conversión de postulaciones
 *   · Distribución por países, distritos y clubes
 *   · Categorías de inscripción
 *   · Alertas operativas y actividad reciente cronológica
 *
 * Admite filtro de períodos: ?period=7d|15d|30d|90d|custom|all&from=...&to=...&evento=...
 */
export const getDashboardIntelligence = withAccess(async (req, res, { cfg, access }) => {
    try {
        let eventId = clean(req.query.evento, 60);
        if (!eventId) {
            try {
                const open = await db.query(`
                    SELECT c."eventId" FROM "ProjectFairConfig" c
                    WHERE c.key LIKE 'edition:%' AND (c.config->>'enabled')::boolean = true
                    ORDER BY c."updatedAt" DESC LIMIT 1
                `);
                eventId = open.rows[0]?.eventId || null;
            } catch { /* ... */ }
        }
        if (!eventId) eventId = '205348ec-83fd-475d-931c-9cdc3fdf8f62';

        const now = new Date();
        const periodKey = clean(req.query.period, 20) || 'all';
        let fromDate = null;
        let toDate = null;
        let prevFromDate = null;
        let prevToDate = null;
        let periodLabel = 'Histórico completo';

        if (periodKey === '7d') {
            periodLabel = 'Últimos 7 días';
            toDate = new Date(now);
            fromDate = new Date(now.getTime() - 7 * 86400000);
            prevToDate = new Date(fromDate);
            prevFromDate = new Date(fromDate.getTime() - 7 * 86400000);
        } else if (periodKey === '15d') {
            periodLabel = 'Últimos 15 días';
            toDate = new Date(now);
            fromDate = new Date(now.getTime() - 15 * 86400000);
            prevToDate = new Date(fromDate);
            prevFromDate = new Date(fromDate.getTime() - 15 * 86400000);
        } else if (periodKey === '30d') {
            periodLabel = 'Últimos 30 días';
            toDate = new Date(now);
            fromDate = new Date(now.getTime() - 30 * 86400000);
            prevToDate = new Date(fromDate);
            prevFromDate = new Date(fromDate.getTime() - 30 * 86400000);
        } else if (periodKey === '90d') {
            periodLabel = 'Últimos 3 meses';
            toDate = new Date(now);
            fromDate = new Date(now.getTime() - 90 * 86400000);
            prevToDate = new Date(fromDate);
            prevFromDate = new Date(fromDate.getTime() - 90 * 86400000);
        } else if (periodKey === 'custom' && req.query.from && req.query.to) {
            periodLabel = `Del ${req.query.from} al ${req.query.to}`;
            fromDate = new Date(req.query.from);
            toDate = new Date(`${clean(req.query.to, 30)}T23:59:59.999Z`);
            const diffMs = toDate.getTime() - fromDate.getTime();
            prevToDate = new Date(fromDate.getTime() - 1);
            prevFromDate = new Date(prevToDate.getTime() - Math.max(86400000, diffMs));
        }

        const dateSubFilter = fromDate && toDate ? `AND "createdAt" >= '${fromDate.toISOString()}' AND "createdAt" <= '${toDate.toISOString()}'` : '';
        const prevDateSubFilter = prevFromDate && prevToDate ? `AND "createdAt" >= '${prevFromDate.toISOString()}' AND "createdAt" <= '${prevToDate.toISOString()}'` : '';
        const dateRegFilter = fromDate && toDate ? `AND "createdAt" >= '${fromDate.toISOString()}' AND "createdAt" <= '${toDate.toISOString()}'` : '';
        const prevDateRegFilter = prevFromDate && prevToDate ? `AND "createdAt" >= '${prevFromDate.toISOString()}' AND "createdAt" <= '${prevToDate.toISOString()}'` : '';

        const [
            evtRes, cfgRes, subAllRes, subPeriodRes, subPrevRes,
            regAllRes, regPeriodRes, regPrevRes,
            catRes, countryRes, districtRes, clubRes,
            subTimeRes, regTimeRes, subActRes, regActRes,
            publishedProjectsRes
        ] = await Promise.all([
            db.query('SELECT id, title, "startDate", "endDate", location FROM "CalendarEvent" WHERE id = $1 LIMIT 1', [eventId]),
            db.query('SELECT config FROM "ProjectFairConfig" WHERE "eventId" = $1 OR key = \'active\' ORDER BY "updatedAt" DESC LIMIT 1', [eventId]),
            // Submissions All (Lifetime)
            db.query(`
                SELECT COUNT(*)::int as total,
                       COUNT(*) FILTER (WHERE status = 'paid')::int as paid,
                       COUNT(*) FILTER (WHERE status = 'pending_payment')::int as pending,
                       COUNT(*) FILTER (WHERE "workflowStatus" = 'in_review')::int as "inReview",
                       COUNT(*) FILTER (WHERE "workflowStatus" = 'approved')::int as approved,
                       COUNT(*) FILTER (WHERE "workflowStatus" = 'sent_to_grants')::int as "sentToGrants",
                       COUNT(*) FILTER (WHERE "workflowStatus" IN ('received','pending_payment','payment_confirmed'))::int as "pendingReview",
                       COUNT(DISTINCT district) FILTER (WHERE district IS NOT NULL AND district <> '')::int as districts,
                       COUNT(DISTINCT lower("clubName")) FILTER (WHERE "clubName" IS NOT NULL AND "clubName" <> '')::int as clubs,
                       COUNT(DISTINCT lower(country)) FILTER (WHERE country IS NOT NULL AND country <> '')::int as countries,
                       COALESCE(SUM("amountCop") FILTER (WHERE status = 'paid'), 0)::float as "totalCop",
                       COALESCE(SUM("amountUsd") FILTER (WHERE status = 'paid'), 0)::float as "totalUsd",
                       COALESCE(SUM("budgetUsd"), 0)::float as "totalBudget",
                       COALESCE(AVG("budgetUsd"), 0)::float as "avgBudget",
                       COALESCE(AVG("trmRate") FILTER (WHERE status = 'paid'), 0)::float as "avgTrm"
                FROM "ProjectFairSubmission"
                WHERE "eventId" = $1 AND "archivedAt" IS NULL
            `, [eventId]),
            // Submissions Period
            db.query(`
                SELECT COUNT(*)::int as total,
                       COUNT(*) FILTER (WHERE status = 'paid')::int as paid,
                       COALESCE(SUM("amountCop") FILTER (WHERE status = 'paid'), 0)::float as "totalCop",
                       COALESCE(SUM("amountUsd") FILTER (WHERE status = 'paid'), 0)::float as "totalUsd"
                FROM "ProjectFairSubmission"
                WHERE "eventId" = $1 AND "archivedAt" IS NULL ${dateSubFilter}
            `, [eventId]),
            // Submissions Prev Period
            db.query(`
                SELECT COUNT(*)::int as total,
                       COUNT(*) FILTER (WHERE status = 'paid')::int as paid
                FROM "ProjectFairSubmission"
                WHERE "eventId" = $1 AND "archivedAt" IS NULL ${prevDateSubFilter}
            `, [eventId]),
            // Registrations All (Lifetime)
            db.query(`
                SELECT COUNT(*)::int as registrations,
                       COUNT(*) FILTER (WHERE status = 'paid' OR status = 'settled' OR status = 'confirmed')::int as settled,
                       COUNT(*) FILTER (WHERE status = 'pending_payment' OR status = 'pending')::int as pending,
                       COUNT(*) FILTER (WHERE status = 'failed' OR status = 'expired')::int as failed,
                       COUNT(*) FILTER (WHERE status = 'refunded')::int as refunded,
                       COALESCE(SUM("companionsCount"), 0)::int as companions,
                       COALESCE(SUM(1 + GREATEST("companionsCount", 0)), 0)::int as people,
                       COUNT(DISTINCT country) FILTER (WHERE country <> '')::int as countries,
                       COUNT(DISTINCT district) FILTER (WHERE district <> '')::int as districts,
                       COUNT(DISTINCT lower("clubName")) FILTER (WHERE "clubName" <> '')::int as clubs,
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'COP'), 0)::float as "revenueCop",
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'USD'), 0)::float as "revenueUsd"
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft'
            `, [eventId]),
            // Registrations Period
            db.query(`
                SELECT COUNT(*)::int as registrations,
                       COUNT(*) FILTER (WHERE status = 'paid' OR status = 'settled' OR status = 'confirmed')::int as settled,
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'COP'), 0)::float as "revenueCop",
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'USD'), 0)::float as "revenueUsd"
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft' ${dateRegFilter}
            `, [eventId]),
            // Registrations Prev Period
            db.query(`
                SELECT COUNT(*)::int as registrations,
                       COUNT(*) FILTER (WHERE status = 'paid' OR status = 'settled' OR status = 'confirmed')::int as settled
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft' ${prevDateRegFilter}
            `, [eventId]),
            // Categories
            db.query(`
                SELECT "categoryKey", "categoryLabel", COUNT(*)::int as count,
                       COUNT(*) FILTER (WHERE status = 'paid' OR status = 'settled' OR status = 'confirmed')::int as settled,
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'COP'), 0)::float as "amountCop",
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'USD'), 0)::float as "amountUsd"
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft'
                GROUP BY "categoryKey", "categoryLabel"
                ORDER BY count DESC
            `, [eventId]),
            // Countries from Event Registration
            db.query(`
                SELECT country, COUNT(*)::int as total
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft' AND country <> ''
                GROUP BY country ORDER BY total DESC LIMIT 10
            `, [eventId]),
            // Districts from Event Registration
            db.query(`
                SELECT district, COUNT(*)::int as total
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft' AND district <> ''
                GROUP BY district ORDER BY total DESC LIMIT 10
            `, [eventId]),
            // Clubs from Event Registration
            db.query(`
                SELECT "clubName", COUNT(*)::int as total
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft' AND "clubName" <> ''
                GROUP BY "clubName" ORDER BY total DESC LIMIT 10
            `, [eventId]),
            // Submissions Timeline
            db.query(`
                SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                       COUNT(*)::int as total,
                       COUNT(*) FILTER (WHERE status = 'paid')::int as paid,
                       COALESCE(SUM("amountCop") FILTER (WHERE status = 'paid'), 0)::float as "amountCop",
                       COALESCE(SUM("amountUsd") FILTER (WHERE status = 'paid'), 0)::float as "amountUsd"
                FROM "ProjectFairSubmission"
                WHERE "eventId" = $1 AND "archivedAt" IS NULL
                GROUP BY 1 ORDER BY 1 ASC
            `, [eventId]),
            // Registrations Timeline
            db.query(`
                SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                       COUNT(*)::int as total,
                       COUNT(*) FILTER (WHERE status = 'paid' OR status = 'settled' OR status = 'confirmed')::int as settled,
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'COP'), 0)::float as "amountCop",
                       COALESCE(SUM("chargeAmount") FILTER (WHERE (status = 'paid' OR status = 'settled' OR status = 'confirmed') AND "chargeCurrency" = 'USD'), 0)::float as "amountUsd"
                FROM "EventRegistration"
                WHERE "eventId" = $1 AND status <> 'draft'
                GROUP BY 1 ORDER BY 1 ASC
            `, [eventId]),
            // Recent Submissions Activity
            db.query(`
                SELECT id, 'submission' as type, "projectName" as title, "clubName" as subtitle, status, "workflowStatus", "createdAt"
                FROM "ProjectFairSubmission" WHERE "eventId" = $1 AND "archivedAt" IS NULL
                ORDER BY "createdAt" DESC LIMIT 6
            `, [eventId]),
            // Recent Registrations Activity
            db.query(`
                SELECT id, 'registration' as type, ("firstName" || ' ' || COALESCE("lastName", '')) as title, "clubName" as subtitle, status, "categoryLabel" as category, "createdAt"
                FROM "EventRegistration" WHERE "eventId" = $1 AND status <> 'draft'
                ORDER BY "createdAt" DESC LIMIT 6
            `, [eventId]),
            // Published projects in club general bank
            db.query('SELECT count(*)::int as total FROM "Project" WHERE "clubId" = $1', [req.user?.clubId || '322c2f88-ad33-484d-bb54-272de9262d72'])
        ]);

        const evt = evtRes.rows[0] || {};
        const editionCfg = cfgRes.rows[0]?.config || {};
        const subAll = subAllRes.rows[0] || {};
        const subPeriod = subPeriodRes.rows[0] || {};
        const subPrev = subPrevRes.rows[0] || {};
        const regAll = regAllRes.rows[0] || {};
        const regPeriod = regPeriodRes.rows[0] || {};
        const regPrev = regPrevRes.rows[0] || {};
        const publishedProjectsCount = publishedProjectsRes.rows[0]?.total || 0;

        // Deltas calculation
        const calcDelta = (curr, prev) => {
            if (!prev || prev <= 0) return curr > 0 ? 100 : 0;
            return Math.round(((curr - prev) / prev) * 100);
        };

        const regDelta = calcDelta(regPeriod.registrations, regPrev.registrations);
        const subDelta = calcDelta(subPeriod.total, subPrev.total);

        // Timeline consolidation
        const dayMap = new Map();
        for (const r of subTimeRes.rows) {
            dayMap.set(r.day, {
                day: r.day,
                submissions: r.total || 0,
                paidSubmissions: r.paid || 0,
                registrations: 0,
                settledRegistrations: 0,
                confirmedPayments: r.paid || 0,
                amountCop: r.amountCop || 0,
                amountUsd: r.amountUsd || 0,
            });
        }
        for (const r of regTimeRes.rows) {
            const entry = dayMap.get(r.day) || {
                day: r.day,
                submissions: 0,
                paidSubmissions: 0,
                registrations: 0,
                settledRegistrations: 0,
                confirmedPayments: 0,
                amountCop: 0,
                amountUsd: 0,
            };
            entry.registrations = r.total || 0;
            entry.settledRegistrations = r.settled || 0;
            entry.confirmedPayments += (r.settled || 0);
            entry.amountCop += (r.amountCop || 0);
            entry.amountUsd += (r.amountUsd || 0);
            dayMap.set(r.day, entry);
        }

        const sortedTimeline = Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
        let cumReg = 0;
        let cumSub = 0;
        let cumPay = 0;
        let cumCop = 0;
        let cumUsd = 0;
        const timeline = sortedTimeline.map(pt => {
            cumReg += pt.registrations;
            cumSub += pt.submissions;
            cumPay += pt.confirmedPayments;
            cumCop += pt.amountCop;
            cumUsd += pt.amountUsd;
            return {
                ...pt,
                cumRegistrations: cumReg,
                cumSubmissions: cumSub,
                cumConfirmedPayments: cumPay,
                cumAmountCop: cumCop,
                cumAmountUsd: Math.round(cumUsd * 100) / 100,
            };
        });

        // Conversion Funnel
        const enviadas = subAll.total || 0;
        const funnel = [
            { key: 'submitted', label: 'Formulario enviado', count: enviadas, rate: enviadas ? 100 : 0 },
            { key: 'paid', label: 'Pago confirmado', count: subAll.paid || 0, rate: enviadas ? Math.round((subAll.paid / enviadas) * 1000) / 10 : 0 },
            { key: 'in_review', label: 'En revisión técnica', count: (subAll.inReview || 0) + (subAll.approved || 0) + (subAll.sentToGrants || 0), rate: enviadas ? Math.round((((subAll.inReview || 0) + (subAll.approved || 0) + (subAll.sentToGrants || 0)) / enviadas) * 1000) / 10 : 0 },
            { key: 'approved', label: 'Aprobada por comité', count: (subAll.approved || 0) + (subAll.sentToGrants || 0), rate: enviadas ? Math.round((((subAll.approved || 0) + (subAll.sentToGrants || 0)) / enviadas) * 1000) / 10 : 0 },
            { key: 'sent_to_grants', label: 'Enviada a Rotary Grants', count: subAll.sentToGrants || 0, rate: enviadas ? Math.round(((subAll.sentToGrants || 0) / enviadas) * 1000) / 10 : 0 },
        ];

        // Format recent activities
        const allActivities = [
            ...subActRes.rows.map(r => ({
                id: `sub-${r.id}`,
                type: 'submission',
                title: r.title,
                subtitle: `Club ${r.subtitle || 'Sin club'}`,
                // v4.1253 — Lo que se pinta es el PAGO (de `status`), no un
                // estado del proyecto que lo imitaba.
                status: r.status === 'paid' ? 'Pago confirmado' : projectStateOf(r) === 'in_review' ? 'En revisión' : 'Pendiente de pago',
                statusType: r.status === 'paid' ? 'success' : 'warning',
                createdAt: r.createdAt,
                link: `/admin/postulaciones-pagos?search=${encodeURIComponent(r.title || '')}`,
            })),
            ...regActRes.rows.map(r => ({
                id: `reg-${r.id}`,
                type: 'registration',
                title: r.title,
                subtitle: r.category ? `${r.category} · Club ${r.subtitle || 'Sin club'}` : `Club ${r.subtitle || 'Sin club'}`,
                status: r.status === 'paid' ? 'Pago confirmado' : 'Pendiente de pago',
                statusType: r.status === 'paid' ? 'success' : 'warning',
                createdAt: r.createdAt,
                link: `/admin/eventos`,
            })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);

        // Operational Alerts
        const alerts = [];
        if (subAll.pendingReview > 0) {
            alerts.push({
                id: 'alt-review',
                severity: 'warning',
                title: `${subAll.pendingReview} postulaciones pendientes de revisión`,
                description: 'Propuestas con pago registrado que requieren calificación y observaciones técnicas.',
                link: '/admin/postulaciones-pagos?workflowStatus=in_review',
            });
        }
        if (regAll.pending > 0) {
            alerts.push({
                id: 'alt-reg-pending',
                severity: 'info',
                title: `${regAll.pending} inscripciones al evento con pago pendiente`,
                description: 'Asistentes que iniciaron formulario pero no han completado la confirmación del pago.',
                link: '/admin/eventos',
            });
        }
        if (subAll.pending > 0) {
            alerts.push({
                id: 'alt-sub-pending',
                severity: 'info',
                title: `${subAll.pending} postulaciones de proyectos pendientes de pago`,
                description: 'Clubes que registraron su proyecto y tienen pendiente abonar el derecho de postulación.',
                link: '/admin/postulaciones-pagos?paymentStatus=pending_payment',
            });
        }
        if ((regAll.failed || 0) === 0 && (subAll.failed || 0) === 0) {
            alerts.push({
                id: 'alt-clean',
                severity: 'success',
                title: 'Recaudación limpia sin pagos fallidos',
                description: 'El 100% de las transacciones procesadas se han asentado con éxito sin contracargos.',
                link: '/admin/postulaciones-pagos',
            });
        }

        // Countries percentage
        const totalRegCountries = countryRes.rows.reduce((acc, r) => acc + (r.total || 0), 0) || 1;
        const byCountry = countryRes.rows.map(r => ({
            country: r.country,
            count: r.total,
            percentage: Math.round((r.total / totalRegCountries) * 1000) / 10,
        }));

        res.json({
            event: {
                id: eventId,
                title: evt.title || 'XII Rotary Project Fair Colombia 2027',
                editionName: editionCfg?.edition?.name || 'XII Feria de Proyectos Rotary Colombia - Valledupar 2027',
                city: editionCfg?.edition?.city || 'Valledupar',
                country: editionCfg?.edition?.country || 'Colombia',
                venue: evt.location || 'Sonesta Hotel Valledupar, Valledupar, Cesar, Colombia',
                startDate: evt.startDate || '2027-01-28T12:00:00.000Z',
                endDate: evt.endDate || '2027-01-30T14:30:00.000Z',
                dateRangeLabel: '28 al 31 de enero de 2027',
                status: 'active',
                statusLabel: 'Convocatoria e Inscripciones Abiertas',
            },
            period: {
                key: periodKey,
                label: periodLabel,
                from: fromDate ? fromDate.toISOString().slice(0, 10) : null,
                to: toDate ? toDate.toISOString().slice(0, 10) : null,
            },
            kpis: {
                registrations: {
                    total: regAll.registrations || 0,
                    settled: regAll.settled || 0,
                    pending: regAll.pending || 0,
                    failed: regAll.failed || 0,
                    confirmationRate: regAll.registrations ? Math.round((regAll.settled / regAll.registrations) * 1000) / 10 : 0,
                    periodRegistrations: regPeriod.registrations || 0,
                    periodSettled: regPeriod.settled || 0,
                    delta: regDelta,
                },
                participants: {
                    totalExpected: regAll.people || 0,
                    confirmedExpected: (regAll.settled || 0) + (regAll.companions || 0),
                    companions: regAll.companions || 0,
                    accredited: 0,
                },
                submissions: {
                    total: subAll.total || 0,
                    paid: subAll.paid || 0,
                    pending: subAll.pending || 0,
                    pendingReview: subAll.pendingReview || 0,
                    inReview: subAll.inReview || 0,
                    approved: subAll.approved || 0,
                    sentToGrants: subAll.sentToGrants || 0,
                    conversionRate: subAll.total ? Math.round((subAll.paid / subAll.total) * 1000) / 10 : 0,
                    periodTotal: subPeriod.total || 0,
                    periodPaid: subPeriod.paid || 0,
                    delta: subDelta,
                },
                revenue: {
                    copConfirmed: (subAll.totalCop || 0) + (regAll.revenueCop || 0),
                    copSubmissions: subAll.totalCop || 0,
                    copEvents: regAll.revenueCop || 0,
                    usdConfirmed: regAll.revenueUsd || 0,
                    usdEquivalentSubmissions: subAll.totalUsd || 0,
                    avgTrm: Math.round((subAll.avgTrm || 0) * 100) / 100,
                    refunded: 0,
                    pendingCopEstimate: (subAll.pending || 0) * 250000,
                },
                institutional: {
                    clubsEvents: regAll.clubs || 0,
                    clubsSubmissions: subAll.clubs || 0,
                    districtsEvents: regAll.districts || 0,
                    districtsSubmissions: subAll.districts || 0,
                    countriesEvents: regAll.countries || 0,
                    countriesSubmissions: subAll.countries || 0,
                },
                projects: {
                    submissionsTotal: subAll.total || 0,
                    submissionsInReview: subAll.inReview || 0,
                    submissionsApproved: subAll.approved || 0,
                    publishedInBank: publishedProjectsCount,
                },
            },
            funnel,
            timeline,
            participation: {
                byCountry,
                byDistrict: districtRes.rows.map(r => ({ district: r.district, count: r.total })),
                byClub: clubRes.rows.map(r => ({ club: r.clubName, count: r.total })),
                byCategory: catRes.rows.map(r => ({
                    key: r.categoryKey,
                    label: r.categoryLabel,
                    count: r.count,
                    settled: r.settled,
                    amountCop: r.amountCop,
                    amountUsd: r.amountUsd,
                })),
            },
            alerts,
            recentActivity: allActivities,
            lastUpdated: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[projectFairAdminController] getDashboardIntelligence error:', err);
        res.status(500).json({ error: 'Error al generar la inteligencia del panel', detail: err.message });
    }
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

    // v4.1304 — `SQL_FDD_COLUMNS` agrega el FDD y el FAP de CADA proyecto.
    // El desempate por `id` deja estable la paginación cuando muchos valores
    // coinciden (o faltan).
    const rowsRes = await db.query(
        `SELECT *, ${SQL_FDD_COLUMNS} FROM "ProjectFairSubmission" ${clause}
         ORDER BY ${sortBy} ${sortDir} NULLS LAST, id ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize]
    );

    const tagsBySubmission = await loadTagsFor(rowsRes.rows.map(r => r.id));
    const sizes = await registrationSizesFor(rowsRes.rows);
    res.json({
        submissions: rowsRes.rows.map(r => mapRow({ ...r, tags: tagsBySubmission[r.id] || [], registrationProjects: sizes[r.registrationId] ?? 1 }, access)),
        pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 },
        access,
    });
});

/**
 * v4.1299 — Cuántos proyectos ACTIVOS tiene la inscripción de cada fila de la
 * página, en una sola consulta. Lo que el listado necesita para rotular
 * «Proyecto 2 de 2». Nunca lanza: sin el dato la fila se pinta igual.
 */
const registrationSizesFor = async (rows) => {
    const ids = [...new Set(rows.map(r => r.registrationId).filter(Boolean))];
    if (!ids.length) return {};
    try {
        const { rows: counts } = await db.query(
            `SELECT "registrationId", COUNT(*)::int AS n FROM "ProjectFairSubmission"
             WHERE "registrationId" = ANY($1::text[]) AND ${SQL_ACTIVE_PROJECT}
             GROUP BY 1`, [ids]);
        return Object.fromEntries(counts.map(c => [c.registrationId, c.n]));
    } catch {
        return {};
    }
};

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

    // v4.1299 — Los demás proyectos de la misma inscripción, para la ficha.
    let siblings = [];
    if (row.registrationId) {
        const sib = await db.query(
            'SELECT id, "publicRef", "projectName", "projectIndex", status, "workflowStatus", "archivedAt", "amountCop", "amountUsd", metadata FROM "ProjectFairSubmission" WHERE "registrationId" = $1 AND id <> $2 ORDER BY "projectIndex" ASC',
            [row.registrationId, row.id]).catch(() => ({ rows: [] }));
        siblings = sib.rows.map(r => ({
            id: r.id, publicRef: r.publicRef, projectName: r.projectName, projectIndex: projectIndexOf(r),
            projectIndexLabel: projectIndexLabel(projectIndexOf(r)), paymentStatus: r.status,
            workflowStatus: projectStateOf(r), projectStateLabel: projectStateMeta(projectStateOf(r)).label,
            archived: !!r.archivedAt, withdrawnByClub: !!r.metadata?.withdrawnByClub,
            amountCop: num(r.amountCop), amountUsd: num(r.amountUsd),
        }));
    }
    const sizes = await registrationSizesFor([row]);
    // v4.1301 — La INSCRIPCIÓN resumida para la ficha: modalidad, origen del
    // segundo proyecto, pagos (original y complementario), total y saldo.
    let registrationSummary = null;
    try {
        const todas = row.registrationId
            ? (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE "registrationId" = $1 ORDER BY "projectIndex" ASC', [row.registrationId])).rows
            : [row];
        const cfg = await readConfigForAdmin(clean(req.query?.evento, 60) || null);
        const breakdown = registrationBreakdown(todas, pricingRulesOf(cfg));
        const segundo = todas.find(r => projectIndexOf(r) >= 2 && !r.archivedAt && projectStateOf(r) !== 'withdrawn') || null;
        const payments = todas
            .filter(r => String(r.status) === 'paid' && !r.metadata?.payment?.coveredBy)
            .map(r => ({
                anchorId: r.id, publicRef: r.publicRef, projectIndex: projectIndexOf(r), paidAt: r.paidAt || null,
                amountReceived: num(r.amountReceived), currency: r.chargeCurrency || null,
                origin: r.paymentConfirmationOrigin || 'stripe',
                kind: projectIndexOf(r) >= 2 && !(Array.isArray(r.metadata?.payment?.coveredProjects) && r.metadata.payment.coveredProjects.length > 1) ? 'complementary' : 'original',
                covers: Array.isArray(r.metadata?.payment?.coveredProjects) && r.metadata.payment.coveredProjects.length
                    ? r.metadata.payment.coveredProjects.map(p => p.publicRef || p.id) : [r.publicRef],
                ...(access.viewPayments ? { paymentIntentId: r.stripePaymentIntentId || null, receiptUrl: r.receiptUrl || null } : {}),
            }));
        registrationSummary = {
            id: row.registrationId || null,
            modality: breakdown.modality,
            count: breakdown.count,
            origin: segundo ? (segundo.metadata?.addedVia === 'portal_extension' ? 'extension' : 'initial_double') : 'single',
            originLabel: segundo ? (segundo.metadata?.addedVia === 'portal_extension' ? 'Ampliación posterior desde «Mi proyecto»' : 'Inscripción inicial de dos proyectos') : 'Un proyecto',
            secondProjectCreatedAt: segundo?.createdAt || null,
            currency: breakdown.currency,
            lines: breakdown.lines,
            total: breakdown.total,
            paidTotal: breakdown.paidTotal,
            pendingTotal: breakdown.pendingTotal,
            payments,
        };
    } catch (err) {
        console.warn('[project-fair-admin] No pude resumir la inscripción:', err?.message);
    }
    res.json({
        submission: mapRow({ ...row, tags: tags[row.id] || [], registrationProjects: sizes[row.registrationId] ?? 1 }, access),
        siblings,
        registrationSummary,
        // v4.1313 — Las tarifas de la convocatoria, para «Editar valor».
        pricing: await (async () => {
            try {
                const rules = pricingRulesOf(await readConfigForAdmin(clean(req.query?.evento, 60) || null));
                return { currency: rules.mode, first: rules.first, second: rules.second, tariff: lineAmountFor(rules, projectIndexOf(row)) };
            } catch { return null; }
        })(),
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

// ── v4.1313 — Editar el valor de la inscripción de UN proyecto ─────────
// POST /admin/postulaciones/:id/amount  { amount | clear: true, reason }
//
// El comité cambia el valor de la línea de un proyecto (250.000 → 100.000, o
// cualquier otro). El criterio es PURO (`amountOverridePlan`); acá sólo se
// escribe. Lo que cambia:
//   · La LÍNEA de la fila (`amountCop`/`amountUsd`): lo que muestra la columna
//     «Valor» y lo que suman los indicadores de recaudo y de saldo.
//   · `metadata.amountOverride`: la marca que `lineAmountOfRow` lee para que
//     el cobro al club, el desglose del perfil y la confirmación manual usen
//     ese valor y no la tarifa de su posición.
// Lo que NO cambia: lo recibido por la pasarela (`amountReceived`), el estado
// del pago, Stripe ni la Bóveda. Ajustar un proyecto pagado no cobra ni
// reembolsa nada; queda en el historial con el motivo.
export const updateProjectAmount = withAccess(async (req, res, { cfg, access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const current = rows[0];
    if (!current) return res.status(404).json({ error: 'Postulación no encontrada' });

    const body = req.body || {};
    const rules = pricingRulesOf(cfg);
    const plan = amountOverridePlan(current, {
        amount: body.amount,
        clear: body.clear === true,
        reason: clean(body.reason, 1000),
    }, rules);
    if (!plan.ok) return res.status(plan.status).json({ error: plan.error });

    const actor = actorFrom(req, access);
    const rate = Number(current.trmRate) || 0;
    const lineCop = plan.currency === 'USD' ? null : plan.amount;
    const lineUsd = plan.currency === 'USD'
        ? plan.amount
        : (rate > 0 ? Math.round((plan.amount / rate) * 100) / 100 : null);
    const override = plan.keepsOverride
        ? {
            amountOverride: {
                amount: plan.amount, currency: plan.currency, tariff: plan.tariff, previous: plan.previous,
                reason: plan.reason, by: actor.name, byId: actor.id, at: new Date().toISOString(),
            },
        }
        : {};

    // ⚠️ UPDATE CONDICIONAL sobre el estado del pago que se leyó: si entre la
    // lectura y la escritura el pago se confirmó o se reembolsó, no se pisa.
    const { rows: updated } = await db.query(`
        UPDATE "ProjectFairSubmission"
        SET "amountCop" = $1,
            "amountUsd" = $2,
            metadata = (COALESCE(metadata, '{}'::jsonb) - 'amountOverride') || $3::jsonb,
            "updatedAt" = NOW()
        WHERE id = $4 AND status IS NOT DISTINCT FROM $5
        RETURNING *
    `, [lineCop, lineUsd, JSON.stringify(override), current.id, current.status]);
    if (!updated.length) {
        return res.status(409).json({ error: 'El pago de este proyecto cambió mientras editabas. Recarga la ficha e inténtalo de nuevo.' });
    }

    // Un cobro abierto se calculó con el valor anterior: se expira para que el
    // club no pague lo que ya no vale. El próximo intento abre otro con el
    // valor nuevo (`reusableCheckout` compara el importe). Es limpieza: si
    // Stripe no responde, el intento siguiente igual lo detecta y lo reemplaza.
    let closedCheckout = false;
    if (!plan.paid) {
        const sessions = [...new Set([current.stripeSessionId, current.metadata?.pendingOrder?.sessionId].filter(Boolean))];
        for (const sid of sessions) {
            try {
                const st = getStripe();
                const sess = await st.checkout.sessions.retrieve(sid);
                if (sess?.status === 'open') { await st.checkout.sessions.expire(sid); closedCheckout = true; }
            } catch { /* ya vencida, cobrada o Stripe sin configurar */ }
        }
    }

    const fmt = (n) => (plan.currency === 'USD'
        ? `US$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`);
    await logEvent(current.id, {
        type: 'amount_changed',
        title: plan.keepsOverride
            ? `Valor de la inscripción: ${fmt(plan.previous)} → ${fmt(plan.amount)}`
            : `Valor de la inscripción restablecido a la tarifa: ${fmt(plan.amount)}`,
        detail: plan.reason,
        actor,
        metadata: {
            before: { amountCop: num(current.amountCop), amountUsd: num(current.amountUsd), override: current.metadata?.amountOverride || null },
            after: { amountCop: lineCop, amountUsd: lineUsd, override: override.amountOverride || null },
            tariff: plan.tariff, currency: plan.currency, paymentStatus: current.status, closedCheckout,
        },
    });

    const tags = await loadTagsFor([current.id]);
    res.json({
        submission: mapRow({ ...updated[0], tags: tags[current.id] || [] }, access),
        plan: { amount: plan.amount, previous: plan.previous, tariff: plan.tariff, currency: plan.currency, paid: plan.paid, override: plan.keepsOverride },
        closedCheckout,
    });
}, 'managePayments');

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
export const listTags = withAccess(async (req, res) => {
    // Las etiquetas pertenecen a su edición: la XIII no ve ni pisa las de la XII.
    const eventId = clean(req.query?.evento, 60) || null;
    const { rows } = await db.query(`
        SELECT t.*, COUNT(st."submissionId")::int AS usage
        FROM "ProjectFairTag" t
        LEFT JOIN "ProjectFairSubmissionTag" st ON st."tagId" = t.id
        ${eventId ? 'WHERE t."eventId" = $1' : ''}
        GROUP BY t.id ORDER BY t."isSystem" DESC, t.label ASC
    `, eventId ? [eventId] : []);
    res.json(rows);
});

export const createTag = withAccess(async (req, res) => {
    const label = clean(req.body?.label, 120);
    const color = clean(req.body?.color, 20) || 'slate';
    if (!label) return res.status(400).json({ error: 'La etiqueta necesita un nombre.' });
    const eventId = clean(req.query?.evento, 60) || null;
    const { rows } = await db.query(
        `INSERT INTO "ProjectFairTag" (label, color, "eventId") VALUES ($1, $2, $3)
         ON CONFLICT (lower(label)) DO UPDATE SET color = EXCLUDED.color RETURNING *`,
        [label, color, eventId]
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
    // v4.1311 — Un proyecto respaldado por el pago de OTRA fila no tiene cobro
    // propio que sincronizar. Sin esto, la búsqueda por correo volvería a
    // pegarle la referencia de un pago anterior (p. ej. el de prueba que una
    // sustitución dejó a un lado) y la Bóveda vería dos filas con un cobro.
    if (submission.metadata?.payment?.coveredBy) {
        const ref = submission.metadata.payment.coveredByRef || submission.metadata.payment.coveredBy;
        return res.status(409).json({ error: `Este proyecto está respaldado por el pago registrado en ${ref}. Sincroniza esa ficha.` });
    }

    let rawRef = clean(req.body?.reference || req.body?.sessionId || req.body?.paymentIntentId, 200);
    let sessionId = submission.stripeSessionId;
    let paymentIntentId = submission.stripePaymentIntentId;

    if (rawRef) {
        if (rawRef.startsWith('cs_')) sessionId = rawRef;
        else if (rawRef.startsWith('pi_')) paymentIntentId = rawRef;
        else if (rawRef.startsWith('ch_')) {
            const stripe = getStripe();
            try {
                const ch = await stripe.charges.retrieve(rawRef);
                if (ch.payment_intent) {
                    paymentIntentId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent.id;
                }
            } catch (err) {}
        }
    }

    const stripe = getStripe();

    // Si aún no tenemos sessionId ni paymentIntentId, intentar búsqueda inteligente en Stripe por correo o metadata
    if (!sessionId && !paymentIntentId) {
        try {
            if (submission.email) {
                const charges = await stripe.charges.list({ limit: 50 });
                const matchedCharge = charges.data?.find(c =>
                    c.billing_details?.email?.toLowerCase() === submission.email.toLowerCase() ||
                    c.receipt_email?.toLowerCase() === submission.email.toLowerCase() ||
                    c.metadata?.submissionId === submission.id ||
                    c.metadata?.publicRef === submission.publicRef
                );
                if (matchedCharge) {
                    if (matchedCharge.payment_intent) {
                        paymentIntentId = typeof matchedCharge.payment_intent === 'string'
                            ? matchedCharge.payment_intent
                            : matchedCharge.payment_intent.id;
                    }
                }
            }
        } catch (e) {
            console.warn('[project-fair-admin] syncStripe search charges error:', e?.message);
        }
    }

    if (!sessionId && !paymentIntentId) {
        return res.status(400).json({
            error: `Esta postulación todavía no tiene una sesión de pago registrada en Stripe.`,
            detail: `No se localizó una transacción automática en Stripe asociada a ${submission.email}. Si el pago fue realizado con otro correo, con tarjeta en otra sesión o por transferencia, puedes indicar el ID de la transacción o utilizar «Confirmar pago manualmente».`,
            canManualConfirm: true,
        });
    }

    try {
        let session = null;
        if (sessionId) {
            session = await stripe.checkout.sessions.retrieve(sessionId);
            if (!paymentIntentId && session.payment_intent) {
                paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
            }
        }

        const mod = await import('./projectFairController.js');

        if (session?.payment_status === 'paid') {
            session.metadata = { ...(session.metadata || {}), submissionId: submission.id };
            await mod.confirmPaidSession(session);
        }

        let pi = null;
        if (paymentIntentId) {
            pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
            if (pi?.status === 'succeeded' && submission.status !== 'paid') {
                await mod.handlePaymentIntentSucceeded(pi);
            }
        }

        const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;

        await db.query(`
            UPDATE "ProjectFairSubmission"
            SET "stripeSessionId" = COALESCE($1, "stripeSessionId"),
                "stripePaymentIntentId" = COALESCE($2, "stripePaymentIntentId"),
                "stripeChargeId" = COALESCE($3, "stripeChargeId"),
                "receiptUrl" = COALESCE($4, "receiptUrl"),
                "paymentMethod" = COALESCE($5, "paymentMethod"),
                "refundedAmount" = CASE WHEN $6 > 0 THEN $6 ELSE "refundedAmount" END,
                "paymentConfirmationOrigin" = CASE WHEN status = 'paid' THEN COALESCE("paymentConfirmationOrigin", 'stripe') ELSE "paymentConfirmationOrigin" END,
                "lastSyncAt" = NOW(),
                "updatedAt" = NOW()
            WHERE id = $7
        `, [
            sessionId || null,
            paymentIntentId || null,
            charge?.id || null,
            charge?.receipt_url || null,
            charge?.payment_method_details?.type || null,
            (charge?.amount_refunded || 0) / 100,
            submission.id,
        ]);

        await logEvent(submission.id, {
            type: 'stripe_sync',
            title: 'Sincronización manual con Stripe',
            detail: session ? `Estado en Stripe: ${session.payment_status}` : (pi ? `Estado en Stripe: ${pi.status}` : 'Consulta de transacción'),
            actor: actorFrom(req, access),
            metadata: { sessionId, paymentIntentId, chargeId: charge?.id || null },
        });

        const { rows: fresh } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1', [submission.id]);
        const tags = await loadTagsFor([submission.id]);
        res.json({
            success: true,
            submission: mapRow({ ...fresh[0], tags: tags[submission.id] || [] }, access),
        });
    } catch (error) {
        console.error('[project-fair-admin] syncStripe:', error?.message);
        res.status(502).json({ error: `Stripe respondió con un error: ${error?.message}` });
    }
}, 'managePayments');

// POST /admin/postulaciones/:id/confirm-manual-payment
// Confirmación manual y autorizada del pago con trazabilidad inmutable.
//
// v4.1308 — Tres cosas nuevas, pedidas con la ventana delante:
//   1. COMPROBANTE ADJUNTO. `receipt: { key, name, contentType }` de un archivo
//      ya subido a S3 con `manual-payment/receipt-url`. El servidor comprueba el
//      objeto real (prefijo de ESTA postulación, peso, primeros bytes). El
//      soporte es el archivo, una referencia escrita o ambos; no ninguno.
//   2. LA INSCRIPCIÓN COMPLETA. `coverProjectIds`: los demás proyectos de la
//      misma inscripción que ese pago cubre (`manualCoverageFor`). Quedan
//      pagados con `coveredBy` = esta fila y SIN `amountReceived` — el dinero
//      vive una sola vez, en el ancla, igual que en el cobro en línea (v4.1299).
//   3. SUMA AL RECAUDO. Los indicadores suman la LÍNEA de cada fila pagada
//      (`amountCop`/`amountUsd`). Si una fila no la tenía, contaba como pagada
//      pero no sumaba: se deja escrita la tarifa de su posición (sin pisar una
//      que ya estuviera).
export const confirmManualPayment = withAccess(async (req, res, { cfg, access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });
    if (String(submission.status) === 'paid') {
        return res.status(409).json({ error: 'Esta postulación ya tiene el pago confirmado. Recarga la ficha para ver cómo se confirmó.' });
    }

    const body = req.body || {};
    const reference = clean(body.reference, 200);
    if (!reference) {
        return res.status(400).json({ error: 'La referencia o identificador de la transacción es obligatoria.' });
    }

    const dateInput = clean(body.paidAt, 50);
    const paidAt = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(paidAt.getTime())) {
        return res.status(400).json({ error: 'La fecha de pago no es válida.' });
    }
    if (paidAt.getTime() > Date.now() + 10 * 60 * 1000) {
        return res.status(400).json({ error: 'La fecha del pago no puede estar en el futuro.' });
    }

    const amount = Number(body.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'El valor pagado debe ser un monto numérico positivo.' });
    }

    const currency = (clean(body.currency, 10) || 'COP').toUpperCase();
    if (!['COP', 'USD'].includes(currency)) {
        return res.status(400).json({ error: 'La moneda debe ser COP o USD.' });
    }
    const paymentMethod = clean(body.paymentMethod, 80);
    if (!paymentMethod) {
        return res.status(400).json({ error: 'El medio de pago es obligatorio.' });
    }

    const evidence = clean(body.evidence, 2000);
    const receipt = await verifyManualReceipt(body.receipt, submission.id);
    if (receipt && !receipt.ok) return res.status(422).json({ error: receipt.error });
    if (!evidence && !receipt) {
        return res.status(400).json({ error: 'Adjunta el comprobante o escribe una referencia verificable del soporte.' });
    }

    const reason = clean(body.reason, 1000);
    if (!reason || reason.length < 5) {
        return res.status(400).json({ error: 'Debes indicar el motivo de la confirmación manual (mínimo 5 caracteres).' });
    }

    // Qué cubre el pago: esta fila y, si se declaró, los demás proyectos de la
    // inscripción que deben. Lo que no puede cubrirse se rechaza con su motivo.
    const rules = pricingRulesOf(cfg);
    const inscripcion = submission.registrationId
        ? (await db.query('SELECT * FROM "ProjectFairSubmission" WHERE "registrationId" = $1 ORDER BY "projectIndex" ASC', [submission.registrationId])).rows
        : [submission];
    const coverage = manualCoverageFor(inscripcion, submission.id, body.coverProjectIds, rules);
    if (coverage.rejected.length) {
        return res.status(409).json({
            error: `No se puede confirmar: ${coverage.rejected.map(r => r.reason).join(' ')}`,
            rejected: coverage.rejected,
        });
    }
    const lineOf = (id) => coverage.lines.find(l => l.submissionId === id)?.amount || null;
    const lineCol = rules.mode === 'USD' ? '"amountUsd"' : '"amountCop"';

    const actor = actorFrom(req, access);
    const previousStatus = submission.status;
    const previousWorkflow = submission.workflowStatus;

    const isUrl = evidence.startsWith('http://') || evidence.startsWith('https://');
    const piId = reference.startsWith('pi_') ? reference : null;
    const csId = reference.startsWith('cs_') ? reference : null;
    const chId = reference.startsWith('ch_') ? reference : null;

    const cubiertos = coverage.coveredIds.map(id => inscripcion.find(r => r.id === id)).filter(Boolean);
    const coveredProjects = cubiertos.length
        ? [submission, ...cubiertos].map(r => ({ id: r.id, publicRef: r.publicRef || null, projectName: r.projectName || '', projectIndex: projectIndexOf(r) }))
        : null;
    const paymentMeta = {
        manual: true,
        confirmedAt: new Date().toISOString(),
        ...(coveredProjects ? { coveredProjects } : {}),
    };

    // ⚠️ UPDATE CONDICIONAL (`status <> 'paid'`): dos clics o dos pestañas no
    // confirman dos veces ni pisan la primera confirmación.
    const { rows: updatedRows } = await db.query(`
        UPDATE "ProjectFairSubmission"
        SET status = 'paid',
            -- v4.1253 — Confirmar el pago no mueve el estado del proyecto.
            "workflowStatus" = CASE
                WHEN "workflowStatus" IN ('pending_payment', 'payment_confirmed', 'payment_failed', 'refunded') OR "workflowStatus" IS NULL
                THEN 'received' ELSE "workflowStatus" END,
            "paidAt" = $1,
            "amountReceived" = $2,
            "chargeCurrency" = $3,
            "paymentMethod" = $4,
            "paymentConfirmationOrigin" = 'manual_admin',
            "manualPaymentRef" = $5,
            "manualPaymentEvidence" = $6,
            "manualPaymentReason" = $7,
            "manualPaymentBy" = $8,
            "manualPaymentAt" = NOW(),
            "manualPaymentReceiptKey" = $14,
            "manualPaymentReceiptName" = $15,
            "manualPaymentReceiptMime" = $16,
            "manualPaymentReceiptBytes" = $17,
            ${lineCol} = COALESCE(NULLIF(${lineCol}, 0), $18),
            "receiptUrl" = CASE WHEN $9::text IS NOT NULL THEN $9::text ELSE "receiptUrl" END,
            "stripePaymentIntentId" = COALESCE($10, "stripePaymentIntentId"),
            "stripeSessionId" = COALESCE($11, "stripeSessionId"),
            "stripeChargeId" = COALESCE($12, "stripeChargeId"),
            "lastPaymentError" = NULL,
            "lastSyncAt" = NOW(),
            metadata = (COALESCE(metadata, '{}'::jsonb) - 'pendingOrder')
                || jsonb_build_object('payment', COALESCE(metadata->'payment', '{}'::jsonb) || $19::jsonb),
            "updatedAt" = NOW()
        WHERE id = $13 AND status <> 'paid'
        RETURNING *
    `, [
        paidAt,
        amount,
        currency,
        paymentMethod,
        reference,
        evidence || null,
        reason,
        actor.name,
        isUrl ? evidence : null,
        piId,
        csId,
        chId,
        submission.id,
        receipt?.key || null,
        receipt?.name || null,
        receipt?.mime || null,
        receipt?.bytes || null,
        lineOf(submission.id),
        JSON.stringify(paymentMeta),
    ]);

    const updated = updatedRows[0];
    if (!updated) {
        return res.status(409).json({ error: 'Otra persona confirmó este pago mientras tanto. Recarga la ficha.' });
    }

    // Los demás proyectos de la inscripción cubiertos por ESTE pago: pagados,
    // con su línea, con la misma trazabilidad y SIN `amountReceived`.
    const coveredRows = [];
    for (const row of cubiertos) {
        const { rows: cov } = await db.query(`
            UPDATE "ProjectFairSubmission"
            SET status = 'paid',
                "workflowStatus" = CASE
                    WHEN "workflowStatus" IN ('pending_payment', 'payment_confirmed', 'payment_failed', 'refunded') OR "workflowStatus" IS NULL
                    THEN 'received' ELSE "workflowStatus" END,
                "paidAt" = $1,
                "chargeCurrency" = $2,
                "paymentMethod" = $3,
                "paymentConfirmationOrigin" = 'manual_admin',
                "manualPaymentRef" = $4,
                "manualPaymentEvidence" = $5,
                "manualPaymentReason" = $6,
                "manualPaymentBy" = $7,
                "manualPaymentAt" = NOW(),
                "manualPaymentReceiptKey" = $8,
                "manualPaymentReceiptName" = $9,
                "manualPaymentReceiptMime" = $10,
                "manualPaymentReceiptBytes" = $11,
                ${lineCol} = COALESCE(NULLIF(${lineCol}, 0), $12),
                "lastPaymentError" = NULL,
                "lastSyncAt" = NOW(),
                metadata = (COALESCE(metadata, '{}'::jsonb) - 'pendingOrder')
                    || jsonb_build_object('payment', COALESCE(metadata->'payment', '{}'::jsonb) || $13::jsonb),
                "updatedAt" = NOW()
            WHERE id = $14 AND status <> 'paid'
            RETURNING *
        `, [
            paidAt, currency, paymentMethod, reference, evidence || null, reason, actor.name,
            receipt?.key || null, receipt?.name || null, receipt?.mime || null, receipt?.bytes || null,
            lineOf(row.id),
            JSON.stringify({ manual: true, coveredBy: updated.id, coveredByRef: updated.publicRef || null, confirmedAt: paymentMeta.confirmedAt }),
            row.id,
        ]);
        if (cov[0]) coveredRows.push(cov[0]);
    }

    // Rol de Gestor de Proyectos para el club y formulario maestro de cada
    // proyecto que quedó pagado (también los cubiertos: v4.1299 lo dejaba
    // pendiente para el cobro conjunto).
    const { grantProjectManagerRole } = await import('./projectFairController.js');
    for (const paidRow of [updated, ...coveredRows]) {
        await grantProjectManagerRole(paidRow, { reason: `manual_confirmation: ${reference} (${actor.name})` });
        try {
            const { rows: formRows } = await db.query('SELECT id FROM "ProjectFairMasterForm" WHERE "submissionId" = $1 LIMIT 1', [paidRow.id]);
            if (!formRows[0]) {
                const { seedAnswersFor } = await import('./projectFormsController.js');
                const { resolveForm } = await import('../lib/projectFormsRegistry.js');
                const { completionOf } = await import('../lib/projectFairMasterForm.js');
                const answers = seedAnswersFor(resolveForm(cfg, 'master')?.template || cfg?.masterForm, paidRow, cfg);
                await db.query(`
                    INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", "lastEditedAt")
                    VALUES ($1, $2::jsonb, $3, NOW())
                    ON CONFLICT ("submissionId") DO NOTHING
                `, [paidRow.id, JSON.stringify(answers), completionOf(cfg.masterForm, answers)]);
            }
        } catch (e) {
            console.error('[project-fair-admin] Error inicializando MasterForm en confirmación manual:', e?.message);
        }
    }

    // Auditoría inmutable en ProjectFairEvent
    const valor = `${currency === 'COP' ? '$' + amount.toLocaleString('es-CO') : 'US$' + amount.toLocaleString('en-US')} ${currency}`;
    const soporte = receipt ? `Comprobante adjunto: ${receipt.name}` : `Soporte: ${evidence}`;
    await logEvent(submission.id, {
        type: 'payment_confirmed_manually',
        title: coveredRows.length ? 'Pago confirmado administrativamente (inscripción completa)' : 'Pago confirmado administrativamente',
        detail: `${valor} · Ref: ${reference} · Medio: ${paymentMethod}\n${soporte}`
            + (coveredRows.length ? `\nCubre también: ${coveredRows.map(r => r.publicRef || r.id).join(', ')}` : '')
            + `\nMotivo: ${reason}`,
        actor,
        metadata: {
            reference,
            paidAt: paidAt.toISOString(),
            amount,
            currency,
            paymentMethod,
            evidence: evidence || null,
            receipt: receipt ? { name: receipt.name, mime: receipt.mime, bytes: receipt.bytes } : null,
            coveredProjectIds: coveredRows.map(r => r.id),
            reason,
            previousStatus,
            previousWorkflow,
        },
    });
    for (const r of coveredRows) {
        await logEvent(r.id, {
            type: 'payment_confirmed_manually',
            title: 'Pago confirmado administrativamente (inscripción conjunta)',
            detail: `Cubierto por el pago confirmado en ${updated.publicRef || updated.id}: ${valor} · Ref: ${reference}\nMotivo: ${reason}`,
            actor,
            metadata: { coveredBy: updated.id, reference, amount, currency },
        });
    }

    const tags = await loadTagsFor([updated.id]);
    res.json({
        success: true,
        submission: mapRow({ ...updated, tags: tags[updated.id] || [] }, access),
        covered: coveredRows.map(r => ({ id: r.id, publicRef: r.publicRef, projectName: r.projectName })),
    });
}, 'managePayments');

// POST /admin/postulaciones/:id/manual-payment/receipt-url
// v4.1308 — URL prefirmada para subir el comprobante de la confirmación manual.
export const manualReceiptUploadUrl = withAccess(async (req, res) => {
    const { rows } = await db.query('SELECT id, status FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Postulación no encontrada' });
    if (String(rows[0].status) === 'paid') return res.status(409).json({ error: 'Esta postulación ya tiene el pago confirmado.' });
    const { filename, contentType, size } = req.body || {};
    const result = await presignManualReceipt({
        submissionId: rows[0].id,
        contentType: clean(contentType, 100),
        filename: clean(filename, 200),
        size: Number(size),
    });
    if (!result.ok) return res.status(422).json({ error: result.errores[0], errores: result.errores });
    res.json({ key: result.key, uploadUrl: result.uploadUrl, contentType: result.contentType });
}, 'managePayments');

// GET /admin/postulaciones/:id/manual-payment/receipt
// v4.1308 — Enlace firmado (5 minutos) al comprobante de la confirmación
// manual. Un proyecto cubierto abre el del pago que lo cubrió.
export const manualReceiptUrl = withAccess(async (req, res) => {
    const { rows } = await db.query(
        'SELECT id, metadata, "manualPaymentReceiptKey", "manualPaymentReceiptName", "manualPaymentReceiptMime" FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1',
        [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Postulación no encontrada' });
    const key = row.manualPaymentReceiptKey;
    const owner = row.metadata?.payment?.coveredBy || row.id;
    if (!key || !(manualReceiptKeyBelongs(key, row.id) || manualReceiptKeyBelongs(key, owner))) {
        return res.status(404).json({ error: 'Esta postulación no tiene un comprobante adjunto.' });
    }
    const url = await signedReceiptUrl(key);
    if (!url) return res.status(502).json({ error: 'No se pudo firmar el enlace del comprobante.' });
    res.json({ url, name: row.manualPaymentReceiptName || 'comprobante', mime: row.manualPaymentReceiptMime || null, expiresInSeconds: 300 });
}, 'viewPayments');

// GET /admin/submissions/:id/payment-history
// Visualiza los intentos, confirmaciones, eventos de webhook y acciones administrativas.
export const getPaymentHistory = withAccess(async (req, res, { access }) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.params.id]);
    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Postulación no encontrada' });

    const [attempts, stripeEvents, events] = await Promise.all([
        db.query('SELECT * FROM "ProjectFairPaymentAttempt" WHERE "submissionId" = $1 ORDER BY "startedAt" DESC', [submission.id]),
        db.query('SELECT id, "stripeEventId", type, "objectId", "receivedAt" FROM "ProjectFairStripeEvent" WHERE "submissionId" = $1 ORDER BY "receivedAt" DESC LIMIT 50', [submission.id]),
        db.query(`
            SELECT * FROM "ProjectFairEvent"
            WHERE "submissionId" = $1
              AND type IN ('payment_succeeded', 'payment_failed', 'payment_confirmed_manually', 'stripe_sync', 'refund', 'checkout_created', 'checkout_expired', 'status_change', 'substitution', 'payment_reclassified')
            ORDER BY "createdAt" DESC
        `, [submission.id]),
    ]);

    res.json({
        submissionId: submission.id,
        publicRef: submission.publicRef,
        summary: {
            status: submission.status,
            workflowStatus: submission.workflowStatus,
            amountCop: num(submission.amountCop),
            amountUsd: num(submission.amountUsd),
            amountReceived: num(submission.amountReceived),
            chargeCurrency: submission.chargeCurrency,
            paidAt: submission.paidAt,
            paymentMethod: submission.paymentMethod,
            paymentConfirmationOrigin: submission.paymentConfirmationOrigin || (submission.status === 'paid' ? (submission.stripeSessionId || submission.stripePaymentIntentId ? 'stripe' : 'manual_admin') : null),
            stripePaymentIntentId: submission.stripePaymentIntentId,
            stripeSessionId: submission.stripeSessionId,
            stripeChargeId: submission.stripeChargeId,
            receiptUrl: submission.receiptUrl,
            lastPaymentError: submission.lastPaymentError,
            lastSyncAt: submission.lastSyncAt,
            manualPayment: {
                ref: submission.manualPaymentRef,
                evidence: submission.manualPaymentEvidence,
                reason: submission.manualPaymentReason,
                by: submission.manualPaymentBy,
                at: submission.manualPaymentAt,
                receipt: submission.manualPaymentReceiptKey
                    ? { name: submission.manualPaymentReceiptName || 'comprobante', mime: submission.manualPaymentReceiptMime || null, bytes: submission.manualPaymentReceiptBytes == null ? null : Number(submission.manualPaymentReceiptBytes) }
                    : null,
            },
        },
        attempts: attempts.rows,
        stripeEvents: stripeEvents.rows,
        events: events.rows,
    });
}, 'viewPayments');

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

// ── Recordatorios de pago (v4.1253) ──────────────────────────────────
/**
 * POST /admin/postulaciones/payment-reminders?evento=…
 * Cuerpo: { ids?: string[], confirm?: boolean }
 *
 * Sin `ids` alcanza a TODAS las postulaciones de la edición que deben la
 * inscripción (la vista «Clubes con pago pendiente»). Sin `confirm: true`
 * NO envía nada: devuelve el PLAN —a quién le llega y a quién no, con su
 * motivo—, que es lo que el comité tiene que poder revisar antes de mandar
 * correos a decenas de clubes.
 *
 * ⚠️ NO SE MANDAN RECORDATORIOS REPETITIVOS. `reminderVerdict` exige un
 * intervalo mínimo entre dos y un tope por postulación (configurables en
 * `notifications.paymentReminders`), y sólo a una obligación válida: ni a un
 * borrador, ni a un proyecto retirado o rechazado, ni a uno ya pagado, ni
 * después de una fecha límite de pago vencida. El rastro de lo enviado son los
 * eventos `payment_reminder` del historial de cada postulación —no hay una
 * tabla aparte que pueda contradecirlo—.
 */
export const sendPaymentReminders = withAccess(async (req, res, { cfg, access }) => {
    const eventId = clean(req.query?.evento, 60);
    if (!eventId) return res.status(400).json({ error: 'Abre una edición para enviar recordatorios: sin ella se mezclarían ferias.' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => clean(x, 60)).filter(Boolean).slice(0, BULK_MAX) : [];

    const { clause, params } = buildFilters({ evento: eventId, vista: ids.length ? undefined : 'pago_pendiente' });
    let sql = `SELECT * FROM "ProjectFairSubmission" ${clause}`;
    const p = [...params];
    if (ids.length) {
        p.push(ids);
        sql += `${clause ? ' AND' : ' WHERE'} id = ANY($${p.length}::text[])`;
    }
    const { rows } = await db.query(`${sql} ORDER BY "createdAt" ASC LIMIT 1000`, p);
    const sentRes = rows.length
        ? await db.query(`SELECT "submissionId", "createdAt" FROM "ProjectFairEvent"
                          WHERE type = 'payment_reminder' AND "submissionId" = ANY($1::text[])`, [rows.map(r => r.id)])
        : { rows: [] };
    const sentBy = {};
    for (const e of sentRes.rows) (sentBy[e.submissionId] ||= []).push(e.createdAt);

    const plan = rows.map(r => {
        const v = reminderVerdict(r, sentBy[r.id] || [], { cfg });
        return { id: r.id, publicRef: r.publicRef, projectName: r.projectName, clubName: r.clubName, email: r.email, send: v.ok, code: v.code, reason: v.reason };
    });
    const toSend = plan.filter(x => x.send);

    if (req.body?.confirm !== true) {
        return res.json({ preview: true, plan, willSend: toSend.length, skipped: plan.length - toSend.length });
    }

    const actor = actorFrom(req, access);
    const outcomes = [];
    for (const item of toSend) {
        const row = rows.find(r => r.id === item.id);
        const result = await sendFairEmail({
            to: row.email,
            subject: 'Tu proyecto ya está postulado — Completa el pago de inscripción cuando estés listo',
            html: buildPaymentReminderHtml(row, cfg),
            cfg,
        });
        if (result?.success) {
            await logEvent(row.id, {
                type: 'payment_reminder', title: 'Recordatorio de pago enviado',
                detail: `Enviado a ${row.email}`, actor, metadata: { publicRef: row.publicRef },
            });
        }
        outcomes.push({ id: row.id, publicRef: row.publicRef, sent: !!result?.success, error: result?.success ? null : (result?.error || 'No se pudo enviar') });
    }
    res.json({
        preview: false,
        sent: outcomes.filter(o => o.sent).length,
        failed: outcomes.filter(o => !o.sent).length,
        skipped: plan.filter(x => !x.send),
        outcomes,
    });
}, 'managePayments');

// ── Alertas ──────────────────────────────────────────────────────────
// GET /admin/alerts
export const getAlerts = withAccess(async (req, res, { cfg }) => {
    const pendingHours = Math.max(1, Number(cfg.alerts?.pendingPaymentHours) || 48);
    const budgetOutlier = Math.max(1, Number(cfg.alerts?.budgetOutlierUsd) || 500000);
    const priceMode = resolvePriceMode(cfg);

    const [stale, failed, duplicates, incomplete, noFocus, outliers, mismatched] = await Promise.all([
        db.query(`
            SELECT id, "publicRef", "projectName", "clubName", email, "createdAt"
            FROM "ProjectFairSubmission"
            WHERE ${SQL_OWES} AND "archivedAt" IS NULL AND "createdAt" < NOW() - ($1 || ' hours')::interval
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
        // Se compara contra el valor que quedó registrado para ESA inscripción
        // (en modo COP depende de la TRM del momento del pago, así que un valor
        // fijo de la convocatoria no sirve). Sólo se miran los cobros hechos en
        // dólares: los anteriores a v4.612 se procesaron en pesos.
        db.query(`SELECT id, "publicRef", "projectName", "amountReceived", "amountUsd", "amountCop"
                  FROM "ProjectFairSubmission"
                  WHERE status = 'paid' AND "amountReceived" IS NOT NULL
                    AND "chargeCurrency" = 'USD' AND "amountUsd" IS NOT NULL
                    AND ABS("amountReceived" - "amountUsd") > 0.01`),
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

    res.json({ alerts, total: alerts.reduce((n, a) => n + a.count, 0), thresholds: { pendingHours, budgetOutlier, priceMode } });
});

// ── Reportes ─────────────────────────────────────────────────────────
// GET /admin/reports
// Alias de compatibilidad: Reportes dejó de ser una pantalla aparte en
// v4.689 y su ruta responde lo mismo que el Centro de Inteligencia.
export const getReports = getIntelligence;

// ── Exportación ──────────────────────────────────────────────────────
// v4.1304 — Un importe para la hoja de cálculo: número sin separadores de
// miles; vacío si no hay valor (no un 0 inventado).
const csvAmount = (v) => (v === null || v === undefined ? '' : String(Number(v)));
// GET /admin/export.csv — respeta los mismos filtros del listado. El detalle
// financiero sólo sale si el perfil puede verlo.
export const exportCsv = withAccess(async (req, res, { access }) => {
    const { clause, params } = buildFilters(req.query);
    const { rows } = await db.query(`SELECT *, ${SQL_FDD_COLUMNS} FROM "ProjectFairSubmission" ${clause} ORDER BY "createdAt" DESC`, params);
    const tagsBySubmission = await loadTagsFor(rows.map(r => r.id));

    const sizes = await registrationSizesFor(rows);
    const headers = [
        'Registro', 'Fecha de inscripción', 'Proyecto', 'Posición en la inscripción', 'Origen', 'Proyectos del club', 'Inscripción', 'Club Rotario', 'Distrito', 'Responsable',
        'Correo', 'WhatsApp', 'Rol en el club', 'País', 'Departamento', 'Ciudad',
        'Tipo de documento', 'Número de documento',
        'Área de enfoque', 'Presupuesto USD', 'FDD (USD)', 'FAP (USD)', 'Comentarios del postulante', 'Estado de la postulación',
        'Estado del pago', 'Valor pagado COP', 'Equivalente USD', 'TRM aplicada', 'Prioridad',
        'Responsable asignado', 'Categoría interna', 'Etiquetas', 'Fecha de confirmación',
        // v4.1311 — De dónde sale el pago cuando no es de esta fila, y quién
        // lo hizo cuando no fue el responsable.
        'Pago respaldado por', 'Pagado por',
    ];
    if (access.viewPayments) headers.push('Referencia Stripe (PaymentIntent)', 'Checkout Session', 'Charge', 'Método de pago', 'Comprobante');

    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const lines = [headers.join(';')];
    for (const r of rows) {
        const values = [
            r.publicRef, r.createdAt ? new Date(r.createdAt).toISOString() : '', r.projectName,
            projectIndexLabel(projectIndexOf(r)),
            projectIndexOf(r) >= 2 ? (r.metadata?.addedVia === 'portal_extension' ? 'Ampliación posterior' : 'Registro inicial') : 'Registro inicial',
            sizes[r.registrationId] ?? 1, r.registrationId || r.id,
            r.clubName, r.district,
            `${r.firstName || ''} ${r.lastName || ''}`.trim(), r.email, r.phone,
            r.clubRoleOther || r.clubRoleLabel || r.clubRole,
            r.country, r.department, r.city, r.idTypeLabel || r.idType, r.idNumber,
            r.focusAreaLabel || r.focusArea, r.budgetUsd,
            // v4.1304 — Número sin formato (vacío si el club no lo escribió).
            csvAmount(r.fddRequestedUsd), csvAmount(r.fapGoalUsd), r.notes,
            WORKFLOW_STATES.find(s => s.key === (r.workflowStatus || 'received'))?.label || r.workflowStatus,
            PAYMENT_STATES.find(s => s.key === r.status)?.label || r.status,
            r.amountCop, r.amountUsd, r.trmRate, r.priority, r.assigneeName, r.internalCategory,
            (tagsBySubmission[r.id] || []).map(t => t.label).join(' | '),
            r.paidAt ? new Date(r.paidAt).toISOString() : '',
            r.metadata?.payment?.coveredBy ? (r.metadata.payment.coveredByRef || r.metadata.payment.coveredBy) : '',
            r.metadata?.substitution?.role === 'kept' ? (r.metadata.substitution.payer?.name || '') : '',
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
    const [districts, clubs, categories, assignees, health] = await Promise.all([
        db.query(`SELECT DISTINCT district AS value FROM "ProjectFairSubmission" WHERE COALESCE(district,'') <> '' ORDER BY 1`),
        db.query(`SELECT DISTINCT "clubName" AS value FROM "ProjectFairSubmission" WHERE COALESCE("clubName",'') <> '' ORDER BY 1`),
        db.query(`SELECT DISTINCT "internalCategory" AS value FROM "ProjectFairSubmission" WHERE COALESCE("internalCategory",'') <> '' ORDER BY 1`),
        db.query(`SELECT DISTINCT "assigneeName" AS value FROM "ProjectFairSubmission" WHERE COALESCE("assigneeName",'') <> '' ORDER BY 1`),
        // Conteo CRUDO, sin filtros: permite distinguir "no hay postulaciones"
        // de "las hay pero algo las está escondiendo".
        db.query(`SELECT
                    (SELECT COUNT(*)::int FROM "ProjectFairSubmission") AS submissions,
                    (SELECT COUNT(*)::int FROM "ProjectFairSubmission" WHERE status = 'paid') AS paid,
                    (SELECT COUNT(*)::int FROM "ProjectFairAccount") AS accounts,
                    (SELECT COUNT(*)::int FROM "ProjectFairMasterForm") AS forms`),
    ]);
    res.json({
        workflowStates: WORKFLOW_STATES,
        paymentStates: PAYMENT_STATES,
        // v4.1253 — Estados del pago como se le explican a una persona, y las
        // vistas de participación y recaudo del listado.
        paymentViewStates: PAYMENT_VIEW_STATES,
        views: VIEW_OPTIONS,
        priorities: PRIORITIES,
        focusAreas: cfg.focusAreas || [],
        configuredDistricts: cfg.districts || [],
        districts: districts.rows.map(r => r.value),
        clubs: clubs.rows.map(r => r.value),
        categories: categories.rows.map(r => r.value),
        assignees: assignees.rows.map(r => r.value),
        edition: cfg.edition,
        registration: cfg.registration,
        health: health.rows[0] || { submissions: 0, paid: 0, accounts: 0, forms: 0 },
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
    // v4.1311 — Un proyecto archivado no entra en la revisión de la Formulación.
    const where = ['s."archivedAt" IS NULL'];
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
        focusAreas: cfg.focusAreas,
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

// ════════════════════════════════════════════════════════════════════
// ACCIONES EN BLOQUE (v4.1024)
//
// Del pedido con el listado delante: seleccionar una o varias postulaciones y
// actuar sobre la selección, «principalmente eliminarlas con el objetivo de
// limpiar el listado». Hasta v4.1023 el módulo NO tenía ninguna forma de
// eliminar una postulación, ni de a una: todo lo que entraba por el formulario
// público se quedaba en el registro para siempre.
//
// Cinco reglas heredadas del sitio sostienen esto:
//
//  1. LO QUE COBRÓ SE ARCHIVA, NO SE BORRA (`dispositionFor` en el criterio).
//     Es la decisión de producto del pedido, tomada con el argumento delante.
//  2. CONFIRMACIÓN EXPLÍCITA (`confirm: true` → 428, patrón v4.885). Esto
//     mueve registros de clubes reales y no se deshace pulsando «atrás».
//  3. EL BLOQUE NO ES ATÓMICO Y SE DICE (v4.886): cada fila reporta su
//     desenlace con su motivo. Envolverlo en una transacción sería peor —un
//     fallo tiraría abajo eliminaciones que sí ocurrieron—.
//  4. EL AISLAMIENTO VA EN EL `WHERE` (v4.932): la fila se carga acotada a la
//     EDICIÓN abierta. Una de otra edición «no existe» para quien pregunta —y
//     sin edición abierta no se opera en bloque, porque el listado sin filtrar
//     mezcla ediciones y ahí un borrado transversal es silencioso.
//  5. EL HISTORIAL SÓLO AGREGA. Al eliminar se conserva `ProjectFairEvent`
//     entero y se le suma el evento de la eliminación: es lo único que
//     contesta «¿por qué esta postulación ya no está?» dentro de seis meses.
//     Las filas quedan huérfanas a propósito — nadie las consulta sin su
//     `submissionId`, y son el rastro.
// ════════════════════════════════════════════════════════════════════

/**
 * Las TABLAS que cuelgan de una postulación, en el orden en que se vacían.
 *
 * ⚠️ `ProjectFairEvent` NO está en la lista, y es deliberado: es el historial y
 * sobrevive a la fila (regla 5). Al agregar una tabla que cuelgue de
 * `submissionId`, agregarla AQUÍ — si no, eliminar deja filas huérfanas que
 * nadie puede ver ni volver a borrar desde el panel, y el fallo es mudo.
 */
const SUBMISSION_CHILDREN = [
    'ProjectFairFile',
    'ProjectFairSubmissionTag',
    'ProjectFairStripeEvent',
    'ProjectFairMasterForm',
    'ProjectFairProjectForm',
    'ProjectFairFormRevision',
    'ProjectFairPaymentAttempt',
    // La cuenta con la que el club entra a /mi-proyecto. Va última porque es
    // la que más duele perder, y perderla es justamente lo que hace que una
    // postulación con cobro se archive en vez de eliminarse.
    'ProjectFairAccount',
];

/** Los ids de la petición: saneados, sin repetidos y sin vacíos. */
const bulkIdsFrom = (body) => (Array.isArray(body?.ids)
    ? [...new Set(body.ids.map(v => clean(v, 80)).filter(Boolean))]
    : []);

/**
 * El gate común de las cinco acciones. Devuelve `null` si ya respondió.
 *
 * Carga las filas FRESCAS de la base —nunca las que mande el navegador— y las
 * acota a la edición abierta: la previsión que pinta la pantalla es una
 * comodidad, el veredicto lo arma aquí el servidor.
 */
const bulkScopeFor = async (req, res, action) => {
    const eventId = clean(req.query?.evento, 60);
    if (!eventId) {
        res.status(400).json({
            error: 'Abrí una edición antes de operar en bloque.',
            detail: 'Sin edición, el listado mezcla postulaciones de varias ferias y una acción en bloque las alcanzaría todas.',
        });
        return null;
    }
    const ids = bulkIdsFrom(req.body);
    if (!ids.length) {
        res.status(400).json({ error: 'No hay postulaciones seleccionadas.' });
        return null;
    }
    if (ids.length > BULK_MAX) {
        res.status(413).json({ error: `Máximo ${BULK_MAX} postulaciones por acción en bloque.` });
        return null;
    }

    // ⚠️ SE CARGA SIN ACOTAR Y SE CLASIFICA DESPUÉS, a propósito.
    //
    // El listado de esta pantalla NO manda `?evento=` (`loadRows` no pasa por
    // `withEvento`), así que hoy enseña también las postulaciones sin edición
    // —las anteriores a v4.683, que nunca se migraron—. Acotar la consulta a
    // la edición las haría desaparecer de una acción sobre filas que el
    // usuario TIENE delante, y el motivo sería «no existe», que es falso.
    //
    // Se opera lo que se ve: esta edición y las que no tienen ninguna. Una de
    // OTRA edición se conserva y se NOMBRA con su motivo —ahí el aislamiento
    // sí manda— en vez de confundirse con una borrada. La distinción se hace
    // en JavaScript porque las tres respuestas son distintas y un `WHERE` sólo
    // sabe decir «no está».
    const { rows } = await db.query(
        `SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[])`, [ids]);
    const byId = new Map(rows.map(r => [r.id, r]));
    const ajenas = new Set(rows.filter(r => r.eventId && r.eventId !== eventId).map(r => r.id));

    const plan = planBulk(ids.map(id => (ajenas.has(id) ? null : byId.get(id) || null)), action);
    // Las de otra edición se nombran con lo que son, no como «no encontrada».
    plan.items = plan.items.map((item, i) => (ajenas.has(ids[i])
        ? { ...item, id: ids[i], label: labelOf(byId.get(ids[i])), outcome: 'sin_cambio', reason: 'otra_edicion' }
        : item));
    plan.totals = plan.items.reduce((acc, it) => ({ ...acc, [it.outcome]: (acc[it.outcome] || 0) + 1 }), {});

    // La confirmación llega DESPUÉS del plan, así que dice el hecho —qué se
    // elimina, qué se archiva y por qué— en vez de preguntar «¿estás seguro?».
    if (req.body?.confirm !== true) {
        res.status(428).json({
            error: 'La acción en bloque exige confirmación explícita.',
            requiresConfirmation: true,
            plan, summary: describeBulkPlan(plan),
        });
        return null;
    }

    const check = validateBulkPlan(plan);
    if (!check.ok) {
        res.status(400).json({ error: check.error, plan, summary: describeBulkPlan(plan) });
        return null;
    }
    return { eventId, ids, rows: byId, plan };
};

/** La respuesta común: el desenlace de cada fila y el desglose. */
const bulkResult = (res, action, outcomes) => {
    const totals = outcomes.reduce((acc, o) => ({ ...acc, [o.outcome]: (acc[o.outcome] || 0) + 1 }), {});
    const plan = { action, items: outcomes, totals, count: outcomes.length };
    return res.json({ outcomes, totals, summary: describeBulkPlan(plan) });
};

/** Vacía las tablas hijas y borra la fila. El historial NO se toca (regla 5). */
const hardDelete = async (id, eventId) => {
    for (const table of SUBMISSION_CHILDREN) {
        await db.query(`DELETE FROM "${table}" WHERE "submissionId" = $1`, [id]).catch((e) => {
            // Una tabla que todavía no existe en esta base no puede impedir la
            // eliminación: se anota y se sigue.
            console.warn(`[project-fair-admin] bulk-delete: no pude vaciar ${table}:`, e?.message);
        });
    }
    // La cláusula repite el alcance del gate: entre leer la fila y borrarla
    // pudo cambiar de edición, y un borrado que no vuelva a comprobarlo
    // alcanzaría una postulación que ya no es de esta feria.
    const { rowCount } = await db.query(
        'DELETE FROM "ProjectFairSubmission" WHERE id = $1 AND ("eventId" = $2 OR "eventId" IS NULL)', [id, eventId]);
    return rowCount > 0;
};

/** Archivar es un UPDATE condicional: dos peticiones a la vez no archivan dos
 *  veces ni pisan la fecha de quien lo archivó primero. */
const archiveRow = async (row, { actor, motivo, porCobro = false }) => {
    const { rowCount } = await db.query(
        `UPDATE "ProjectFairSubmission"
         SET "archivedAt" = NOW(), "archivedBy" = $2, "archivedReason" = $3, "updatedAt" = NOW()
         WHERE id = $1 AND "archivedAt" IS NULL`,
        [row.id, actor?.name || null, motivo]);
    if (!rowCount) return false;
    await logEvent(row.id, {
        type: 'archived',
        title: porCobro
            ? 'Archivada (registró un cobro, no se elimina)'
            : 'Archivada — sale del listado',
        detail: motivo,
        actor,
        metadata: { bulk: true, porCobro },
    });
    return true;
};

// POST /admin/postulaciones/bulk-delete
export const bulkDelete = withAccess(async (req, res, { access }) => {
    const scope = await bulkScopeFor(req, res, 'delete');
    if (!scope) return;
    const actor = actorFrom(req, access);
    const motivo = clean(req.body?.reason, 1000) || null;
    const outcomes = [];

    for (const item of scope.plan.items) {
        const row = item.id ? scope.rows.get(item.id) : null;
        try {
            if (!row) { outcomes.push({ ...item, outcome: 'no_existe' }); continue; }

            if (item.outcome === 'archivada') {
                await archiveRow(row, { actor, motivo, porCobro: true });
                outcomes.push(item);
                continue;
            }
            if (item.outcome !== 'eliminada') { outcomes.push(item); continue; }

            const borrada = await hardDelete(row.id, scope.eventId);
            if (!borrada) { outcomes.push({ ...item, outcome: 'no_existe' }); continue; }
            // Después de borrar la fila: el evento queda huérfano y ES el rastro.
            await logEvent(row.id, {
                type: 'submission_deleted',
                title: `Postulación eliminada definitivamente: ${labelOf(row)}`,
                detail: motivo,
                actor,
                metadata: { bulk: true, email: row.email, clubName: row.clubName, publicRef: row.publicRef, eventId: scope.eventId },
            });
            outcomes.push(item);
        } catch (e) {
            console.error('[project-fair-admin] bulkDelete fila:', e);
            outcomes.push({ ...item, outcome: 'error', reason: e?.message || 'Fallo al eliminar' });
        }
    }
    return bulkResult(res, 'delete', outcomes);
}, BULK_CAPABILITY.delete);

// POST /admin/postulaciones/bulk-archive
export const bulkArchive = withAccess(async (req, res, { access }) => {
    const scope = await bulkScopeFor(req, res, 'archive');
    if (!scope) return;
    const actor = actorFrom(req, access);
    const motivo = clean(req.body?.reason, 1000) || null;
    const outcomes = [];

    for (const item of scope.plan.items) {
        const row = item.id ? scope.rows.get(item.id) : null;
        try {
            if (!row) { outcomes.push({ ...item, outcome: 'no_existe' }); continue; }
            if (item.outcome !== 'archivada') { outcomes.push(item); continue; }
            const hecha = await archiveRow(row, { actor, motivo });
            outcomes.push(hecha ? item : { ...item, outcome: 'sin_cambio', reason: 'ya_archivada' });
        } catch (e) {
            console.error('[project-fair-admin] bulkArchive fila:', e);
            outcomes.push({ ...item, outcome: 'error', reason: e?.message || 'Fallo al archivar' });
        }
    }
    return bulkResult(res, 'archive', outcomes);
}, BULK_CAPABILITY.archive);

// POST /admin/postulaciones/bulk-restore
export const bulkRestore = withAccess(async (req, res, { access }) => {
    const scope = await bulkScopeFor(req, res, 'restore');
    if (!scope) return;
    const actor = actorFrom(req, access);
    const outcomes = [];

    for (const item of scope.plan.items) {
        const row = item.id ? scope.rows.get(item.id) : null;
        try {
            if (!row) { outcomes.push({ ...item, outcome: 'no_existe' }); continue; }
            if (item.outcome !== 'restaurada') { outcomes.push(item); continue; }
            const { rowCount } = await db.query(
                `UPDATE "ProjectFairSubmission"
                 SET "archivedAt" = NULL, "archivedBy" = NULL, "archivedReason" = NULL, "updatedAt" = NOW()
                 WHERE id = $1 AND "archivedAt" IS NOT NULL`, [row.id]);
            if (!rowCount) { outcomes.push({ ...item, outcome: 'sin_cambio', reason: 'no_archivada' }); continue; }
            await logEvent(row.id, {
                type: 'restored', title: 'Restaurada — vuelve al listado', actor, metadata: { bulk: true },
            });
            outcomes.push(item);
        } catch (e) {
            console.error('[project-fair-admin] bulkRestore fila:', e);
            outcomes.push({ ...item, outcome: 'error', reason: e?.message || 'Fallo al restaurar' });
        }
    }
    return bulkResult(res, 'restore', outcomes);
}, BULK_CAPABILITY.restore);

// POST /admin/postulaciones/bulk-status — mover la selección a otro estado.
// El MOTIVO es obligatorio: es lo que queda en el historial de cada una, y un
// cambio de estado en bloque sin explicación no se puede reconstruir después.
export const bulkStatus = withAccess(async (req, res, { access }) => {
    const next = clean(req.body?.workflowStatus, 40);
    if (!WORKFLOW_KEYS.includes(next)) return res.status(400).json({ error: 'Estado no válido.' });
    const motivo = clean(req.body?.reason, 1000);
    if (!motivo) return res.status(400).json({ error: 'Escribí el motivo del cambio: queda en el historial de cada postulación.' });

    const scope = await bulkScopeFor(req, res, 'status');
    if (!scope) return;
    const actor = actorFrom(req, access);
    const label = k => WORKFLOW_STATES.find(st => st.key === k)?.label || k;
    const outcomes = [];

    for (const item of scope.plan.items) {
        const row = item.id ? scope.rows.get(item.id) : null;
        try {
            if (!row) { outcomes.push({ ...item, outcome: 'no_existe' }); continue; }
            const from = row.workflowStatus || 'received';
            if (from === next) { outcomes.push({ ...item, outcome: 'sin_cambio', reason: 'mismo_estado' }); continue; }
            await db.query(
                'UPDATE "ProjectFairSubmission" SET "workflowStatus" = $2, "updatedAt" = NOW() WHERE id = $1',
                [row.id, next]);
            await logEvent(row.id, {
                type: 'status_change',
                title: `Estado: ${label(from)} → ${label(next)}`,
                detail: motivo, actor, metadata: { from, to: next, bulk: true },
            });
            outcomes.push({ ...item, outcome: 'actualizada' });
        } catch (e) {
            console.error('[project-fair-admin] bulkStatus fila:', e);
            outcomes.push({ ...item, outcome: 'error', reason: e?.message || 'Fallo al cambiar el estado' });
        }
    }
    return bulkResult(res, 'status', outcomes);
}, BULK_CAPABILITY.status);

// POST /admin/postulaciones/bulk-tag — poner o quitar UNA etiqueta.
export const bulkTag = withAccess(async (req, res, { access }) => {
    const tagId = clean(req.body?.tagId, 60);
    const quitar = req.body?.remove === true;
    if (!tagId) return res.status(400).json({ error: 'Elegí la etiqueta.' });

    const { rows: tagRows } = await db.query('SELECT id, label FROM "ProjectFairTag" WHERE id = $1 LIMIT 1', [tagId]);
    const tag = tagRows[0];
    if (!tag) return res.status(404).json({ error: 'Esa etiqueta no existe.' });

    const scope = await bulkScopeFor(req, res, 'tag');
    if (!scope) return;
    const actor = actorFrom(req, access);
    const outcomes = [];

    for (const item of scope.plan.items) {
        const row = item.id ? scope.rows.get(item.id) : null;
        try {
            if (!row) { outcomes.push({ ...item, outcome: 'no_existe' }); continue; }
            let cambio;
            if (quitar) {
                const { rowCount } = await db.query(
                    'DELETE FROM "ProjectFairSubmissionTag" WHERE "submissionId" = $1 AND "tagId" = $2', [row.id, tagId]);
                cambio = rowCount > 0;
            } else {
                const { rowCount } = await db.query(
                    `INSERT INTO "ProjectFairSubmissionTag" ("submissionId","tagId") VALUES ($1,$2)
                     ON CONFLICT ("submissionId","tagId") DO NOTHING`, [row.id, tagId]);
                cambio = rowCount > 0;
            }
            if (!cambio) {
                outcomes.push({ ...item, outcome: 'sin_cambio', reason: quitar ? 'no_tenia_etiqueta' : 'ya_tenia_etiqueta' });
                continue;
            }
            await logEvent(row.id, {
                type: quitar ? 'tag_removed' : 'tag_added',
                title: `${quitar ? 'Etiqueta quitada' : 'Etiqueta'}: ${tag.label}`,
                actor, metadata: { tagId, bulk: true },
            });
            outcomes.push({ ...item, outcome: 'actualizada' });
        } catch (e) {
            console.error('[project-fair-admin] bulkTag fila:', e);
            outcomes.push({ ...item, outcome: 'error', reason: e?.message || 'Fallo al etiquetar' });
        }
    }
    return bulkResult(res, 'tag', outcomes);
}, BULK_CAPABILITY.tag);

// ════════════════════════════════════════════════════════════════════
// EL TRASLADO DEL DINERO COBRADO — v4.1026
// ════════════════════════════════════════════════════════════════════
//
// POST /admin/postulaciones/transfers/resolve
//
// ⚠️ ESTE ENDPOINT NO ESCRIBE NADA, Y ES LA MITAD DE LO QUE LO HACE SEGURO.
// Traduce «estas postulaciones» a los movimientos de la Bóveda que las
// respaldan y devuelve la forma EXACTA que la barra de desembolso ya consume.
// El registro —el lote, el comprobante compartido, la notificación
// consolidada, la idempotencia por operación— sigue yendo por
// `POST /financial/wallet/disbursements/bulk`, que es el único punto de la
// plataforma que mueve este dinero. Lo fija una prueba que lee este archivo.
//
// ⚠️ Y EL SITIO SE RESUELVE CON EL MISMO CRITERIO QUE VA A APLICAR EL
// REGISTRO. Para un administrador de sitio, `clubDe` ignora el `clubId` del
// cuerpo y usa el del token: elegir otro acá daría una barra que promete un
// traslado y recibe «no existe en este sitio», que manda a diagnosticar donde
// no está el problema.
export const resolveTransfers = withAccess(async (req, res, { access }) => {
    const ids = bulkIdsFrom(req.body);
    if (!ids.length) return res.status(400).json({ error: 'No hay postulaciones seleccionadas.' });
    if (ids.length > BULK_MAX) {
        return res.status(413).json({ error: `Máximo ${BULK_MAX} postulaciones por vez.` });
    }

    // Se cargan SIN acotar por edición y se clasifica después, igual que las
    // acciones en bloque (v4.1024): el listado de esta pantalla muestra también
    // las postulaciones sin edición, y hacerlas desaparecer con el motivo «no
    // existe» sería falso. Una de OTRA edición se bloquea nombrándolo.
    const eventId = clean(req.query?.evento, 60) || null;
    const { rows } = await db.query(
        'SELECT * FROM "ProjectFairSubmission" WHERE id = ANY($1::text[])', [ids]);
    const byId = new Map(rows.map(r => [r.id, r]));

    const propias = rows.filter(r => !eventId || !r.eventId || r.eventId === eventId);
    const ajenas = new Set(rows.filter(r => eventId && r.eventId && r.eventId !== eventId).map(r => r.id));

    // Una consulta para todos los movimientos, no una por inscripción.
    const pagos = await paymentsForSubmissions(propias);

    // El operador de la plataforma puede registrar contra cualquier sitio; un
    // administrador de sitio, sólo contra el suyo. Es lo que decide `clubDe`.
    const esOperador = req.user?.role === 'administrator';
    const siteClubId = pickTransferSite([...pagos.values()], {
        sessionClubId: req.user?.clubId || null,
        isOperator: esOperador,
    });

    const ahora = new Date();
    const items = [];
    for (const id of ids) {
        const submission = byId.get(id);
        if (!submission) {
            items.push({ id, titulo: id, bloqueo: { id: 'no_existe', motivo: 'No se encontró.', salida: null, donde: null } });
            continue;
        }
        if (ajenas.has(id)) {
            items.push({
                id, titulo: labelOf(submission),
                bloqueo: {
                    id: 'otra_edicion',
                    motivo: 'Pertenece a otra edición de la feria.',
                    salida: 'Abrí esa edición para trasladar su dinero.',
                    donde: null,
                },
            });
            continue;
        }
        const pago = pagos.get(id) || null;
        // El saldo y el permiso sólo se consultan cuando hay pago: sin fila no
        // hay nada que preguntar y `transferItem` ya lo bloquea con su salida.
        let balance = null;
        let permission = null;
        if (pago) {
            permission = canDisburse(pago, ahora);
            if (permission.ok) {
                try { balance = await balanceFor(pago); }
                catch (e) { console.warn('[fair-transfers] saldo:', e?.message); }
            }
        }
        items.push(transferItem({ submission, payment: pago, balance, permission, siteClubId }));
    }

    const plan = planTransfers(items);
    return res.json({
        ...plan,
        clubId: siteClubId,
        // Se dice de dónde salió el sitio: sin eso, «¿por qué me dice que este
        // cobro es de otro sitio?» no se puede contestar mirando la pantalla.
        clubSource: esOperador ? 'cobros' : 'sesion',
        canRegister: access.managePayments === true,
    });
}, 'managePayments');

// ════════════════════════════════════════════════════════════════════
// v4.1311 — SUSTITUIR UNA POSTULACIÓN POR OTRA DEL MISMO CLUB, CON SU PAGO.
//
// Dos pasos, los dos del lado del servidor:
//   1. VERIFICAR (solo lectura): lee las dos filas, consulta a Stripe cada
//      pago y la Bóveda, y devuelve las comprobaciones con su motivo y una
//      HUELLA de lo verificado. Si algo no coincide con lo que el comité
//      informó, lo dice y no deja seguir.
//   2. APLICAR: vuelve a verificar, exige la misma huella, y en UNA
//      transacción archiva el proyecto retirado (el pago real queda en él,
//      como ancla), deja el conservado respaldado por ese pago
//      (`coveredBy`), guarda entero el pago anterior del conservado y
//      escribe la auditoría antes/después. Cualquier fallo → ROLLBACK.
// El criterio vive en `server/lib/projectFairSubstitution.js`.
// ════════════════════════════════════════════════════════════════════

// Stripe con tope de tiempo: una verificación no puede quedarse colgada.
// `STRIPE_API_BASE` es la misma salida para pruebas que usa el Video Pitch
// (`videoPitchCommerceController.getStripe`); en producción no existe.
const stripeForSubstitution = () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    const base = process.env.STRIPE_API_BASE;
    if (base) {
        const u = new URL(base);
        return new Stripe(key, { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80), protocol: u.protocol.replace(':', ''), maxNetworkRetries: 0, timeout: 15000 });
    }
    return new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
};

/** Lo que Stripe dice del pago de una fila (o null si la fila no tiene pago en Stripe). */
const stripeFactsForRow = async (row) => {
    const facts = paymentFactsOf(row);
    if (!facts || (!facts.stripePaymentIntentId && !facts.stripeSessionId)) return null;
    const stripe = stripeForSubstitution();
    if (!stripe) return stripeFactsOf(null, new Error('El servidor no tiene la clave de Stripe configurada.'));
    try {
        let piId = facts.stripePaymentIntentId;
        if (!piId && facts.stripeSessionId) {
            const session = await stripe.checkout.sessions.retrieve(facts.stripeSessionId);
            piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
            if (!piId) return stripeFactsOf(null, new Error(`La sesión ${facts.stripeSessionId} no tiene PaymentIntent (estado: ${session.payment_status}).`));
        }
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
        return stripeFactsOf(pi);
    } catch (err) {
        return stripeFactsOf(null, err);
    }
};

/** El movimiento de la Bóveda de un cobro (por su referencia), si existe. */
const ledgerMovementFor = async (row) => {
    const ref = String(row?.stripePaymentIntentId || row?.stripeSessionId || '').trim();
    if (!ref) return null;
    try {
        const { rows } = await db.query(
            `SELECT id, status, amount, currency, "rawPayload"->>'submissionId' AS "submissionId", "createdAt"
               FROM "Payment" WHERE provider = 'stripe' AND "providerRef" = $1 LIMIT 1`, [ref]);
        return rows[0]
            ? { found: true, id: rows[0].id, status: rows[0].status, amount: num(rows[0].amount), currency: rows[0].currency, submissionId: rows[0].submissionId || null }
            : { found: false };
    } catch {
        return { found: false, error: 'No se pudo consultar la Bóveda' };
    }
};

const hasOpenAttempt = async (id) => {
    try {
        const { rows } = await db.query(`SELECT 1 FROM "ProjectFairPaymentAttempt" WHERE "submissionId" = $1 AND status = 'open' LIMIT 1`, [id]);
        return rows.length > 0;
    } catch { return false; }
};

const substitutionInput = (body = {}) => ({
    retiredRef: clean(body.retiredRef, 40).toUpperCase(),
    keptRef: clean(body.keptRef, 40).toUpperCase(),
    amount: body.amount === undefined || body.amount === null || body.amount === '' ? null : Number(body.amount),
    currency: clean(body.currency, 5).toUpperCase() === 'USD' ? 'USD' : 'COP',
});

const rowByRef = async (q, ref, { lock = false } = {}) => {
    if (!ref) return null;
    const { rows } = await q.query(
        `SELECT * FROM "ProjectFairSubmission" WHERE upper("publicRef") = $1 LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [ref]);
    return rows[0] || null;
};

/** Verifica con las filas que se le den; consulta Stripe y la Bóveda. */
const planSubstitution = async (input, { retired, kept, stripe = null } = {}) => {
    const retiredStripe = stripe ? stripe.retired : await stripeFactsForRow(retired);
    const keptStripe = stripe ? stripe.kept : await stripeFactsForRow(kept);
    const [retiredMovement, keptMovement, keptOpenAttempt] = await Promise.all([
        ledgerMovementFor(retired), ledgerMovementFor(kept), kept ? hasOpenAttempt(kept.id) : false,
    ]);
    const plan = substitutionPlan({
        retired, kept, retiredStripe, keptStripe,
        expected: input,
        ledger: { retiredMovement, keptMovement, keptOpenAttempt },
    });
    return { plan, stripe: { retired: retiredStripe, kept: keptStripe } };
};

// POST /admin/postulaciones/sustitucion/verificar  — solo lectura.
export const verifySubstitution = withAccess(async (req, res, { access }) => {
    if (!access.managePayments) return res.status(403).json({ error: 'Tu perfil no puede mover pagos.' });
    const input = substitutionInput(req.body);
    if (!input.retiredRef || !input.keptRef) {
        return res.status(400).json({ error: 'Indica la referencia del proyecto que se retira y la del que se conserva.' });
    }
    const [retired, kept] = await Promise.all([rowByRef(db, input.retiredRef), rowByRef(db, input.keptRef)]);
    const { plan } = await planSubstitution(input, { retired, kept });
    res.json({ plan });
}, 'remove');

// POST /admin/postulaciones/sustitucion/aplicar
export const applySubstitution = withAccess(async (req, res, { access }) => {
    if (!access.managePayments) return res.status(403).json({ error: 'Tu perfil no puede mover pagos.' });
    const input = substitutionInput(req.body);
    const reason = clean(req.body?.reason, 1000);
    const fingerprint = clean(req.body?.fingerprint, 80);
    if (req.body?.confirm !== true) return res.status(428).json({ error: 'La sustitución exige confirmación explícita.' });
    if (!input.retiredRef || !input.keptRef) return res.status(400).json({ error: 'Faltan las referencias de los dos proyectos.' });
    if (reason.length < 10) return res.status(400).json({ error: 'Escribe el motivo de la sustitución (mínimo 10 caracteres).' });
    if (!fingerprint) return res.status(400).json({ error: 'Verifica antes de aplicar.' });

    // Stripe se consulta FUERA de la transacción: no se tienen filas
    // bloqueadas mientras se espera a un tercero.
    const [retired0, kept0] = await Promise.all([rowByRef(db, input.retiredRef), rowByRef(db, input.keptRef)]);
    const first = await planSubstitution(input, { retired: retired0, kept: kept0 });
    if (first.plan.alreadyApplied) {
        // IDEMPOTENTE: ya estaba aplicada; no se escribe nada.
        return res.json({ applied: false, alreadyApplied: true, plan: first.plan });
    }
    if (!first.plan.ok) {
        return res.status(409).json({ error: 'Las comprobaciones no pasan: no se aplicó nada.', plan: first.plan });
    }
    if (first.plan.fingerprint !== fingerprint) {
        return res.status(409).json({ error: 'Los datos cambiaron desde la verificación. Vuelve a verificar antes de aplicar.', plan: first.plan });
    }

    const actor = actorFrom(req, access);
    const at = new Date().toISOString();
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const retired = await rowByRef(client, input.retiredRef, { lock: true });
        const kept = await rowByRef(client, input.keptRef, { lock: true });
        // Con las filas BLOQUEADAS se vuelve a decidir con lo mismo que Stripe
        // dijo: si algo cambió entre la lectura y el bloqueo, la huella no
        // coincide y no se toca nada.
        const { plan } = await planSubstitution(input, { retired, kept, stripe: first.stripe });
        if (!plan.ok || plan.fingerprint !== fingerprint) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Los datos cambiaron mientras se aplicaba. No se modificó nada; vuelve a verificar.', plan });
        }
        const w = substitutionWrites(plan, { actor, reason, at });
        const before = { retired, kept };

        // 1) El proyecto retirado: archivado, retirado y, en su pago (que NO
        //    pierde ni un dato), la marca de a quién respalda ahora.
        const { rows: r1 } = await client.query(`
            UPDATE "ProjectFairSubmission"
            SET "archivedAt" = NOW(), "archivedBy" = $2, "archivedReason" = $3,
                "workflowStatus" = $4,
                metadata = (COALESCE(metadata, '{}'::jsonb) - 'substitution')
                    || jsonb_build_object(
                        'payment', COALESCE(metadata->'payment', '{}'::jsonb) || $5::jsonb,
                        'substitution', $6::jsonb),
                "updatedAt" = NOW()
            WHERE id = $1 AND "archivedAt" IS NULL AND status = 'paid'
            RETURNING *
        `, [retired.id, actor.name, w.retired.archivedReason, w.retired.workflowStatus,
            JSON.stringify(w.retired.paymentMerge), JSON.stringify(w.retired.substitution)]);
        if (!r1[0]) throw Object.assign(new Error('El proyecto retirado cambió de estado durante la operación.'), { status: 409 });

        // 2) El proyecto conservado: respaldado por el pago oficial, sin dinero
        //    propio (vive en el ancla) y con su pago anterior guardado entero.
        const k = w.kept;
        const m = k.manual || {};
        const { rows: r2 } = await client.query(`
            UPDATE "ProjectFairSubmission"
            SET status = 'paid',
                "paidAt" = COALESCE($2::timestamptz, "paidAt"),
                "amountReceived" = NULL,
                "chargeCurrency" = $3,
                "paymentMethod" = $4,
                "paymentConfirmationOrigin" = $5,
                "amountCop" = $6,
                "amountUsd" = $7,
                "stripeSessionId" = NULL, "stripePaymentIntentId" = NULL, "stripeChargeId" = NULL, "stripeCustomerId" = NULL,
                "receiptUrl" = NULL, "refundedAmount" = NULL, "refundedAt" = NULL, "lastPaymentError" = NULL,
                "manualPaymentRef" = $8, "manualPaymentEvidence" = $9, "manualPaymentReason" = $10,
                "manualPaymentBy" = $11, "manualPaymentAt" = $12::timestamptz,
                "manualPaymentReceiptKey" = $13, "manualPaymentReceiptName" = $14,
                "manualPaymentReceiptMime" = $15, "manualPaymentReceiptBytes" = $16,
                "lastSyncAt" = NOW(),
                metadata = (COALESCE(metadata, '{}'::jsonb) - 'payment' - 'pendingOrder' - 'substitution')
                    || jsonb_build_object('payment', $17::jsonb, 'substitution', $18::jsonb),
                "updatedAt" = NOW()
            WHERE id = $1 AND "archivedAt" IS NULL AND COALESCE(metadata->'payment'->>'coveredBy', '') = ''
            RETURNING *
        `, [kept.id, k.paidAt, k.chargeCurrency, k.paymentMethod, k.paymentConfirmationOrigin,
            k.amountCop, k.amountUsd,
            m.ref || null, m.evidence || null, m.reason || null, m.by || null, m.at || null,
            m.receiptKey || null, m.receiptName || null, m.receiptMime || null, m.receiptBytes ?? null,
            JSON.stringify(k.payment), JSON.stringify(k.substitution)]);
        if (!r2[0]) throw Object.assign(new Error('El proyecto conservado cambió de estado durante la operación.'), { status: 409 });

        // 3) Auditoría inmutable, dentro de la MISMA transacción: antes y después.
        const ev = (submissionId, type, title, detail, metadata) => client.query(`
            INSERT INTO "ProjectFairEvent" ("submissionId", type, title, detail, "actorId", "actorName", "actorRole", metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [submissionId, type, title, detail, actor.id, actor.name, actor.role, JSON.stringify(metadata)]);
        const off = plan.retired.payment;
        const valor = off.amountCop != null && plan.expected.currency === 'COP'
            ? `$${Number(off.amountCop).toLocaleString('es-CO')} COP` : `US$${Number(off.amountUsd || 0).toLocaleString('en-US')} USD`;
        const refPago = off.stripePaymentIntentId || off.stripeSessionId || off.manualPaymentRef || '—';
        const pagador = plan.payer?.name || plan.payer?.email || 'sin nombre';
        const audit = { fingerprint, checks: plan.checks, retiredStripe: plan.retiredStripe, keptStripe: plan.keptStripe, ledger: plan.ledger, at };
        await ev(retired.id, 'substitution',
            `Archivada — sustituida por ${kept.publicRef}; su pago respalda ahora ese proyecto`,
            `El pago oficial (${valor}, ref. ${refPago}, pagado por ${pagador}) se conserva en esta ficha y respalda la inscripción de ${kept.publicRef} — ${kept.projectName}.\nMotivo: ${reason}`,
            { ...audit, role: 'retired', before: before.retired, after: r1[0] });
        await ev(kept.id, 'substitution',
            `Pago oficial reasignado desde ${retired.publicRef}`,
            `La inscripción queda respaldada por el pago de ${valor} (ref. ${refPago}) hecho por ${pagador} en ${retired.publicRef}, que se archiva. El responsable del proyecto no cambia.\nMotivo: ${reason}`,
            { ...audit, role: 'kept', before: before.kept, after: r2[0] });
        if (plan.replacedPayment.kind !== 'none') {
            const prev = plan.kept.payment;
            await ev(kept.id, 'payment_reclassified',
                'Pago anterior identificado: no respalda la inscripción',
                `${plan.replacedPayment.label}. ${prev.amountReceived != null ? `Importe: ${prev.amountReceived} ${prev.chargeCurrency || ''}. ` : ''}Ref.: ${prev.stripePaymentIntentId || prev.stripeSessionId || prev.manualPaymentRef || '—'}. No se eliminó ni se reembolsó: queda registrado en el historial de esta ficha${plan.replacedPayment.realMoney ? ' y en la Bóveda con su referencia' : ''}.`,
                { classification: plan.replacedPayment, previousPayment: prev, stripe: plan.keptStripe, ledger: plan.ledger.keptMovement });
        }
        await client.query('COMMIT');

        console.log(`[project-fair-admin] Sustitución aplicada: ${retired.publicRef} → ${kept.publicRef} por ${actor.name}`);
        res.json({
            applied: true,
            plan,
            retired: mapRow(r1[0], access),
            kept: mapRow(r2[0], access),
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[project-fair-admin] Sustitución revertida:', err?.message);
        res.status(err?.status || 500).json({ error: `No se aplicó la sustitución: ${err?.message || 'error interno'}. No quedó ningún cambio parcial.` });
    } finally {
        client.release();
    }
}, 'remove');

// ⚠️ EL `export default` VA AL FINAL DEL ARCHIVO, DESPUÉS DE LA ÚLTIMA
// DECLARACIÓN, Y NO A MITAD DE CAMINO. Las rutas lo consumen por defecto
// (`import fair from '...'`), así que un manejador declarado DEBAJO de este
// objeto no entra en él: `fair.loQueSea` queda `undefined` y Express LANZA al
// registrar la ruta —«Route.post() requires a callback function»—, lo que
// tumba el router ENTERO en el primer arranque en frío. Y agregarlo al objeto
// sin moverlo tampoco sirve: la `const` todavía no está inicializada y sería
// un `ReferenceError`. Al final del archivo el problema no puede volver a
// ocurrir. Lo fija `npm run check:route-handlers`.
export default {
    getOverview, listSubmissions, getSubmission, updateSubmission, addComment,
    listTags, createTag, deleteTag, attachTag, detachTag,
    addFile, deleteFile, syncStripe, resendReceipt, confirmManualPayment, updateProjectAmount, manualReceiptUploadUrl, manualReceiptUrl, getPaymentHistory,
    getAlerts, getReports, getIntelligence, getDashboardIntelligence, exportCsv, getCatalog, getSubmissionSnapshot,
    readConvocatoriaConfig, writeConvocatoriaConfig,
    listMasterForms, getMasterForm, downloadMasterFormDocx, reopenMasterForm, lockMasterForm,
    bulkArchive, bulkRestore, bulkDelete, bulkStatus, bulkTag,
    resolveTransfers, sendPaymentReminders,
    verifySubstitution, applySubstitution,
};
