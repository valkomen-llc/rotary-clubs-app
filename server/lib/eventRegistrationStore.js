// ════════════════════════════════════════════════════════════════════
// Acceso a datos del módulo de inscripciones — v4.648.0
//
// Lo que comparten el flujo público (`eventRegistrationController`) y el panel
// (`eventRegistrationAdminController`): cargar el evento y su edición, leer y
// escribir categorías, mapear filas a objetos y dejar historial.
//
// Regla del módulo: todo se consulta con `eventId`. Ninguna función devuelve
// datos de una edición distinta a la que se le pide.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureEventRegistrationSchema } from './ensureEventRegistrationSchema.js';
import {
    CATEGORY_BLUEPRINTS, normalizeCategory, COMMITTED_STATUSES,
    parseRomanEdition, parseLocation, buildCodePrefix, buildRegistrationCode,
    randomCodeSuffix,
} from './eventRegistrationSpec.js';

export const clean = (value, max = 250) => String(value ?? '').trim().slice(0, max);
export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
export const asNumber = (value) => (value === null || value === undefined ? null : Number(value));

/** JSONB puede llegar como objeto (pg lo parsea) o como texto. Acepta ambos. */
export const parseJson = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
};

// ── Evento y edición ─────────────────────────────────────────────────

/** Busca el evento por id o por slug, opcionalmente acotado a un sitio. */
export const loadEvent = async (eventRef, clubId = null) => {
    const ref = clean(eventRef, 200);
    if (!ref) return null;
    const params = clubId ? [ref, clubId] : [ref];
    const where = clubId ? '(id = $1 OR slug = $1) AND "clubId" = $2' : '(id = $1 OR slug = $1)';
    const { rows } = await db.query(
        `SELECT id, slug, title, "startDate", "endDate", location, "clubId", metadata
         FROM "CalendarEvent" WHERE ${where} LIMIT 1`,
        params
    );
    return rows[0] || null;
};

const mapEdition = (row, event) => row && ({
    id: row.id,
    eventId: row.eventId,
    clubId: row.clubId,
    editionNumber: row.editionNumber,
    editionLabel: row.editionLabel || event?.title || '',
    venue: row.venue || '',
    city: row.city || '',
    region: row.region || '',
    country: row.country || '',
    timezone: row.timezone || 'America/Bogota',
    codePrefix: row.codePrefix || buildCodePrefix(row.editionNumber),
    registrationOpen: row.registrationOpen === true,
    opensAt: row.opensAt ? new Date(row.opensAt).toISOString().slice(0, 10) : null,
    closesAt: row.closesAt ? new Date(row.closesAt).toISOString().slice(0, 10) : null,
    fx: parseJson(row.fx, {}),
    settings: parseJson(row.settings, {}),
});

/**
 * Devuelve la edición del evento y la crea si aún no existe.
 *
 * Los valores iniciales se deducen del propio evento —el número romano del
 * título y la sede de `location`— para que la XII Feria de Valledupar quede
 * bien puesta sin escribir nada a mano. A partir de ahí manda el
 * administrador: esta función nunca vuelve a pisar lo que él haya guardado.
 */
export const ensureEdition = async (event) => {
    await ensureEventRegistrationSchema();

    const { rows: existing } = await db.query(
        'SELECT * FROM "EventEdition" WHERE "eventId" = $1 LIMIT 1', [event.id]);
    if (existing[0]) return mapEdition(existing[0], event);

    const editionNumber = parseRomanEdition(event.title);
    const place = parseLocation(event.location);
    const legacy = parseJson(event.metadata, {})?.registration || {};

    const { rows } = await db.query(
        `INSERT INTO "EventEdition"
            ("eventId", "clubId", "editionNumber", "editionLabel", venue, city, region, country,
             "codePrefix", "registrationOpen", "closesAt", fx)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT ("eventId") DO UPDATE SET "updatedAt" = NOW()
         RETURNING *`,
        [
            event.id, event.clubId || null, editionNumber,
            clean(event.title, 160), clean(place.venue, 240), clean(place.city, 160),
            clean(place.region, 160), clean(place.country, 160),
            buildCodePrefix(editionNumber),
            // Si el evento ya tenía el registro simple de v4.606 abierto, la
            // edición nace abierta: no se le cierra el registro a nadie.
            legacy.enabled === true,
            /^\d{4}-\d{2}-\d{2}$/.test(String(legacy.closesAt || '')) ? legacy.closesAt : null,
            JSON.stringify({}),
        ]
    );
    return mapEdition(rows[0], event);
};

