// ════════════════════════════════════════════════════════════════════
// Gestión de Inscripciones del Evento — panel — v4.648.0
//
// El otro lado del módulo: configurar la edición y sus categorías, ver el
// tablero, filtrar la tabla, abrir la ficha de una inscripción, cambiar
// estados, etiquetar, acreditar el día del evento y exportar.
//
// Reglas:
//
// - **Todo se consulta por `eventId`.** Ninguna respuesta mezcla ediciones.
// - **Cada cambio deja historial** con usuario, fecha y comentario
//   (`EventRegistrationHistory`). El estado no se escribe sin registrarlo.
// - **El acceso se comprueba en el servidor.** Un administrador de sitio sólo
//   ve los eventos de su club; el rol `administrator` los ve todos.
// - **Los pagos no se tocan desde aquí.** Marcar "reembolsado" a mano cambia el
//   estado administrativo, no mueve dinero en Stripe: eso se hace en Stripe y
//   llega por webhook.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';
import { ensureEventRegistrationSchema } from '../lib/ensureEventRegistrationSchema.js';
import {
    STATUSES, STATUS_KEYS, STATUS, SETTLED_STATUSES,
    SYSTEM_TAGS, SYSTEM_TAG_KEYS, normalizeTag, statusMeta,
    CATEGORY_BLUEPRINTS, CURRENCIES, AUDIENCES, buildFormSchema,
} from '../lib/eventRegistrationSpec.js';
import {
    clean, isEmail, parseJson, loadEvent, ensureEdition, updateEdition,
    listCategories, upsertCategory, seedCategories, deleteCategory, categoryUsage,
    mapRegistration, findRegistration, listCompanions, listHistory, listPayments,
    listMessages, recordHistory, recordMessage, assignRegistrationCode,
} from '../lib/eventRegistrationStore.js';

console.log('[eventRegistrationAdminController] v4.648.0 cargado — tablero, categorías, fichas, acreditación y exportación de inscripciones por evento.');

// ── Acceso ───────────────────────────────────────────────────────────

/** El evento debe pertenecer al sitio de quien consulta (o ser `administrator`). */
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

/** Resuelve el evento del `eventRef` o responde 404. Devuelve null si falló. */
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

// ── Edición ──────────────────────────────────────────────────────────

// GET /admin/edition?eventRef=
export const getEdition = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const edition = await ensureEdition(event);
        const categories = await listCategories(event.id);

        const withUsage = await Promise.all(categories.map(async (c) => ({
            ...c,
            usage: await categoryUsage(event.id, c.key),
        })));

        res.json({
            event: { id: event.id, slug: event.slug, title: event.title, startDate: event.startDate, location: event.location },
            edition,
            categories: withUsage,
            // Catálogos que el panel necesita para pintar los formularios.
            catalog: {
                statuses: STATUSES,
                tags: SYSTEM_TAGS,
                currencies: CURRENCIES,
                audiences: AUDIENCES.map(a => ({ key: a.key, label: a.label })),
                blueprints: CATEGORY_BLUEPRINTS.map(b => ({ key: b.key, name: b.name })),
            },
        });
    } catch (error) {
        console.error('[event-registrations][admin] getEdition:', error);
        res.status(500).json({ error: 'No se pudo cargar la edición del evento' });
    }
};

// PUT /admin/edition
export const saveEdition = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        await ensureEdition(event);

        const body = req.body || {};
        const patch = {};
        if ('editionNumber' in body) patch.editionNumber = Number(body.editionNumber) > 0 ? Math.floor(Number(body.editionNumber)) : null;
        if ('editionLabel' in body) patch.editionLabel = clean(body.editionLabel, 160);
        if ('venue' in body) patch.venue = clean(body.venue, 240);
        if ('city' in body) patch.city = clean(body.city, 160);
        if ('region' in body) patch.region = clean(body.region, 160);
        if ('country' in body) patch.country = clean(body.country, 160);
        if ('timezone' in body) patch.timezone = clean(body.timezone, 80) || 'America/Bogota';
        if ('codePrefix' in body) patch.codePrefix = clean(body.codePrefix, 20).toUpperCase();
        if ('registrationOpen' in body) patch.registrationOpen = body.registrationOpen === true;
        if ('opensAt' in body) patch.opensAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.opensAt || '')) ? body.opensAt : null;
        if ('closesAt' in body) patch.closesAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.closesAt || '')) ? body.closesAt : null;

        if ('fx' in body) {
            const fx = body.fx || {};
            patch.fx = {
                usdToCop: Number(fx.usdToCop) > 0 ? Number(fx.usdToCop) : undefined,
                rates: typeof fx.rates === 'object' && fx.rates ? fx.rates : undefined,
                source: clean(fx.source, 80) || 'manual',
                updatedAt: new Date().toISOString(),
            };
        }
        if ('settings' in body) {
            const s = body.settings || {};
            patch.settings = {
                successMessage: clean(s.successMessage, 600),
                sendReceipt: s.sendReceipt !== false,
                adminEmails: (Array.isArray(s.adminEmails) ? s.adminEmails : []).filter(isEmail).slice(0, 20),
                termsUrl: clean(s.termsUrl, 400),
            };
        }

        const edition = await updateEdition(event.id, patch);
        res.json({ edition });
    } catch (error) {
        console.error('[event-registrations][admin] saveEdition:', error);
        res.status(500).json({ error: 'No se pudo guardar la edición' });
    }
};

