// ════════════════════════════════════════════════════════════════════
// Registro de asistentes a un evento — v4.606.0
//
// Permite que el público se inscriba directamente desde la ficha de un
// evento y pague su entrada con Stripe.
//
// Configuración: vive en `metadata.registration` del propio evento, así que
// es aditiva y no cambia el esquema. La edita el administrador en la pestaña
// "Registro" del evento:
//
//   { enabled, currency, closesAt, tickets: [{ key, label, description,
//     amount, capacity }], requireClub, adminEmails, sendReceipt,
//     successMessage }
//
// Persistencia: la tabla "EventRegistration" se crea de forma perezosa con
// SQL crudo (CREATE TABLE IF NOT EXISTS), igual que "ProjectFairSubmission" y
// "BannerTemplate". Queda FUERA de Prisma a propósito: el `prisma db push`
// del build no la toca y los datos del cliente sobreviven a los despliegues.
// NINGUNA operación de este archivo es destructiva.
//
// Pagos: NO se crea una integración nueva de Stripe. Se reutiliza la cuenta y
// el webhook existentes (/api/payments/webhook) creando una Checkout Session
// con metadata.type = 'event_registration'.
// ════════════════════════════════════════════════════════════════════
import Stripe from 'stripe';
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';

console.log('[eventRegistrationController] v4.606.0 cargado — registro de asistentes a eventos con pago por Stripe. Formulario en /eventos/:evento/registro');

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
const DEFAULT_FRONTEND_URL = 'https://app.clubplatform.org';
const PLATFORM_SENDER = '"Registro de eventos" <noreply@clubplatform.org>';

// Monedas que Stripe cobra sin decimales: su importe va tal cual, no en
// centavos. El resto se multiplica por 100.
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const toStripeAmount = (amount, currency) =>
    ZERO_DECIMAL.has(String(currency || '').toLowerCase())
        ? Math.round(Number(amount) || 0)
        : Math.round((Number(amount) || 0) * 100);

/** Estados posibles de una inscripción. */
export const STATUS = {
    PENDING: 'pending_payment',
    PAID: 'paid',
    FREE: 'confirmed',        // entradas sin costo: no pasan por Stripe
    FAILED: 'payment_failed',
    EXPIRED: 'expired',
    REFUNDED: 'refunded',
};

// ── Tabla ────────────────────────────────────────────────────────────
let _tableReady = false;
const ensureTable = async () => {
    if (_tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS "EventRegistration" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "publicRef" VARCHAR(20),
            "eventId" TEXT NOT NULL,
            "clubId" TEXT,
            "firstName" VARCHAR(120),
            "lastName" VARCHAR(120),
            email VARCHAR(200) NOT NULL,
            phone VARCHAR(60),
            country VARCHAR(120),
            "clubName" VARCHAR(200),
            "ticketKey" VARCHAR(80),
            "ticketLabel" VARCHAR(200),
            quantity INTEGER NOT NULL DEFAULT 1,
            "unitAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
            "totalAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency VARCHAR(10) NOT NULL DEFAULT 'USD',
            status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
            notes TEXT,
            "stripeSessionId" TEXT,
            "stripePaymentIntentId" TEXT,
            "paidAt" TIMESTAMPTZ,
            metadata JSONB DEFAULT '{}',
            "createdAt" TIMESTAMPTZ DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "EventRegistration_event_idx" ON "EventRegistration" ("eventId");`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "EventRegistration_status_idx" ON "EventRegistration" (status);`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "EventRegistration_session_idx" ON "EventRegistration" ("stripeSessionId");`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS "EventRegistration_email_idx" ON "EventRegistration" (email);`).catch(() => {});
    _tableReady = true;
};

// ── Utilidades ───────────────────────────────────────────────────────
const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