export const updateEdition = async (eventId, patch) => {
    const allowed = {
        editionNumber: 'editionNumber', editionLabel: 'editionLabel', venue: 'venue',
        city: 'city', region: 'region', country: 'country', timezone: 'timezone',
        codePrefix: 'codePrefix', registrationOpen: 'registrationOpen',
        opensAt: 'opensAt', closesAt: 'closesAt',
    };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(allowed)) {
        if (!(key in patch)) continue;
        values.push(patch[key]);
        sets.push(`"${column}" = $${values.length}`);
    }
    if ('fx' in patch) {
        values.push(JSON.stringify(patch.fx || {}));
        sets.push(`fx = $${values.length}`);
    }
    if ('settings' in patch) {
        values.push(JSON.stringify(patch.settings || {}));
        sets.push(`settings = $${values.length}`);
    }
    if (!sets.length) return null;

    values.push(eventId);
    const { rows } = await db.query(
        `UPDATE "EventEdition" SET ${sets.join(', ')}, "updatedAt" = NOW()
         WHERE "eventId" = $${values.length} RETURNING *`, values);
    return rows[0] ? mapEdition(rows[0], null) : null;
};

// ── Categorías ───────────────────────────────────────────────────────

const mapCategory = (row) => normalizeCategory({
    id: row.id,
    key: row.key,
    name: row.name,
    audience: row.audience,
    description: row.description,
    currency: row.currency,
    settlementCurrency: row.settlementCurrency,
    price: Number(row.price),
    capacity: row.capacity,
    opensAt: row.opensAt ? new Date(row.opensAt).toISOString().slice(0, 10) : null,
    closesAt: row.closesAt ? new Date(row.closesAt).toISOString().slice(0, 10) : null,
    requireClub: row.requireClub,
    companions: parseJson(row.companions, {}),
    benefits: parseJson(row.benefits, []),
    extraFields: parseJson(row.extraFields, []),
    extraFieldsLabel: row.extraFieldsLabel,
    sortOrder: row.sortOrder,
    active: row.active,
    // Alimenta `tariffVersionOf`: cada guardado de la categoría produce una
    // versión de tarifa nueva, sin llevar un contador aparte.
    updatedAt: row.updatedAt,
});

export const listCategories = async (eventId, { onlyActive = false } = {}) => {
    await ensureEventRegistrationSchema();
    const { rows } = await db.query(
        `SELECT * FROM "EventRegistrationCategory"
         WHERE "eventId" = $1 ${onlyActive ? 'AND active = true' : ''}
         ORDER BY "sortOrder" ASC, name ASC`, [eventId]);
    return rows.map(mapCategory);
};

export const findCategory = async (eventId, key) => {
    const { rows } = await db.query(
        'SELECT * FROM "EventRegistrationCategory" WHERE "eventId" = $1 AND key = $2 LIMIT 1',
        [eventId, clean(key, 60)]);
    return rows[0] ? mapCategory(rows[0]) : null;
};