// POST /admin/edition/seed — crea las tres categorías de la plantilla.
export const seedEditionCategories = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        await ensureEdition(event);
        const result = await seedCategories(event.id);
        res.json({
            created: result.created.map(c => c.key),
            total: result.total,
            categories: await listCategories(event.id),
        });
    } catch (error) {
        console.error('[event-registrations][admin] seedEditionCategories:', error);
        res.status(500).json({ error: 'No se pudieron crear las categorías' });
    }
};

// ── Categorías ───────────────────────────────────────────────────────

// PUT /admin/categories
export const saveCategory = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        await ensureEdition(event);

        const raw = req.body?.category || {};
        if (!clean(raw.name, 160)) return res.status(400).json({ error: 'La categoría necesita un nombre.' });
        if (!normalizeTag(raw.key)) return res.status(400).json({ error: 'La categoría necesita una clave.' });

        const saved = await upsertCategory(event.id, raw);
        res.json({ category: { ...saved, usage: await categoryUsage(event.id, saved.key) } });
    } catch (error) {
        console.error('[event-registrations][admin] saveCategory:', error);
        res.status(500).json({ error: 'No se pudo guardar la categoría' });
    }
};

// DELETE /admin/categories/:key
export const removeCategory = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const result = await deleteCategory(event.id, req.params.key);
        if (!result.deleted) {
            return res.status(409).json({
                error: `No se puede borrar: la categoría ya tiene ${result.count} inscripción(es). Desactívala en vez de borrarla.`,
            });
        }
        res.json({ deleted: true });
    } catch (error) {
        console.error('[event-registrations][admin] removeCategory:', error);
        res.status(500).json({ error: 'No se pudo borrar la categoría' });
    }
};

// GET /admin/categories/:key/form — vista previa del formulario resultante.
export const previewCategoryForm = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const categories = await listCategories(event.id);
        const category = categories.find(c => c.key === clean(req.params.key, 60));
        if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });
        res.json({ category: category.name, ...buildFormSchema(category) });
    } catch (error) {
        console.error('[event-registrations][admin] previewCategoryForm:', error);
        res.status(500).json({ error: 'No se pudo cargar el formulario' });
    }
};

// ── Filtros de la tabla ──────────────────────────────────────────────

/**
 * Traduce los filtros de la pantalla a un WHERE parametrizado.
 * Siempre arranca acotado al evento: es la garantía de que una edición no ve
 * las inscripciones de otra.
 */
