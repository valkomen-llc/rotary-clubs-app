// La I/O de la conciliación de fondos de un evento (v4.1248). El criterio vive
// en `eventFundsSpec.js` (puro); acá está lo que toca la base.
//
// Todo se acota en el `WHERE` por sitio Y por evento: un evento de otro sitio
// «no existe» (el llamador responde 404), igual que en el resto de la Bóveda.
import db from './db.js';
import { matchRegistrationsToPayments, PAID_REGISTRATION_STATUSES } from './eventFundsSpec.js';

/**
 * Las inscripciones del evento, sus pagos en la Bóveda y lo que falta.
 *
 * Devuelve `{ event: null }` si el evento no es de este sitio. Si el sitio
 * nunca usó el registro de asistentes (la tabla no existe), devuelve el evento
 * sin inscripciones: no es un error, es un evento sin cobros.
 */
export const eventFundsScope = async ({ clubId, eventId }) => {
    const id = String(eventId || '').trim();
    if (!clubId || !id) return { event: null };
    const ev = await db.query(
        'SELECT id, title, slug, "clubId" FROM "CalendarEvent" WHERE id = $1 AND "clubId" = $2 LIMIT 1',
        [id, clubId]
    );
    const event = ev.rows[0];
    if (!event) return { event: null };

    let registrations = [];
    try {
        const r = await db.query(
            `SELECT id, "registrationCode", "publicRef", "firstName", "lastName", email, status,
                    "categoryLabel", "clubName", district, country, currency, "chargeCurrency",
                    "totalAmount", "chargeAmount", "paidAt", "stripePaymentIntentId", "stripeSessionId"
               FROM "EventRegistration"
              WHERE "eventId" = $1`,
            [id]
        );
        registrations = r.rows;
    } catch (e) {
        if (e?.code !== '42P01') throw e; // 42P01: la tabla todavía no existe
    }

    const refs = [...new Set(registrations.flatMap(r => [r.stripePaymentIntentId, r.stripeSessionId]).filter(Boolean))];
    const payments = refs.length
        ? (await db.query(
            `SELECT id, "providerRef" FROM "Payment"
              WHERE "clubId" = $1 AND provider = 'stripe' AND "providerRef" = ANY($2::text[])`,
            [clubId, refs]
        )).rows
        : [];

    const match = matchRegistrationsToPayments(registrations, payments);
    return {
        event,
        registrations,
        paidCount: registrations.filter(r => PAID_REGISTRATION_STATUSES.includes(r.status)).length,
        ...match,
    };
};

/** Sólo los ids de los pagos del evento (para acotar avisos y auditoría). */
export const eventPaymentIds = async ({ clubId, eventId }) => {
    const scope = await eventFundsScope({ clubId, eventId });
    return scope.event ? scope.paymentIds : null;
};

/** Lo que viaja de una inscripción junto a su pago: sin tokens ni respuestas. */
export const registrationSummary = (reg) => reg ? {
    id: reg.id,
    code: reg.registrationCode || reg.publicRef || null,
    name: `${reg.firstName || ''} ${reg.lastName || ''}`.trim() || null,
    email: reg.email || null,
    status: reg.status || null,
    category: reg.categoryLabel || null,
    clubName: reg.clubName || null,
    district: reg.district || null,
    paidAt: reg.paidAt || null,
} : null;