/** Crea o actualiza una categoría. La clave identifica la fila dentro del evento. */
export const upsertCategory = async (eventId, raw) => {
    await ensureEventRegistrationSchema();
    const c = normalizeCategory(raw);
    const { rows } = await db.query(
        `INSERT INTO "EventRegistrationCategory"
            ("eventId", key, name, audience, description, currency, "settlementCurrency", price,
             capacity, "opensAt", "closesAt", "requireClub", companions, benefits,
             "extraFields", "extraFieldsLabel", "sortOrder", active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT ("eventId", key) DO UPDATE SET
            name = EXCLUDED.name, audience = EXCLUDED.audience, description = EXCLUDED.description,
            currency = EXCLUDED.currency, "settlementCurrency" = EXCLUDED."settlementCurrency",
            price = EXCLUDED.price, capacity = EXCLUDED.capacity,
            "opensAt" = EXCLUDED."opensAt", "closesAt" = EXCLUDED."closesAt",
            "requireClub" = EXCLUDED."requireClub", companions = EXCLUDED.companions,
            benefits = EXCLUDED.benefits, "extraFields" = EXCLUDED."extraFields",
            "extraFieldsLabel" = EXCLUDED."extraFieldsLabel",
            "sortOrder" = EXCLUDED."sortOrder", active = EXCLUDED.active,
            "updatedAt" = NOW()
         RETURNING *`,
        [
            eventId, c.key, c.name, c.audience, c.description, c.currency, c.settlementCurrency,
            c.price, c.capacity, c.opensAt, c.closesAt, c.requireClub,
            JSON.stringify(c.companions), JSON.stringify(c.benefits),
            JSON.stringify(c.extraFields), c.extraFieldsLabel, c.sortOrder, c.active,
        ]
    );
    return mapCategory(rows[0]);
};

/**
 * Siembra las tres categorías de la plantilla en un evento que aún no las
 * tiene. No pisa las que ya existan: si el administrador ya cambió el precio de
 * "Rotario Nacional", sembrar de nuevo no se lo revierte.
 */
export const seedCategories = async (eventId) => {
    const existing = await listCategories(eventId);
    const known = new Set(existing.map(c => c.key));
    const created = [];
    for (const blueprint of CATEGORY_BLUEPRINTS) {
        if (known.has(blueprint.key)) continue;
        created.push(await upsertCategory(eventId, blueprint));
    }
    return { created, total: existing.length + created.length };
};

/**
 * Desactivar es lo normal; borrar sólo se permite si la categoría no tiene
 * inscripciones. Una categoría con historial nunca se elimina.
 */
export const deleteCategory = async (eventId, key) => {
    const { rows: used } = await db.query(
        'SELECT COUNT(*)::int AS total FROM "EventRegistration" WHERE "eventId" = $1 AND "categoryKey" = $2',
        [eventId, clean(key, 60)]);
    if ((used[0]?.total || 0) > 0) {
        return { deleted: false, reason: 'has_registrations', count: used[0].total };
    }
    await db.query('DELETE FROM "EventRegistrationCategory" WHERE "eventId" = $1 AND key = $2',
        [eventId, clean(key, 60)]);
    return { deleted: true };
};

/** Personas ya comprometidas en una categoría (titulares + acompañantes). */
export const categoryUsage = async (eventId, categoryKey) => {
    const { rows } = await db.query(
        `SELECT COALESCE(SUM(1 + GREATEST("companionsCount", 0)), 0)::int AS seats,
                COUNT(*)::int AS registrations
         FROM "EventRegistration"
         WHERE "eventId" = $1 AND "categoryKey" = $2 AND status = ANY($3)`,
        [eventId, categoryKey, COMMITTED_STATUSES]);
    return { seats: rows[0]?.seats || 0, registrations: rows[0]?.registrations || 0 };
};

// ── Inscripciones ────────────────────────────────────────────────────

