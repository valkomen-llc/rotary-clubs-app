// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas — panel — v4.945.0
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
    RESERVED_SLUGS, normalizeCompletedSlug, normalizeCompletedConfig,
    completedCodePrefixFor, buildDuplicateFlags, buildCompletedSchema,
    SOURCE_LABELS, COMPLETED_SOURCE,
    EMAIL_VARIABLES, defaultNotifySubject, defaultNotifyBody, buildCompletedEmail,
} from '../lib/completedRegistrationSpec.js';
import {
    getCompletedConfig, saveCompletedConfig, slugTakenByOther,
    mapCompleted, findCompleted, findDuplicates, assignCompletedCode,
    eventBrandingFor,
} from '../lib/completedRegistrationStore.js';
import { signedReceiptUrl } from '../lib/completedReceipts.js';
import EmailService from '../services/EmailService.js';
import { sendCompletedConfirmation, PLATFORM_SENDER } from './completedRegistrationController.js';

console.log('[completedRegistrationAdminController] v4.945.0 cargado — tablero, fichas, validación, exportación y la notificación de confirmación (vista previa y prueba).');

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
                clubRoles: clubRoleOptions(config.rolePeriod),
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
    if (clean(query.from, 10)) push('"createdAt" >= @@::date', clean(query.from, 10));
    if (clean(query.to, 10)) push('"createdAt" < (@@::date + interval \'1 day\')', clean(query.to, 10));
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
    'district', 'clubName', 'membershipType', 'clubRole', 'clubRoleOther',
    'eps', 'foodAllergy', 'emergencyName', 'emergencyPhone',
    'paymentMethod', 'comments', 'internalNotes',
];
const FIELD_MAX = {
    firstName: 120, lastName: 120, documentNumber: 60, email: 200, phone: 60,
    district: 60, clubName: 200, membershipType: 30, clubRole: 40, clubRoleOther: 160,
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

export default {
    getConfig, saveConfig,
    list, getSummary, detail,
    changeStatus, update, resend, receiptUrl, checkIn,
    notificationPreview, notificationTest,
    exportCsv, exportXlsx,
};
