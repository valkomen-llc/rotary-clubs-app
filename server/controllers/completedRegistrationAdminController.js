// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas — panel — v4.965.0
//
// La pestaña «Inscripciones completadas» de un evento: configurar el
// formulario público (slug, textos, prefijo del código), el tablero, la
// tabla con filtros, la ficha con el comprobante, las acciones del Equipo de
// Registro y la exportación.
//
// Reglas, heredadas del módulo:
//
// - **Todo se consulta por `eventId`.** Ninguna respuesta mezcla eventos.
// - **Cada cambio deja historial** (`EventRegistrationHistory`): quién, cuándo,
//   estado anterior y estado nuevo. El estado no se escribe sin registrarlo.
// - **El acceso se comprueba en el servidor.** Un administrador de sitio sólo
//   alcanza los eventos de su club; el rol `administrator` los ve todos.
// - **El comprobante se lee con un enlace firmado que caduca** (5 minutos),
//   nunca con una URL pública: es un documento financiero.
// - **Validar o rechazar no mueve dinero.** Acá no hay pasarela: el pago
//   ocurrió por fuera y el equipo sólo deja constancia de su verificación.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import { ensureEventRegistrationSchema } from '../lib/ensureEventRegistrationSchema.js';
import {
    clean, loadEvent, ensureEdition, recordHistory, listHistory, listMessages,
    mapRegistration,
} from '../lib/eventRegistrationStore.js';
import {
    COMPLETED_STATUS_KEYS, COMPLETED_STATUSES, completedStatusMeta,
    ACCREDITABLE_STATUSES, PAYMENT_METHODS, paymentMethodLabel,
    MEMBERSHIP_OPTIONS, membershipLabel, clubRoleOptions, clubRoleLabel,
    GUEST_TYPE_OPTIONS, guestTypeLabel, RETIRED_MEMBERSHIP_LABELS,
    RESERVED_SLUGS, normalizeCompletedSlug, normalizeCompletedConfig,
    completedCodePrefixFor, buildDuplicateFlags, buildCompletedSchema,
    SOURCE_LABELS, COMPLETED_SOURCE, ONLINE_SOURCE, validateCompletedAnswers,
    EMAIL_VARIABLES, defaultNotifySubject, defaultNotifyBody, buildCompletedEmail,
} from '../lib/completedRegistrationSpec.js';
import {
    getCompletedConfig, saveCompletedConfig, slugTakenByOther,
    mapCompleted, findCompleted, findDuplicates, assignCompletedCode, hasSentMessage,
    eventBrandingFor,
} from '../lib/completedRegistrationStore.js';
import { signedReceiptUrl, deleteReceiptObject } from '../lib/completedReceipts.js';
import { rotaryCatalogFor } from '../lib/eventRegistrationSpec.js';
import {
    IMPORT_SOURCE, IMPORT_SOURCE_LABEL, IMPORT_INITIAL_STATUSES, DEFAULT_IMPORT_STATUS,
    isAllowedInitialStatus, IMPORT_MAX_ROWS, parseImportText, importFieldsFor,
    autoMapColumns, assembleRow, suggestClub, classifyDuplicate, rememberRow, newSeen,
    defaultDecisionFor, buildImportSummary, splitImportFindings,
    DEFAULT_DUPLICATE_POLICY, isDuplicatePolicy,
} from '../lib/completedImportSpec.js';
import {
    existingPeopleFor, insertImportBatch, finishImportBatch, markBatchReverted,
    listImportBatches, findImportBatch, listBatchRows,
    insertImportedCompleted, fillExistingCompleted, deleteBatchRow, rowHasMessages,
} from '../lib/completedImportStore.js';
import EmailService from '../services/EmailService.js';
import { sendCompletedConfirmation, PLATFORM_SENDER } from './completedRegistrationController.js';

console.log('[completedRegistrationAdminController] v4.965.0 cargado — tablero, fichas, validación, exportación, acciones en bloque, la notificación de confirmación y el motor de importación de inscripciones históricas.');

// ── Acceso ───────────────────────────────────────────────────────────
// El mismo criterio del panel de inscripciones: el evento tiene que pertenecer
// al sitio de quien consulta, salvo el operador de la plataforma.

const assertEventAccess = async (req, eventRef) => {
    const isPlatformAdmin = req.user?.role === 'administrator';
    const event = await loadEvent(eventRef, isPlatformAdmin ? null : req.user?.clubId);
    if (!event) return null;
    if (!isPlatformAdmin && event.clubId !== req.user?.clubId) return null;
    return event;
};

const actorOf = (req) => ({
    id: req.user?.id || null,
    name: req.user?.name || req.user?.email || 'Equipo',
    email: req.user?.email || null,
});

const requireEvent = async (req, res) => {
    await ensureEventRegistrationSchema();
    const ref = clean(req.query.eventRef || req.body?.eventRef, 200);
    if (!ref) {
        res.status(400).json({ error: 'Falta el evento.' });
        return null;
    }
    const event = await assertEventAccess(req, ref);
    if (!event) {
        res.status(404).json({ error: 'Evento no encontrado' });
        return null;
    }
    return event;
};

/** La fila y su evento, con el acceso ya comprobado. `null` si ya respondió. */
const loadDetail = async (req, res) => {
    await ensureEventRegistrationSchema();
    const row = await findCompleted(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Registro no encontrado' });
        return null;
    }
    const event = await assertEventAccess(req, row.eventId);
    if (!event) {
        // Un registro de un evento ajeno no existe para quien pregunta:
        // confirmar que existe ya es filtrar que existe.
        res.status(404).json({ error: 'Registro no encontrado' });
        return null;
    }
    return { row, event };
};

// ── Configuración ────────────────────────────────────────────────────

// GET /admin/completed/config?eventRef=
export const getConfig = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);

        res.json({
            event: { id: event.id, slug: event.slug, title: event.title },
            config,
            codePrefix: completedCodePrefixFor(config, edition),
            // v4.945 — lo que el panel MUESTRA de la notificación: el remitente
            // real (no se adivina), los predeterminados derivados del evento y
            // el catálogo de variables. La cabecera del correo es la misma
            // «Imagen de cabecera» de esta configuración.
            notification: {
                sender: PLATFORM_SENDER,
                defaultSubject: defaultNotifySubject(event),
                defaultBody: defaultNotifyBody(),
                variables: EMAIL_VARIABLES,
            },
            form: buildCompletedSchema(config),
            catalog: {
                statuses: COMPLETED_STATUSES,
                paymentMethods: PAYMENT_METHODS,
                membership: MEMBERSHIP_OPTIONS,
                // Lo RETIRADO no se ofrece y sí se entiende: sin esto, la
                // ficha de un registro viejo pintaría la clave cruda
                // «sin_club» como si fuera la respuesta (regla v4.708).
                retiredMembership: RETIRED_MEMBERSHIP_LABELS,
                clubRoles: clubRoleOptions(config.rolePeriod),
                // v4.958 — el tipo de invitado ya es un catálogo cerrado: el
                // panel lo pinta con su rótulo y lo ofrece en la edición.
                guestTypes: GUEST_TYPE_OPTIONS,
                sources: SOURCE_LABELS,
            },
        });
    } catch (error) {
        console.error('[completed-registrations][admin] getConfig:', error);
        res.status(500).json({ error: 'No se pudo cargar la configuración' });
    }
};

