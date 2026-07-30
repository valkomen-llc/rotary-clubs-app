// ════════════════════════════════════════════════════════════════════
// Inscripciones a un evento — flujo público — v4.648.0
//
// El público elige su categoría, llena el formulario que esa categoría define,
// agrega acompañantes si aplica y paga con Stripe. Todo cuelga de un `eventId`:
// la XII Feria de Valledupar no comparte inscripciones, precios ni formularios
// con las ediciones siguientes.
//
// Reglas del módulo:
//
// - **El precio no viene del navegador, nunca.** Se calcula en el servidor a
//   partir de la categoría y se CONGELA en la inscripción (`pricing`). El
//   checkout lee esa foto guardada, no la configuración viva: así el
//   administrador puede cambiar el precio o la moneda de una categoría sin
//   afectar a quien ya se inscribió.
// - **La confirmación la da el webhook, no el navegador.** El retorno de Stripe
//   sólo sirve para mostrar el estado; quien pasa la inscripción a "Pago
//   confirmado" es `/api/payments/webhook`.
// - **Moneda doble.** Si la categoría publica en pesos y la pasarela liquida en
//   dólares, se guardan el valor original, el convertido y la tasa usada.
// - **Se reutiliza la cuenta y el webhook de Stripe que ya existen.** No hay
//   integración nueva: la Checkout Session viaja con
//   `metadata.type = 'event_registration'`.
//
// Persistencia: tablas creadas en runtime (ver `ensureEventRegistrationSchema`),
// fuera de Prisma. Ninguna operación de este archivo es destructiva.
// ════════════════════════════════════════════════════════════════════
import Stripe from 'stripe';
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';
import { ensureEventRegistrationSchema } from '../lib/ensureEventRegistrationSchema.js';
import {
    STATUS, STATUSES, SETTLED_STATUSES, COMMITTED_STATUSES,
    toStripeAmount, ZERO_DECIMAL, formatMoney, buildFormSchema, validateAnswers, validateCompanion,
    categoryWindow, resolveCharge, deriveSystemTags, SYSTEM_TAG_KEYS,
    COMPANION_FIELDS, randomCodeSuffix, tariffVersionOf,
    resolveAudienceHint, resolveCtaButtons, normalizeCtaConfig,
} from '../lib/eventRegistrationSpec.js';
import store, {
    clean, isEmail, loadEvent, ensureEdition, listCategories, findCategory,
    categoryUsage, findRegistration, listCompanions, replaceCompanions,
    toPublicRegistration, recordHistory, recordMessage, recordPayment,
    assignRegistrationCode,
} from '../lib/eventRegistrationStore.js';

console.log('[eventRegistrationController] v4.654.0 cargado — inscripciones por categoría; el botón principal de la ficha lo decide el IDIOMA activo del sitio (es-CO → nacional, resto → internacional), CADRES siempre visible, formulario bloqueado por categoría, acompañantes, multimoneda y pago por Stripe. El formulario público comparte cabecera y fondo con Postular Proyecto.');

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';
const PLATFORM_SENDER = '"Registro de eventos" <noreply@clubplatform.org>';

export { STATUS };

/** Estados desde los que se puede retomar una inscripción sin duplicarla. */
const RESUMABLE = [STATUS.DRAFT, STATUS.STARTED, STATUS.PENDING, STATUS.FAILED, STATUS.EXPIRED];

