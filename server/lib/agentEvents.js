// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — eventos de los módulos (v4.1316.0)
//
// Los módulos (inscripciones, Feria, solicitudes de contenido) avisan aquí lo
// que pasó. El tick del runtime (`agents-tick`) los lee y dispara los workflows
// programados `event@tipo` del mismo sitio. Liviano a propósito: no importa el
// runtime ni el gateway, y NUNCA lanza ni demora la respuesta del módulo.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';

export async function emitAgentEvent(type, siteId, payload = {}) {
    try {
        await Promise.race([
            (async () => {
                await ensureAgentCenterSchema();
                await db.query(`INSERT INTO "AgentEvent" (type, "siteId", payload) VALUES ($1, $2, $3::jsonb)`,
                    [String(type).slice(0, 80), siteId ? String(siteId) : null, JSON.stringify(payload || {})]);
            })(),
            new Promise(r => setTimeout(r, 1500)),
        ]);
    } catch (err) {
        console.warn('[agent-events] no se pudo registrar el evento:', err?.message);
    }
}