// PUT /admin/completed/config
export const saveConfig = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const edition = await ensureEdition(event);

        const incoming = normalizeCompletedConfig(req.body?.config || {});
        if (incoming.enabled && !incoming.slug) {
            return res.status(400).json({ error: 'Para activar el formulario escribe su dirección pública (slug).' });
        }
        if (incoming.slug && RESERVED_SLUGS.includes(incoming.slug)) {
            return res.status(400).json({ error: `«/${incoming.slug}» es una ruta del sitio y no puede usarse como formulario.` });
        }
        if (incoming.slug) {
            const taken = await slugTakenByOther(incoming.slug, event.id);
            if (taken) {
                return res.status(409).json({ error: 'Otra edición ya publica esa dirección. Cada formulario necesita un slug propio.' });
            }
        }

        const config = await saveCompletedConfig(event, edition, incoming);
        res.json({ config, codePrefix: completedCodePrefixFor(config, edition) });
    } catch (error) {
        console.error('[completed-registrations][admin] saveConfig:', error);
        res.status(500).json({ error: 'No se pudo guardar la configuración' });
    }
};

// ── Filtros de la tabla ──────────────────────────────────────────────

const buildFilters = (eventId, query) => {
    const where = ['"eventId" = $1'];
    const values = [eventId];
    const push = (sql, value) => { values.push(value); where.push(sql.replace('@@', `$${values.length}`)); };
    const list = (raw) => String(raw || '').split(',').map(v => v.trim()).filter(Boolean);

    if (list(query.status).length) push('status = ANY(@@)', list(query.status));
    if (list(query.method).length) push('"paymentMethod" = ANY(@@)', list(query.method));
    if (list(query.clubRole).length) push('"clubRole" = ANY(@@)', list(query.clubRole));
    if (clean(query.district, 60)) push('lower(district) = lower(@@)', clean(query.district, 60));
    if (clean(query.club, 200)) push('"clubName" ILIKE @@', `%${clean(query.club, 200)}%`);
    // v4.959 — el filtro mira la MISMA fecha que pinta la columna «Fecha»
    // (`submittedAt || createdAt`). Filtrando sólo por `createdAt`, un registro
    // importado con su marca temporal real quedaría fuera del rango en el que
    // se ve — el filtro diría una cosa y la tabla otra.
    if (clean(query.from, 10)) push('COALESCE("submittedAt", "createdAt") >= @@::date', clean(query.from, 10));
    if (clean(query.to, 10)) push('COALESCE("submittedAt", "createdAt") < (@@::date + interval \'1 day\')', clean(query.to, 10));
    if (query.duplicates === 'only') where.push(`(flags->>'hasDuplicates') = 'true'`);

    const search = clean(query.q, 160);
    if (search) {
        values.push(`%${search}%`);
        const p = `$${values.length}`;
        where.push(`(
            "firstName" ILIKE ${p} OR "lastName" ILIKE ${p} OR email ILIKE ${p}
            OR "documentNumber" ILIKE ${p} OR phone ILIKE ${p}
            OR "registrationCode" ILIKE ${p} OR district ILIKE ${p} OR "clubName" ILIKE ${p}
            OR (COALESCE("firstName",'') || ' ' || COALESCE("lastName",'')) ILIKE ${p}
        )`);
    }
    return { where: where.join(' AND '), values };
};

const SORTABLE = {
    createdAt: '"createdAt"', name: '"lastName"', status: 'status',
    method: '"paymentMethod"', code: '"registrationCode"', district: 'district',
};

// GET /admin/completed/list
export const list = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;

        const { where, values } = buildFilters(event.id, req.query);
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const sort = SORTABLE[req.query.sort] || SORTABLE.createdAt;
        const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*)::int AS total FROM "EventCompletedRegistration" WHERE ${where}`, values);
        const { rows } = await db.query(
            `SELECT * FROM "EventCompletedRegistration" WHERE ${where}
             ORDER BY ${sort} ${dir} NULLS LAST
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, offset]);

        res.json({
            event: { id: event.id, slug: event.slug, title: event.title },
            total: countRows[0]?.total || 0,
            limit, offset,
            registrations: rows.map(mapCompleted),
        });
    } catch (error) {
        console.error('[completed-registrations][admin] list:', error);
        res.status(500).json({ error: 'No se pudieron cargar los registros' });
    }
};