const buildFilters = (eventId, query) => {
    const where = ['"eventId" = $1'];
    const values = [eventId];
    // El marcador es `@@` y no `?`: en SQL, `?` es un operador de JSONB y
    // reemplazarlo a ciegas rompería las condiciones sobre `tags`.
    const push = (sql, value) => { values.push(value); where.push(sql.replace('@@', `$${values.length}`)); };

    const list = (raw) => String(raw || '').split(',').map(v => v.trim()).filter(Boolean);

    if (list(query.status).length) push('status = ANY(@@)', list(query.status));
    if (list(query.category).length) push('"categoryKey" = ANY(@@)', list(query.category));
    if (list(query.audience).length) push('audience = ANY(@@)', list(query.audience));
    if (clean(query.country, 120)) push('lower(country) = lower(@@)', clean(query.country, 120));
    if (clean(query.district, 40)) push('lower(district) = lower(@@)', clean(query.district, 40));
    if (clean(query.club, 200)) push('"clubName" ILIKE @@', `%${clean(query.club, 200)}%`);
    if (clean(query.currency, 3)) push('"baseCurrency" = upper(@@)', clean(query.currency, 3));
    if (clean(query.from, 10)) push('"createdAt" >= @@::date', clean(query.from, 10));
    if (clean(query.to, 10)) push('"createdAt" < (@@::date + interval \'1 day\')', clean(query.to, 10));
    // `@>` exige que estén TODAS las etiquetas pedidas (Y lógico).
    if (list(query.tags).length) push('tags @> @@::jsonb', JSON.stringify(list(query.tags)));

    // Estado del pago, que no es lo mismo que el estado de la inscripción.
    if (query.payment === 'settled') push('status = ANY(@@)', SETTLED_STATUSES);
    else if (query.payment === 'pending') push('status = @@', STATUS.PENDING);
    else if (query.payment === 'failed') push('status = ANY(@@)', [STATUS.FAILED, STATUS.EXPIRED]);
    else if (query.payment === 'refunded') push('status = @@', STATUS.REFUNDED);

    if (query.companions === 'with') where.push('"companionsCount" > 0');
    else if (query.companions === 'without') where.push('"companionsCount" = 0');

    const search = clean(query.q, 160);
    if (search) {
        values.push(`%${search}%`);
        const p = `$${values.length}`;
        where.push(`(
            "firstName" ILIKE ${p} OR "lastName" ILIKE ${p} OR email ILIKE ${p}
            OR "clubName" ILIKE ${p} OR "publicRef" ILIKE ${p} OR "registrationCode" ILIKE ${p}
            OR "documentNumber" ILIKE ${p} OR (COALESCE("firstName",'') || ' ' || COALESCE("lastName",'')) ILIKE ${p}
        )`);
    }

    // Los borradores no ensucian la tabla salvo que se pidan a propósito.
    if (query.includeDrafts !== 'true' && !list(query.status).length) {
        where.push(`status <> '${STATUS.DRAFT}'`);
    }

    return { where: where.join(' AND '), values };
};

const SORTABLE = {
    createdAt: '"createdAt"', name: '"lastName"', category: '"categoryKey"',
    amount: '"baseAmount"', status: 'status', country: 'country', code: '"registrationCode"',
};

// GET /admin/list
export const listRegistrations = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;

        const { where, values } = buildFilters(event.id, req.query);
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const sort = SORTABLE[req.query.sort] || SORTABLE.createdAt;
        const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*)::int AS total FROM "EventRegistration" WHERE ${where}`, values);

        const { rows } = await db.query(
            `SELECT * FROM "EventRegistration" WHERE ${where}
             ORDER BY ${sort} ${dir} NULLS LAST
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, offset]);

        res.json({
            event: { id: event.id, slug: event.slug, title: event.title },
            total: countRows[0]?.total || 0,
            limit, offset,
            registrations: rows.map(mapRegistration),
        });
    } catch (error) {
        console.error('[event-registrations][admin] listRegistrations:', error);
        res.status(500).json({ error: 'No se pudieron cargar las inscripciones' });
    }
};

// ── Tablero ──────────────────────────────────────────────────────────