export const mapRegistration = (row) => row && ({
    id: row.id,
    publicRef: row.publicRef,
    registrationCode: row.registrationCode,
    eventId: row.eventId,
    clubId: row.clubId,
    // Cuenta de Asistente al Evento a la que pertenece (v4.655).
    accountId: row.accountId || null,
    status: row.status,
    categoryId: row.categoryId,
    categoryKey: row.categoryKey,
    categoryLabel: row.categoryLabel,
    audience: row.audience,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    country: row.country,
    city: row.city,
    district: row.district,
    documentNumber: row.documentNumber,
    department: row.department,
    fairRole: row.fairRole,
    fairRoleOther: row.fairRoleOther,
    // Se conserva lo que guardaron las inscripciones anteriores a v4.708: el
    // formulario ya no pregunta el cargo dentro de Rotary, pero el panel sigue
    // mostrando el de quien lo respondió.
    rotaryRole: row.rotaryRole,
    language: row.language,
    dietary: row.dietary,
    clubName: row.clubName,
    answers: parseJson(row.answers, {}),
    tags: parseJson(row.tags, []),
    pricing: parseJson(row.pricing, {}),
    baseCurrency: row.baseCurrency,
    baseAmount: asNumber(row.baseAmount),
    chargeCurrency: row.chargeCurrency,
    chargeAmount: asNumber(row.chargeAmount),
    fxRate: asNumber(row.fxRate),
    companionsCount: row.companionsCount || 0,
    companionsAmount: asNumber(row.companionsAmount),
    // Compatibilidad con la vista de v4.606
    totalAmount: asNumber(row.totalAmount),
    currency: row.currency,
    ticketLabel: row.ticketLabel,
    quantity: row.quantity,
    stripeSessionId: row.stripeSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    stripeChargeId: row.stripeChargeId,
    stripeCustomerId: row.stripeCustomerId,
    paymentMethod: row.paymentMethod,
    receiptUrl: row.receiptUrl,
    refundedAt: row.refundedAt,
    refundedAmount: asNumber(row.refundedAmount),
    notes: row.notes,
    internalNotes: row.internalNotes,
    checkedInAt: row.checkedInAt,
    checkedInBy: row.checkedInBy,
    paidAt: row.paidAt,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

/** Vista pública: sin notas internas, sin identificadores de Stripe. */
export const toPublicRegistration = (row) => {
    const r = mapRegistration(row);
    if (!r) return null;
    return {
        id: r.id,
        publicRef: r.publicRef,
        registrationCode: r.registrationCode,
        status: r.status,
        categoryKey: r.categoryKey,
        categoryLabel: r.categoryLabel,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        answers: r.answers,
        pricing: r.pricing,
        baseCurrency: r.baseCurrency,
        baseAmount: r.baseAmount,
        chargeCurrency: r.chargeCurrency,
        chargeAmount: r.chargeAmount,
        fxRate: r.fxRate,
        companionsCount: r.companionsCount,
        companionsAmount: r.companionsAmount,
        totalAmount: r.totalAmount,
        currency: r.currency,
        paidAt: r.paidAt,
        createdAt: r.createdAt,
    };
};

export const findRegistration = async (id) => {
    await ensureEventRegistrationSchema();
    const { rows } = await db.query('SELECT * FROM "EventRegistration" WHERE id = $1 LIMIT 1', [id]);
    return rows[0] || null;
};

export const listCompanions = async (registrationId) => {
    const { rows } = await db.query(
        `SELECT * FROM "EventRegistrationCompanion"
         WHERE "registrationId" = $1 ORDER BY "sortOrder" ASC, "createdAt" ASC`, [registrationId]);
    return rows.map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        documentNumber: c.documentNumber,
        relationship: c.relationship,
        email: c.email,
        phone: c.phone,
        dietary: c.dietary,
        notes: c.notes,
        categoryKey: c.categoryKey,
        amount: asNumber(c.amount),
        currency: c.currency,
        badgeCode: c.badgeCode,
        checkedInAt: c.checkedInAt,
    }));
};

/**
 * Reemplaza la lista de acompañantes de una inscripción.
 *
 * Se borra y se vuelve a insertar a propósito: los acompañantes son parte del
 * formulario del titular, no entidades con vida propia, y el titular puede
 * quitar uno del medio. Los ya acreditados conservan su marca de check-in
 * cuando coinciden por documento, para no perder la acreditación del día.
 */
