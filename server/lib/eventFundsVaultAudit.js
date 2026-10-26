// ════════════════════════════════════════════════════════════════════════════
// Auditoría de v4.1248–v4.1249 — SÓLO LECTURA — v4.1250
//
// Es el ÚNICO archivo del módulo de Eventos que mira tablas de la Bóveda, y sólo
// para leer: v4.1248–v4.1249 crearon por error filas de `Payment` para pagos de
// inscripción (al confirmarse el pago y con «Registrar movimiento en la
// Bóveda»). Desde v4.1250 ningún código las crea ni las lee, así que no afectan
// a los eventos. Si se borran o no lo decide el equipo con esta lista delante:
// un registro financiero no se elimina sin revisar antes si ya se giró.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

/**
 * Se reconocen por la marca que SÓLO ese código escribía: `"eventId"` dentro del
 * `rawPayload` de un cobro `event_registration` (la reconstrucción anterior
 * escribía `edition` y no `eventId`). Con cuántos desembolsos y eventos de ciclo
 * de vida tiene cada una: lo que haría falta revisar antes de tocarla.
 */
export const auditEventVaultRows = async ({ clubId = null } = {}) => {
    try {
        const { rows } = await db.query(
            `SELECT p.id, p."clubId", p.amount, p.currency, p.status, p."providerRef", p."createdAt",
                    (SELECT COUNT(*)::int FROM "Disbursement" d WHERE d."paymentId" = p.id) AS desembolsos,
                    (SELECT COUNT(*)::int FROM "PaymentLifecycleEvent" e WHERE e."paymentId" = p.id) AS eventos
               FROM "Payment" p
              WHERE p."rawPayload" LIKE '%"type":"event_registration"%'
                AND p."rawPayload" LIKE '%"eventId":%'
                ${clubId ? 'AND p."clubId" = $1' : ''}
              ORDER BY p."createdAt" DESC`,
            clubId ? [clubId] : []
        );
        return rows;
    } catch (e) {
        if (e?.code === '42P01') return [];
        throw e;
    }
};