const resolveOrigin = (req, returnUrl) => {
    if (returnUrl && /^https?:\/\//.test(returnUrl)) return returnUrl.replace(/\/$/, '');
    const headerOrigin = req.headers?.origin;
    if (headerOrigin && /^https?:\/\//.test(headerOrigin)) return headerOrigin.replace(/\/$/, '');
    return DEFAULT_FRONTEND_URL;
};

/** Referencia corta y legible que el asistente puede citar por correo. */
const buildPublicRef = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return `EV-${out}`;
};

/** Busca el evento por id o por slug y devuelve también su configuración. */
const loadEvent = async (eventRef, clubId) => {
    const params = clubId ? [eventRef, clubId] : [eventRef];
    const where = clubId ? '(id = $1 OR slug = $1) AND "clubId" = $2' : '(id = $1 OR slug = $1)';
    const { rows } = await db.query(
        `SELECT id, slug, title, "startDate", location, "clubId", metadata
         FROM "CalendarEvent" WHERE ${where} LIMIT 1`,
        params
    );
    return rows[0] || null;
};

/** Configuración de registro del evento, con los valores por defecto. */
export const readRegistrationConfig = (event) => {
    const cfg = event?.metadata?.registration || {};
    const tickets = (Array.isArray(cfg.tickets) ? cfg.tickets : [])
        .map((t, i) => ({
            key: clean(t?.key, 80) || `ticket-${i + 1}`,
            label: clean(t?.label, 200) || `Entrada ${i + 1}`,
            description: clean(t?.description, 400),
            amount: Math.max(0, Number(t?.amount) || 0),
            capacity: Number(t?.capacity) > 0 ? Math.floor(Number(t.capacity)) : null,
        }))
        .filter(t => t.label);
    return {
        enabled: cfg.enabled === true,
        currency: (clean(cfg.currency, 10) || 'USD').toUpperCase(),
        closesAt: clean(cfg.closesAt, 30),
        requireClub: cfg.requireClub !== false,
        sendReceipt: cfg.sendReceipt !== false,
        adminEmails: Array.isArray(cfg.adminEmails) ? cfg.adminEmails.filter(isEmail) : [],
        successMessage: clean(cfg.successMessage, 600),
        maxPerRegistration: Number(cfg.maxPerRegistration) > 0 ? Math.floor(Number(cfg.maxPerRegistration)) : 10,
        tickets,
    };
};

/** ¿Ya cerró el registro? `closesAt` se interpreta al final del día indicado. */
const isClosed = (cfg) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cfg.closesAt || '');
    if (!match) return false;
    const limit = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
    return Date.now() > limit.getTime();
};