export const replaceCompanions = async (registrationId, eventId, companions, { amount = 0, currency = 'USD', categoryKey = null } = {}) => {
    const previous = await listCompanions(registrationId);
    const checkedIn = new Map(previous
        .filter(c => c.checkedInAt && c.documentNumber)
        .map(c => [String(c.documentNumber).toLowerCase(), c]));

    await db.query('DELETE FROM "EventRegistrationCompanion" WHERE "registrationId" = $1', [registrationId]);

    const saved = [];
    for (let i = 0; i < companions.length; i++) {
        const c = companions[i] || {};
        const previousMatch = checkedIn.get(String(c.documentNumber || '').toLowerCase());
        const { rows } = await db.query(
            `INSERT INTO "EventRegistrationCompanion"
                ("registrationId", "eventId", "firstName", "lastName", "documentNumber", relationship,
                 email, phone, dietary, notes, "categoryKey", amount, currency, "badgeCode",
                 "checkedInAt", "sortOrder")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
            [
                registrationId, eventId, clean(c.firstName, 120), clean(c.lastName, 120),
                clean(c.documentNumber, 60), clean(c.relationship, 80),
                clean(c.email, 200).toLowerCase() || null, clean(c.phone, 60),
                clean(c.dietary, 40), clean(c.notes, 300), categoryKey,
                amount, currency,
                previousMatch?.badgeCode || `A${randomCodeSuffix(4)}`,
                previousMatch?.checkedInAt || null,
                i,
            ]
        );
        saved.push(rows[0]);
    }
    return saved.length;
};

// ── Historial y comunicaciones ───────────────────────────────────────

/** Deja constancia de un cambio. Nunca tumba el flujo que lo llamó. */
export const recordHistory = async ({ registrationId, eventId, type, fromStatus = null, toStatus = null, comment = null, actor = null, payload = {} }) => {
    try {
        await db.query(
            `INSERT INTO "EventRegistrationHistory"
                ("registrationId", "eventId", type, "fromStatus", "toStatus", comment,
                 "actorId", "actorName", payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
                registrationId, eventId, clean(type, 40), fromStatus, toStatus,
                comment ? clean(comment, 2000) : null,
                actor?.id || null,
                clean(actor?.name || actor?.email || (actor ? 'Equipo' : 'Sistema'), 160),
                JSON.stringify(payload || {}),
            ]
        );
    } catch (error) {
        console.error('[eventRegistrations] historial:', error?.message);
    }
};

export const listHistory = async (registrationId) => {
    const { rows } = await db.query(
        `SELECT * FROM "EventRegistrationHistory"
         WHERE "registrationId" = $1 ORDER BY "createdAt" DESC LIMIT 200`, [registrationId]);
    return rows.map(h => ({
        id: h.id, type: h.type, fromStatus: h.fromStatus, toStatus: h.toStatus,
        comment: h.comment, actorName: h.actorName, payload: parseJson(h.payload, {}),
        createdAt: h.createdAt,
    }));
};

export const listPayments = async (registrationId) => {
    const { rows } = await db.query(
        `SELECT * FROM "EventRegistrationPayment"
         WHERE "registrationId" = $1 ORDER BY "occurredAt" DESC LIMIT 100`, [registrationId]);
    return rows.map(p => ({
        id: p.id, provider: p.provider, status: p.status,
        stripeEventId: p.stripeEventId, checkoutSessionId: p.checkoutSessionId,
        paymentIntentId: p.paymentIntentId, chargeId: p.chargeId, customerId: p.customerId,
        baseCurrency: p.baseCurrency, baseAmount: asNumber(p.baseAmount),
        currency: p.currency, amount: asNumber(p.amount), fxRate: asNumber(p.fxRate),
        paymentMethod: p.paymentMethod, receiptUrl: p.receiptUrl,
        refundedAmount: asNumber(p.refundedAmount), failureMessage: p.failureMessage,
        occurredAt: p.occurredAt,
    }));
};

export const listMessages = async (registrationId) => {
    const { rows } = await db.query(
        `SELECT id, channel, template, recipient, subject, status, error, "createdAt"
         FROM "EventRegistrationMessage"
         WHERE "registrationId" = $1 ORDER BY "createdAt" DESC LIMIT 100`, [registrationId]);
    return rows;
};