// GET /admin/completed/summary
export const getSummary = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;

        const [totals, byDistrict, byClub, byStatus] = await Promise.all([
            db.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
                        COUNT(*) FILTER (WHERE status = 'validated')::int AS validated,
                        COUNT(*) FILTER (WHERE status = 'payment_confirmed')::int AS payment_confirmed,
                        COUNT(*) FILTER (WHERE status = 'needs_correction')::int AS needs_correction,
                        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                        COUNT(*) FILTER (WHERE "paymentMethod" = 'transferencia')::int AS transfers,
                        COUNT(*) FILTER (WHERE "paymentMethod" = 'pasarela_colrotarios')::int AS colrotarios,
                        COUNT(*) FILTER (WHERE "paymentMethod" = 'otro')::int AS other_methods,
                        COUNT(*) FILTER (WHERE (flags->>'hasDuplicates') = 'true')::int AS duplicates,
                        COUNT(*) FILTER (WHERE "checkedInAt" IS NOT NULL)::int AS accredited,
                        COUNT(DISTINCT district) FILTER (WHERE COALESCE(district, '') <> '')::int AS districts,
                        COUNT(DISTINCT lower("clubName")) FILTER (WHERE COALESCE("clubName", '') <> '')::int AS clubs
                 FROM "EventCompletedRegistration" WHERE "eventId" = $1`, [event.id]),
            db.query(`SELECT district, COUNT(*)::int AS total FROM "EventCompletedRegistration"
                      WHERE "eventId" = $1 AND COALESCE(district, '') <> ''
                      GROUP BY district ORDER BY total DESC LIMIT 15`, [event.id]),
            db.query(`SELECT "clubName", COUNT(*)::int AS total FROM "EventCompletedRegistration"
                      WHERE "eventId" = $1 AND COALESCE("clubName", '') <> ''
                      GROUP BY "clubName" ORDER BY total DESC LIMIT 15`, [event.id]),
            db.query(`SELECT status, COUNT(*)::int AS total FROM "EventCompletedRegistration"
                      WHERE "eventId" = $1 GROUP BY status`, [event.id]),
        ]);

        res.json({
            totals: totals.rows[0],
            byDistrict: byDistrict.rows,
            byClub: byClub.rows,
            byStatus: byStatus.rows.map(r => ({ ...r, ...completedStatusMeta(r.status) })),
        });
    } catch (error) {
        console.error('[completed-registrations][admin] getSummary:', error);
        res.status(500).json({ error: 'No se pudo cargar el tablero' });
    }
};

// ── Ficha ────────────────────────────────────────────────────────────

// GET /admin/completed/:id
export const detail = async (req, res) => {
    try {
        const found = await loadDetail(req, res);
        if (!found) return;
        const { row, event } = found;
        const registration = mapCompleted(row);

        // Los duplicados se RECONSULTAN al abrir la ficha: los guardados son
        // la foto del envío, y desde entonces pudo entrar otra inscripción.
        const live = await findDuplicates(event.id, {
            email: registration.email,
            documentNumber: registration.documentNumber,
            excludeId: registration.id,
        });
        const flags = buildDuplicateFlags(live, registration);

        // La inscripción normal relacionada, resumida — es la relación que
        // pidió el módulo: distinguir sin borrar.
        let linked = null;
        if (registration.linkedRegistrationId) {
            const { rows } = await db.query(
                'SELECT * FROM "EventRegistration" WHERE id = $1 AND "eventId" = $2 LIMIT 1',
                [registration.linkedRegistrationId, event.id]);
            if (rows[0]) {
                const r = mapRegistration(rows[0]);
                linked = {
                    id: r.id, code: r.registrationCode || r.publicRef, status: r.status,
                    name: [r.firstName, r.lastName].filter(Boolean).join(' '),
                    categoryLabel: r.categoryLabel,
                };
            }
        }

        const [history, messages] = await Promise.all([
            listHistory(registration.id),
            listMessages(registration.id),
        ]);

        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);

        res.json({
            registration,
            duplicates: flags,
            linked,
            history, messages,
            form: buildCompletedSchema(config),
            event: { id: event.id, slug: event.slug, title: event.title },
        });
    } catch (error) {
        console.error('[completed-registrations][admin] detail:', error);
        res.status(500).json({ error: 'No se pudo cargar el registro' });
    }
};

// PATCH /admin/completed/:id/status
export const changeStatus = async (req, res) => {
    try {
        const found = await loadDetail(req, res);
        if (!found) return;
        const { row, event } = found;

        const next = clean(req.body?.status, 30);
        if (!COMPLETED_STATUS_KEYS.includes(next)) {
            return res.status(400).json({ error: 'Estado no válido.' });
        }
        const comment = clean(req.body?.comment, 2000);
        // Pedir una corrección o rechazar sin decir POR QUÉ deja al equipo
        // —y al participante— adivinando. El motivo es obligatorio ahí.
        if (['needs_correction', 'rejected'].includes(next) && !comment) {
            return res.status(400).json({ error: 'Escribe el motivo: es lo que le llega al equipo y al participante.' });
        }
        if (row.status === next) {
            return res.json({ registration: mapCompleted(row), unchanged: true });
        }

        const { rows } = await db.query(
            `UPDATE "EventCompletedRegistration"
             SET status = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING *`,
            [next, row.id]);

        // Un registro validado sin código no debería existir —el código nace
        // con el envío—, pero si una fila vieja quedó sin él, acá se completa.
        if (ACCREDITABLE_STATUSES.includes(next) && !rows[0].registrationCode) {
            const edition = await ensureEdition(event);
            await assignCompletedCode(rows[0].id, completedCodePrefixFor(getCompletedConfig(edition), edition));
        }

        await recordHistory({
            registrationId: row.id, eventId: event.id, type: 'completed_status_changed',
            fromStatus: row.status, toStatus: next,
            comment: comment || `Cambio manual a "${completedStatusMeta(next).label}"`,
            actor: actorOf(req),
        });

        res.json({ registration: mapCompleted(await findCompleted(row.id)) });
    } catch (error) {
        console.error('[completed-registrations][admin] changeStatus:', error);
        res.status(500).json({ error: 'No se pudo cambiar el estado' });
    }
};

// PATCH /admin/completed/:id — edición de la información por el equipo.
const EDITABLE_FIELDS = [
    'firstName', 'lastName', 'documentNumber', 'email', 'phone',
    'district', 'clubName', 'membershipType', 'clubRole', 'clubRoleOther', 'guestType',
    'eps', 'foodAllergy', 'emergencyName', 'emergencyPhone',
    'paymentMethod', 'comments', 'internalNotes',
];
const FIELD_MAX = {
    firstName: 120, lastName: 120, documentNumber: 60, email: 200, phone: 60,
    district: 60, clubName: 200, membershipType: 30, clubRole: 40, clubRoleOther: 160, guestType: 200,
    eps: 200, foodAllergy: 300, emergencyName: 160, emergencyPhone: 60,
    paymentMethod: 40, comments: 2000, internalNotes: 8000,
};

export const update = async (req, res) => {
    try {
        const found = await loadDetail(req, res);
        if (!found) return;
        const { row, event } = found;
        const registration = mapCompleted(row);

        const body = req.body || {};
        const sets = [];
        const values = [];
        const changed = {};
        for (const key of EDITABLE_FIELDS) {
            if (!(key in body)) continue;
            const next = clean(body[key], FIELD_MAX[key] || 200);
            if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
                return res.status(400).json({ error: 'El correo electrónico no es válido.' });
            }
            if (String(registration[key] ?? '') === next) continue;
            changed[key] = { from: registration[key] ?? '', to: next };
            values.push(key === 'email' ? next.toLowerCase() : next);
            sets.push(`"${key}" = $${values.length}`);
        }
        if (!sets.length) return res.json({ registration, unchanged: true });

        // La foto de `answers` acompaña a las columnas: si el equipo corrige
        // el club, la ficha no puede seguir mostrando el anterior en el
        // desglose por pasos.
        const nextAnswers = { ...registration.answers };
        for (const [key, diff] of Object.entries(changed)) {
            if (key !== 'internalNotes') nextAnswers[key] = diff.to;
        }
        values.push(JSON.stringify(nextAnswers));
        sets.push(`answers = $${values.length}`);

        values.push(row.id);
        const { rows } = await db.query(
            `UPDATE "EventCompletedRegistration" SET ${sets.join(', ')}, "updatedAt" = NOW()
             WHERE id = $${values.length} RETURNING *`, values);

        await recordHistory({
            registrationId: row.id, eventId: event.id, type: 'completed_edited',
            comment: `Editó: ${Object.keys(changed).join(', ')}`,
            actor: actorOf(req), payload: { changed },
        });

        res.json({ registration: mapCompleted(rows[0]) });
    } catch (error) {
        console.error('[completed-registrations][admin] update:', error);
        res.status(500).json({ error: 'No se pudo guardar la edición' });
    }
};

// POST /admin/completed/:id/resend — reenvía la confirmación al participante.
export const resend = async (req, res) => {
    try {
        const found = await loadDetail(req, res);
        if (!found) return;
        const { row, event } = found;

        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);
        const result = await sendCompletedConfirmation(row, event, config, { actorId: req.user?.id || null });
        if (!result.sent) {
            return res.status(502).json({ error: `No se pudo enviar: ${result.error || 'fallo del proveedor de correo'}` });
        }

        await recordHistory({
            registrationId: row.id, eventId: event.id, type: 'message_sent',
            comment: `Reenvió la confirmación a ${row.email}`, actor: actorOf(req),
        });
        res.json({ sent: true, messages: await listMessages(row.id) });
    } catch (error) {
        console.error('[completed-registrations][admin] resend:', error);
        res.status(500).json({ error: 'No se pudo reenviar la confirmación' });
    }
};

// ── La notificación: vista previa y correo de prueba (v4.945) ────────
//
// Las dos corren por la MISMA plantilla que el envío real
// (`buildCompletedEmail`): con dos pipelines, probar no diría nada sobre lo
// que recibe el participante. Aceptan `subject`/`body` como OVERRIDES para
// que el panel pruebe lo que está EN PANTALLA sin obligar a guardar primero.

const SAMPLE_REGISTRATION = (config, edition) => ({
    firstName: 'María', lastName: 'Rodríguez',
    email: 'participante@ejemplo.org',
    registrationCode: `${completedCodePrefixFor(config, edition)}-4K9ZQ`,
});

// POST /admin/completed/notification-preview
export const notificationPreview = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);
        const branding = await eventBrandingFor(event.clubId);

        const { subject, html, text } = buildCompletedEmail({
            config, event, branding,
            registration: SAMPLE_REGISTRATION(config, edition),
            overrides: { subject: clean(req.body?.subject, 300), body: clean(req.body?.body, 4000) },
        });
        res.json({ subject, html, text, from: PLATFORM_SENDER, headerImageUrl: config.headerImageUrl });
    } catch (error) {
        console.error('[completed-registrations][admin] notificationPreview:', error);
        res.status(500).json({ error: 'No se pudo componer la vista previa', detail: error?.message });
    }
};

// POST /admin/completed/notification-test — manda un correo REAL a quien se
// indique, con datos de ejemplo y el asunto marcado «[Prueba]»: probar el
// camino que se va a usar, no otro (regla de v4.857). No toca ningún registro.
export const notificationTest = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const to = clean(req.body?.to, 200);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return res.status(422).json({ error: 'Escribe un correo de destino válido.' });
        }
        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);
        const branding = await eventBrandingFor(event.clubId);

        const { subject, html, text } = buildCompletedEmail({
            config, event, branding,
            registration: SAMPLE_REGISTRATION(config, edition),
            overrides: { subject: clean(req.body?.subject, 300), body: clean(req.body?.body, 4000) },
        });
        const salida = await EmailService.sendPlatformEmail({
            to, from: PLATFORM_SENDER, subject: `[Prueba] ${subject}`, html, text,
        });
        if (salida && salida.success === false) {
            // El motivo del proveedor viaja TEXTUAL: «no se pudo enviar» a
            // secas obliga a diagnosticar a ciegas (regla del CRM, v4.702).
            return res.status(502).json({ error: `El proveedor rechazó el envío: ${salida.error || 'sin motivo'}` });
        }
        res.json({ sent: true, to, messageId: salida?.messageId || null });
    } catch (error) {
        console.error('[completed-registrations][admin] notificationTest:', error);
        res.status(500).json({ error: 'No se pudo enviar el correo de prueba', detail: error?.message });
    }
};

// GET /admin/completed/:id/receipt — enlace firmado, caduca a los 5 minutos.
export const receiptUrl = async (req, res) => {
    try {
        const found = await loadDetail(req, res);
        if (!found) return;
        const { row } = found;
        if (!row.receiptKey) return res.status(404).json({ error: 'Este registro no tiene comprobante' });

        const url = await signedReceiptUrl(row.receiptKey);
        if (!url) return res.status(502).json({ error: 'No se pudo firmar el enlace del comprobante' });
        res.json({ url, name: row.receiptName, mime: row.receiptMime, expiresInSeconds: 300 });
    } catch (error) {
        console.error('[completed-registrations][admin] receiptUrl:', error);
        res.status(500).json({ error: 'No se pudo abrir el comprobante' });
    }
};

// POST /admin/completed/:id/checkin — acreditación del día del evento.
export const checkIn = async (req, res) => {
    try {
        const found = await loadDetail(req, res);
        if (!found) return;
        const { row, event } = found;
        const undo = req.body?.undo === true;
        const actor = actorOf(req);

        if (!undo && !ACCREDITABLE_STATUSES.includes(row.status)) {
            return res.status(409).json({
                error: `No se puede acreditar: el registro está en "${completedStatusMeta(row.status).label}". Valídalo primero.`,
            });
        }

        const { rows } = await db.query(
            `UPDATE "EventCompletedRegistration"
             SET "checkedInAt" = ${undo ? 'NULL' : 'NOW()'}, "checkedInBy" = $1, "updatedAt" = NOW()
             WHERE id = $2 RETURNING *`,
            [undo ? null : actor.name, row.id]);

        await recordHistory({
            registrationId: row.id, eventId: event.id,
            type: undo ? 'checkin_undone' : 'checkin',
            comment: undo
                ? 'Anuló la acreditación del registro completado.'
                : 'Acreditó en la sede a un registro de inscripción completada.',
            actor,
        });

        res.json({ registration: mapCompleted(rows[0]) });
    } catch (error) {
        console.error('[completed-registrations][admin] checkIn:', error);
        res.status(500).json({ error: 'No se pudo registrar la acreditación' });
    }
};

// ── Acciones en bloque (v4.952) ──────────────────────────────────────
//
// Del pedido con el listado delante: seleccionar uno o varios registros y
// actuar sobre la selección. Tres reglas heredadas del sitio: la confirmación
// explícita (`confirm: true` → 428, patrón v4.885); el bloque NO es atómico y
// cada fila reporta su desenlace con su motivo (v4.886) — envolverlo en una
// transacción sería peor: un fallo tiraría abajo cambios que sí ocurrieron—;
// y el alcance se comprueba fila por fila contra el evento del gate: una fila
// de otro evento «no existe» para quien pregunta (v4.932).

const BULK_MAX = 500;

/** El gate común de las tres acciones. `null` si ya respondió. */
const bulkScopeFor = async (req, res) => {
    const event = await requireEvent(req, res);
    if (!event) return null;
    const ids = Array.isArray(req.body?.ids)
        ? [...new Set(req.body.ids.map(v => clean(v, 80)).filter(Boolean))]
        : [];
    if (!ids.length) {
        res.status(400).json({ error: 'No hay registros seleccionados.' });
        return null;
    }
    if (ids.length > BULK_MAX) {
        res.status(413).json({ error: `Máximo ${BULK_MAX} registros por acción en bloque.` });
        return null;
    }
    if (req.body?.confirm !== true) {
        res.status(428).json({
            error: 'La acción en bloque exige confirmación explícita.',
            requiresConfirmation: true, count: ids.length,
        });
        return null;
    }
    return { event, ids };
};

/** La fila, SÓLO si es de este evento. Una ajena no existe para quien pregunta. */
const bulkRowOf = async (id, event) => {
    const row = await findCompleted(id);
    return row && row.eventId === event.id ? row : null;
};

// POST /admin/completed/bulk-status — mover la selección a otro estado.
export const bulkStatus = async (req, res) => {
    try {
        const scope = await bulkScopeFor(req, res);
        if (!scope) return;
        const { event, ids } = scope;

        const next = clean(req.body?.status, 30);
        if (!COMPLETED_STATUS_KEYS.includes(next)) {
            return res.status(400).json({ error: 'Estado no válido.' });
        }
        const comment = clean(req.body?.comment, 2000);
        // La misma regla del cambio de a uno: pedir corrección o rechazar sin
        // decir POR QUÉ deja al equipo —y al participante— adivinando.
        if (['needs_correction', 'rejected'].includes(next) && !comment) {
            return res.status(400).json({ error: 'Escribe el motivo: es lo que le llega al equipo y al participante.' });
        }

        // El prefijo del código se resuelve UNA vez, no por fila.
        const edition = await ensureEdition(event);
        const codePrefix = completedCodePrefixFor(getCompletedConfig(edition), edition);
        const actor = actorOf(req);
        const outcomes = [];
        for (const id of ids) {
            try {
                const row = await bulkRowOf(id, event);
                if (!row) { outcomes.push({ id, outcome: 'no_existe' }); continue; }
                if (row.status === next) { outcomes.push({ id, outcome: 'sin_cambio' }); continue; }

                const { rows } = await db.query(
                    `UPDATE "EventCompletedRegistration"
                     SET status = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING *`,
                    [next, row.id]);
                if (ACCREDITABLE_STATUSES.includes(next) && !rows[0].registrationCode) {
                    await assignCompletedCode(rows[0].id, codePrefix);
                }
                await recordHistory({
                    registrationId: row.id, eventId: event.id, type: 'completed_status_changed',
                    fromStatus: row.status, toStatus: next,
                    comment: comment || `Cambio en bloque a "${completedStatusMeta(next).label}"`,
                    actor, payload: { bulk: true },
                });
                outcomes.push({ id, outcome: 'cambiada' });
            } catch (e) {
                console.error('[completed-registrations][admin] bulkStatus fila:', e);
                outcomes.push({ id, outcome: 'error', reason: e?.message || 'Fallo al actualizar' });
            }
        }
        res.json({
            outcomes,
            totals: {
                cambiadas: outcomes.filter(o => o.outcome === 'cambiada').length,
                sinCambio: outcomes.filter(o => o.outcome === 'sin_cambio').length,
                noEncontradas: outcomes.filter(o => o.outcome === 'no_existe').length,
                errores: outcomes.filter(o => o.outcome === 'error').length,
            },
        });
    } catch (error) {
        console.error('[completed-registrations][admin] bulkStatus:', error);
        res.status(500).json({ error: 'No se pudo cambiar el estado en bloque' });
    }
};

// POST /admin/completed/bulk-edit — UN campo, UN valor, aplicado a la selección.
//
// El catálogo es MÁS estrecho que el de la edición de a uno, a propósito: los
// campos de IDENTIDAD (nombre, documento, correo, teléfono, emergencia) no
// pueden recibir el mismo valor en veinte personas — sería la forma más rápida
// de destruir datos—. Lo que sí se corrige en bloque es lo COMPARTIDO: el
// distrito, el club, el vínculo, el cargo, el método de pago, la EPS y las
// notas internas. Es el caso real de la limpieza tras una importación.
const BULK_EDITABLE = [
    'district', 'clubName', 'membershipType', 'clubRole', 'clubRoleOther',
    'guestType', 'eps', 'foodAllergy', 'paymentMethod', 'internalNotes',
];

export const bulkEdit = async (req, res) => {
    try {
        const scope = await bulkScopeFor(req, res);
        if (!scope) return;
        const { event, ids } = scope;

        const field = clean(req.body?.field, 40);
        if (!BULK_EDITABLE.includes(field)) {
            return res.status(400).json({ error: 'Ese campo no se puede editar en bloque.' });
        }
        const value = clean(req.body?.value, FIELD_MAX[field] || 200);

        const actor = actorOf(req);
        const outcomes = [];
        for (const id of ids) {
            try {
                const row = await bulkRowOf(id, event);
                if (!row) { outcomes.push({ id, outcome: 'no_existe' }); continue; }
                if (String(row[field] ?? '') === value) { outcomes.push({ id, outcome: 'sin_cambio' }); continue; }

                // La foto de `answers` acompaña a la columna (regla de `update`):
                // la ficha no puede seguir mostrando el valor anterior por pasos.
                const nextAnswers = { ...(mapCompleted(row).answers || {}) };
                if (field !== 'internalNotes') nextAnswers[field] = value;
                await db.query(
                    `UPDATE "EventCompletedRegistration"
                     SET "${field}" = $1, answers = $2, "updatedAt" = NOW() WHERE id = $3`,
                    [value, JSON.stringify(nextAnswers), row.id]);
                await recordHistory({
                    registrationId: row.id, eventId: event.id, type: 'completed_edited',
                    comment: `Edición en bloque: ${field}`,
                    actor, payload: { bulk: true, changed: { [field]: { from: row[field] ?? '', to: value } } },
                });
                outcomes.push({ id, outcome: 'editada' });
            } catch (e) {
                console.error('[completed-registrations][admin] bulkEdit fila:', e);
                outcomes.push({ id, outcome: 'error', reason: e?.message || 'Fallo al editar' });
            }
        }
        res.json({
            outcomes,
            totals: {
                editadas: outcomes.filter(o => o.outcome === 'editada').length,
                sinCambio: outcomes.filter(o => o.outcome === 'sin_cambio').length,
                noEncontradas: outcomes.filter(o => o.outcome === 'no_existe').length,
                errores: outcomes.filter(o => o.outcome === 'error').length,
            },
        });
    } catch (error) {
        console.error('[completed-registrations][admin] bulkEdit:', error);
        res.status(500).json({ error: 'No se pudo editar en bloque' });
    }
};

// POST /admin/completed/bulk-notify — enviar la confirmación a la selección.
//
// ⚠️ v4.965 — CORRE POR LA MISMA `sendCompletedConfirmation` que el envío
// automático y que el reenvío de a uno. Un segundo camino de correo se separa
// en silencio y dejaría estos envíos fuera del historial del participante,
// que es justo donde alguien los va a buscar cuando digan que no llegó.
//
// Va SIN `auto`, a propósito: el candado de «ya se le envió» frena el disparo
// automático (v4.945), no un acto que una persona pide con nombre y apellido.
// Quien no quiera repetirle a nadie usa `soloFaltantes`, que es el valor por
// defecto de la pantalla.
//
// El PRESUPUESTO DE TIEMPO no es opcional: cada correo es una llamada al
// proveedor y doscientos setenta no entran en una invocación (300 s en
// `vercel.json`). Se atiende lo que quepa y se DEVUELVE lo que falta
// (`pendientes`), como el barrido del Creador de Reels y el commit de la
// importación; el navegador vuelve a pedir hasta terminar. Cortar en silencio
// se leería como «ya se le envió a todos».
const NOTIFY_BUDGET_MS = 60_000;

export const bulkNotify = async (req, res) => {
    try {
        const scope = await bulkScopeFor(req, res);
        if (!scope) return;
        const { event, ids } = scope;
        const soloFaltantes = req.body?.soloFaltantes !== false;

        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);
        const actor = actorOf(req);
        const arranque = Date.now();

        const resultados = [];
        const pendientes = [];
        for (const id of ids) {
            if (Date.now() - arranque > NOTIFY_BUDGET_MS) { pendientes.push(id); continue; }

            const row = await bulkRowOf(id, event);
            if (!row) { resultados.push({ id, resultado: 'no_existe' }); continue; }
            const quien = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.email;
            if (!clean(row.email, 200)) {
                resultados.push({ id, nombre: quien, resultado: 'omitida', motivo: 'sin_correo' });
                continue;
            }
            if (soloFaltantes && await hasSentMessage(row.id, 'completed_confirmation')) {
                resultados.push({ id, nombre: quien, resultado: 'omitida', motivo: 'ya_recibio' });
                continue;
            }

            const envio = await sendCompletedConfirmation(row, event, config, { actorId: actor.id });
            if (!envio.sent) {
                // El motivo del proveedor viaja TEXTUAL: convertirlo en «no se
                // pudo enviar» deja a quien corrige sin saber qué pasó.
                resultados.push({
                    id, nombre: quien, resultado: 'fallida',
                    motivo: envio.error || 'fallo del proveedor de correo',
                });
                continue;
            }
            await recordHistory({
                registrationId: row.id, eventId: event.id, type: 'message_sent',
                comment: `Envió la confirmación a ${row.email} (envío en bloque)`, actor,
            });
            resultados.push({ id, nombre: quien, resultado: 'enviada' });
        }

        const cuenta = (r) => resultados.filter(x => x.resultado === r).length;
        res.json({
            enviadas: cuenta('enviada'),
            omitidas: cuenta('omitida'),
            fallidas: cuenta('fallida'),
            noExisten: cuenta('no_existe'),
            pendientes,
            resultados,
        });
    } catch (error) {
        console.error('[completed-registrations][admin] bulkNotify:', error);
        res.status(500).json({ error: 'No se pudo enviar la confirmación en bloque', detail: error?.message });
    }
};

// POST /admin/completed/bulk-delete — eliminar la selección.
//
// Una fila ACREDITADA se CONSERVA y se nombra con su motivo (la regla de la
// reversión de importaciones): la acreditación registra un hecho físico — esa
// persona entró a la sede— y borrarlo en bloque lo perdería en silencio. Para
// eliminarla hay que anular primero su acreditación en la ficha, a propósito.
// El comprobante de S3 se quita ANTES que la fila (regla de la Librería,
// v4.740) y su fallo no detiene el borrado; el rastro queda en el historial,
// que sobrevive a la fila.
export const bulkDelete = async (req, res) => {
    try {
        const scope = await bulkScopeFor(req, res);
        if (!scope) return;
        const { event, ids } = scope;

        const actor = actorOf(req);
        const outcomes = [];
        const conservadas = [];
        for (const id of ids) {
            try {
                const row = await bulkRowOf(id, event);
                if (!row) { outcomes.push({ id, outcome: 'no_existe' }); continue; }
                if (row.checkedInAt) {
                    conservadas.push({
                        id, code: row.registrationCode || null,
                        name: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
                        motivo: 'ya_acreditada',
                    });
                    outcomes.push({ id, outcome: 'conservada', motivo: 'ya_acreditada' });
                    continue;
                }
                if (row.receiptKey) await deleteReceiptObject(row.receiptKey);
                await db.query(
                    `DELETE FROM "EventCompletedRegistration" WHERE id = $1 AND "eventId" = $2`,
                    [row.id, event.id]);
                await recordHistory({
                    registrationId: row.id, eventId: event.id, type: 'completed_deleted',
                    comment: `Eliminó el registro ${row.registrationCode || row.id} (${`${row.firstName || ''} ${row.lastName || ''}`.trim() || row.email}) en una acción en bloque.`,
                    actor, payload: { bulk: true, email: row.email, source: row.registrationSource },
                });
                outcomes.push({ id, outcome: 'borrada' });
            } catch (e) {
                console.error('[completed-registrations][admin] bulkDelete fila:', e);
                outcomes.push({ id, outcome: 'error', reason: e?.message || 'Fallo al eliminar' });
            }
        }
        res.json({
            outcomes, conservadas,
            totals: {
                borradas: outcomes.filter(o => o.outcome === 'borrada').length,
                conservadas: conservadas.length,
                noEncontradas: outcomes.filter(o => o.outcome === 'no_existe').length,
                errores: outcomes.filter(o => o.outcome === 'error').length,
            },
        });
    } catch (error) {
        console.error('[completed-registrations][admin] bulkDelete:', error);
        res.status(500).json({ error: 'No se pudo eliminar en bloque' });
    }
};

// ── Exportación ──────────────────────────────────────────────────────

const roleForExport = (r) => (r.clubRole === 'otro_cargo'
    ? (r.clubRoleOther || 'Otro cargo asignado')
    : clubRoleLabel(r.clubRole));

const EXPORT_COLUMNS = [
    ['Código', r => r.registrationCode || ''],
    ['Nombre', r => r.firstName],
    ['Apellido', r => r.lastName],
    ['Documento', r => r.documentNumber],
    ['Correo', r => r.email],
    ['Teléfono / WhatsApp', r => r.phone],
    ['Distrito', r => r.district],
    ['Club', r => r.clubName],
    ['Vínculo', r => membershipLabel(r.membershipType)],
    ['Cargo 2026-2027', r => roleForExport(r)],
    ['Si es invitado (opción)', r => guestTypeLabel(r.guestType)],
    ['EPS', r => r.eps],
    ['Alergia alimentaria', r => r.foodAllergy],
    ['Contacto de emergencia', r => r.emergencyName],
    ['Teléfono de emergencia', r => r.emergencyPhone],
    ['Método de pago', r => paymentMethodLabel(r.paymentMethod)],
    ['Comprobante', r => (r.hasReceipt ? (r.receiptName || 'Sí') : 'No')],
    ['Comentarios', r => r.comments || ''],
    ['Estado', r => completedStatusMeta(r.status).label],
    ['Fuente', r => SOURCE_LABELS[r.registrationSource] || SOURCE_LABELS[COMPLETED_SOURCE]],
    ['Posible duplicado', r => (r.flags?.hasDuplicates ? 'Sí' : 'No')],
    ['Acreditado el', r => (r.checkedInAt ? new Date(r.checkedInAt).toISOString() : '')],
    ['Enviado el', r => (r.submittedAt ? new Date(r.submittedAt).toISOString() : '')],
];

const fetchForExport = async (event, query) => {
    const { where, values } = buildFilters(event.id, query);
    const { rows } = await db.query(
        `SELECT * FROM "EventCompletedRegistration" WHERE ${where}
         ORDER BY "createdAt" DESC LIMIT 20000`, values);
    return rows.map(mapCompleted);
};

// GET /admin/completed/export.csv
export const exportCsv = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const rows = await fetchForExport(event, req.query);

        const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const lines = [
            EXPORT_COLUMNS.map(([label]) => escape(label)).join(','),
            ...rows.map(r => EXPORT_COLUMNS.map(([, get]) => escape(get(r))).join(',')),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="inscripciones-completadas-${event.slug || event.id}.csv"`);
        // BOM para que Excel abra los acentos bien.
        res.send('﻿' + lines.join('\n'));
    } catch (error) {
        console.error('[completed-registrations][admin] exportCsv:', error);
        res.status(500).json({ error: 'No se pudo exportar' });
    }
};