/** Entradas ya comprometidas de un tipo (pagadas, confirmadas o en pago). */
const soldForTicket = async (eventId, ticketKey) => {
    const { rows } = await db.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS total
         FROM "EventRegistration"
         WHERE "eventId" = $1 AND "ticketKey" = $2 AND status = ANY($3)`,
        [eventId, ticketKey, [STATUS.PAID, STATUS.FREE, STATUS.PENDING]]
    );
    return rows[0]?.total || 0;
};

/** Vista pública de una inscripción: sin datos internos ni de Stripe. */
const toPublicRegistration = (row) => row && ({
    id: row.id,
    publicRef: row.publicRef,
    status: row.status,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    ticketLabel: row.ticketLabel,
    quantity: row.quantity,
    unitAmount: Number(row.unitAmount),
    totalAmount: Number(row.totalAmount),
    currency: row.currency,
    paidAt: row.paidAt,
});

// ── Público ──────────────────────────────────────────────────────────

// GET /api/event-registrations/config/:clubId/:eventRef
// Entradas disponibles y estado del registro para pintar el formulario.
export const getPublicRegistrationConfig = async (req, res) => {
    try {
        await ensureTable();
        const event = await loadEvent(req.params.eventRef, req.params.clubId);
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        const cfg = readRegistrationConfig(event);
        const closed = isClosed(cfg);

        // Se informa el cupo restante de cada entrada para que el formulario
        // pueda mostrar "agotada" antes de que la persona llene sus datos.
        const tickets = await Promise.all(cfg.tickets.map(async (t) => {
            if (!t.capacity) return { ...t, remaining: null, soldOut: false };
            const sold = await soldForTicket(event.id, t.key);
            const remaining = Math.max(0, t.capacity - sold);
            return { ...t, remaining, soldOut: remaining <= 0 };
        }));

        res.json({
            event: {
                id: event.id,
                slug: event.slug,
                title: event.title,
                startDate: event.startDate,
                location: event.location,
            },
            enabled: cfg.enabled,
            closed,
            currency: cfg.currency,
            closesAt: cfg.closesAt,
            requireClub: cfg.requireClub,
            maxPerRegistration: cfg.maxPerRegistration,
            successMessage: cfg.successMessage,
            tickets,
        });
    } catch (error) {
        console.error('[event-registrations] getPublicRegistrationConfig:', error);
        res.status(500).json({ error: 'No se pudo cargar el registro del evento' });
    }
};

// POST /api/event-registrations
// Crea la inscripción. El importe NUNCA viene del cliente: se toma de la
// configuración del evento.
export const createRegistration = async (req, res) => {
    try {
        await ensureTable();
        const { clubId, eventRef, ticketKey, quantity, firstName, lastName, email, phone, country, clubName, notes } = req.body || {};

        const event = await loadEvent(clean(eventRef, 200), clean(clubId, 100) || null);
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        const cfg = readRegistrationConfig(event);
        if (!cfg.enabled) return res.status(400).json({ error: 'El registro de este evento no está abierto.' });
        if (isClosed(cfg)) return res.status(400).json({ error: 'El registro de este evento ya cerró.' });
        if (!cfg.tickets.length) return res.status(400).json({ error: 'El evento no tiene entradas configuradas.' });

        const ticket = cfg.tickets.find(t => t.key === clean(ticketKey, 80)) || (cfg.tickets.length === 1 ? cfg.tickets[0] : null);
        if (!ticket) return res.status(400).json({ error: 'Elige el tipo de entrada.' });

        const qty = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), cfg.maxPerRegistration);

        if (!isEmail(email)) return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
        if (!clean(firstName)) return res.status(400).json({ error: 'Escribe tu nombre.' });
        if (!clean(lastName)) return res.status(400).json({ error: 'Escribe tus apellidos.' });
        if (cfg.requireClub && !clean(clubName)) return res.status(400).json({ error: 'Indica el club u organización a la que perteneces.' });

        if (ticket.capacity) {
            const sold = await soldForTicket(event.id, ticket.key);
            const remaining = ticket.capacity - sold;
            if (remaining <= 0) return res.status(409).json({ error: `Las entradas "${ticket.label}" están agotadas.` });
            if (qty > remaining) {
                return res.status(409).json({ error: `Sólo quedan ${remaining} entradas "${ticket.label}".` });
            }
        }

        const total = Math.round(ticket.amount * qty * 100) / 100;
        // Las entradas sin costo quedan confirmadas de una vez: no tiene
        // sentido mandar a Stripe un cobro de cero.
        const status = total > 0 ? STATUS.PENDING : STATUS.FREE;

        const { rows } = await db.query(
            `INSERT INTO "EventRegistration"
                ("publicRef", "eventId", "clubId", "firstName", "lastName", email, phone, country,
                 "clubName", "ticketKey", "ticketLabel", quantity, "unitAmount", "totalAmount",
                 currency, status, notes, "paidAt", metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             RETURNING *`,
            [
                buildPublicRef(), event.id, event.clubId, clean(firstName, 120), clean(lastName, 120),
                clean(email, 200).toLowerCase(), clean(phone, 60), clean(country, 120), clean(clubName, 200),
                ticket.key, ticket.label, qty, ticket.amount, total, cfg.currency, status, clean(notes, 1000),
                status === STATUS.FREE ? new Date() : null,
                JSON.stringify({ eventTitle: event.title }),
            ]
        );

        const registration = rows[0];
        if (status === STATUS.FREE) await notifyRegistration(registration, event, cfg);

        res.json(toPublicRegistration(registration));
    } catch (error) {
        console.error('[event-registrations] createRegistration:', error);
        res.status(500).json({ error: 'No pudimos registrar tu inscripción. Inténtalo de nuevo.' });
    }
};

// POST /api/event-registrations/:id/checkout
export const createCheckout = async (req, res) => {
    try {
        await ensureTable();
        const { rows } = await db.query('SELECT * FROM "EventRegistration" WHERE id = $1 LIMIT 1', [req.params.id]);
        const registration = rows[0];
        if (!registration) return res.status(404).json({ error: 'Inscripción no encontrada' });
        if (registration.status === STATUS.PAID) {
            return res.status(400).json({ error: 'Esta inscripción ya tiene el pago confirmado.' });
        }

        const event = await loadEvent(registration.eventId, registration.clubId);
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        // El importe se recalcula desde la configuración: nunca se confía en
        // lo que haya quedado guardado ni en lo que mande el cliente.
        const cfg = readRegistrationConfig(event);
        const ticket = cfg.tickets.find(t => t.key === registration.ticketKey);
        if (!ticket) return res.status(400).json({ error: 'El tipo de entrada ya no está disponible.' });

        const total = Math.round(ticket.amount * registration.quantity * 100) / 100;
        if (total <= 0) return res.status(400).json({ error: 'Esta entrada no tiene costo: no requiere pago.' });

        const origin = resolveOrigin(req, req.body?.returnUrl);
        const path = `/eventos/${event.slug || event.id}/registro`;
        const stripe = getStripe();

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: registration.email,
            line_items: [{
                price_data: {
                    currency: cfg.currency.toLowerCase(),
                    product_data: {
                        name: `${ticket.label} — ${event.title}`.slice(0, 250),
                        description: ticket.description || `Registro de ${registration.firstName} ${registration.lastName}`.slice(0, 250),
                    },
                    unit_amount: toStripeAmount(ticket.amount, cfg.currency),
                },
                quantity: registration.quantity,
            }],
            success_url: `${origin}${path}?registro=${registration.id}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}${path}?registro=${registration.id}&pago=cancelado`,
            // La misma metadata viaja al PaymentIntent, para que los eventos de
            // pago fallido o reembolso lleguen ligados a la inscripción.
            payment_intent_data: {
                metadata: {
                    type: 'event_registration',
                    registrationId: registration.id,
                    publicRef: registration.publicRef || '',
                },
            },
            metadata: {
                type: 'event_registration',
                registrationId: registration.id,
                publicRef: registration.publicRef || '',
                eventId: event.id,
            },
        });

        await db.query(
            `UPDATE "EventRegistration" SET "stripeSessionId" = $1, "totalAmount" = $2, "unitAmount" = $3, "updatedAt" = NOW() WHERE id = $4`,
            [session.id, total, ticket.amount, registration.id]
        );

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('[event-registrations] createCheckout:', error);
        res.status(500).json({ error: error.message || 'No se pudo iniciar el pago.' });
    }
};

// GET /api/event-registrations/:id
export const getRegistration = async (req, res) => {
    try {
        await ensureTable();
        const { rows } = await db.query('SELECT * FROM "EventRegistration" WHERE id = $1 LIMIT 1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Inscripción no encontrada' });
        res.json(toPublicRegistration(rows[0]));
    } catch (error) {
        console.error('[event-registrations] getRegistration:', error);
        res.status(500).json({ error: 'No se pudo cargar la inscripción' });
    }
};

// ── Correos ──────────────────────────────────────────────────────────
const money = (amount, currency) =>
    `${Number(amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;

/** Comprobante al asistente y aviso al equipo. Nunca tumba el flujo. */
const notifyRegistration = async (registration, event, cfg) => {
    const summary = `
        <p>Hola ${registration.firstName},</p>
        <p>Tu registro para <strong>${event.title}</strong> quedó confirmado.</p>
        <ul>
            <li><strong>Referencia:</strong> ${registration.publicRef}</li>
            <li><strong>Entrada:</strong> ${registration.ticketLabel} × ${registration.quantity}</li>
            ${Number(registration.totalAmount) > 0 ? `<li><strong>Total:</strong> ${money(registration.totalAmount, registration.currency)}</li>` : ''}
            ${event.location ? `<li><strong>Lugar:</strong> ${event.location}</li>` : ''}
        </ul>
        ${cfg.successMessage ? `<p>${cfg.successMessage}</p>` : ''}
        <p>¡Nos vemos allí!</p>
    `;

    if (cfg.sendReceipt) {
        try {
            await EmailService.sendPlatformEmail({
                to: registration.email,
                from: PLATFORM_SENDER,
                subject: `Registro confirmado — ${event.title}`,
                html: summary,
            });
        } catch (error) {
            console.error('[event-registrations] comprobante:', error?.message);
        }
    }

    if (cfg.adminEmails.length) {
        try {
            await EmailService.sendPlatformEmail({
                to: cfg.adminEmails.join(','),
                from: PLATFORM_SENDER,
                subject: `Nuevo registro — ${event.title} (${registration.publicRef})`,
                html: `<p>${registration.firstName} ${registration.lastName} (${registration.email}) se registró.</p>${summary}`,
            });
        } catch (error) {
            console.error('[event-registrations] aviso al equipo:', error?.message);
        }
    }
};

// ── Webhook de Stripe ────────────────────────────────────────────────

/**
 * Confirma la inscripción a partir de una Checkout Session pagada.
 * Idempotente: si ya está en 'paid', no vuelve a enviar nada.
 */
export const confirmPaidSession = async (session) => {
    const registrationId = session?.metadata?.registrationId;
    if (!registrationId) return null;

    await ensureTable();
    const { rows } = await db.query('SELECT * FROM "EventRegistration" WHERE id = $1 LIMIT 1', [registrationId]);
    const registration = rows[0];
    if (!registration || registration.status === STATUS.PAID) return registration || null;

    const { rows: updatedRows } = await db.query(
        `UPDATE "EventRegistration"
         SET status = $1, "paidAt" = NOW(), "stripeSessionId" = COALESCE($2, "stripeSessionId"),
             "stripePaymentIntentId" = COALESCE($3, "stripePaymentIntentId"), "updatedAt" = NOW()
         WHERE id = $4 RETURNING *`,
        [STATUS.PAID, session.id || null, session.payment_intent || null, registrationId]
    );
    const updated = updatedRows[0];

    const event = await loadEvent(updated.eventId, updated.clubId);
    if (event) await notifyRegistration(updated, event, readRegistrationConfig(event));
    return updated;
};

/** Marca la inscripción según el evento de Stripe que llegue. */
export const applyStripeStatus = async (object, kind) => {
    const registrationId = object?.metadata?.registrationId;
    const status = kind === 'failed' ? STATUS.FAILED
        : kind === 'expired' ? STATUS.EXPIRED
            : kind === 'refunded' ? STATUS.REFUNDED
                : null;
    if (!status) return null;

    await ensureTable();
    // charge.refunded no siempre trae metadata: se busca por el PaymentIntent.
    const where = registrationId ? 'id = $2' : '"stripePaymentIntentId" = $2';
    const key = registrationId || object?.payment_intent || object?.id;
    if (!key) return null;

    const { rows } = await db.query(
        `UPDATE "EventRegistration" SET status = $1, "updatedAt" = NOW() WHERE ${where} RETURNING *`,
        [status, key]
    );
    return rows[0] || null;
};

// ── Administración ───────────────────────────────────────────────────

/** El evento debe pertenecer al sitio de quien consulta (o ser administrator). */
const assertEventAccess = async (req, eventRef) => {
    const event = await loadEvent(eventRef, req.user?.role === 'administrator' ? null : req.user?.clubId);
    if (!event) return null;
    if (req.user?.role !== 'administrator' && event.clubId !== req.user?.clubId) return null;
    return event;
};

// GET /api/event-registrations/admin?eventRef=...
export const listRegistrations = async (req, res) => {
    try {
        await ensureTable();
        const event = await assertEventAccess(req, clean(req.query.eventRef, 200));
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        const { rows } = await db.query(
            `SELECT * FROM "EventRegistration" WHERE "eventId" = $1 ORDER BY "createdAt" DESC`,
            [event.id]
        );

        const paid = rows.filter(r => r.status === STATUS.PAID || r.status === STATUS.FREE);
        res.json({
            event: { id: event.id, slug: event.slug, title: event.title },
            registrations: rows,
            totals: {
                count: rows.length,
                confirmed: paid.length,
                attendees: paid.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0),
                pending: rows.filter(r => r.status === STATUS.PENDING).length,
                revenue: paid.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0),
                currency: rows[0]?.currency || readRegistrationConfig(event).currency,
            },
        });
    } catch (error) {
        console.error('[event-registrations] listRegistrations:', error);
        res.status(500).json({ error: 'No se pudieron cargar las inscripciones' });
    }
};

// GET /api/event-registrations/admin/export.csv?eventRef=...
export const exportRegistrationsCsv = async (req, res) => {
    try {
        await ensureTable();
        const event = await assertEventAccess(req, clean(req.query.eventRef, 200));
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        const { rows } = await db.query(
            `SELECT * FROM "EventRegistration" WHERE "eventId" = $1 ORDER BY "createdAt" DESC`,
            [event.id]
        );

        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['Referencia', 'Nombre', 'Apellidos', 'Correo', 'Teléfono', 'País', 'Club', 'Entrada', 'Cantidad', 'Total', 'Moneda', 'Estado', 'Pagado el', 'Creado el'];
        const lines = rows.map(r => [
            r.publicRef, r.firstName, r.lastName, r.email, r.phone, r.country, r.clubName,
            r.ticketLabel, r.quantity, r.totalAmount, r.currency, r.status,
            r.paidAt ? new Date(r.paidAt).toISOString() : '', new Date(r.createdAt).toISOString(),
        ].map(escape).join(','));

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="inscripciones-${event.slug || event.id}.csv"`);
        res.send('﻿' + [header.map(escape).join(','), ...lines].join('\n'));
    } catch (error) {
        console.error('[event-registrations] exportRegistrationsCsv:', error);
        res.status(500).json({ error: 'No se pudo exportar' });
    }
};

export default {
    getPublicRegistrationConfig,
    createRegistration,
    createCheckout,
    getRegistration,
    listRegistrations,
    exportRegistrationsCsv,
    confirmPaidSession,
    applyStripeStatus,
};