// GET /admin/dashboard
export const getDashboard = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const edition = await ensureEdition(event);
        const categories = await listCategories(event.id);

        const params = [event.id, STATUS.DRAFT];
        const base = '"eventId" = $1 AND status <> $2';

        const [totals, byStatus, byCategory, byCurrency, byCountry, byDistrict, byClub, timeline, companionTotals] =
            await Promise.all([
                db.query(
                    `SELECT COUNT(*)::int AS registrations,
                            COALESCE(SUM("companionsCount"), 0)::int AS companions,
                            COALESCE(SUM(1 + GREATEST("companionsCount", 0)), 0)::int AS people,
                            COUNT(*) FILTER (WHERE status = ANY($3))::int AS settled,
                            COUNT(*) FILTER (WHERE status = $4)::int AS pending,
                            COUNT(*) FILTER (WHERE status = ANY($5))::int AS failed,
                            COUNT(*) FILTER (WHERE status = $6)::int AS refunded,
                            COUNT(*) FILTER (WHERE status = $7)::int AS waitlist,
                            COUNT(*) FILTER (WHERE "checkedInAt" IS NOT NULL)::int AS accredited,
                            COUNT(DISTINCT country) FILTER (WHERE country <> '')::int AS countries,
                            COUNT(DISTINCT district) FILTER (WHERE district <> '')::int AS districts,
                            COUNT(DISTINCT lower("clubName")) FILTER (WHERE "clubName" <> '')::int AS clubs
                     FROM "EventRegistration" WHERE ${base}`,
                    [...params, SETTLED_STATUSES, STATUS.PENDING, [STATUS.FAILED, STATUS.EXPIRED],
                        STATUS.REFUNDED, STATUS.WAITLIST]),

                db.query(`SELECT status, COUNT(*)::int AS total FROM "EventRegistration"
                          WHERE "eventId" = $1 GROUP BY status`, [event.id]),

                db.query(
                    `SELECT "categoryKey", "categoryLabel", COUNT(*)::int AS total,
                            COALESCE(SUM(1 + GREATEST("companionsCount", 0)), 0)::int AS people,
                            COUNT(*) FILTER (WHERE status = ANY($3))::int AS settled,
                            COALESCE(SUM("baseAmount") FILTER (WHERE status = ANY($3)), 0) AS revenue,
                            MAX("baseCurrency") AS currency
                     FROM "EventRegistration" WHERE ${base}
                     GROUP BY "categoryKey", "categoryLabel" ORDER BY total DESC`,
                    [...params, SETTLED_STATUSES]),

                // Recaudo por moneda: el publicado y el efectivamente cobrado.
                db.query(
                    `SELECT "baseCurrency" AS currency,
                            COALESCE(SUM("baseAmount"), 0) AS base,
                            MAX("chargeCurrency") AS "chargeCurrency",
                            COALESCE(SUM("chargeAmount"), 0) AS charged,
                            COUNT(*)::int AS total
                     FROM "EventRegistration"
                     WHERE "eventId" = $1 AND status = ANY($2)
                     GROUP BY "baseCurrency"`,
                    [event.id, SETTLED_STATUSES]),

                db.query(`SELECT country, COUNT(*)::int AS total FROM "EventRegistration"
                          WHERE ${base} AND country <> '' GROUP BY country ORDER BY total DESC LIMIT 25`, params),

                db.query(`SELECT district, COUNT(*)::int AS total FROM "EventRegistration"
                          WHERE ${base} AND district <> '' GROUP BY district ORDER BY total DESC LIMIT 25`, params),

                db.query(`SELECT "clubName", COUNT(*)::int AS total FROM "EventRegistration"
                          WHERE ${base} AND "clubName" <> '' GROUP BY "clubName" ORDER BY total DESC LIMIT 25`, params),

                db.query(
                    `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                            COUNT(*)::int AS total,
                            COUNT(*) FILTER (WHERE status = ANY($3))::int AS settled
                     FROM "EventRegistration" WHERE ${base}
                     GROUP BY 1 ORDER BY 1 ASC LIMIT 400`,
                    [...params, SETTLED_STATUSES]),

                db.query(
                    `SELECT COUNT(*)::int AS total,
                            COUNT(*) FILTER (WHERE c."checkedInAt" IS NOT NULL)::int AS accredited
                     FROM "EventRegistrationCompanion" c
                     JOIN "EventRegistration" r ON r.id = c."registrationId"
                     WHERE c."eventId" = $1 AND r.status <> $2`, params),
            ]);

        const capacity = await Promise.all(categories.map(async (c) => ({
            key: c.key, name: c.name, capacity: c.capacity,
            ...(await categoryUsage(event.id, c.key)),
        })));

        res.json({
            event: { id: event.id, slug: event.slug, title: event.title, startDate: event.startDate },
            edition,
            totals: {
                ...totals.rows[0],
                companionsAccredited: companionTotals.rows[0]?.accredited || 0,
                companionRecords: companionTotals.rows[0]?.total || 0,
            },
            byStatus: byStatus.rows.map(r => ({ ...r, ...statusMeta(r.status) })),
            byCategory: byCategory.rows.map(r => ({ ...r, revenue: Number(r.revenue) })),
            byCurrency: byCurrency.rows.map(r => ({ ...r, base: Number(r.base), charged: Number(r.charged) })),
            byCountry: byCountry.rows,
            byDistrict: byDistrict.rows,
            byClub: byClub.rows,
            timeline: timeline.rows,
            capacity,
        });
    } catch (error) {
        console.error('[event-registrations][admin] getDashboard:', error);
        res.status(500).json({ error: 'No se pudo cargar el tablero' });
    }
};

// ── Ficha de una inscripción ─────────────────────────────────────────