// GET /admin/completed/export.xlsx
export const exportXlsx = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const rows = await fetchForExport(event, req.query);

        const xlsxModule = await import('xlsx');
        const XLSX = xlsxModule.utils ? xlsxModule : xlsxModule.default;
        const book = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([
            EXPORT_COLUMNS.map(([label]) => label),
            ...rows.map(r => EXPORT_COLUMNS.map(([, get]) => get(r))),
        ]);
        XLSX.utils.book_append_sheet(book, sheet, 'Inscripciones completadas');

        const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="inscripciones-completadas-${event.slug || event.id}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('[completed-registrations][admin] exportXlsx:', error);
        res.status(500).json({ error: 'No se pudo exportar a Excel' });
    }
};

// ════════════════════════════════════════════════════════════════════
// El motor de importación de inscripciones históricas (v4.950)
//
// Migra a esta misma tabla los registros capturados en el sistema anterior.
// El TEXTO del archivo viaja en el cuerpo y se parsea acá con el criterio puro
// —el mismo en la inspección, la validación y el commit: lo que se importa es
// lo que se previsualizó—. Nada se importa en la inspección ni en la
// validación; el commit exige `confirm: true` (patrón v4.885) y deja el lote
// escrito ANTES de crear la primera fila.
// ════════════════════════════════════════════════════════════════════