export const recordMessage = async ({ registrationId, eventId, channel, template, recipient, subject, body, status = 'sent', error = null, actorId = null }) => {
    try {
        await db.query(
            `INSERT INTO "EventRegistrationMessage"
                ("registrationId", "eventId", channel, template, recipient, subject, body, status, error, "actorId")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                registrationId, eventId, clean(channel, 20), clean(template, 60),
                clean(recipient, 240), clean(subject, 300),
                body ? String(body).slice(0, 20000) : null,
                clean(status, 20), error ? clean(error, 1000) : null, actorId,
            ]
        );
    } catch (err) {
        console.error('[eventRegistrations] registro de comunicación:', err?.message);
    }
};

/** Registra un evento de Stripe. `false` = ya se había procesado. */
export const recordPayment = async (payment) => {
    try {
        const { rows } = await db.query(
            `INSERT INTO "EventRegistrationPayment"
                ("registrationId", "eventId", provider, "stripeEventId", "checkoutSessionId",
                 "paymentIntentId", "chargeId", "customerId", status, "baseCurrency", "baseAmount",
                 currency, amount, "fxRate", "paymentMethod", "receiptUrl", "refundedAmount",
                 "failureMessage", payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             -- El índice único de "stripeEventId" es PARCIAL (sólo cuando no es
             -- nulo). Postgres no lo infiere si no se repite aquí su misma
             -- condición: sin este WHERE la sentencia falla entera.
             ON CONFLICT ("stripeEventId") WHERE "stripeEventId" IS NOT NULL DO NOTHING
             RETURNING id`,
            [
                payment.registrationId, payment.eventId, payment.provider || 'stripe',
                payment.stripeEventId || null, payment.checkoutSessionId || null,
                payment.paymentIntentId || null, payment.chargeId || null, payment.customerId || null,
                clean(payment.status, 30) || 'pending',
                payment.baseCurrency || null, payment.baseAmount ?? null,
                payment.currency || 'USD', payment.amount ?? 0, payment.fxRate ?? null,
                clean(payment.paymentMethod, 60) || null, payment.receiptUrl || null,
                payment.refundedAmount ?? null,
                payment.failureMessage ? clean(payment.failureMessage, 1000) : null,
                JSON.stringify(payment.payload || {}),
            ]
        );
        return rows.length > 0;
    } catch (error) {
        // Violación de unicidad = ese evento de Stripe ya se había procesado.
        // Es el mismo desenlace que el ON CONFLICT, por si alguna vez no llega
        // a inferir el índice.
        if (error?.code === '23505') return false;
        console.error('[eventRegistrations] registro de pago:', error?.message);
        // Cualquier otro fallo no debe impedir que la inscripción se confirme:
        // perder el renglón de auditoría es malo, dejar un pago sin aplicar es
        // peor. Queda el error en el log.
        return true;
    }
};

/**
 * Asigna un código de inscripción único dentro del evento.
 * El índice único de la base es el que decide: si dos webhooks confirman a la
 * vez, uno choca y reintenta con otro sufijo.
 */
export const assignRegistrationCode = async (registrationId, codePrefix) => {
    for (let attempt = 0; attempt < 6; attempt++) {
        const code = buildRegistrationCode(codePrefix);
        try {
            const { rows } = await db.query(
                `UPDATE "EventRegistration" SET "registrationCode" = $1, "updatedAt" = NOW()
                 WHERE id = $2 AND "registrationCode" IS NULL RETURNING "registrationCode"`,
                [code, registrationId]);
            if (rows[0]) return rows[0].registrationCode;
            // Ya lo tenía: se devuelve el que hay.
            const existing = await findRegistration(registrationId);
            return existing?.registrationCode || null;
        } catch (error) {
            if (!String(error?.message || '').includes('EventRegistration_code_uniq')) throw error;
        }
    }
    return null;
};

export default {
    clean, isEmail, parseJson,
    loadEvent, ensureEdition, updateEdition,
    listCategories, findCategory, upsertCategory, seedCategories, deleteCategory, categoryUsage,
    mapRegistration, toPublicRegistration, findRegistration,
    listCompanions, replaceCompanions,
    recordHistory, listHistory, listPayments, listMessages, recordMessage, recordPayment,
    assignRegistrationCode,
};