const loadDetail = async (req, res) => {
    const registration = await findRegistration(req.params.id);
    if (!registration) {
        res.status(404).json({ error: 'Inscripción no encontrada' });
        return null;
    }
    const event = await assertEventAccess(req, registration.eventId);
    if (!event) {
        res.status(404).json({ error: 'Inscripción no encontrada' });
        return null;
    }
    return { registration, event };
};

// GET /admin/registrations/:id
export const getRegistrationDetail = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const found = await loadDetail(req, res);
        if (!found) return;
        const { registration, event } = found;

        const [companions, history, payments, messages] = await Promise.all([
            listCompanions(registration.id),
            listHistory(registration.id),
            listPayments(registration.id),
            listMessages(registration.id),
        ]);

        const categories = await listCategories(event.id);
        const category = categories.find(c => c.key === registration.categoryKey) || null;

        res.json({
            registration: mapRegistration(registration),
            companions, history, payments, messages,
            // El formulario con el que se llenó, para etiquetar cada respuesta
            // con su pregunta en vez de mostrar claves sueltas.
            form: category ? buildFormSchema(category) : null,
            category,
            event: { id: event.id, slug: event.slug, title: event.title },
        });
    } catch (error) {
        console.error('[event-registrations][admin] getRegistrationDetail:', error);
        res.status(500).json({ error: 'No se pudo cargar la inscripción' });
    }
};

// PATCH /admin/registrations/:id/status
export const changeStatus = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const found = await loadDetail(req, res);
        if (!found) return;
        const { registration, event } = found;

        const next = clean(req.body?.status, 30);
        if (!STATUS_KEYS.includes(next)) {
            return res.status(400).json({ error: 'Estado no válido.' });
        }
        const comment = clean(req.body?.comment, 2000);
        if (registration.status === next) {
            return res.json({ registration: mapRegistration(registration), unchanged: true });
        }

        const { rows } = await db.query(
            `UPDATE "EventRegistration"
             SET status = $1,
                 "paidAt" = CASE WHEN $2 AND "paidAt" IS NULL THEN NOW() ELSE "paidAt" END,
                 "lastActivityAt" = NOW(), "updatedAt" = NOW()
             WHERE id = $3 RETURNING *`,
            [next, SETTLED_STATUSES.includes(next), registration.id]);

        // Al pasar a un estado liquidado se le asigna código si aún no tenía:
        // es lo que se busca en la acreditación.
        if (SETTLED_STATUSES.includes(next) && !rows[0].registrationCode) {
            const edition = await ensureEdition(event);
            await assignRegistrationCode(rows[0].id, edition.codePrefix);
        }

        await recordHistory({
            registrationId: registration.id, eventId: event.id, type: 'status_changed',
            fromStatus: registration.status, toStatus: next,
            comment: comment || `Cambio manual a "${statusMeta(next).label}"`,
            actor: actorOf(req),
        });

        res.json({ registration: mapRegistration(await findRegistration(registration.id)) });
    } catch (error) {
        console.error('[event-registrations][admin] changeStatus:', error);
        res.status(500).json({ error: 'No se pudo cambiar el estado' });
    }
};

// PATCH /admin/registrations/:id/tags
export const updateTags = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const found = await loadDetail(req, res);
        if (!found) return;
        const { registration, event } = found;

        const incoming = (Array.isArray(req.body?.tags) ? req.body.tags : [])
            .map(normalizeTag).filter(Boolean).slice(0, 40);
        // Las etiquetas de sistema describen hechos: no se editan a mano, se
        // conservan tal cual estén y sólo se reemplazan las manuales.
        const current = parseJson(registration.tags, []);
        const system = current.filter(t => SYSTEM_TAG_KEYS.includes(t));
        const manual = incoming.filter(t => !SYSTEM_TAG_KEYS.includes(t));
        const next = [...new Set([...system, ...manual])];

        await db.query(
            'UPDATE "EventRegistration" SET tags = $1, "updatedAt" = NOW() WHERE id = $2',
            [JSON.stringify(next), registration.id]);

        await recordHistory({
            registrationId: registration.id, eventId: event.id, type: 'tags_changed',
            comment: `Etiquetas: ${manual.join(', ') || '(ninguna)'}`,
            actor: actorOf(req), payload: { tags: next },
        });

        res.json({ tags: next });
    } catch (error) {
        console.error('[event-registrations][admin] updateTags:', error);
        res.status(500).json({ error: 'No se pudieron guardar las etiquetas' });
    }
};