const IMPORT_TEXT_MAX = 5 * 1024 * 1024; // ~5 MB de texto: miles de filas de sobra.

const importContextFor = (edition, config) => ({
    fields: importFieldsFor(config),
    catalogs: { districts: rotaryCatalogFor(edition.settings) },
});

const sanitizeMapping = (raw, headers, fields) => {
    const allowed = new Set([...fields.map(f => f.key), 'omit', 'extra']);
    const mapping = {};
    headers.forEach((_, i) => {
        const dest = raw?.[i] ?? raw?.[String(i)];
        mapping[i] = allowed.has(dest) ? dest : null;
    });
    return mapping;
};

/** Parse + mapeo + normalización + validación + duplicados, para TODO el archivo. */
const preflightRows = async (event, edition, config, body) => {
    const text = String(body?.text || '');
    if (!text.trim()) return { error: 'No llegó ningún contenido para importar.' };
    if (text.length > IMPORT_TEXT_MAX) return { error: 'El archivo es demasiado grande para este motor (máximo ~5 MB de texto).' };

    const { fields, catalogs } = importContextFor(edition, config);
    const parsed = parseImportText(text, fields);
    if (!parsed.rows.length) return { error: 'No se detectó ninguna fila con datos.' };
    if (parsed.rows.length > IMPORT_MAX_ROWS) {
        return { error: `El archivo trae ${parsed.rows.length} filas y el máximo por lote es ${IMPORT_MAX_ROWS}. Pártelo y cárgalo por partes.` };
    }

    const mapping = body?.mapping
        ? sanitizeMapping(body.mapping, parsed.headers, fields)
        : autoMapColumns(parsed.headers, fields);
    const edits = body?.edits && typeof body.edits === 'object' ? body.edits : {};
    const fieldKeys = new Set(fields.map(f => f.key));
    const options = {
        defaultPaymentMethod: PAYMENT_METHODS.some(m => m.value === body?.options?.defaultPaymentMethod)
            ? body.options.defaultPaymentMethod : '',
        // v4.959 — la marca temporal del archivo es hora de PARED de quien
        // llenó el formulario: se interpreta en la zona de la EDICIÓN, no en
        // la del servidor (que corre en UTC).
        timeZone: clean(edition?.timezone, 60) || 'America/Bogota',
    };

    // El universo de duplicados se trae UNA vez para todo el archivo.
    const existing = await existingPeopleFor(event.id);
    const seen = newSeen();

    const rows = parsed.rows.map((cells, idx) => {
        const n = idx + 1; // número de FILA DE DATOS, 1-based (así se reporta)
        const assembled = assembleRow(parsed.headers, cells, mapping, fields, options);
        const rowEdits = edits[n] || edits[String(n)] || {};
        for (const [key, value] of Object.entries(rowEdits)) {
            if (fieldKeys.has(key)) assembled.answers[key] = String(value ?? '').trim();
        }
        const verdict = validateCompletedAnswers(config, assembled.answers, catalogs);
        // v4.960 — El mismo veredicto del formulario, repartido: lo que impide
        // importar (la fila no identifica a nadie) y lo que sólo se avisa.
        const { errores, avisos } = splitImportFindings(verdict.errors, assembled.answers);
        const clubSuggestion = avisos.clubName || !assembled.answers.clubName
            ? null
            : suggestClub(assembled.answers.district, assembled.answers.clubName, catalogs);
        const duplicate = classifyDuplicate(assembled.answers, existing, seen);
        rememberRow(seen, assembled.answers, n);
        return {
            n,
            answers: assembled.answers,
            receiptUrl: assembled.receiptUrl,
            submittedAt: assembled.submittedAt,
            extra: assembled.extra,
            notes: assembled.notes,
            errors: errores,
            avisos,
            clubSuggestion,
            duplicate: {
                kind: duplicate.kind,
                matches: duplicate.matches.slice(0, 5).map(m => ({
                    id: m.id || null, source: m.source || null,
                    code: m.registrationCode || null,
                    name: [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || m.name || '',
                    status: m.status || null, reason: m.reason,
                })),
            },
        };
    });

    // v4.962 — La política de duplicados del lote: la elige quien importa y su
    // valor por defecto es crearlos (marcados). Viaja resuelta al navegador.
    const duplicatePolicy = isDuplicatePolicy(body?.options?.duplicatePolicy)
        ? body.options.duplicatePolicy : DEFAULT_DUPLICATE_POLICY;

    return {
        parsed, mapping, rows, duplicatePolicy,
        summary: buildImportSummary(rows, { duplicatePolicy }),
    };
};

// POST /admin/completed/import/inspect — paso 1: mirar el archivo. No importa nada.
export const importInspect = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);
        const { fields } = importContextFor(edition, config);

        const text = String(req.body?.text || '');
        if (!text.trim()) return res.status(400).json({ error: 'No llegó ningún contenido para importar.' });
        if (text.length > IMPORT_TEXT_MAX) return res.status(400).json({ error: 'El archivo es demasiado grande para este motor (máximo ~5 MB de texto).' });

        const parsed = parseImportText(text, fields);
        const sample = (i) => {
            const withValue = parsed.rows.find(r => String(r[i] || '').trim() !== '');
            return withValue ? String(withValue[i]).slice(0, 120) : '';
        };
        res.json({
            delimiter: parsed.delimiter === '\t' ? 'tab' : parsed.delimiter,
            headerDetected: parsed.headerDetected,
            emptyDropped: parsed.emptyDropped,
            rowCount: parsed.rows.length,
            columnCount: parsed.headers.length,
            maxRows: IMPORT_MAX_ROWS,
            columns: parsed.headers.map((name, i) => ({ index: i, name, sample: sample(i) })),
            preview: parsed.rows.slice(0, 5),
            fields,
            autoMapping: autoMapColumns(parsed.headers, fields),
            initialStatuses: IMPORT_INITIAL_STATUSES.map(k => completedStatusMeta(k)),
            defaultStatus: DEFAULT_IMPORT_STATUS,
            paymentMethods: PAYMENT_METHODS,
        });
    } catch (error) {
        console.error('[completed-import] inspect:', error);
        res.status(500).json({ error: 'No se pudo inspeccionar el archivo', detail: error?.message });
    }
};