const resolveOrigin = (req, returnUrl) => {
    if (returnUrl && /^https?:\/\//.test(returnUrl)) return returnUrl.replace(/\/$/, '');
    const headerOrigin = req.headers?.origin;
    if (headerOrigin && /^https?:\/\//.test(headerOrigin)) return headerOrigin.replace(/\/$/, '');
    return DEFAULT_FRONTEND_URL;
};

/** Referencia corta que el asistente puede citar antes incluso de pagar. */
const buildPublicRef = () => `EV-${randomCodeSuffix(6)}`;

// ── Disponibilidad ───────────────────────────────────────────────────

/**
 * Estado de una categoría de cara al público: si está abierta, cuánto cupo
 * queda y cuántos asientos ocupa cada inscripción (titular + acompañantes).
 */
const decorateCategory = async (eventId, category, edition) => {
    const window = categoryWindow(category);
    const usage = category.capacity ? await categoryUsage(eventId, category.key) : { seats: 0, registrations: 0 };
    const remaining = category.capacity ? Math.max(0, category.capacity - usage.seats) : null;
    const charge = resolveCharge({ category, companionsCount: 0, fx: edition?.fx });

    return {
        key: category.key,
        name: category.name,
        audience: category.audience,
        description: category.description,
        currency: category.currency,
        price: category.price,
        benefits: category.benefits,
        requireClub: category.requireClub,
        companions: category.companions,
        opensAt: category.opensAt,
        closesAt: category.closesAt,
        capacity: category.capacity,
        // Va explícito porque `resolveCtaButtons` vuelve a pasar esta categoría
        // decorada por `categoryWindow`, y sin `active` la daría por inactiva y
        // escondería todos los botones.
        active: category.active,
        remaining,
        soldOut: remaining !== null && remaining <= 0,
        open: window.open && !(remaining !== null && remaining <= 0),
        closedReason: window.reason,
        // Lo que realmente cobrará la pasarela, para poder avisarlo antes de
        // que la persona llene el formulario.
        charge: {
            currency: charge.chargeCurrency,
            amount: charge.chargeAmount,
            converted: charge.converted,
            fxRate: charge.fxRate,
            fxMissing: charge.fxMissing === true,
        },
        form: buildFormSchema(category),
    };
};

// ── Público: configuración ───────────────────────────────────────────

/**
 * Con qué contexto se está mirando la ficha.
 *
 * `?locale=` es el idioma ACTIVO del sitio, el que el visitante tiene puesto en
 * el selector. Es lo único que decide qué registro se le ofrece.
 *
 * Lo demás son respaldos para cuando ese dato no llega —una consulta a la API
 * sin decir en qué idioma está el sitio—: el `Accept-Language` del navegador y,
 * por último, el país que entrega la red (`x-vercel-ip-country`, con los
 * equivalentes de otros proveedores por si se cambia de infraestructura).
 *
 * El país NO decide cuando hay idioma activo. Hasta v4.651 mandaba, y por eso
 * un visitante con el sitio en inglés desde Colombia veía el botón nacional.
 */
const readVisitorOrigin = (req) => {
    const headers = req.headers || {};
    // `lang` se sigue aceptando por compatibilidad con la versión anterior.
    const locale = clean(req.query?.locale || req.query?.lang, 10);
    const countryCode = clean(
        headers['x-vercel-ip-country'] || headers['cf-ipcountry'] || headers['x-geo-country'] || '', 2);

    const languages = [];
    for (const part of String(headers['accept-language'] || '').split(',')) {
        const tag = part.split(';')[0].trim();
        if (tag && tag !== '*') languages.push(tag);
    }
    return { locale, countryCode, languages };
};

// GET /api/event-registrations/config/:clubId/:eventRef
// `?categoria=<clave>` devuelve SÓLO esa categoría. Es lo que usa el formulario
// cuando se entra por uno de los botones: así el navegador no recibe siquiera
// los precios ni los campos de las otras categorías.
export const getPublicRegistrationConfig = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const event = await loadEvent(req.params.eventRef, req.params.clubId);
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        const edition = await ensureEdition(event);
        const all = await listCategories(event.id, { onlyActive: true });

        const requested = clean(req.query?.categoria, 60);
        if (requested && !all.some(c => c.key === requested)) {
            return res.status(404).json({ error: 'Esa categoría de inscripción no existe en este evento.' });
        }
        const categories = requested ? all.filter(c => c.key === requested) : all;
        const decorated = await Promise.all(categories.map(c => decorateCategory(event.id, c, edition)));

        // Los botones se calculan siempre sobre TODAS las categorías, aunque la
        // respuesta venga filtrada: son la navegación de la ficha, no del
        // formulario.
        const allDecorated = requested
            ? await Promise.all(all.map(c => decorateCategory(event.id, c, edition)))
            : decorated;
        const { locale, countryCode, languages } = readVisitorOrigin(req);
        const ctaConfig = edition.settings?.cta || {};
        const hint = resolveAudienceHint({
            locale, countryCode, languages,
            config: normalizeCtaConfig(ctaConfig, allDecorated),
        });
        const cta = resolveCtaButtons({
            categories: allDecorated,
            config: ctaConfig,
            audience: hint.audience,
            language: locale || languages[0] || '',
        });

        const today = new Date().toISOString().slice(0, 10);
        const editionClosed = Boolean(edition.closesAt && today > edition.closesAt)
            || Boolean(edition.opensAt && today < edition.opensAt);

        res.json({
            visitor: {
                audience: hint.audience,
                source: hint.source,
                locale: hint.locale || null,
                countryCode: hint.countryCode || null,
            },
            cta,
            /** La categoría que quedó fijada por el botón, si se entró por uno. */
            lockedCategory: requested || null,
            event: {
                id: event.id,
                slug: event.slug,
                title: event.title,
                startDate: event.startDate,
                endDate: event.endDate,
                location: event.location,
            },
            edition: {
                editionNumber: edition.editionNumber,
                editionLabel: edition.editionLabel,
                venue: edition.venue,
                city: edition.city,
                country: edition.country,
                opensAt: edition.opensAt,
                closesAt: edition.closesAt,
            },
            enabled: edition.registrationOpen && decorated.length > 0,
            closed: editionClosed,
            successMessage: clean(edition.settings?.successMessage, 600),
            categories: decorated,
        });
    } catch (error) {
        console.error('[event-registrations] getPublicRegistrationConfig:', error);
        res.status(500).json({ error: 'No se pudo cargar el registro del evento' });
    }
};