// PATCH /admin/registrations/:id/notes
export const updateNotes = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const found = await loadDetail(req, res);
        if (!found) return;
        const { registration, event } = found;

        const notes = clean(req.body?.internalNotes, 8000);
        await db.query(
            'UPDATE "EventRegistration" SET "internalNotes" = $1, "updatedAt" = NOW() WHERE id = $2',
            [notes, registration.id]);

        await recordHistory({
            registrationId: registration.id, eventId: event.id, type: 'note_added',
            comment: clean(req.body?.comment, 500) || 'Actualizó las notas internas.',
            actor: actorOf(req),
        });

        res.json({ internalNotes: notes });
    } catch (error) {
        console.error('[event-registrations][admin] updateNotes:', error);
        res.status(500).json({ error: 'No se pudieron guardar las notas' });
    }
};

// ── Acreditación ─────────────────────────────────────────────────────

// GET /admin/checkin/lookup?eventRef=&q=
export const lookupForCheckIn = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const q = clean(req.query.q, 120);
        if (q.length < 2) return res.json({ results: [] });

        const { rows } = await db.query(
            `SELECT * FROM "EventRegistration"
             WHERE "eventId" = $1 AND status = ANY($2) AND (
                "registrationCode" ILIKE $3 OR "publicRef" ILIKE $3 OR email ILIKE $3
                OR "documentNumber" ILIKE $3
                OR (COALESCE("firstName",'') || ' ' || COALESCE("lastName",'')) ILIKE $3
             )
             ORDER BY "lastName" ASC LIMIT 25`,
            [event.id, [...SETTLED_STATUSES, STATUS.PENDING], `%${q}%`]);

        const results = await Promise.all(rows.map(async (row) => ({
            ...mapRegistration(row),
            companions: await listCompanions(row.id),
        })));
        res.json({ results });
    } catch (error) {
        console.error('[event-registrations][admin] lookupForCheckIn:', error);
        res.status(500).json({ error: 'No se pudo buscar' });
    }
};

// POST /admin/registrations/:id/checkin
export const checkIn = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const found = await loadDetail(req, res);
        if (!found) return;
        const { registration, event } = found;

        const undo = req.body?.undo === true;
        const companionId = clean(req.body?.companionId, 60);
        const actor = actorOf(req);

        if (companionId) {
            const { rows } = await db.query(
                `UPDATE "EventRegistrationCompanion"
                 SET "checkedInAt" = ${undo ? 'NULL' : 'NOW()'}, "updatedAt" = NOW()
                 WHERE id = $1 AND "registrationId" = $2 RETURNING *`,
                [companionId, registration.id]);
            if (!rows[0]) return res.status(404).json({ error: 'Acompañante no encontrado' });

            await recordHistory({
                registrationId: registration.id, eventId: event.id,
                type: undo ? 'checkin_undone' : 'checkin',
                comment: `${undo ? 'Anuló la acreditación' : 'Acreditó'} al acompañante ${rows[0].firstName} ${rows[0].lastName}`,
                actor,
            });
            return res.json({ companions: await listCompanions(registration.id) });
        }

        if (!undo && !SETTLED_STATUSES.includes(registration.status)) {
            return res.status(409).json({
                error: `No se puede acreditar: la inscripción está en "${statusMeta(registration.status).label}".`,
            });
        }

        const { rows } = await db.query(
            `UPDATE "EventRegistration"
             SET "checkedInAt" = ${undo ? 'NULL' : 'NOW()'},
                 "checkedInBy" = $1,
                 status = $2,
                 "lastActivityAt" = NOW(), "updatedAt" = NOW()
             WHERE id = $3 RETURNING *`,
            [
                undo ? null : actor.name,
                // Acreditar mueve el estado a "Acreditado". Deshacerlo devuelve
                // la inscripción al estado liquidado que le corresponde: "Pago
                // confirmado" si costó algo, "Confirmado" si era sin costo.
                undo
                    ? (Number(registration.chargeAmount) > 0 ? STATUS.PAID : STATUS.FREE)
                    : STATUS.ACCREDITED,
                registration.id,
            ]);

        await recordHistory({
            registrationId: registration.id, eventId: event.id,
            type: undo ? 'checkin_undone' : 'checkin',
            fromStatus: registration.status, toStatus: rows[0].status,
            comment: undo ? 'Anuló la acreditación del titular.' : 'Acreditó al titular en la sede.',
            actor,
        });

        res.json({
            registration: mapRegistration(rows[0]),
            companions: await listCompanions(registration.id),
        });
    } catch (error) {
        console.error('[event-registrations][admin] checkIn:', error);
        res.status(500).json({ error: 'No se pudo registrar la acreditación' });
    }
};