// POST /admin/completed/import/preflight — pasos 3-5: valida, normaliza y
// clasifica duplicados. Sigue sin importar nada.
export const importPreflight = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);
        const result = await preflightRows(event, edition, config, req.body);
        if (result.error) return res.status(400).json({ error: result.error });
        res.json({
            summary: result.summary,
            duplicatePolicy: result.duplicatePolicy,
            rows: result.rows.map(r => ({
                ...r, defaultDecision: defaultDecisionFor(r, { duplicatePolicy: result.duplicatePolicy }),
            })),
            mapping: result.mapping,
            headers: result.parsed.headers,
        });
    } catch (error) {
        console.error('[completed-import] preflight:', error);
        res.status(500).json({ error: 'No se pudo validar el archivo', detail: error?.message });
    }
};

const IMPORT_DECISIONS = new Set(['importar', 'omitir', 'nuevo', 'completar']);

// POST /admin/completed/import/commit — paso 6: crea los registros.
export const importCommit = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        // La confirmación explícita: crea decenas de registros y no se deshace
        // pulsando «atrás» (patrón del desembolso, v4.885).
        if (req.body?.confirm !== true) {
            return res.status(428).json({ error: 'Falta la confirmación explícita (confirm: true).' });
        }
        const edition = await ensureEdition(event);
        const config = getCompletedConfig(edition);

        const initialStatus = isAllowedInitialStatus(req.body?.initialStatus)
            ? req.body.initialStatus : DEFAULT_IMPORT_STATUS;

        const result = await preflightRows(event, edition, config, req.body);
        if (result.error) return res.status(400).json({ error: result.error });

        const decisions = req.body?.decisions && typeof req.body.decisions === 'object' ? req.body.decisions : {};
        const actor = actorOf(req);
        const fileName = clean(req.body?.fileName, 300);

        // El lote primero: si esto muere a mitad, queda el rastro (v4.669).
        const batch = await insertImportBatch({
            eventId: event.id, clubId: event.clubId, fileName,
            initialStatus, createdBy: actor.id, createdByName: actor.name,
        });

        const outcomes = [];
        const totals = {
            detectadas: result.rows.length, importadas: 0, completadas: 0,
            omitidas: 0, errores: 0, duplicados: 0, conAvisos: 0,
            // ⚠️ v4.961 — `duplicados` cuenta los duplicados que el lote VIO,
            // se hayan importado o no. Para explicar por qué se crearon menos
            // registros que filas trae el archivo hace falta el otro número:
            // cuántos se dejaron FUERA por serlo. Presentar el primero como el
            // segundo sería afirmar algo que no se midió.
            duplicadosOmitidos: 0,
        };

        for (const row of result.rows) {
            const asked = decisions[row.n] ?? decisions[String(row.n)];
            const decision = IMPORT_DECISIONS.has(asked)
                ? asked
                : defaultDecisionFor(row, { duplicatePolicy: result.duplicatePolicy });
            const hasErrors = Object.keys(row.errors).length > 0;

            // v4.960 — Lo único que impide importar es que la fila no
            // identifique a nadie. Lo que FALTA viaja como aviso: un inscrito
            // que no terminó de llenar el formulario del sistema anterior sigue
            // siendo un inscrito que va a asistir.
            if (hasErrors) {
                totals.errores++;
                outcomes.push({ n: row.n, outcome: 'omitida', motivo: 'fila_sin_persona', errors: row.errors });
                continue;
            }
            if (decision === 'omitir') {
                totals.omitidas++;
                if (row.duplicate.kind !== 'nuevo') { totals.duplicados++; totals.duplicadosOmitidos++; }
                outcomes.push({ n: row.n, outcome: 'omitida', motivo: row.duplicate.kind !== 'nuevo' ? `duplicado_${row.duplicate.kind}` : 'omitida_a_mano' });
                continue;
            }
            if (decision === 'completar') {
                // Rellenar SÓLO vacíos de un registro COMPLETADO existente;
                // una inscripción en línea no se toca desde acá.
                const target = row.duplicate.matches.find(m => m.id && m.source !== ONLINE_SOURCE);
                if (!target) {
                    totals.omitidas++;
                    outcomes.push({ n: row.n, outcome: 'omitida', motivo: 'sin_registro_completado_que_completar' });
                    continue;
                }
                const existingRow = await findCompleted(target.id);
                if (!existingRow || existingRow.eventId !== event.id) {
                    totals.omitidas++;
                    outcomes.push({ n: row.n, outcome: 'omitida', motivo: 'registro_existente_no_encontrado' });
                    continue;
                }
                const filled = await fillExistingCompleted(existingRow, row.answers);
                totals.completadas++;
                await recordHistory({
                    registrationId: existingRow.id, eventId: event.id, type: 'import_filled',
                    comment: `Importación histórica (lote ${batch.id}, fila ${row.n}): completó ${filled.length ? filled.join(', ') : 'ningún campo (nada estaba vacío)'}.`,
                    actor, payload: { batchId: batch.id, sourceRow: row.n, filled },
                });
                outcomes.push({ n: row.n, outcome: 'completada', id: existingRow.id, filled });
                continue;
            }

            // decision importar / nuevo → crear la fila
            try {
                const flags = row.duplicate.kind !== 'nuevo'
                    ? {
                        hasDuplicates: true,
                        duplicates: row.duplicate.matches.map(m => ({
                            id: m.id, source: m.source, code: m.code, name: m.name,
                            status: m.status, match: m.reason,
                        })),
                    }
                    : {};
                const created = await insertImportedCompleted({
                    eventId: event.id, clubId: event.clubId,
                    ...row.answers, answers: row.answers, flags,
                }, {
                    status: initialStatus, batchId: batch.id,
                    // v4.959 — la fecha del registro sale del archivo cuando
                    // viene y se pudo leer; si no, la fila queda con la de la
                    // importación (`NOW()` en el INSERT).
                    submittedAt: row.submittedAt || null,
                    meta: {
                        fileName: fileName || null, sourceRow: row.n,
                        importedBy: actor.name, importedById: actor.id,
                        receiptUrl: row.receiptUrl || null,
                        submittedAt: row.submittedAt || null,
                        extra: Object.keys(row.extra).length ? row.extra : undefined,
                        notes: row.notes.length ? row.notes : undefined,
                        // Qué le faltaba a esta fila al importarla queda
                        // escrito: sin eso, «¿por qué este registro no tiene
                        // correo?» no se puede contestar dentro de un año.
                        avisos: Object.keys(row.avisos || {}).length ? row.avisos : undefined,
                    },
                });
                const code = await assignCompletedCode(created.id, completedCodePrefixFor(config, edition));
                await recordHistory({
                    registrationId: created.id, eventId: event.id, type: 'imported',
                    toStatus: initialStatus,
                    comment: `Importación histórica (lote ${batch.id}, fila ${row.n}${fileName ? `, archivo ${fileName}` : ''}).`,
                    actor, payload: { batchId: batch.id, sourceRow: row.n },
                });
                totals.importadas++;
                if (row.duplicate.kind !== 'nuevo') totals.duplicados++;
                const faltantes = Object.keys(row.avisos || {});
                if (faltantes.length) totals.conAvisos++;
                outcomes.push({
                    n: row.n, outcome: 'importada', id: created.id, code,
                    avisos: faltantes.length ? faltantes.length : undefined,
                });
            } catch (error) {
                // El lote NO es atómico y se dice (v4.886): las filas que ya
                // entraron son registros reales; la que falló se nombra.
                console.error('[completed-import] fila', row.n, error);
                totals.errores++;
                outcomes.push({ n: row.n, outcome: 'omitida', motivo: 'error_al_insertar', detail: error?.message });
            }
        }

        const finished = await finishImportBatch(batch.id, totals);
        res.status(201).json({ batch: finished || batch, totals, outcomes });
    } catch (error) {
        console.error('[completed-import] commit:', error);
        res.status(500).json({ error: 'No se pudo importar el lote', detail: error?.message });
    }
};