// ── Público: guardar la inscripción ──────────────────────────────────

/** Lee del cuerpo los acompañantes, ya recortados a lo que permite la categoría. */
const readCompanions = (body, category) => {
    if (!category.companions.allowed) return [];
    const raw = Array.isArray(body?.companions) ? body.companions : [];
    return raw.slice(0, category.companions.max).map(c => {
        const out = {};
        for (const field of COMPANION_FIELDS) out[field.key] = clean(c?.[field.key], field.max || 200);
        if (out.email) out.email = out.email.toLowerCase();
        return out;
    });
};

/**
 * Crea o actualiza la inscripción.
 *
 * `mode: 'draft'` guarda sin validar (es el autoguardado del asistente).
 * `mode: 'submit'` valida todo, congela el precio y deja la inscripción lista
 * para el cobro.
 */
const saveRegistration = async (req, res, mode) => {
    await ensureEventRegistrationSchema();
    const body = req.body || {};

    const event = await loadEvent(clean(body.eventRef, 200), clean(body.clubId, 100) || null);
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

    const edition = await ensureEdition(event);
    if (!edition.registrationOpen) {
        return res.status(400).json({ error: 'El registro de este evento no está abierto.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (edition.opensAt && today < edition.opensAt) {
        return res.status(400).json({ error: `El registro abre el ${edition.opensAt}.` });
    }
    if (edition.closesAt && today > edition.closesAt) {
        return res.status(400).json({ error: 'El registro de este evento ya cerró.' });
    }

    const category = await findCategory(event.id, body.categoryKey);
    if (!category || !category.active) {
        return res.status(400).json({ error: 'Elige una categoría de participante válida.' });
    }
    const window = categoryWindow(category);
    if (!window.open) {
        return res.status(400).json({
            error: window.reason === 'not_yet'
                ? `Las inscripciones de "${category.name}" abren el ${window.opensAt}.`
                : `Las inscripciones de "${category.name}" ya cerraron.`,
        });
    }

    const answers = typeof body.answers === 'object' && body.answers ? body.answers : {};
    const companions = readCompanions(body, category);

    // ── Validación (sólo al enviar; el borrador se guarda como venga) ──
    if (mode === 'submit') {
        const { ok, errors } = validateAnswers(category, answers);
        if (!ok) {
            return res.status(400).json({ error: 'Revisa los campos marcados.', fieldErrors: errors });
        }
        for (let i = 0; i < companions.length; i++) {
            const check = validateCompanion(companions[i], category.companions);
            if (!check.ok) {
                return res.status(400).json({
                    error: `Faltan datos del acompañante ${i + 1}.`,
                    companionErrors: { [i]: check.errors },
                });
            }
        }
    }
    if (!isEmail(answers.email)) {
        return res.status(400).json({ error: 'Escribe un correo electrónico válido.', fieldErrors: { email: 'Correo inválido.' } });
    }

    const email = clean(answers.email, 200).toLowerCase();

    // ── Evitar duplicados ────────────────────────────────────────────
    // La misma persona en la misma categoría del mismo evento retoma su
    // inscripción en vez de crear otra. Si ya la tiene confirmada, se le dice.
    let existing = null;
    if (clean(body.registrationId, 60)) {
        existing = await findRegistration(clean(body.registrationId, 60));
        // El id por sí solo no basta: hay que traer el token que se entregó al
        // crear el borrador, para que nadie edite la inscripción de otro.
        if (existing && existing.accessToken && existing.accessToken !== clean(body.accessToken, 48)) {
            return res.status(403).json({ error: 'No pudimos verificar esta inscripción. Empieza de nuevo.' });
        }
        if (existing && existing.eventId !== event.id) existing = null;
        // Una inscripción ya liquidada o cerrada NO se reescribe, ni siquiera
        // con su propio token: reenviar el formulario la devolvería a "registro
        // iniciado" y borraría la fecha de pago. Sin esta guarda, quien
        // conserve la pestaña abierta puede degradar su propia inscripción
        // pagada volviendo a pulsar enviar.
        if (existing && (SETTLED_STATUSES.includes(existing.status) || !RESUMABLE.includes(existing.status))) {
            return res.status(409).json({
                error: SETTLED_STATUSES.includes(existing.status)
                    ? 'Esta inscripción ya está confirmada. Escríbenos si necesitas cambiar algún dato.'
                    : 'Esta inscripción ya no admite cambios. Escríbenos si necesitas ayuda.',
                duplicate: true,
            });
        }
    }
    if (!existing) {
        const { rows } = await db.query(
            `SELECT * FROM "EventRegistration"
             WHERE "eventId" = $1 AND lower(email) = $2 AND "categoryKey" = $3
             ORDER BY "createdAt" DESC LIMIT 1`,
            [event.id, email, category.key]);
        const candidate = rows[0];
        if (candidate && SETTLED_STATUSES.includes(candidate.status)) {
            return res.status(409).json({
                error: `Ya existe una inscripción confirmada para ${email} en la categoría "${category.name}". Escríbenos si necesitas cambiarla.`,
                duplicate: true,
            });
        }
        if (candidate && RESUMABLE.includes(candidate.status)) existing = candidate;
    }

    // ── Cupo ─────────────────────────────────────────────────────────
    const seats = 1 + companions.length;
    if (category.capacity) {
        const usage = await categoryUsage(event.id, category.key);
        // Si ya ocupaba cupo, sus propios asientos no cuentan contra él.
        const own = existing && COMMITTED_STATUSES.includes(existing.status)
            ? 1 + (existing.companionsCount || 0) : 0;
        const remaining = category.capacity - usage.seats + own;
        if (remaining <= 0) {
            return res.status(409).json({ error: `La categoría "${category.name}" está agotada.`, soldOut: true });
        }
        if (mode === 'submit' && seats > remaining) {
            return res.status(409).json({
                error: `Sólo quedan ${remaining} cupos en "${category.name}" y estás inscribiendo ${seats}.`,
            });
        }
    }

    // ── Precio: se calcula aquí y se congela ─────────────────────────
    const charge = resolveCharge({ category, companionsCount: companions.length, fx: edition.fx });
    const status = mode === 'draft'
        ? STATUS.DRAFT
        : charge.chargeAmount > 0 ? STATUS.STARTED : STATUS.FREE;

    const pricing = {
        categoryKey: category.key,
        categoryName: category.name,
        // Identifica la tarifa vigente al abrir la inscripción. Si mañana se
        // cambia el precio, esta foto sigue diciendo con cuál entró.
        tariffVersion: tariffVersionOf(category),
        holderAmount: charge.holderAmount,
        companionUnit: charge.companionUnit,
        companionsAmount: charge.companionsAmount,
        companionsCount: charge.companionsCount,
        baseCurrency: charge.baseCurrency,
        baseAmount: charge.baseAmount,
        chargeCurrency: charge.chargeCurrency,
        chargeAmount: charge.chargeAmount,
        fxRate: charge.fxRate,
        fxSource: charge.fxSource,
        fxUpdatedAt: charge.fxUpdatedAt,
        converted: charge.converted,
        frozenAt: new Date().toISOString(),
    };

    const tags = deriveSystemTags({
        categoryKey: category.key, audience: category.audience,
        status, companionsCount: companions.length,
    });
    // Las etiquetas manuales que el equipo ya hubiera puesto se conservan.
    const manualTags = (store.parseJson(existing?.tags, []) || []).filter(t => !SYSTEM_TAG_KEYS.includes(t));
    const allTags = [...new Set([...tags, ...manualTags])];

    const columns = {
        eventId: event.id,
        clubId: event.clubId || null,
        categoryId: category.id,
        categoryKey: category.key,
        categoryLabel: category.name,
        audience: category.audience,
        firstName: clean(answers.firstName, 120),
        lastName: clean(answers.lastName, 120),
        email,
        phone: clean(answers.phone, 60),
        country: clean(answers.country, 120),
        city: clean(answers.city, 120),
        district: clean(answers.district, 40),
        documentNumber: clean(answers.documentNumber, 60),
        rotaryRole: clean(answers.rotaryRole, 60),
        language: clean(answers.language, 20),
        dietary: clean(answers.dietary, 40),
        clubName: clean(answers.clubName, 200),
        answers: JSON.stringify(answers),
        tags: JSON.stringify(allTags),
        baseCurrency: charge.baseCurrency,
        baseAmount: charge.baseAmount,
        chargeCurrency: charge.chargeCurrency,
        chargeAmount: charge.chargeAmount,
        fxRate: charge.fxRate,
        pricing: JSON.stringify(pricing),
        companionsCount: companions.length,
        companionsAmount: charge.companionsAmount,
        notes: clean(answers.accessibility, 1000),
        status,
        // Se mantienen las columnas de v4.606 para que la vista y el CSV
        // anteriores sigan mostrando algo coherente.
        ticketKey: category.key,
        ticketLabel: category.name,
        quantity: seats,
        unitAmount: charge.holderAmount,
        totalAmount: charge.baseAmount,
        currency: charge.baseCurrency,
        lastActivityAt: new Date(),
        submittedAt: mode === 'submit' ? new Date() : (existing?.submittedAt || null),
        paidAt: status === STATUS.FREE ? new Date() : (existing?.paidAt || null),
    };

    let row;
    if (existing) {
        const keys = Object.keys(columns);
        const sets = keys.map((k, i) => `"${k}" = $${i + 1}`);
        const values = keys.map(k => columns[k]);
        values.push(existing.id);
        const { rows } = await db.query(
            `UPDATE "EventRegistration" SET ${sets.join(', ')}, "updatedAt" = NOW()
             WHERE id = $${values.length} RETURNING *`, values);
        row = rows[0];
    } else {
        const withIdentity = {
            ...columns,
            publicRef: buildPublicRef(),
            accessToken: randomCodeSuffix(24),
        };
        const keys = Object.keys(withIdentity);
        const { rows } = await db.query(
            `INSERT INTO "EventRegistration" (${keys.map(k => `"${k}"`).join(', ')})
             VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
            keys.map(k => withIdentity[k]));
        row = rows[0];
    }

    await replaceCompanions(row.id, event.id, companions, {
        amount: charge.companionUnit,
        currency: charge.baseCurrency,
        categoryKey: category.key,
    });

    if (mode === 'submit') {
        await recordHistory({
            registrationId: row.id, eventId: event.id, type: 'submitted',
            fromStatus: existing?.status || null, toStatus: status,
            comment: `Formulario enviado — ${category.name}`,
            payload: { seats, pricing },
        });
        if (status === STATUS.FREE) {
            await assignRegistrationCode(row.id, edition.codePrefix);
            const fresh = await findRegistration(row.id);
            await notifyRegistration(fresh, event, edition);
            row = fresh;
        }
    }

    return res.json({
        ...toPublicRegistration(row),
        accessToken: row.accessToken,
        companions: await listCompanions(row.id),
    });
};

// POST /api/event-registrations/draft — autoguardado del asistente.
export const saveDraft = async (req, res) => {
    try {
        return await saveRegistration(req, res, 'draft');
    } catch (error) {
        console.error('[event-registrations] saveDraft:', error);
        return res.status(500).json({ error: 'No pudimos guardar tu avance.' });
    }
};

// POST /api/event-registrations — envío del formulario completo.
export const createRegistration = async (req, res) => {
    try {
        return await saveRegistration(req, res, 'submit');
    } catch (error) {
        console.error('[event-registrations] createRegistration:', error);
        return res.status(500).json({ error: 'No pudimos registrar tu inscripción. Inténtalo de nuevo.' });
    }
};

// ── Público: pago ────────────────────────────────────────────────────

// POST /api/event-registrations/:id/checkout
export const createCheckout = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const registration = await findRegistration(req.params.id);
        if (!registration) return res.status(404).json({ error: 'Inscripción no encontrada' });
        if (registration.accessToken && registration.accessToken !== clean(req.body?.accessToken, 48)) {
            return res.status(403).json({ error: 'No pudimos verificar esta inscripción.' });
        }
        if (SETTLED_STATUSES.includes(registration.status)) {
            return res.status(400).json({ error: 'Esta inscripción ya tiene el pago confirmado.' });
        }
        if (registration.status === STATUS.DRAFT) {
            return res.status(400).json({ error: 'Completa el formulario antes de pagar.' });
        }

        const event = await loadEvent(registration.eventId, registration.clubId);
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        // El importe sale de la foto congelada en la inscripción, que la
        // escribió el servidor al enviar el formulario. No se recalcula contra
        // la configuración viva —cambiar el precio de la categoría no debe
        // mover lo que ya se le prometió a quien está pagando— ni se acepta
        // nada del navegador.
        const pricing = store.parseJson(registration.pricing, {});
        const amount = Number(pricing.chargeAmount ?? registration.chargeAmount ?? 0);
        const currency = String(pricing.chargeCurrency || registration.chargeCurrency || 'USD');
        if (!(amount > 0)) {
            return res.status(400).json({ error: 'Esta inscripción no tiene un importe por cobrar.' });
        }

        const origin = resolveOrigin(req, req.body?.returnUrl);
        const path = `/eventos/${event.slug || event.id}/registro`;
        const label = `${registration.categoryLabel || 'Inscripción'} — ${event.title}`.slice(0, 250);
        const detail = registration.companionsCount > 0
            ? `Titular + ${registration.companionsCount} acompañante(s)`
            : `Inscripción de ${registration.firstName} ${registration.lastName}`;

        const session = await getStripe().checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: registration.email,
            line_items: [{
                price_data: {
                    currency: currency.toLowerCase(),
                    product_data: { name: label, description: detail.slice(0, 250) },
                    unit_amount: toStripeAmount(amount, currency),
                },
                quantity: 1,
            }],
            success_url: `${origin}${path}?registro=${registration.id}&t=${registration.accessToken || ''}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}${path}?registro=${registration.id}&t=${registration.accessToken || ''}&pago=cancelado`,
            // La misma metadata viaja al PaymentIntent para que los eventos de
            // pago fallido y de reembolso lleguen ligados a la inscripción.
            payment_intent_data: {
                metadata: {
                    type: 'event_registration',
                    registrationId: registration.id,
                    publicRef: registration.publicRef || '',
                    eventId: event.id,
                },
            },
            metadata: {
                type: 'event_registration',
                registrationId: registration.id,
                publicRef: registration.publicRef || '',
                eventId: event.id,
                categoryKey: registration.categoryKey || '',
                // Deja rastro del cambio en el propio Stripe: si el cobro se
                // hizo en dólares por un precio publicado en pesos, la
                // conciliación no depende sólo de nuestra base.
                baseCurrency: pricing.baseCurrency || '',
                baseAmount: String(pricing.baseAmount ?? ''),
                fxRate: pricing.fxRate ? String(pricing.fxRate) : '',
            },
        });

        await db.query(
            `UPDATE "EventRegistration"
             SET "stripeSessionId" = $1, status = $2, "lastActivityAt" = NOW(), "updatedAt" = NOW()
             WHERE id = $3`,
            [session.id, STATUS.PENDING, registration.id]);

        await recordHistory({
            registrationId: registration.id, eventId: event.id, type: 'checkout_created',
            fromStatus: registration.status, toStatus: STATUS.PENDING,
            comment: `Cobro por ${formatMoney(amount, currency)}`,
            payload: { sessionId: session.id, amount, currency, fxRate: pricing.fxRate || null },
        });

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('[event-registrations] createCheckout:', error);
        res.status(500).json({ error: error.message || 'No se pudo iniciar el pago.' });
    }
};

// GET /api/event-registrations/:id?t=<accessToken>
export const getRegistration = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const registration = await findRegistration(req.params.id);
        if (!registration) return res.status(404).json({ error: 'Inscripción no encontrada' });
        // Las filas anteriores a v4.648 no tienen token: se siguen sirviendo
        // como antes para no romper los enlaces ya enviados por correo.
        if (registration.accessToken && registration.accessToken !== clean(req.query?.t, 48)) {
            return res.status(403).json({ error: 'No pudimos verificar esta inscripción.' });
        }
        res.json({
            ...toPublicRegistration(registration),
            companions: await listCompanions(registration.id),
        });
    } catch (error) {
        console.error('[event-registrations] getRegistration:', error);
        res.status(500).json({ error: 'No se pudo cargar la inscripción' });
    }
};

// ── Correos ──────────────────────────────────────────────────────────

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Cuerpo del comprobante. Se usa para el asistente y para el aviso al equipo. */
const buildReceiptHtml = (registration, event, edition, companions) => {
    const pricing = store.parseJson(registration.pricing, {});
    const lines = [
        ['Código de inscripción', registration.registrationCode || registration.publicRef],
        ['Categoría', registration.categoryLabel],
        ['Participante', `${registration.firstName} ${registration.lastName}`],
        ['Correo', registration.email],
        edition?.venue || event.location ? ['Sede', edition?.venue || event.location] : null,
        event.startDate ? ['Fecha', new Date(event.startDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })] : null,
        companions.length ? ['Acompañantes', String(companions.length)] : null,
    ].filter(Boolean);

    if (Number(pricing.baseAmount) > 0) {
        lines.push(['Valor', formatMoney(pricing.baseAmount, pricing.baseCurrency)]);
        // Si se cobró en otra moneda, el comprobante lo dice: el participante
        // ve en su extracto un valor distinto al publicado.
        if (pricing.converted && pricing.chargeCurrency !== pricing.baseCurrency) {
            lines.push(['Cobrado', `${formatMoney(pricing.chargeAmount, pricing.chargeCurrency)} (tasa ${Number(pricing.fxRate).toLocaleString('es-CO', { maximumFractionDigits: 6 })})`]);
        }
    }

    const rows = lines.map(([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px">${escapeHtml(label)}</td>
             <td style="padding:6px 0;font-weight:600;color:#0f172a;font-size:13px">${escapeHtml(value)}</td></tr>`).join('');

    const companionList = companions.length
        ? `<p style="margin:16px 0 4px;font-size:13px;color:#64748b">Acompañantes registrados:</p>
           <ul style="margin:0;padding-left:18px;color:#0f172a;font-size:13px">
             ${companions.map(c => `<li>${escapeHtml(`${c.firstName} ${c.lastName}`)}</li>`).join('')}
           </ul>`
        : '';

    return `
        <p>Hola ${escapeHtml(registration.firstName)},</p>
        <p>Tu inscripción a <strong>${escapeHtml(event.title)}</strong> quedó confirmada.</p>
        <table style="border-collapse:collapse;margin:12px 0">${rows}</table>
        ${companionList}
        ${edition?.settings?.successMessage ? `<p>${escapeHtml(edition.settings.successMessage)}</p>` : ''}
        <p style="font-size:13px;color:#64748b">Presenta tu código de inscripción el día del evento para recoger tu escarapela.</p>
        <p>¡Nos vemos en ${escapeHtml(edition?.city || event.location || 'el evento')}!</p>
    `;
};

/** Comprobante al asistente y aviso al equipo. Nunca tumba el flujo. */
export const notifyRegistration = async (registration, event, edition) => {
    const companions = await listCompanions(registration.id);
    const html = buildReceiptHtml(registration, event, edition, companions);
    const settings = edition?.settings || {};
    const subject = `Inscripción confirmada — ${event.title}`;

    if (settings.sendReceipt !== false) {
        try {
            await EmailService.sendPlatformEmail({
                to: registration.email, from: PLATFORM_SENDER, subject, html,
            });
            await recordMessage({
                registrationId: registration.id, eventId: event.id, channel: 'email',
                template: 'confirmation', recipient: registration.email, subject, body: html,
            });
        } catch (error) {
            console.error('[event-registrations] comprobante:', error?.message);
            await recordMessage({
                registrationId: registration.id, eventId: event.id, channel: 'email',
                template: 'confirmation', recipient: registration.email, subject,
                status: 'failed', error: error?.message,
            });
        }
    }

    const adminEmails = (Array.isArray(settings.adminEmails) ? settings.adminEmails : []).filter(isEmail);
    if (adminEmails.length) {
        try {
            await EmailService.sendPlatformEmail({
                to: adminEmails.join(','), from: PLATFORM_SENDER,
                subject: `Nueva inscripción — ${event.title} (${registration.registrationCode || registration.publicRef})`,
                html: `<p>${escapeHtml(`${registration.firstName} ${registration.lastName}`)} (${escapeHtml(registration.email)}) se inscribió en <strong>${escapeHtml(registration.categoryLabel || '')}</strong>.</p>${html}`,
            });
        } catch (error) {
            console.error('[event-registrations] aviso al equipo:', error?.message);
        }
    }
};

// ── Webhook de Stripe ────────────────────────────────────────────────
//
// La fuente de verdad del pago. El retorno del navegador sólo consulta estado.

/**
 * Confirma la inscripción a partir de una Checkout Session pagada.
 *
 * Idempotente por partida doble: el UPDATE es condicional (sólo cambia filas
 * que aún no están liquidadas) y el evento de Stripe se registra con id único.
 * Si Stripe reenvía el mismo evento, no se vuelve a notificar ni a cobrar cupo.
 */
export const confirmPaidSession = async (session, stripeEvent = null) => {
    const registrationId = session?.metadata?.registrationId;
    if (!registrationId) return null;

    await ensureEventRegistrationSchema();
    const registration = await findRegistration(registrationId);
    if (!registration) return null;

    const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent : session.payment_intent?.id || null;
    const customerId = typeof session.customer === 'string'
        ? session.customer : session.customer?.id || null;

    const pricing = store.parseJson(registration.pricing, {});
    // `amount_total` viene en la unidad mínima de la moneda; las de cero
    // decimales (COP no lo es, pero CLP o JPY sí) no se dividen.
    const amount = session.amount_total != null
        ? session.amount_total / (ZERO_DECIMAL.has(String(session.currency || '').toLowerCase()) ? 1 : 100)
        : Number(pricing.chargeAmount ?? registration.chargeAmount ?? 0);

    const fresh = await recordPayment({
        registrationId, eventId: registration.eventId,
        stripeEventId: stripeEvent?.id || null,
        checkoutSessionId: session.id || null,
        paymentIntentId, customerId,
        status: 'succeeded',
        baseCurrency: pricing.baseCurrency || registration.baseCurrency,
        baseAmount: pricing.baseAmount ?? registration.baseAmount,
        currency: (session.currency || pricing.chargeCurrency || 'USD').toUpperCase(),
        amount,
        fxRate: pricing.fxRate ?? null,
        paymentMethod: session.payment_method_types?.[0] || 'card',
        payload: { sessionId: session.id, mode: session.mode, status: session.payment_status },
    });
    if (!fresh) return registration; // evento repetido de Stripe

    // Sólo avanza si todavía no estaba liquidada: dos webhocks simultáneos no
    // pueden confirmar la misma inscripción dos veces.
    const { rows } = await db.query(
        `UPDATE "EventRegistration"
         SET status = $1, "paidAt" = COALESCE("paidAt", NOW()),
             "stripeSessionId" = COALESCE($2, "stripeSessionId"),
             "stripePaymentIntentId" = COALESCE($3, "stripePaymentIntentId"),
             "stripeCustomerId" = COALESCE($4, "stripeCustomerId"),
             "paymentMethod" = COALESCE($5, "paymentMethod"),
             "lastActivityAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $6 AND status <> ALL($7) RETURNING *`,
        [
            STATUS.PAID, session.id || null, paymentIntentId, customerId,
            session.payment_method_types?.[0] || null, registrationId, SETTLED_STATUSES,
        ]);
    if (!rows[0]) return registration;

    const event = await loadEvent(rows[0].eventId, rows[0].clubId);
    if (!event) return rows[0];
    const edition = await ensureEdition(event);

    await assignRegistrationCode(rows[0].id, edition.codePrefix);
    const updated = await findRegistration(rows[0].id);

    await recordHistory({
        registrationId: updated.id, eventId: updated.eventId, type: 'payment_confirmed',
        fromStatus: registration.status, toStatus: STATUS.PAID,
        comment: `Pago confirmado por Stripe — ${formatMoney(amount, session.currency?.toUpperCase() || pricing.chargeCurrency)}`,
        payload: { sessionId: session.id, paymentIntentId },
    });

    await notifyRegistration(updated, event, edition);
    return updated;
};

/** Aplica a la inscripción el desenlace que informe Stripe. */
export const applyStripeStatus = async (object, kind, stripeEvent = null) => {
    const status = kind === 'failed' ? STATUS.FAILED
        : kind === 'expired' ? STATUS.EXPIRED
            : kind === 'refunded' ? STATUS.REFUNDED
                : null;
    if (!status) return null;

    await ensureEventRegistrationSchema();

    // `charge.refunded` no siempre trae metadata: se resuelve por PaymentIntent.
    const registrationId = object?.metadata?.registrationId || null;
    const intentId = object?.payment_intent || (kind === 'failed' ? object?.id : null);

    const { rows: found } = registrationId
        ? await db.query('SELECT * FROM "EventRegistration" WHERE id = $1 LIMIT 1', [registrationId])
        : intentId
            ? await db.query('SELECT * FROM "EventRegistration" WHERE "stripePaymentIntentId" = $1 LIMIT 1', [intentId])
            : { rows: [] };
    const registration = found[0];
    if (!registration) return null;

    const refundedAmount = kind === 'refunded' && object?.amount_refunded != null
        ? object.amount_refunded / 100 : null;

    const fresh = await recordPayment({
        registrationId: registration.id, eventId: registration.eventId,
        stripeEventId: stripeEvent?.id || null,
        paymentIntentId: intentId || registration.stripePaymentIntentId,
        chargeId: kind === 'refunded' ? object?.id : null,
        status: kind,
        currency: (object?.currency || registration.chargeCurrency || 'USD').toUpperCase(),
        amount: refundedAmount ?? Number(registration.chargeAmount || 0),
        refundedAmount,
        failureMessage: object?.last_payment_error?.message || object?.failure_message || null,
        payload: { kind, objectId: object?.id },
    });
    if (!fresh) return registration;

    const { rows } = await db.query(
        `UPDATE "EventRegistration"
         SET status = $1,
             "stripeChargeId" = COALESCE($2, "stripeChargeId"),
             "refundedAt" = CASE WHEN $3::text = 'refunded' THEN NOW() ELSE "refundedAt" END,
             "refundedAmount" = COALESCE($4, "refundedAmount"),
             "lastActivityAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $5 RETURNING *`,
        [status, kind === 'refunded' ? object?.id || null : null, kind, refundedAmount, registration.id]);

    await recordHistory({
        registrationId: registration.id, eventId: registration.eventId, type: `payment_${kind}`,
        fromStatus: registration.status, toStatus: status,
        comment: kind === 'refunded' ? 'Stripe reembolsó el pago.'
            : kind === 'failed' ? 'Stripe rechazó el cobro.'
                : 'La sesión de pago expiró.',
        payload: { objectId: object?.id },
    });

    return rows[0] || null;
};

export default {
    getPublicRegistrationConfig,
    saveDraft,
    createRegistration,
    createCheckout,
    getRegistration,
    confirmPaidSession,
    applyStripeStatus,
    notifyRegistration,
    STATUS,
    STATUSES,
};