// ── Comunicaciones ───────────────────────────────────────────────────

// POST /admin/registrations/:id/message
// Envía un correo a la inscripción y lo deja en su historial. WhatsApp y las
// automatizaciones se enganchan aquí mismo cuando se habiliten: la ficha ya
// guarda el canal.
export const sendMessage = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const found = await loadDetail(req, res);
        if (!found) return;
        const { registration, event } = found;

        const channel = ['email', 'whatsapp'].includes(req.body?.channel) ? req.body.channel : 'email';
        const subject = clean(req.body?.subject, 300);
        const body = clean(req.body?.body, 20000);
        if (!body) return res.status(400).json({ error: 'Escribe el mensaje.' });

        if (channel !== 'email') {
            return res.status(400).json({
                error: 'Por ahora sólo se puede enviar por correo desde la ficha. El envío por WhatsApp se hace desde el módulo de campañas.',
            });
        }
        if (!subject) return res.status(400).json({ error: 'Escribe el asunto del correo.' });

        const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#0f172a">
            ${body.split('\n').map(line => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')}
        </div>`;

        try {
            await EmailService.sendPlatformEmail({
                to: registration.email,
                from: '"Registro de eventos" <noreply@clubplatform.org>',
                subject, html,
            });
            await recordMessage({
                registrationId: registration.id, eventId: event.id, channel: 'email',
                template: 'manual', recipient: registration.email, subject, body: html,
                actorId: req.user?.id || null,
            });
        } catch (error) {
            await recordMessage({
                registrationId: registration.id, eventId: event.id, channel: 'email',
                template: 'manual', recipient: registration.email, subject,
                status: 'failed', error: error?.message, actorId: req.user?.id || null,
            });
            return res.status(502).json({ error: `No se pudo enviar: ${error?.message}` });
        }

        await recordHistory({
            registrationId: registration.id, eventId: event.id, type: 'message_sent',
            comment: `Correo enviado: ${subject}`, actor: actorOf(req),
        });

        res.json({ sent: true, messages: await listMessages(registration.id) });
    } catch (error) {
        console.error('[event-registrations][admin] sendMessage:', error);
        res.status(500).json({ error: 'No se pudo enviar el mensaje' });
    }
};

// ── Exportación ──────────────────────────────────────────────────────

const EXPORT_COLUMNS = [
    ['Código', r => r.registrationCode || r.publicRef],
    ['Categoría', r => r.categoryLabel],
    ['Nombres', r => r.firstName],
    ['Apellidos', r => r.lastName],
    ['Correo', r => r.email],
    ['Teléfono', r => r.phone],
    ['Documento', r => r.documentNumber],
    ['País', r => r.country],
    ['Ciudad', r => r.city],
    ['Departamento', r => r.answers?.department || ''],
    ['Club', r => r.clubName],
    ['Distrito', r => r.district],
    ['Cargo', r => r.rotaryRole],
    ['Idioma', r => r.language],
    ['Alimentación', r => r.dietary],
    ['Acompañantes', r => r.companionsCount],
    ['Valor', r => r.baseAmount],
    ['Moneda', r => r.baseCurrency],
    ['Cobrado', r => r.chargeAmount],
    ['Moneda cobro', r => r.chargeCurrency],
    ['Tasa', r => r.fxRate ?? ''],
    ['Estado', r => statusMeta(r.status).label],
    ['Etiquetas', r => (r.tags || []).join(' | ')],
    ['Referencia Stripe', r => r.stripePaymentIntentId || r.stripeSessionId || ''],
    ['Pagado el', r => (r.paidAt ? new Date(r.paidAt).toISOString() : '')],
    ['Acreditado el', r => (r.checkedInAt ? new Date(r.checkedInAt).toISOString() : '')],
    ['Creado el', r => new Date(r.createdAt).toISOString()],
];

/** Trae las filas que cumplen los filtros actuales, sin paginar. */
const fetchForExport = async (event, query) => {
    const { where, values } = buildFilters(event.id, query);
    const { rows } = await db.query(
        `SELECT * FROM "EventRegistration" WHERE ${where} ORDER BY "createdAt" DESC LIMIT 20000`, values);
    return rows.map(mapRegistration);
};

// GET /admin/export.csv
export const exportRegistrationsCsv = async (req, res) => {
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
        res.setHeader('Content-Disposition', `attachment; filename="inscripciones-${event.slug || event.id}.csv"`);
        // BOM para que Excel abra los acentos bien.
        res.send('﻿' + lines.join('\n'));
    } catch (error) {
        console.error('[event-registrations][admin] exportRegistrationsCsv:', error);
        res.status(500).json({ error: 'No se pudo exportar' });
    }
};

// GET /admin/export.xlsx — dos hojas: inscripciones y acompañantes.
export const exportRegistrationsXlsx = async (req, res) => {
    try {
        const event = await requireEvent(req, res);
        if (!event) return;
        const rows = await fetchForExport(event, req.query);

        // `xlsx` es CommonJS: según cómo lo resuelva Node, las utilidades
        // quedan en la raíz del módulo o bajo `default`.
        const xlsxModule = await import('xlsx');
        const XLSX = xlsxModule.utils ? xlsxModule : xlsxModule.default;
        const book = XLSX.utils.book_new();

        const main = XLSX.utils.aoa_to_sheet([
            EXPORT_COLUMNS.map(([label]) => label),
            ...rows.map(r => EXPORT_COLUMNS.map(([, get]) => get(r))),
        ]);
        XLSX.utils.book_append_sheet(book, main, 'Inscripciones');

        const { rows: companionRows } = await db.query(
            `SELECT c.*, r."registrationCode", r."publicRef", r."categoryLabel",
                    r."firstName" AS "holderFirstName", r."lastName" AS "holderLastName"
             FROM "EventRegistrationCompanion" c
             JOIN "EventRegistration" r ON r.id = c."registrationId"
             WHERE c."eventId" = $1 ORDER BY r."lastName" ASC, c."sortOrder" ASC`, [event.id]);

        const companions = XLSX.utils.aoa_to_sheet([
            ['Código titular', 'Titular', 'Categoría', 'Nombres', 'Apellidos', 'Documento',
                'Parentesco', 'Correo', 'Teléfono', 'Alimentación', 'Valor', 'Moneda', 'Acreditado el'],
            ...companionRows.map(c => [
                c.registrationCode || c.publicRef,
                `${c.holderFirstName || ''} ${c.holderLastName || ''}`.trim(),
                c.categoryLabel, c.firstName, c.lastName, c.documentNumber, c.relationship,
                c.email, c.phone, c.dietary, Number(c.amount), c.currency,
                c.checkedInAt ? new Date(c.checkedInAt).toISOString() : '',
            ]),
        ]);
        XLSX.utils.book_append_sheet(book, companions, 'Acompañantes');

        const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="inscripciones-${event.slug || event.id}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('[event-registrations][admin] exportRegistrationsXlsx:', error);
        res.status(500).json({ error: 'No se pudo exportar a Excel' });
    }
};

// ── Nueva edición ────────────────────────────────────────────────────

// POST /admin/editions/clone
// Copia las categorías de esta edición a otro evento. Es lo que permite
// levantar la XIII feria sin tocar código: se crea el evento y se le clona la
// estructura de la XII.
export const cloneEdition = async (req, res) => {
    try {
        const source = await requireEvent(req, res);
        if (!source) return;

        const target = await assertEventAccess(req, clean(req.body?.targetEventRef, 200));
        if (!target) return res.status(404).json({ error: 'Evento destino no encontrado' });
        if (target.id === source.id) return res.status(400).json({ error: 'El evento destino debe ser distinto.' });

        const sourceEdition = await ensureEdition(source);
        await ensureEdition(target);
        const categories = await listCategories(source.id);

        for (const category of categories) {
            await upsertCategory(target.id, { ...category, id: null });
        }
        // La nueva edición hereda la configuración pero nace CERRADA: se abre
        // a propósito cuando el equipo esté listo, no por el hecho de clonarla.
        await updateEdition(target.id, {
            fx: sourceEdition.fx,
            settings: sourceEdition.settings,
            timezone: sourceEdition.timezone,
            registrationOpen: false,
        });

        res.json({
            cloned: categories.length,
            target: { id: target.id, title: target.title },
            categories: await listCategories(target.id),
        });
    } catch (error) {
        console.error('[event-registrations][admin] cloneEdition:', error);
        res.status(500).json({ error: 'No se pudo clonar la edición' });
    }
};

export default {
    getEdition, saveEdition, seedEditionCategories,
    saveCategory, removeCategory, previewCategoryForm,
    listRegistrations, getDashboard, getRegistrationDetail,
    changeStatus, updateTags, updateNotes,
    lookupForCheckIn, checkIn, sendMessage,
    exportRegistrationsCsv, exportRegistrationsXlsx,
    cloneEdition,
};