// GET /admin/completed/import/batches?eventRef= — el historial de importaciones.
export const importBatches = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        res.json({ batches: await listImportBatches(event.id), sourceLabel: IMPORT_SOURCE_LABEL });
    } catch (error) {
        console.error('[completed-import] batches:', error);
        res.status(500).json({ error: 'No se pudo cargar el historial de importaciones' });
    }
};

// GET /admin/completed/import/batches/:batchId?eventRef= — el detalle de un lote.
export const importBatchDetail = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const batch = await findImportBatch(req.params.batchId, event.id);
        if (!batch) return res.status(404).json({ error: 'Lote no encontrado' });
        const rows = await listBatchRows(batch.id, event.id);
        res.json({ batch, rows });
    } catch (error) {
        console.error('[completed-import] batch detail:', error);
        res.status(500).json({ error: 'No se pudo cargar el lote' });
    }
};

// POST /admin/completed/import/batches/:batchId/revert — la reversión.
//
// Sólo borra filas del lote que sigan INTACTAS: en su estado inicial, sin
// acreditar y sin comunicaciones registradas. Lo que cambió desde la
// importación se conserva y se NOMBRA — un borrado silencioso de un registro
// tocado por una persona sería peor que dejar el lote a medias.
export const importRevert = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        if (req.body?.confirm !== true) {
            return res.status(428).json({ error: 'La reversión exige confirmación explícita (confirm: true).' });
        }
        const batch = await findImportBatch(req.params.batchId, event.id);
        if (!batch) return res.status(404).json({ error: 'Lote no encontrado' });
        if (batch.status === 'reverted') {
            return res.status(409).json({ error: 'Este lote ya fue revertido.' });
        }

        const rows = await listBatchRows(batch.id, event.id);
        const actor = actorOf(req);
        let borradas = 0;
        const conservadas = [];
        for (const row of rows) {
            let motivo = null;
            if (row.checkedInAt) motivo = 'ya_acreditada';
            else if (row.status !== batch.initialStatus) motivo = `estado_cambiado_${row.status}`;
            else if (await rowHasMessages(row.id)) motivo = 'con_comunicaciones';
            if (motivo) {
                conservadas.push({ id: row.id, code: row.registrationCode, motivo });
                continue;
            }
            if (await deleteBatchRow(row.id, batch.id)) borradas++;
        }

        const totals = { ...(typeof batch.totals === 'object' && batch.totals ? batch.totals : {}), revertidas: borradas, conservadas: conservadas.length };
        const updated = await markBatchReverted(batch.id, totals);
        res.json({ batch: updated, borradas, conservadas, actor: actor.name });
    } catch (error) {
        console.error('[completed-import] revert:', error);
        res.status(500).json({ error: 'No se pudo revertir el lote', detail: error?.message });
    }
};

export default {
    getConfig, saveConfig,
    list, getSummary, detail,
    changeStatus, update, resend, receiptUrl, checkIn,
    bulkStatus, bulkEdit, bulkDelete,
    notificationPreview, notificationTest,
    exportCsv, exportXlsx,
    bulkNotify,
    importInspect, importPreflight, importCommit,
    importBatches, importBatchDetail, importRevert,
};
