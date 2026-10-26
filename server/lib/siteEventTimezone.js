// La zona horaria de respaldo de un sitio para sus eventos (v4.1247).
//
// Vive aparte de `eventLifecycle.js` porque toca la base y aquél lo importa
// también el navegador. El orden de resolución está documentado allá:
// Setting `events_timezone` del sitio → país del sitio →
// `EVENTS_DEFAULT_TIMEZONE` → America/Bogota.
import db from './db.js';
import { siteTimezone, PLATFORM_TIMEZONE } from './eventLifecycle.js';

export const resolveSiteEventTimezone = async (clubId) => {
    const envDefault = process.env.EVENTS_DEFAULT_TIMEZONE;
    if (!clubId) return siteTimezone({ envDefault });
    try {
        const r = await db.query(
            `SELECT c.country,
                    (SELECT s.value FROM "Setting" s WHERE s."clubId" = c.id AND s.key = 'events_timezone' LIMIT 1) AS setting
             FROM "Club" c WHERE c.id = $1 LIMIT 1`,
            [clubId]
        );
        const row = r.rows[0] || {};
        return siteTimezone({ setting: row.setting, country: row.country, envDefault });
    } catch (error) {
        // La zona es un respaldo: si la consulta falla, la lista igual se sirve.
        console.warn('[EVENTS] Zona del sitio no disponible:', error.message);
        return siteTimezone({ envDefault }) || PLATFORM_TIMEZONE;
    }
};
